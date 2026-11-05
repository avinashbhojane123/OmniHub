import { io, Socket } from 'socket.io-client';
import { Platform, Alert } from 'react-native';
import {
  ChatMessage,
  RoomUser,
  UserRole,
  ChatStatusStory,
  WatchPartyState,
  RoomWallpaperState,
  RoomWallpaperThemeId,
  ActiveCallData,
  JoinRoomConfig,
  WebrtcSignalEvent,
  WatchPartyActionType,
  WatchPartyActionPayload,
  WatchPartyReactionPayload,
  WatchPartyCommentPayload,
  SendMessagePayload,
  SendDirectMessagePayload,
  CreateStatusPayload,
  ScreenShareStatusPayload,
} from '../../types/chat';
import { batteryService } from '../battery/BatteryService';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

export type { JoinRoomConfig, WebrtcSignalEvent };

export type ChatEventListener = () => void;
export type WatchPartyReactionListener = (data: WatchPartyReactionPayload) => void;
export type WatchPartyCommentListener = (data: WatchPartyCommentPayload) => void;

class ChatSocketManager {
  private socket: Socket | null = null;
  private currentNickname: string = '';
  private currentPasscode: string = '';
  public static readonly CLOUD_SERVER_URL = 'https://omnihub-1x3r.onrender.com';
  private serverUrl: string = ChatSocketManager.CLOUD_SERVER_URL;
  private sessionToken: string = '';

  // In-memory cache
  private messages: ChatMessage[] = [];
  private users: RoomUser[] = [];
  private statuses: ChatStatusStory[] = [];
  private typingUsers: string[] = [];
  private pinnedMessage: ChatMessage | null = null;
  private wallpaper: RoomWallpaperState = { theme: 'wa-doodle', customWallpaper: null, isDefault: true };
  private watchParty: WatchPartyState | null = null;
  private activeCall: ActiveCallData | null = null;
  private latencyMs: number = 0;
  private serverTimeOffsetMs: number = 0;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private connectionError: string | null = null;
  private outboxQueue: Array<{ type: 'sendMessage' | 'sendDirectMessage'; payload: any }> = [];
  private persistTimer?: ReturnType<typeof setTimeout>;

  // Listeners & Timers
  private listeners: Set<ChatEventListener> = new Set();
  private watchPartyReactionListeners: Set<WatchPartyReactionListener> = new Set();
  private watchPartyCommentListeners: Set<WatchPartyCommentListener> = new Set();
  private pingTimer?: ReturnType<typeof setInterval>;
  private typingTimeout?: ReturnType<typeof setTimeout>;
  private callDurationTimer?: ReturnType<typeof setInterval>;
  private callTimeoutTimer?: ReturnType<typeof setTimeout>;
  private expirationSweepTimer?: ReturnType<typeof setInterval>;
  private refreshUsersTimer?: ReturnType<typeof setTimeout>;
  private fallbackFlushTimer?: ReturnType<typeof setTimeout>;
  private batteryUnsub: (() => void) | null = null;
  private isJoinedRoom: boolean = false;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private webrtcSignalListeners: Set<(signal: WebrtcSignalEvent) => void> = new Set();

  constructor() {
    this.sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    settingsRepository
      .get('chat_session_token')
      .then((saved) => {
        if (saved && saved.trim()) {
          this.sessionToken = saved.trim();
        } else {
          settingsRepository.set('chat_session_token', this.sessionToken).catch(() => {});
        }
      })
      .catch(() => {});
  }

  // --- Getters ---
  public get isConnected(): boolean {
    return Boolean(this.socket && this.socket.connected);
  }

  public get isJoined(): boolean {
    return this.isJoinedRoom;
  }

  public get connectionState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  public get lastConnectionError(): string | null {
    return this.connectionError;
  }

  public get nickname(): string {
    return this.currentNickname;
  }

  public get passcode(): string {
    return this.currentPasscode;
  }

  public get activeServerUrl(): string {
    return this.serverUrl;
  }

  public get latency(): number {
    return this.latencyMs;
  }

  public get serverTimeOffset(): number {
    return this.serverTimeOffsetMs;
  }

  public getAdjustedServerNow(): number {
    return Date.now() + this.serverTimeOffsetMs;
  }

  public get getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public get getUsers(): RoomUser[] {
    return [...this.users];
  }

  public get getStatuses(): ChatStatusStory[] {
    return [...this.statuses];
  }

  public get getTypingUsers(): string[] {
    return [...this.typingUsers];
  }

  public get getPinnedMessage(): ChatMessage | null {
    return this.pinnedMessage;
  }

  public get getWallpaper(): RoomWallpaperState {
    return this.wallpaper;
  }

  public get getWatchParty(): WatchPartyState | null {
    return this.watchParty;
  }

  public get getActiveCall(): ActiveCallData | null {
    return this.activeCall ? { ...this.activeCall } : null;
  }

  public get currentUser(): RoomUser | undefined {
    return this.users.find(
      (u) => u.nickname.trim().toLowerCase() === this.currentNickname.trim().toLowerCase()
    );
  }

  public get isHost(): boolean {
    return this.currentUser?.role === 'host' || Boolean(this.currentUser?.isCreator);
  }

  public get isAdmin(): boolean {
    return this.currentUser?.role === 'host' || this.currentUser?.role === 'admin';
  }

  public resolveFileUrl(url?: string | null): string {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('file://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }
    const base = (this.serverUrl || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${base}${cleanPath}`;
  }

  // --- Subscriptions ---
  public subscribe(listener: ChatEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeWatchPartyReaction(listener: WatchPartyReactionListener): () => void {
    this.watchPartyReactionListeners.add(listener);
    return () => {
      this.watchPartyReactionListeners.delete(listener);
    };
  }

  public subscribeWatchPartyComment(listener: WatchPartyCommentListener): () => void {
    this.watchPartyCommentListeners.add(listener);
    return () => {
      this.watchPartyCommentListeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.warn('Chat listener notification error:', err);
      }
    });
  }

  // --- Cache & Outbox Persistence Helpers ---
  private async loadCachedMessages(passcode: string) {
    if (!passcode) return;
    const cleanPass = passcode.trim().toLowerCase();
    try {
      const cached = await settingsRepository.get(`chat_cache_${cleanPass}`);
      if (cached && this.messages.length === 0) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.messages = parsed;
          this.pruneExpiredMessages();
          this.notify();
        }
      }
      const cachedWallpaper = await settingsRepository.get(`chat_wallpaper_${cleanPass}`);
      if (cachedWallpaper) {
        const parsedWp = JSON.parse(cachedWallpaper);
        if (parsedWp && typeof parsedWp.theme === 'string') {
          this.wallpaper = parsedWp;
          this.notify();
        }
      }
    } catch {
      // non-critical
    }
  }

  public async loadOlderMessages(limit: number = 30): Promise<{ loaded: number; hasMore: boolean }> {
    if (!this.socket || !this.isConnected || this.messages.length === 0) {
      return { loaded: 0, hasMore: false };
    }

    const firstConfirmed = this.messages.find(
      (m) =>
        (typeof m.id === 'number' && !isNaN(m.id)) ||
        (typeof m.id === 'string' && !m.id.startsWith('offline_') && !isNaN(Number(m.id)))
    );
    if (!firstConfirmed) {
      return { loaded: 0, hasMore: false };
    }

    const beforeId = Number(firstConfirmed.id);
    if (isNaN(beforeId)) {
      return { loaded: 0, hasMore: false };
    }

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        resolve({ loaded: 0, hasMore: false });
      }, 8000);

      this.socket?.emit(
        'getMessages',
        { passcode: this.currentPasscode, beforeId, limit },
        (olderMessages: ChatMessage[]) => {
          clearTimeout(timeoutTimer);
          if (Array.isArray(olderMessages) && olderMessages.length > 0) {
            const existingIds = new Set(this.messages.map((m) => String(m.id)));
            const newOlder = olderMessages.filter((m) => !existingIds.has(String(m.id)));
            if (newOlder.length > 0) {
              this.messages = [...newOlder, ...this.messages];
              this.persistMessages();
              this.notify();
              resolve({ loaded: newOlder.length, hasMore: olderMessages.length >= limit });
              return;
            }
          }
          resolve({ loaded: 0, hasMore: false });
        }
      );
    });
  }

  public async searchRemoteMessages(searchQuery: string, limit: number = 30): Promise<{ loaded: number }> {
    if (!this.socket || !this.isConnected || !searchQuery.trim()) {
      return { loaded: 0 };
    }

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        resolve({ loaded: 0 });
      }, 8000);

      this.socket?.emit(
        'getMessages',
        { passcode: this.currentPasscode, searchQuery: searchQuery.trim(), limit },
        (matchedMessages: ChatMessage[]) => {
          clearTimeout(timeoutTimer);
          if (Array.isArray(matchedMessages) && matchedMessages.length > 0) {
            const existingIds = new Set(this.messages.map((m) => String(m.id)));
            const newMatches = matchedMessages.filter((m) => !existingIds.has(String(m.id)));
            if (newMatches.length > 0) {
              this.messages = [...this.messages, ...newMatches].sort((a, b) => {
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return timeA - timeB;
              });
              this.persistMessages();
              this.notify();
              resolve({ loaded: newMatches.length });
              return;
            }
          }
          resolve({ loaded: 0 });
        }
      );
    });
  }

  private persistMessages() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(async () => {
      try {
        if (this.currentPasscode) {
          const toSave = this.messages.slice(-150);
          await settingsRepository.set(`chat_cache_${this.currentPasscode.trim().toLowerCase()}`, JSON.stringify(toSave));
        }
      } catch {
        // non-critical
      }
    }, 400);
  }

  public pruneExpiredMessages(): boolean {
    const now = this.getAdjustedServerNow();
    const originalLen = this.messages.length;
    this.messages = this.messages.filter((m) => {
      if (!m.expiresAt) return true;
      const expTime = new Date(m.expiresAt).getTime();
      return isNaN(expTime) || expTime > now;
    });

    if (this.pinnedMessage?.expiresAt) {
      const pinExp = new Date(this.pinnedMessage.expiresAt).getTime();
      if (!isNaN(pinExp) && pinExp <= now) {
        this.pinnedMessage = null;
      }
    }

    if (this.messages.length !== originalLen) {
      this.persistMessages();
      this.notify();
      return true;
    }
    return false;
  }

  private async loadPersistedOutbox(passcode?: string) {
    try {
      const cleanPass = (passcode || this.currentPasscode).trim().toLowerCase();
      const saved = await settingsRepository.get(`chat_offline_outbox_${cleanPass}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingIds = new Set(
            this.outboxQueue.map((item) => String(item.payload?.tempId || item.payload?.id))
          );
          const unqueued = parsed.filter(
            (item: any) => !existingIds.has(String(item.payload?.tempId || item.payload?.id))
          );
          this.outboxQueue = [...unqueued, ...this.outboxQueue];
          if (this.socket?.connected && this.isJoinedRoom) {
            this.flushOutboxQueue();
          }
        }
      }
    } catch {
      // non-critical
    }
  }

  private persistOutboxQueue() {
    if (!this.currentPasscode) return;
    const cleanPass = this.currentPasscode.trim().toLowerCase();
    settingsRepository.set(`chat_offline_outbox_${cleanPass}`, JSON.stringify(this.outboxQueue)).catch(() => { });
  }

  private flushOutboxQueue() {
    if (this.outboxQueue.length > 0 && this.socket?.connected && this.isJoinedRoom) {
      const currentPass = this.currentPasscode.trim().toLowerCase();
      const eligible = this.outboxQueue.filter(
        (item) => !item.payload?.passcode || item.payload.passcode.trim().toLowerCase() === currentPass
      );
      if (eligible.length === 0) return;

      this.outboxQueue = this.outboxQueue.filter((item) => !eligible.includes(item));
      this.persistOutboxQueue();
      eligible.forEach((item) => {
        if (item.type === 'sendMessage') {
          this.socket?.emit('sendMessage', item.payload);
        } else if (item.type === 'sendDirectMessage') {
          this.socket?.emit('sendDirectMessage', item.payload);
        }
      });
    }
  }

  // --- Connection Management ---
  public connect(config: JoinRoomConfig) {
    this.disconnect();

    this.currentNickname = config.nickname.trim();
    this.currentPasscode = config.passcode.trim();
    if (config.serverUrl && config.serverUrl.trim()) {
      this.serverUrl = config.serverUrl.trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }

    this.connectionStatus = 'connecting';
    this.connectionError = null;

    // Restore cached messages, wallpaper, & outbox from local storage
    this.loadCachedMessages(this.currentPasscode);
    this.loadPersistedOutbox(this.currentPasscode);
    this.notify();

    try {
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        randomizationFactor: 0.5,
      });

      this.setupSocketEvents(config.avatarUrl);
    } catch (err: any) {
      console.error('Socket init error:', err);
      this.connectionStatus = 'disconnected';
      this.connectionError = err?.message || 'Failed to initialize socket';
      this.notify();
    }
  }

  public refreshUsers() {
    if (this.socket?.connected && this.currentPasscode) {
      this.socket.emit('getUsers', { passcode: this.currentPasscode });
    }
  }

  public refreshStatuses() {
    if (this.socket?.connected && this.currentPasscode) {
      this.socket.emit('getStatuses', { passcode: this.currentPasscode });
    }
  }

  public refreshWatchPartyState() {
    if (this.socket?.connected && this.currentPasscode) {
      this.socket.emit('getWatchPartyState', { passcode: this.currentPasscode });
    }
  }

  public syncOnForeground() {
    if (!this.currentPasscode) return;
    if (this.socket && this.socket.connected) {
      this.socket.emit('getUsers', { passcode: this.currentPasscode });
      this.socket.emit('getStatuses', { passcode: this.currentPasscode });
      this.socket.emit('getWatchPartyState', { passcode: this.currentPasscode });
      this.flushOutboxQueue();
    } else if (this.currentNickname && this.currentPasscode) {
      this.connect({
        nickname: this.currentNickname,
        passcode: this.currentPasscode,
        serverUrl: this.serverUrl,
      });
    }
  }

  private async setupSocketEvents(avatarUrl?: string) {
    if (!this.socket) return;

    // Debounced users refresh helper to batch rapid presence changes
    const refreshUsers = () => {
      if (this.refreshUsersTimer) clearTimeout(this.refreshUsersTimer);
      this.refreshUsersTimer = setTimeout(() => {
        this.refreshUsers();
      }, 150);
    };

    // Connect & Room Handshake
    this.socket.on('connect', async () => {
      this.connectionStatus = 'connected';
      this.connectionError = null;
      console.log('[Socket] Connected to', this.serverUrl, 'Socket ID:', this.socket?.id);

      if (this.expirationSweepTimer) clearInterval(this.expirationSweepTimer);
      this.expirationSweepTimer = setInterval(() => {
        this.pruneExpiredMessages();
      }, 5000);

      // Collect fresh battery telemetry
      let batteryLabel: string | undefined;
      let batteryIsCharging: boolean = false;
      try {
        const bStatus = batteryService.getCurrentStatus();
        if (bStatus) {
          batteryLabel = `${bStatus.level}%`;
          batteryIsCharging = bStatus.isCharging;
        }
      } catch {
        // non-critical
      }

      try {
        const savedToken = await settingsRepository.get('chat_session_token');
        if (savedToken && savedToken.trim()) {
          this.sessionToken = savedToken.trim();
        }
      } catch {
        // non-critical
      }

      const joinPayload = {
        passcode: this.currentPasscode,
        nickname: this.currentNickname,
        sessionToken: this.sessionToken,
        deviceType: Platform.OS === 'android' ? 'Android Device' : Platform.OS === 'ios' ? 'iPhone' : 'Mobile Device',
        deviceModel: `${Platform.OS.toUpperCase()} Native`,
        os: Platform.OS,
        browser: 'OmniHub Chat',
        networkLabel: 'Mobile / Wi-Fi',
        batteryLabel,
        batteryIsCharging,
        avatarUrl,
      };

      // Emit joinRoom first to establish server session before flushing queued messages
      this.socket?.emit('joinRoom', joinPayload, (res: any) => {
        if (res && res.success === false) {
          console.warn('[JoinRoom] Server response failed:', res.message);
          this.connectionStatus = 'disconnected';
          this.connectionError = res.message || 'Failed to join room';
          this.isJoinedRoom = false;
          this.socket?.disconnect();
          this.notify();
          Alert.alert('Room Join Failed', res.message || 'Failed to join room');
        } else {
          this.isJoinedRoom = true;
          if (res?.passcode && typeof res.passcode === 'string') {
            this.currentPasscode = res.passcode;
          }
          this.flushOutboxQueue();
          this.notify();
        }
      });

      // Fallback flush after 1.5s in case server does not return joinRoom ack callback
      if (this.fallbackFlushTimer) clearTimeout(this.fallbackFlushTimer);
      this.fallbackFlushTimer = setTimeout(() => {
        this.flushOutboxQueue();
      }, 1500);

      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
      this.socket?.emit('getStatuses', { passcode: this.currentPasscode });
      this.socket?.emit('getWatchPartyState', { passcode: this.currentPasscode });

      // Subscribe to real-time battery status changes to keep room presence accurate
      if (this.batteryUnsub) {
        this.batteryUnsub();
      }
      this.batteryUnsub = batteryService.subscribeStatus((st) => {
        if (this.socket?.connected && this.currentPasscode) {
          const newLabel = `${st.level}%`;
          if (newLabel !== batteryLabel || st.isCharging !== batteryIsCharging) {
            batteryLabel = newLabel;
            batteryIsCharging = st.isCharging;
            this.socket?.emit('updateMetadata', {
              passcode: this.currentPasscode,
              batteryLabel: newLabel,
              batteryIsCharging: st.isCharging,
            });
          }
        }
      });

      // Start ping loop for latency & server time offset sync with immediate initial calibration
      const runPing = () => {
        if (this.socket?.connected) {
          const start = Date.now();
          this.socket.emit('clientPing', { clientTime: start }, (res?: any) => {
            const now = Date.now();
            const newLatency = Math.max(2, now - start);
            const latencyDiff = Math.abs(newLatency - this.latencyMs);
            this.latencyMs = newLatency;
            if (res && typeof res.serverTime === 'number') {
              const estimatedHalfRoundTrip = (now - start) / 2;
              this.serverTimeOffsetMs = res.serverTime - (start + estimatedHalfRoundTrip);
            }
            const pruned = this.pruneExpiredMessages();
            if (pruned || latencyDiff >= 15) {
              this.notify();
            }
          });
        }
      };

      runPing();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(runPing, 10000);

      this.notify();
    });

    // Pong event from server
    this.socket.on('clientPong', (res?: any) => {
      if (res && typeof res.serverTime === 'number' && typeof res.clientTime === 'number') {
        const now = Date.now();
        const roundTrip = Math.max(2, now - res.clientTime);
        this.latencyMs = roundTrip;
        const estimatedHalfRoundTrip = roundTrip / 2;
        this.serverTimeOffsetMs = res.serverTime - (res.clientTime + estimatedHalfRoundTrip);
        this.notify();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connectionStatus = 'disconnected';
      this.isJoinedRoom = false;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = undefined;
      }
      this.typingUsers = [];
      for (const t of this.typingTimers.values()) {
        clearTimeout(t);
      }
      this.typingTimers.clear();
      if (this.activeCall && this.activeCall.state === 'active') {
        this.activeCall = { ...this.activeCall, state: 'reconnecting' };
      }
      this.notify();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connect error:', err.message);
      this.connectionStatus = 'disconnected';
      this.isJoinedRoom = false;
      this.connectionError = err.message || 'Connection refused or server offline';
      this.notify();
    });

    // Server-emitted application errors
    this.socket.on('error', (err: any) => {
      const msg = typeof err === 'string' ? err : err?.message || 'A chat error occurred';
      console.warn('[Socket] Server error event:', msg);
      Alert.alert('Notice', msg);
    });

    // Session replaced on another connection
    this.socket.on('sessionReplaced', (data?: { message?: string }) => {
      const msg = data?.message || 'Your session has been resumed in another connection.';
      console.warn('[Socket] Session replaced:', msg);
      this.connectionError = msg;
      this.disconnect();
      Alert.alert('Session Replaced', msg);
    });

    if (this.socket.io) {
      this.socket.io.on('reconnect_attempt', () => {
        this.connectionStatus = 'connecting';
        this.notify();
      });
      this.socket.io.on('reconnect_failed', () => {
        console.warn('[Socket] Reconnection stopped after max attempts');
        this.connectionStatus = 'disconnected';
        this.connectionError = 'Unable to reconnect to chat server';
        this.notify();
      });
    }

    // Chat History & Messages (Preserves unconfirmed pending messages during sync)
    const mergeWithPending = (history: ChatMessage[]) => {
      this.isJoinedRoom = true;
      const serverHistory = Array.isArray(history) ? history : [];
      const pendingMessages = this.messages.filter(
        (m) => typeof m.id === 'string' && (m.id.startsWith('offline_') || m.id.startsWith('pending_'))
      );
      const unconfirmedPending = pendingMessages.filter(
        (p) => !serverHistory.some((s) => (s.tempId && (s.tempId === p.id || s.tempId === p.tempId)) || s.id === p.id)
      );
      this.messages = [...serverHistory, ...unconfirmedPending];
      this.pruneExpiredMessages();
      this.persistMessages();
      this.notify();
    };

    this.socket.on('chatHistory', mergeWithPending);
    this.socket.on('roomHistory', mergeWithPending);

    const handleIncomingMessage = (msg: ChatMessage) => {
      if (!msg) return;
      if (msg.id !== undefined && msg.id !== null && this.messages.some((m) => String(m.id) === String(msg.id))) return;

      // Replace matching optimistic/offline pending message if sent by me
      const isMe = msg.nickname?.trim().toLowerCase() === this.currentNickname.trim().toLowerCase();
      let replaced = false;
      if (isMe) {
        const optimisticIdx = this.messages.findIndex(
          (m) =>
            typeof m.id === 'string' &&
            m.id.startsWith('offline_') &&
            ((msg.tempId && (m.tempId === msg.tempId || m.id === msg.tempId)) ||
              (!msg.tempId &&
                m.message === msg.message &&
                (m.nickname || '').trim().toLowerCase() === (msg.nickname || '').trim().toLowerCase()) ||
              (!msg.tempId && Boolean(m.fileUrl) && m.fileUrl === msg.fileUrl) ||
              (!msg.tempId && Boolean(m.pollData) && Boolean(msg.pollData) && m.pollData?.question === msg.pollData?.question) ||
              (!msg.tempId &&
                Boolean(m.locationData) &&
                Boolean(msg.locationData) &&
                m.locationData?.lat === msg.locationData?.lat &&
                m.locationData?.lng === msg.locationData?.lng))
        );
        if (optimisticIdx !== -1) {
          const prevId = this.messages[optimisticIdx].id;
          const next = [...this.messages];
          next[optimisticIdx] = msg;
          this.messages = next;
          replaced = true;

          // Remove the confirmed item from outboxQueue if it was still queued
          this.outboxQueue = this.outboxQueue.filter(
            (item) => item.payload?.tempId !== prevId && item.payload?.tempId !== msg.tempId && item.payload?.id !== prevId
          );
          this.persistOutboxQueue();
        }
      }

      if (!replaced) {
        this.messages = [...this.messages, msg];
      }
      this.persistMessages();

      // Trigger Notifee notification if this is a private whisper or mention directed to me
      const isWhisperToMe = msg.targetNickname?.trim().toLowerCase() === this.currentNickname.trim().toLowerCase();
      const isMentioned = Boolean(
        this.currentNickname &&
        msg.message?.toLowerCase().includes(`@${this.currentNickname.toLowerCase()}`)
      );

      if (!isMe && (isWhisperToMe || isMentioned) && !msg.isWithoutSound) {
        try {
          const notifee = require('@notifee/react-native').default;
          notifee.displayNotification({
            title: isWhisperToMe
              ? `🔒 Direct Whisper from @${msg.nickname}`
              : `💬 @${msg.nickname} mentioned you in #${this.currentPasscode}`,
            body: msg.message || 'New message',
            android: {
              channelId: 'high_priority_reminders',
              pressAction: { id: 'default' },
            },
          });
        } catch {
          // Notification is best-effort
        }
      }

      this.notify();
    };

    this.socket.on('newMessage', handleIncomingMessage);
    this.socket.on('message', handleIncomingMessage);
    this.socket.on('directMessage', handleIncomingMessage);

    this.socket.on('messagesRead', ({ messageIds, readByNick }: { messageIds: number[]; readByNick: string }) => {
      if (Array.isArray(messageIds) && readByNick) {
        let changed = false;
        this.messages = this.messages.map((m) => {
          if (messageIds.includes(Number(m.id))) {
            const existing = Array.isArray(m.readBy) ? m.readBy : [];
            if (!existing.includes(readByNick)) {
              changed = true;
              return { ...m, readBy: [...existing, readByNick] };
            }
          }
          return m;
        });
        if (changed) {
          this.persistMessages();
          this.notify();
        }
      }
    });

    this.socket.on('messageRead', ({ messageId, readByNick }: any) => {
      if (messageId !== undefined && readByNick) {
        let changed = false;
        this.messages = this.messages.map((m) => {
          if (String(m.id) === String(messageId)) {
            const existing = Array.isArray(m.readBy) ? m.readBy : [];
            if (!existing.includes(readByNick)) {
              changed = true;
              return { ...m, readBy: [...existing, readByNick] };
            }
          }
          return m;
        });
        if (changed) {
          this.persistMessages();
          this.notify();
        }
      }
    });

    this.socket.on('messageEdited', (updated: { messageId?: number; id?: number; newMessage?: string; message?: string; fileUrl?: string }) => {
      const msgId = updated.id !== undefined ? updated.id : updated.messageId;
      const text = updated.newMessage !== undefined ? updated.newMessage : updated.message;
      this.messages = this.messages.map((m) =>
        String(m.id) === String(msgId)
          ? { ...m, message: text || m.message, fileUrl: updated.fileUrl || m.fileUrl, isEdited: true }
          : m
      );
      if (this.pinnedMessage && String(this.pinnedMessage.id) === String(msgId)) {
        this.pinnedMessage = {
          ...this.pinnedMessage,
          message: text || this.pinnedMessage.message,
          fileUrl: updated.fileUrl || this.pinnedMessage.fileUrl,
          isEdited: true,
        };
      }
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messageDeleted', (payload: any) => {
      const msgId = payload?.id !== undefined ? payload.id : payload?.messageId;
      this.messages = this.messages.map((m) =>
        String(m.id) === String(msgId)
          ? { ...m, isDeleted: true, message: 'This message was deleted' }
          : m
      );
      if (this.pinnedMessage && String(this.pinnedMessage.id) === String(msgId)) {
        this.pinnedMessage = null;
      }
      this.persistMessages();
      this.notify();
    });

    const handleReactions = (payload: any) => {
      const msgId = payload?.id !== undefined ? payload.id : payload?.messageId;
      if (msgId === undefined) return;
      this.messages = this.messages.map((m) =>
        String(m.id) === String(msgId) ? { ...m, reactions: payload.reactions } : m
      );
      if (this.pinnedMessage && String(this.pinnedMessage.id) === String(msgId)) {
        this.pinnedMessage = { ...this.pinnedMessage, reactions: payload.reactions };
      }
      this.persistMessages();
      this.notify();
    };

    this.socket.on('messageReactionsUpdated', handleReactions);
    this.socket.on('messageReaction', handleReactions);

    this.socket.on('pinnedMessageUpdated', (msg: ChatMessage | null) => {
      this.pinnedMessage = msg;
      this.notify();
    });

    this.socket.on('messageUpdated', (updated: any) => {
      if (!updated) return;
      const targetId = updated.id !== undefined ? updated.id : updated.messageId;
      if (targetId === undefined) return;
      this.messages = this.messages.map((m) => {
        if (String(m.id) === String(targetId)) {
          return { ...m, ...updated, id: m.id };
        }
        return m;
      });
      if (this.pinnedMessage && String(this.pinnedMessage.id) === String(targetId)) {
        this.pinnedMessage = { ...this.pinnedMessage, ...updated, id: this.pinnedMessage.id };
      }
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messagesExpired', ({ ids }: { ids: (string | number)[] }) => {
      if (Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(ids.map((id) => String(id)));
        const prevLen = this.messages.length;
        this.messages = this.messages.filter((m) => !idSet.has(String(m.id)));
        if (this.pinnedMessage && idSet.has(String(this.pinnedMessage.id))) {
          this.pinnedMessage = null;
        }
        if (this.messages.length !== prevLen) {
          this.persistMessages();
          this.notify();
        }
      }
    });

    this.socket.on('directMessageError', (err: { message?: string }) => {
      console.warn('[Socket] Direct message error:', err?.message);
      if (err?.message) {
        Alert.alert('Whisper Notice', err.message);
      }
    });

    this.socket.on('historyCleared', () => {
      this.messages = [];
      this.pinnedMessage = null;
      if (this.currentPasscode) {
        settingsRepository.set(`chat_cache_${this.currentPasscode.trim().toLowerCase()}`, '[]').catch(() => { });
      }
      this.notify();
    });

    // Typing Indicators with Auto-Expiration (4s TTL)
    this.socket.on('userTyping', ({ nickname }: { nickname: string }) => {
      if (nickname && nickname.toLowerCase() !== this.currentNickname.toLowerCase()) {
        const lower = nickname.toLowerCase();
        const existingTimer = this.typingTimers.get(lower);
        if (existingTimer) clearTimeout(existingTimer);

        if (!this.typingUsers.some((u) => u.toLowerCase() === lower)) {
          this.typingUsers = [...this.typingUsers, nickname];
          this.notify();
        }

        const timer = setTimeout(() => {
          this.typingUsers = this.typingUsers.filter((u) => u.toLowerCase() !== lower);
          this.typingTimers.delete(lower);
          this.notify();
        }, 4000);
        this.typingTimers.set(lower, timer);
      }
    });

    const handleUserStop = ({ nickname }: { nickname: string }) => {
      if (nickname) {
        const lower = nickname.toLowerCase();
        const timer = this.typingTimers.get(lower);
        if (timer) {
          clearTimeout(timer);
          this.typingTimers.delete(lower);
        }
        this.typingUsers = this.typingUsers.filter((u) => u.toLowerCase() !== lower);
        this.notify();
      }
    };

    this.socket.on('userStoppedTyping', handleUserStop);
    this.socket.on('userStopTyping', handleUserStop);

    // Users List & Presence
    this.socket.on('usersList', (users: RoomUser[]) => {
      this.users = Array.isArray(users) ? users : [];
      this.notify();
    });

    this.socket.on('userOnline', ({ nickname }: { nickname: string }) => {
      if (nickname) {
        const lower = nickname.trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === lower ? { ...u, isOnline: true } : u
        );
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('userOffline', ({ nickname }: { nickname: string }) => {
      if (nickname) {
        const lower = nickname.trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === lower ? { ...u, isOnline: false } : u
        );
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('userLeft', ({ nickname }: { nickname: string }) => {
      if (nickname) {
        const lower = nickname.trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === lower ? { ...u, isOnline: false } : u
        );
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('userJoined', (data: any) => {
      if (data?.user && data.user.nickname) {
        const lower = data.user.nickname.trim().toLowerCase();
        const existingIdx = this.users.findIndex((u) => u.nickname.trim().toLowerCase() === lower);
        if (existingIdx !== -1) {
          const updated = [...this.users];
          updated[existingIdx] = { ...updated[existingIdx], ...data.user, isOnline: true };
          this.users = updated;
        } else {
          this.users = [...this.users, { ...data.user, isOnline: true }];
        }
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('hostChanged', (data?: { newHostNickname?: string; reason?: string }) => {
      if (data?.newHostNickname) {
        const hostLower = data.newHostNickname.trim().toLowerCase();
        this.users = this.users.map((u) => ({
          ...u,
          role: (u.nickname.trim().toLowerCase() === hostLower
            ? 'host'
            : u.role === 'host'
            ? 'member'
            : u.role || 'member') as UserRole,
        }));
        this.notify();
        if (hostLower === this.currentNickname.trim().toLowerCase()) {
          Alert.alert('Host Role Assigned', 'You are now the room host!');
        }
      }
      refreshUsers();
    });

    this.socket.on('userMuteToggled', (data?: { targetNickname?: string; isMuted?: boolean; mutedUntil?: Date | string }) => {
      if (data?.targetNickname) {
        const target = data.targetNickname.trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === target
            ? { ...u, isMuted: Boolean(data.isMuted), mutedUntil: data.mutedUntil ? new Date(data.mutedUntil) : undefined }
            : u
        );
        this.notify();
      }
      refreshUsers();
      if (data?.targetNickname && data.targetNickname.trim().toLowerCase() === this.currentNickname.trim().toLowerCase()) {
        if (data.isMuted) {
          Alert.alert('Muted', 'You have been muted by a room administrator.');
        } else {
          Alert.alert('Unmuted', 'You have been unmuted.');
        }
      }
    });

    this.socket.on('userKicked', (data?: { targetNickname?: string }) => {
      if (data?.targetNickname) {
        const target = data.targetNickname.trim().toLowerCase();
        this.users = this.users.filter((u) => u.nickname.trim().toLowerCase() !== target);
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('userBanned', (data?: { targetNickname?: string }) => {
      if (data?.targetNickname) {
        const target = data.targetNickname.trim().toLowerCase();
        this.users = this.users.filter((u) => u.nickname.trim().toLowerCase() !== target);
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('userUnbanned', refreshUsers);

    this.socket.on('userPromoted', (data?: { targetNickname?: string; role?: 'host' | 'admin' | 'member'; promotedBy?: string }) => {
      if (data?.targetNickname && data.role) {
        const target = data.targetNickname.trim().toLowerCase();
        const role = data.role as UserRole;
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === target ? { ...u, role } : u
        );
        this.notify();
        if (target === this.currentNickname.trim().toLowerCase()) {
          Alert.alert('Role Updated', `Your role in this room is now: ${data.role}`);
        }
      }
      refreshUsers();
    });

    this.socket.on('userMetadataUpdated', (data: any) => {
      if (data?.nickname) {
        const lower = data.nickname.trim().toLowerCase();
        this.users = this.users.map((u) => {
          if (u.nickname.trim().toLowerCase() === lower) {
            return {
              ...u,
              batteryLabel: data.batteryLabel !== undefined ? data.batteryLabel : u.batteryLabel,
              batteryIsCharging: data.batteryIsCharging !== undefined ? data.batteryIsCharging : u.batteryIsCharging,
              networkLabel: data.networkLabel !== undefined ? data.networkLabel : u.networkLabel,
              avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : u.avatarUrl,
            };
          }
          return u;
        });
        this.notify();
      }
      refreshUsers();
    });

    this.socket.on('pipStateChanged', ({ nickname, isPip }: { nickname: string; isPip: boolean }) => {
      if (nickname) {
        const target = nickname.trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === target ? { ...u, isPip } : u
        );
        this.notify();
      }
    });

    // Wallpapers
    const handleWallpaperUpdate = (wp: RoomWallpaperState) => {
      if (wp && typeof wp.theme === 'string') {
        this.wallpaper = {
          theme: wp.theme,
          customWallpaper: wp.customWallpaper || null,
          isDefault: Boolean(wp.isDefault),
        };
        if (this.currentPasscode) {
          settingsRepository
            .set(`chat_wallpaper_${this.currentPasscode.trim().toLowerCase()}`, JSON.stringify(this.wallpaper))
            .catch(() => {});
        }
        this.notify();
      }
    };

    this.socket.on('roomWallpaperSync', handleWallpaperUpdate);
    this.socket.on('roomWallpaperUpdated', handleWallpaperUpdate);

    // Status Stories
    this.socket.on('statusesList', (list: ChatStatusStory[]) => {
      this.statuses = Array.isArray(list) ? list : [];
      this.notify();
    });

    this.socket.on('statusesUpdated', (list: ChatStatusStory[]) => {
      this.statuses = Array.isArray(list) ? list : [];
      this.notify();
    });

    this.socket.on('statusCreated', (story: ChatStatusStory) => {
      if (story && !this.statuses.some((s) => s.id === story.id)) {
        this.statuses = [...this.statuses, story];
        this.notify();
      }
    });

    this.socket.on('statusViewed', ({ statusId, viewers }: any) => {
      this.statuses = this.statuses.map((s) =>
        s.id === statusId ? { ...s, viewers } : s
      );
      this.notify();
    });

    this.socket.on('statusDeleted', ({ statusId }: { statusId: number }) => {
      this.statuses = this.statuses.filter((s) => s.id !== statusId);
      this.notify();
    });

    // Watch Party
    this.socket.on('watchPartyStateSync', (wpState: WatchPartyState) => {
      this.watchParty = wpState;
      this.notify();
    });
    this.socket.on('watchPartyState', (wpState: WatchPartyState) => {
      this.watchParty = wpState;
      this.notify();
    });
    this.socket.on('watchPartyUpdate', (wpState: WatchPartyState) => {
      this.watchParty = wpState;
      this.notify();
    });
    this.socket.on('watchPartyClosed', () => {
      this.watchParty = null;
      this.notify();
    });

    this.socket.on('watchPartyInvite', (data: { from: string; videoSource: any; timestamp: number }) => {
      Alert.alert(
        'Watch Party Invitation',
        `@${data.from} invited the room to a Watch Party!`,
        [
          { text: 'Decline', onPress: () => this.watchPartyAction('decline') },
          { text: 'Join', onPress: () => this.watchPartyAction('accept') },
        ]
      );
    });

    this.socket.on('watchPartyAccepted', () => {
      this.refreshWatchPartyState();
    });

    this.socket.on('watchPartyDeclined', (data: { declinedBy: string }) => {
      if (data?.declinedBy) {
        Alert.alert('Watch Party', `@${data.declinedBy} declined the Watch Party invite.`);
      }
    });

    this.socket.on('watchPartyReaction', (payload: WatchPartyReactionPayload) => {
      const normalized: WatchPartyReactionPayload = {
        ...payload,
        emoji: payload.emoji || payload.reaction,
        reaction: payload.reaction || payload.emoji,
      };
      this.watchPartyReactionListeners.forEach((fn) => {
        try {
          fn(normalized);
        } catch {}
      });
    });

    this.socket.on('watchPartyComment', (payload: WatchPartyCommentPayload) => {
      const normalized: WatchPartyCommentPayload = {
        ...payload,
        comment: payload.comment || payload.text,
        text: payload.text || payload.comment,
      };
      this.watchPartyCommentListeners.forEach((fn) => {
        try {
          fn(normalized);
        } catch {}
      });
    });

    this.socket.on('kickedFromRoom', (data?: { reason?: string }) => {
      const reason = data?.reason || 'You were removed from this room by the host.';
      this.connectionError = reason;
      this.currentPasscode = '';
      this.disconnect();
      Alert.alert('Room Access Removed', reason);
    });

    // WebRTC Calling (Dual alias handling with callId deduplication and auto-busy signaling)
    const handleIncomingCall = (callData: any) => {
      if (!callData) return;
      if (this.activeCall && this.activeCall.callId === callData.callId) {
        return;
      }
      if (this.activeCall && this.activeCall.state !== 'ended') {
        const callerSocketId = callData?.callerSocketId || callData?.from;
        this.socket?.emit('declineCall', {
          passcode: this.currentPasscode,
          receiverName: this.currentNickname,
          from: this.currentNickname,
          targetSocketId: callerSocketId,
          callId: callData.callId,
          reason: 'User is busy on another call',
        });
        return;
      }
      this.activeCall = {
        callId: callData.callId,
        callerNickname: callData.callerName || callData.from,
        callerSocketId: callData.callerSocketId,
        isVoiceOnly: Boolean(callData.isVoiceOnly),
        state: 'incoming',
      };
      this.notify();
    };

    this.socket.on('userCalling', handleIncomingCall);
    this.socket.on('callUser', handleIncomingCall);

    const handleCallAccepted = (data: any) => {
      if (this.activeCall) {
        if (this.callTimeoutTimer) {
          clearTimeout(this.callTimeoutTimer);
          this.callTimeoutTimer = undefined;
        }
        this.activeCall = {
          ...this.activeCall,
          calleeNickname: data.receiverName || data.from || this.activeCall.calleeNickname,
          calleeSocketId: data.receiverSocketId || this.activeCall.calleeSocketId,
          callId: data.callId || this.activeCall.callId,
          state: 'active',
          startedAt: Date.now(),
          durationSeconds: 0,
        };
        this.startCallDurationTimer();
        this.requestIceServers();
        this.notify();
      }
    };

    this.socket.on('callAccepted', handleCallAccepted);
    this.socket.on('acceptCall', handleCallAccepted);

    this.socket.on('callDeclined', () => {
      this.resetCall();
    });
    this.socket.on('declineCall', () => {
      this.resetCall();
    });

    this.socket.on('callEnded', () => {
      this.resetCall();
    });
    this.socket.on('endCall', () => {
      this.resetCall();
    });

    this.socket.on('callTimeout', () => {
      this.resetCall();
    });

    this.socket.on('callMissed', () => {
      this.resetCall();
    });

    this.socket.on('callBusy', (data?: { message?: string }) => {
      Alert.alert('User Busy', data?.message || 'The user is currently on another call.');
      this.resetCall();
    });

    this.socket.on('callError', (data?: { message?: string }) => {
      console.warn('[Call] Call error:', data?.message);
      Alert.alert('Call Notice', data?.message || 'Unable to establish call.');
      this.resetCall();
    });

    this.socket.on('peerReconnecting', (data?: { nickname?: string; callId?: string }) => {
      if (this.activeCall && (!data?.callId || this.activeCall.callId === data.callId)) {
        this.activeCall = {
          ...this.activeCall,
          state: 'reconnecting',
        };
        this.notify();
      }
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'peerReconnecting', payload: data });
        } catch { }
      });
    });

    this.socket.on('peerReconnected', (data?: { nickname?: string; callId?: string; socketId?: string }) => {
      if (this.activeCall && (!data?.callId || this.activeCall.callId === data.callId)) {
        const isCaller = this.activeCall.callerNickname?.trim().toLowerCase() === this.currentNickname.trim().toLowerCase();
        this.activeCall = {
          ...this.activeCall,
          calleeSocketId: isCaller ? (data?.socketId || this.activeCall.calleeSocketId) : this.activeCall.calleeSocketId,
          callerSocketId: !isCaller ? (data?.socketId || this.activeCall.callerSocketId) : this.activeCall.callerSocketId,
          state: 'active',
        };
        this.notify();
      }
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'peerReconnected', payload: data });
        } catch { }
      });
    });

    this.socket.on('callRestored', (data?: { callId?: string; targetSocketId?: string; isVoiceOnly?: boolean }) => {
      if (data?.callId) {
        if (!this.activeCall) {
          this.activeCall = {
            callId: data.callId,
            callerNickname: this.currentNickname,
            callerSocketId: this.socket?.id,
            calleeSocketId: data.targetSocketId,
            isVoiceOnly: Boolean(data.isVoiceOnly),
            state: 'active',
            startedAt: Date.now(),
            durationSeconds: 0,
          };
        } else {
          this.activeCall = {
            ...this.activeCall,
            callId: data.callId,
            calleeSocketId: data.targetSocketId || this.activeCall.calleeSocketId,
            state: 'active',
          };
        }
        this.startCallDurationTimer();
        this.requestIceServers();
        this.notify();
      }
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'callRestored', payload: data });
        } catch { }
      });
    });

    // WebRTC Signaling Events
    this.socket.on('webrtcOffer', (payload: any) => {
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'offer', payload });
        } catch { }
      });
    });

    this.socket.on('webrtcAnswer', (payload: any) => {
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'answer', payload });
        } catch { }
      });
    });

    this.socket.on('webrtcCandidate', (payload: any) => {
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'candidate', payload });
        } catch { }
      });
    });

    this.socket.on('webrtcMediaState', (payload: any) => {
      if (payload?.from) {
        const fromNick = String(payload.from).trim().toLowerCase();
        const micMuted = payload.micMuted !== undefined ? Boolean(payload.micMuted) : Boolean(payload.isAudioMuted);
        const cameraOff = payload.cameraOff !== undefined ? Boolean(payload.cameraOff) : Boolean(payload.isVideoMuted);
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === fromNick
            ? { ...u, micMuted, cameraOff }
            : u
        );
        this.notify();
      }
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'mediaState', payload });
        } catch { }
      });
    });

    this.socket.on('screenShareStatus', (payload: any) => {
      if (payload?.from) {
        const fromNick = String(payload.from).trim().toLowerCase();
        this.users = this.users.map((u) =>
          u.nickname.trim().toLowerCase() === fromNick
            ? { ...u, isScreenSharing: Boolean(payload.isSharing) }
            : u
        );
        this.notify();
      }
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'screenShare', payload });
        } catch { }
      });
    });

    this.socket.on('iceServers', (payload: any) => {
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'iceServers', payload: payload?.iceServers });
        } catch { }
      });
    });
  }

  private startCallDurationTimer() {
    if (this.callDurationTimer) clearInterval(this.callDurationTimer);
    this.callDurationTimer = setInterval(() => {
      if (this.activeCall && this.activeCall.state === 'active' && this.activeCall.startedAt) {
        this.activeCall = {
          ...this.activeCall,
          durationSeconds: Math.floor((Date.now() - this.activeCall.startedAt) / 1000),
        };
        this.notify();
      }
    }, 1000);
  }

  private resetCall() {
    if (this.callDurationTimer) clearInterval(this.callDurationTimer);
    if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
    this.callDurationTimer = undefined;
    this.callTimeoutTimer = undefined;
    this.activeCall = null;
    this.webrtcSignalListeners.forEach((fn) => {
      try {
        fn({ type: 'callEnded', payload: { reason: 'call_ended' } });
      } catch { }
    });
    this.notify();
  }

  // --- Message Sending ---
  public sendMessage(
    text: string,
    replyTo?: ChatMessage['replyTo'],
    extraProps: Partial<ChatMessage> = {}
  ) {
    if (!text.trim() && !extraProps.fileUrl && !extraProps.pollData && !extraProps.locationData) {
      return;
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload: SendMessagePayload = {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      message: text.trim(),
      replyTo: replyTo || null,
      tempId,
      ...extraProps,
    };

    const optimisticMsg: ChatMessage = {
      id: tempId,
      tempId,
      nickname: this.currentNickname,
      message: text.trim(),
      createdAt: new Date().toISOString(),
      status: this.isConnected ? 'sending' : 'pending',
      expiresAt: extraProps.expiresIn
        ? new Date(Date.now() + extraProps.expiresIn * 1000).toISOString()
        : undefined,
      replyTo: replyTo || undefined,
      ...extraProps,
    };

    if (!this.isConnected || !this.socket || !this.isJoinedRoom) {
      this.messages = [...this.messages, optimisticMsg];
      this.outboxQueue.push({ type: 'sendMessage', payload });
      this.persistOutboxQueue();
      this.persistMessages();
      this.notify();
      return;
    }

    // Immediate optimistic feed update for zero-latency send feedback
    this.messages = [...this.messages, optimisticMsg];
    this.persistMessages();
    this.notify();

    this.socket.emit('sendMessage', payload);
    this.sendTyping(false);
  }

  public sendDirectMessage(
    targetNickname: string,
    text: string,
    extraProps: Partial<ChatMessage> = {}
  ) {
    if ((!text.trim() && !extraProps.fileUrl && !extraProps.pollData && !extraProps.locationData) || !targetNickname.trim()) return;

    const tempId = `offline_dm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanTarget = targetNickname.trim();
    const { targetNickname: _target, ...restExtra } = extraProps;
    const payload: SendDirectMessagePayload = {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      targetNickname: cleanTarget,
      message: text.trim(),
      tempId,
      ...restExtra,
    };

    const optimisticMsg: ChatMessage = {
      id: tempId,
      tempId,
      nickname: this.currentNickname,
      targetNickname: cleanTarget,
      isDirect: true,
      message: text.trim(),
      status: this.isConnected ? 'sending' : 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: extraProps.expiresIn
        ? new Date(Date.now() + extraProps.expiresIn * 1000).toISOString()
        : undefined,
      ...restExtra,
    };

    if (!this.isConnected || !this.socket || !this.isJoinedRoom) {
      this.messages = [...this.messages, optimisticMsg];
      this.outboxQueue.push({ type: 'sendDirectMessage', payload });
      this.persistOutboxQueue();
      this.persistMessages();
      this.notify();
      return;
    }

    // Immediate optimistic feed update for direct message send
    this.messages = [...this.messages, optimisticMsg];
    this.persistMessages();
    this.notify();

    this.socket.emit('sendDirectMessage', payload);
  }

  public sendTyping(isTyping: boolean) {
    if (!this.socket || !this.isConnected) return;

    if (isTyping) {
      this.socket.emit('typing', {
        passcode: this.currentPasscode,
        nickname: this.currentNickname,
      });

      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.sendTyping(false);
      }, 3000);
    } else {
      this.socket.emit('stopTyping', {
        passcode: this.currentPasscode,
        nickname: this.currentNickname,
      });
    }
  }

  public markMessagesRead(messageIds: (number | string)[]) {
    if (!this.socket || !this.isConnected) return;
    const numericIds = messageIds
      .map((id) => Number(id))
      .filter((n) => !isNaN(n) && n > 0);
    if (numericIds.length === 0) return;

    // Optimistically update read status locally
    const myNick = this.currentNickname.trim().toLowerCase();
    if (myNick) {
      this.messages = this.messages.map((m) => {
        if (numericIds.includes(Number(m.id))) {
          const readers = Array.isArray(m.readBy) ? m.readBy : [];
          if (!readers.some((r) => r.trim().toLowerCase() === myNick)) {
            return { ...m, readBy: [...readers, this.currentNickname] };
          }
        }
        return m;
      });
      this.persistMessages();
      this.notify();
    }

    this.socket.emit('markRead', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      messageIds: numericIds,
    });
  }

  public markRead(messageId: number | string) {
    this.markMessagesRead([messageId]);
  }

  public votePoll(messageId: number | string, optionId: number | string) {
    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;

    const myNick = this.currentNickname.trim().toLowerCase();
    const now = this.getAdjustedServerNow();

    // Instant optimistic poll feedback matching backend toggle/multi-choice semantics
    let isExpired = false;
    this.messages = this.messages.map((m) => {
      if (String(m.id) === String(messageId) && m.pollData?.options) {
        if (m.pollData.expiresAt) {
          const exp = new Date(m.pollData.expiresAt).getTime();
          if (!isNaN(exp) && exp <= now) {
            isExpired = true;
            return m;
          }
        }

        const isMulti = Boolean(m.pollData.allowMultiple);
        const targetOpt = m.pollData.options.find(
          (o) => String(o.id) === String(optionId)
        );
        const alreadyVotedTarget = Boolean(
          targetOpt?.votes?.some(
            (v: string) => (v || '').trim().toLowerCase() === myNick
          )
        );

        const nextOptions = m.pollData.options.map((opt) => {
          const votes = opt.votes || [];
          if (String(opt.id) === String(optionId)) {
            if (alreadyVotedTarget) {
              return {
                ...opt,
                votes: votes.filter(
                  (v: string) => (v || '').trim().toLowerCase() !== myNick
                ),
              };
            } else {
              return {
                ...opt,
                votes: [
                  ...votes.filter(
                    (v: string) => (v || '').trim().toLowerCase() !== myNick
                  ),
                  this.currentNickname,
                ],
              };
            }
          } else if (!isMulti) {
            return {
              ...opt,
              votes: votes.filter(
                (v: string) => (v || '').trim().toLowerCase() !== myNick
              ),
            };
          }
          return opt;
        });

        return { ...m, pollData: { ...m.pollData, options: nextOptions } };
      }
      return m;
    });

    if (isExpired) {
      Alert.alert('Poll Closed', 'This poll has already expired.');
      return;
    }

    this.persistMessages();
    this.notify();

    const numMsgId = Number(messageId);
    if (isNaN(numMsgId)) return;
    const cleanOptId = typeof optionId === 'number' || !isNaN(Number(optionId)) ? Number(optionId) : optionId;

    this.socket.emit('votePoll', {
      passcode: this.currentPasscode,
      messageId: numMsgId,
      optionId: cleanOptId,
    });
  }

  public reactToMessage(messageId: number | string, emoji: string) {
    if (!emoji) return;

    // Optimistic local reaction toggle
    const myNick = this.currentNickname.trim().toLowerCase();
    this.messages = this.messages.map((m) => {
      if (String(m.id) === String(messageId)) {
        const reactions = { ...(m.reactions || {}) };
        const users = [...(reactions[emoji] || [])];
        const alreadyReacted = users.some((u) => u.trim().toLowerCase() === myNick);
        if (alreadyReacted) {
          reactions[emoji] = users.filter((u) => u.trim().toLowerCase() !== myNick);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        } else {
          reactions[emoji] = [...users, this.currentNickname];
        }
        return { ...m, reactions };
      }
      return m;
    });
    this.persistMessages();
    this.notify();

    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;

    const numMsgId = Number(messageId);
    if (isNaN(numMsgId)) return;
    this.socket.emit('reactToMessage', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      messageId: numMsgId,
      emoji,
    });
  }

  public editMessage(messageId: number | string, newText: string) {
    if (!newText.trim()) return;

    // Optimistic local update
    this.messages = this.messages.map((m) =>
      String(m.id) === String(messageId) ? { ...m, message: newText.trim(), isEdited: true } : m
    );
    this.persistMessages();
    this.notify();

    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;

    const numMsgId = Number(messageId);
    if (isNaN(numMsgId)) return;
    this.socket.emit('editMessage', {
      passcode: this.currentPasscode,
      messageId: numMsgId,
      newMessage: newText.trim(),
    });
  }

  public deleteMessage(messageId: number | string) {
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) {
      this.removePendingMessage(messageId);
      return;
    }

    // Optimistic local deletion
    this.messages = this.messages.map((m) =>
      String(m.id) === String(messageId) ? { ...m, isDeleted: true, message: 'This message was deleted' } : m
    );
    if (this.pinnedMessage && String(this.pinnedMessage.id) === String(messageId)) {
      this.pinnedMessage = null;
    }
    this.persistMessages();
    this.notify();

    if (!this.socket) return;
    const numMsgId = Number(messageId);
    if (isNaN(numMsgId)) return;
    this.socket.emit('deleteMessage', {
      passcode: this.currentPasscode,
      messageId: numMsgId,
    });
  }

  public pinMessage(messageId: number | string | null) {
    // Optimistic local pinning
    if (messageId === null) {
      this.pinnedMessage = null;
      this.messages = this.messages.map((m) => (m.isPinned ? { ...m, isPinned: false } : m));
    } else {
      const found = this.messages.find((m) => String(m.id) === String(messageId));
      this.pinnedMessage = found ? { ...found, isPinned: true } : null;
      this.messages = this.messages.map((m) =>
        String(m.id) === String(messageId) ? { ...m, isPinned: true } : (m.isPinned ? { ...m, isPinned: false } : m)
      );
    }
    this.persistMessages();
    this.notify();

    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;

    const cleanMsgId = messageId !== null && !isNaN(Number(messageId)) ? Number(messageId) : null;

    this.socket.emit('pinMessage', {
      passcode: this.currentPasscode,
      messageId: cleanMsgId,
    });
  }

  public clearHistory() {
    this.messages = [];
    this.pinnedMessage = null;
    if (this.currentPasscode) {
      settingsRepository.set(`chat_cache_${this.currentPasscode.trim().toLowerCase()}`, '[]').catch(() => { });
    }
    this.notify();

    if (!this.socket) return;
    this.socket.emit('clearHistory', {
      passcode: this.currentPasscode,
    });
  }

  // --- 24h Status / Stories ---
  public createStatus(data: Omit<CreateStatusPayload, 'passcode'>) {
    if (!this.socket) return;
    this.socket.emit('createStatus', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      ...data,
    });
  }

  public viewStatus(statusId: number | string) {
    if (!this.socket) return;
    const numId = Number(statusId);
    if (isNaN(numId)) return;
    this.socket.emit('viewStatus', {
      passcode: this.currentPasscode,
      statusId: numId,
    });
  }

  public deleteStatus(statusId: number | string) {
    const numId = Number(statusId);
    if (isNaN(numId)) return;
    // Optimistic local deletion
    this.statuses = this.statuses.filter((s) => Number(s.id) !== numId);
    this.notify();

    if (!this.socket) return;
    this.socket.emit('deleteStatus', {
      passcode: this.currentPasscode,
      statusId: numId,
    });
  }

  // --- WebRTC Calling Actions ---
  public initiateCall(targetNickname?: string, isVoiceOnly: boolean = false): boolean {
    if (!this.socket) return false;
    if (this.activeCall && (this.activeCall.state === 'active' || this.activeCall.state === 'calling')) {
      return false;
    }
    const cleanTarget = targetNickname?.trim();
    const targetUser = cleanTarget
      ? this.users.find((u) => u.nickname.trim().toLowerCase() === cleanTarget.toLowerCase())
      : undefined;
    const targetSocketId = targetUser?.socketId;

    this.activeCall = {
      callId: `outgoing_${Date.now()}`,
      callerNickname: this.currentNickname,
      callerSocketId: this.socket?.id,
      calleeNickname: cleanTarget,
      calleeSocketId: targetSocketId || undefined,
      isVoiceOnly,
      state: 'calling',
    };

    // Auto-timeout after 45 seconds if no response
    if (this.callTimeoutTimer) clearTimeout(this.callTimeoutTimer);
    this.callTimeoutTimer = setTimeout(() => {
      if (this.activeCall && this.activeCall.state === 'calling') {
        Alert.alert('Call Unanswered', 'The user did not answer the call.');
        this.resetCall();
      }
    }, 45000);

    this.socket.emit('callUser', {
      passcode: this.currentPasscode,
      callerName: this.currentNickname,
      from: this.currentNickname,
      targetNickname: cleanTarget,
      targetSocketId: targetSocketId || undefined,
      isVoiceOnly,
    });
    this.requestIceServers();
    this.notify();
    return true;
  }

  public acceptCall() {
    if (!this.socket || !this.activeCall) return;
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = undefined;
    }
    this.socket.emit('acceptCall', {
      passcode: this.currentPasscode,
      receiverName: this.currentNickname,
      from: this.currentNickname,
      callId: this.activeCall.callId,
      targetSocketId: this.activeCall.callerSocketId,
    });
    this.activeCall = {
      ...this.activeCall,
      state: 'active',
      startedAt: Date.now(),
      durationSeconds: 0,
    };
    this.startCallDurationTimer();
    this.requestIceServers();
    this.notify();
  }

  private getCallPeerSocketId(override?: string): string | undefined {
    if (override && override.trim() && override !== this.socket?.id) return override.trim();
    if (!this.activeCall) return undefined;
    const isMeCaller =
      this.activeCall.callerNickname?.trim().toLowerCase() === this.currentNickname.trim().toLowerCase();
    const candidate = isMeCaller
      ? (this.activeCall.calleeSocketId || this.activeCall.callerSocketId)
      : (this.activeCall.callerSocketId || this.activeCall.calleeSocketId);
    return candidate !== this.socket?.id ? candidate : undefined;
  }

  public declineCall(reason?: string) {
    if (!this.socket || !this.activeCall) return;
    this.socket.emit('declineCall', {
      passcode: this.currentPasscode,
      receiverName: this.currentNickname,
      from: this.currentNickname,
      callId: this.activeCall.callId,
      targetSocketId: this.getCallPeerSocketId(),
      reason,
    });
    this.resetCall();
  }

  public endCall(reason: string = 'Call ended by user') {
    if (!this.socket || !this.activeCall) return;
    this.socket.emit('endCall', {
      passcode: this.currentPasscode,
      callId: this.activeCall.callId,
      targetSocketId: this.getCallPeerSocketId(),
      reason,
    });
    this.resetCall();
  }

  public togglePip(isPip: boolean) {
    const myNick = this.currentNickname.trim().toLowerCase();
    this.users = this.users.map((u) =>
      u.nickname.trim().toLowerCase() === myNick ? { ...u, isPip } : u
    );
    this.notify();

    if (!this.socket) return;
    this.socket.emit('togglePip', {
      passcode: this.currentPasscode,
      isPip,
    });
  }

  public setMediaState(isAudioMuted: boolean, isVideoMuted: boolean, targetSocketId?: string) {
    const myNick = this.currentNickname.trim().toLowerCase();
    this.users = this.users.map((u) =>
      u.nickname.trim().toLowerCase() === myNick
        ? { ...u, micMuted: isAudioMuted, cameraOff: isVideoMuted }
        : u
    );
    this.notify();

    if (!this.socket) return;
    this.socket.emit('webrtcMediaState', {
      passcode: this.currentPasscode,
      isAudioMuted,
      isVideoMuted,
      micMuted: isAudioMuted,
      cameraOff: isVideoMuted,
      callId: this.activeCall?.callId,
      targetSocketId: this.getCallPeerSocketId(targetSocketId),
    });
  }

  public setScreenShareStatus(isSharing: boolean, targetSocketId?: string) {
    const myNick = this.currentNickname.trim().toLowerCase();
    this.users = this.users.map((u) =>
      u.nickname.trim().toLowerCase() === myNick
        ? { ...u, isScreenSharing: isSharing }
        : u
    );
    this.notify();

    if (!this.socket) return;
    this.socket.emit('screenShareStatus', {
      passcode: this.currentPasscode,
      isSharing,
      targetSocketId: this.getCallPeerSocketId(targetSocketId),
      callId: this.activeCall?.callId,
    });
  }

  public requestIceServers() {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('getIceServers', { passcode: this.currentPasscode });
  }

  // --- WebRTC Signaling Methods ---
  public subscribeWebrtcSignal(listener: (signal: WebrtcSignalEvent) => void): () => void {
    this.webrtcSignalListeners.add(listener);
    return () => {
      this.webrtcSignalListeners.delete(listener);
    };
  }

  public sendWebrtcOffer(offer: any, targetSocketId?: string, isVoiceOnly: boolean = false) {
    if (!this.socket) return;
    this.socket.emit('webrtcOffer', {
      passcode: this.currentPasscode,
      offer,
      targetSocketId: this.getCallPeerSocketId(targetSocketId),
      isVoiceOnly,
      callerName: this.currentNickname,
      from: this.currentNickname,
      callId: this.activeCall?.callId,
    });
  }

  public sendWebrtcAnswer(answer: any, targetSocketId?: string) {
    if (!this.socket) return;
    this.socket.emit('webrtcAnswer', {
      passcode: this.currentPasscode,
      answer,
      targetSocketId: this.getCallPeerSocketId(targetSocketId),
      receiverName: this.currentNickname,
      from: this.currentNickname,
      callId: this.activeCall?.callId,
    });
  }

  public sendWebrtcCandidate(candidate: any, targetSocketId?: string) {
    if (!this.socket) return;
    this.socket.emit('webrtcCandidate', {
      passcode: this.currentPasscode,
      candidate,
      targetSocketId: this.getCallPeerSocketId(targetSocketId),
      from: this.currentNickname,
      callId: this.activeCall?.callId,
    });
  }

  // --- Watch Party Actions ---
  public watchPartyAction(
    action: WatchPartyActionType,
    payload: Partial<WatchPartyActionPayload> = {}
  ) {
    // Optimistic local state update for instant actor feedback
    if (action === 'close') {
      this.watchParty = null;
      this.notify();
    } else if (action === 'play' && this.watchParty) {
      this.watchParty = { ...this.watchParty, isPlaying: true, currentTime: payload.currentTime ?? this.watchParty.currentTime };
      this.notify();
    } else if (action === 'pause' && this.watchParty) {
      this.watchParty = { ...this.watchParty, isPlaying: false, currentTime: payload.currentTime ?? this.watchParty.currentTime };
      this.notify();
    } else if (action === 'seek' && this.watchParty && typeof payload.currentTime === 'number') {
      this.watchParty = { ...this.watchParty, currentTime: payload.currentTime };
      this.notify();
    } else if (action === 'rate' && this.watchParty && typeof payload.playbackRate === 'number') {
      this.watchParty = { ...this.watchParty, playbackRate: payload.playbackRate };
      this.notify();
    } else if (action === 'buffering' && this.watchParty) {
      const users = this.watchParty.bufferingUsers || [];
      if (!users.includes(this.currentNickname)) {
        this.watchParty = { ...this.watchParty, isBuffering: true, bufferingUsers: [...users, this.currentNickname] };
        this.notify();
      }
    } else if (action === 'ready' && this.watchParty) {
      const users = (this.watchParty.bufferingUsers || []).filter((u) => u !== this.currentNickname);
      this.watchParty = { ...this.watchParty, isBuffering: users.length > 0, bufferingUsers: users };
      this.notify();
    } else if (action === 'change_video' && payload.videoSource && this.watchParty) {
      this.watchParty = {
        ...this.watchParty,
        videoSource: payload.videoSource,
        currentTime: payload.currentTime || 0,
        isPlaying: Boolean(payload.isPlaying),
        lastUpdatedTimestamp: Date.now(),
        version: (this.watchParty.version || 0) + 1,
        lastActorNickname: this.currentNickname,
      };
      this.notify();
    } else if (action === 'toggle_host_lock' && this.watchParty) {
      this.watchParty = {
        ...this.watchParty,
        isHostOnly: payload.isHostOnly !== undefined ? payload.isHostOnly : !this.watchParty.isHostOnly,
      };
      this.notify();
    } else if (action === 'open' && payload.videoSource) {
      this.watchParty = {
        isActive: true,
        videoSource: payload.videoSource,
        currentTime: payload.currentTime || 0,
        isPlaying: Boolean(payload.isPlaying),
        playbackRate: payload.playbackRate || 1,
        lastUpdatedTimestamp: Date.now(),
        version: (this.watchParty?.version || 0) + 1,
        lastActorNickname: this.currentNickname,
        isBuffering: false,
        bufferingUsers: [],
        isHostOnly: payload.isHostOnly !== undefined ? payload.isHostOnly : true,
      };
      this.notify();
    }

    if (!this.socket) return;
    this.socket.emit('watchPartyAction', {
      passcode: this.currentPasscode,
      action,
      ...payload,
    });
  }

  public pingWatchPartyClock(): Promise<{ clientSendTime: number; serverTime: number }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected || !this.currentPasscode) {
        resolve({ clientSendTime: Date.now(), serverTime: Date.now() });
        return;
      }
      const sendTime = Date.now();
      this.socket.emit(
        'watchPartyClockPing',
        { passcode: this.currentPasscode, clientSendTime: sendTime },
        (res: any) => {
          resolve({
            clientSendTime: sendTime,
            serverTime: res?.serverTime || Date.now(),
          });
        }
      );
    });
  }

  public watchPartyReaction(reaction: string) {
    if (!this.socket || !reaction || !this.currentPasscode) return;
    this.socket.emit('watchPartyReaction', {
      passcode: this.currentPasscode,
      reaction,
      emoji: reaction,
    });
  }

  public watchPartyComment(comment: string, top?: number) {
    if (!this.socket || !comment?.trim() || !this.currentPasscode) return;
    this.socket.emit('watchPartyComment', {
      passcode: this.currentPasscode,
      text: comment.trim(),
      comment: comment.trim(),
      top,
    });
  }

  // --- Wallpaper & Customization ---
  public updateRoomWallpaper(theme: RoomWallpaperThemeId | string, customWallpaper: string | null = null) {
    // Optimistic local theme update
    this.wallpaper = {
      theme,
      customWallpaper,
      isDefault: theme === 'wa-doodle' && !customWallpaper,
    };
    if (this.currentPasscode) {
      settingsRepository
        .set(`chat_wallpaper_${this.currentPasscode.trim().toLowerCase()}`, JSON.stringify(this.wallpaper))
        .catch(() => {});
    }
    this.notify();

    if (!this.socket) return;
    this.socket.emit('updateRoomWallpaper', {
      passcode: this.currentPasscode,
      theme,
      customWallpaper,
    });
  }

  // --- Moderation Actions ---
  public muteUser(targetNickname: string, isMuted: boolean, durationMinutes?: number) {
    const target = targetNickname.trim().toLowerCase();
    this.users = this.users.map((u) =>
      u.nickname.trim().toLowerCase() === target ? { ...u, isMuted } : u
    );
    this.notify();

    if (!this.socket) return;
    this.socket.emit('muteUser', {
      passcode: this.currentPasscode,
      targetNickname,
      isMuted,
      durationMinutes,
    });
  }

  public kickUser(targetNickname: string) {
    const target = targetNickname.trim().toLowerCase();
    this.users = this.users.filter((u) => u.nickname.trim().toLowerCase() !== target);
    this.notify();

    if (!this.socket) return;
    this.socket.emit('kickUser', {
      passcode: this.currentPasscode,
      targetNickname,
    });
  }

  public banUser(targetNickname: string) {
    const target = targetNickname.trim().toLowerCase();
    this.users = this.users.filter((u) => u.nickname.trim().toLowerCase() !== target);
    this.notify();

    if (!this.socket) return;
    this.socket.emit('banUser', {
      passcode: this.currentPasscode,
      targetNickname,
    });
  }

  public unbanUser(targetNickname: string) {
    if (!this.socket) return;
    this.socket.emit('unbanUser', {
      passcode: this.currentPasscode,
      targetNickname,
    });
  }

  public promoteUser(targetNickname: string, role: 'admin' | 'member') {
    const target = targetNickname.trim().toLowerCase();
    this.users = this.users.map((u) =>
      u.nickname.trim().toLowerCase() === target ? { ...u, role } : u
    );
    this.notify();

    if (!this.socket) return;
    this.socket.emit('promoteUser', {
      passcode: this.currentPasscode,
      targetNickname,
      role,
    });
  }

  public transferHost(targetNickname: string) {
    if (!this.socket) return;
    this.socket.emit('transferHost', {
      passcode: this.currentPasscode,
      targetNickname,
    });
  }

  public reclaimHost() {
    if (!this.socket) return;
    this.socket.emit('reclaimHost', {
      passcode: this.currentPasscode,
    });
  }

  public clearInactiveUsers(daysInactive: number = 7) {
    if (!this.socket) return;
    this.socket.emit('clearInactiveUsers', {
      passcode: this.currentPasscode,
      daysInactive,
    });
  }

  public updateUserMetadata(metadata: {
    batteryLabel?: string;
    batteryIsCharging?: boolean;
    networkLabel?: string;
    avatarUrl?: string;
  }) {
    if (!this.socket || !this.isConnected || !this.currentPasscode) return;
    this.socket.emit('updateMetadata', {
      passcode: this.currentPasscode,
      ...metadata,
    });
  }

  public removePendingMessage(tempId: string | number) {
    this.messages = this.messages.filter(
      (m) => String(m.id) !== String(tempId) && String(m.tempId) !== String(tempId)
    );
    this.outboxQueue = this.outboxQueue.filter(
      (item) => String(item.payload?.tempId) !== String(tempId) && String(item.payload?.id) !== String(tempId)
    );
    this.persistOutboxQueue();
    this.persistMessages();
    this.notify();
  }

  public leaveRoom() {
    if (this.socket && this.socket.connected) {
      if (this.activeCall) {
        try {
          this.endCall('Participant left room');
        } catch {}
      }
      try {
        this.socket.emit('leaveRoom', { passcode: this.currentPasscode });
      } catch {}
    }
    this.currentPasscode = '';
    this.disconnect();
  }

  public disconnect() {
    if (this.refreshUsersTimer) {
      clearTimeout(this.refreshUsersTimer);
      this.refreshUsersTimer = undefined;
    }
    if (this.fallbackFlushTimer) {
      clearTimeout(this.fallbackFlushTimer);
      this.fallbackFlushTimer = undefined;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
    }
    if (this.callDurationTimer) {
      clearInterval(this.callDurationTimer);
      this.callDurationTimer = undefined;
    }
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = undefined;
    }
    if (this.expirationSweepTimer) {
      clearInterval(this.expirationSweepTimer);
      this.expirationSweepTimer = undefined;
    }
    if (this.batteryUnsub) {
      this.batteryUnsub();
      this.batteryUnsub = null;
    }

    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();

    this.connectionStatus = 'disconnected';
    this.isJoinedRoom = false;
    this.messages = [];
    this.users = [];
    this.statuses = [];
    this.typingUsers = [];
    this.pinnedMessage = null;
    this.watchParty = null;
    this.activeCall = null;
    this.outboxQueue = [];
    this.wallpaper = { theme: 'wa-doodle', customWallpaper: null, isDefault: true };
    this.latencyMs = 0;
    this.serverTimeOffsetMs = 0;

    if (this.socket) {
      if (this.socket.io) {
        this.socket.io.removeAllListeners();
      }
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.notify();
  }
}

export const chatSocketService = new ChatSocketManager();
