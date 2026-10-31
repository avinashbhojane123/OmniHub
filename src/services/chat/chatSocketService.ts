import { io, Socket } from 'socket.io-client';
import { Platform, Alert } from 'react-native';
import {
  ChatMessage,
  RoomUser,
  ChatStatusStory,
  WatchPartyState,
  RoomWallpaperState,
  ActiveCallData,
} from '../../types/chat';
import { batteryService } from '../battery/BatteryService';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

export interface JoinRoomConfig {
  serverUrl?: string;
  nickname: string;
  passcode: string;
  avatarUrl?: string;
}

export type ChatEventListener = () => void;

class ChatSocketManager {
  private socket: Socket | null = null;
  private currentNickname: string = '';
  private currentPasscode: string = '';
  public static readonly CLOUD_SERVER_URL = 'https://backend-9i6w.onrender.com';
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

  // Listeners
  private listeners: Set<ChatEventListener> = new Set();
  private pingTimer?: ReturnType<typeof setInterval>;
  private typingTimeout?: ReturnType<typeof setTimeout>;
  private callDurationTimer?: ReturnType<typeof setInterval>;
  private expirationSweepTimer?: ReturnType<typeof setInterval>;
  private batteryUnsub: (() => void) | null = null;
  private isJoinedRoom: boolean = false;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private webrtcSignalListeners: Set<(signal: { type: string; payload: any }) => void> = new Set();

  constructor() {
    this.sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
    try {
      const cached = await settingsRepository.get(`chat_cache_${passcode.trim().toLowerCase()}`);
      if (cached && this.messages.length === 0) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.messages = parsed;
          this.pruneExpiredMessages();
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
      (m) => typeof m.id === 'number' || (typeof m.id === 'string' && !m.id.startsWith('offline_'))
    );
    if (!firstConfirmed || typeof firstConfirmed.id !== 'number') {
      return { loaded: 0, hasMore: false };
    }

    return new Promise((resolve) => {
      this.socket?.emit(
        'getMessages',
        { passcode: this.currentPasscode, beforeId: firstConfirmed.id, limit },
        (olderMessages: ChatMessage[]) => {
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
      this.socket?.emit(
        'getMessages',
        { passcode: this.currentPasscode, searchQuery: searchQuery.trim(), limit },
        (matchedMessages: ChatMessage[]) => {
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
    if (this.messages.length !== originalLen) {
      this.persistMessages();
      this.notify();
      return true;
    }
    return false;
  }

  private async loadPersistedOutbox() {
    try {
      const saved = await settingsRepository.get('chat_offline_outbox');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.outboxQueue = parsed;
        }
      }
    } catch {
      // non-critical
    }
  }

  private persistOutboxQueue() {
    settingsRepository.set('chat_offline_outbox', JSON.stringify(this.outboxQueue)).catch(() => { });
  }

  private flushOutboxQueue() {
    if (this.outboxQueue.length > 0 && this.socket?.connected) {
      const queue = [...this.outboxQueue];
      this.outboxQueue = [];
      this.persistOutboxQueue();
      queue.forEach((item) => {
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

    // Instantly restore cached messages & outbox from SQLite before network handshake completes
    this.loadCachedMessages(this.currentPasscode);
    this.loadPersistedOutbox();
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

  public syncOnForeground() {
    if (!this.currentPasscode) return;
    if (this.socket && this.socket.connected) {
      this.socket.emit('getUsers', { passcode: this.currentPasscode });
      this.socket.emit('getStatuses', { passcode: this.currentPasscode });
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

    // Connect
    this.socket.on('connect', async () => {
      this.connectionStatus = 'connected';
      this.connectionError = null;
      console.log('[Socket] Connected to', this.serverUrl, 'Socket ID:', this.socket?.id);

      if (this.expirationSweepTimer) clearInterval(this.expirationSweepTimer);
      this.expirationSweepTimer = setInterval(() => {
        this.pruneExpiredMessages();
      }, 5000);

      // Collect real battery telemetry
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
          this.notify();
        } else {
          this.isJoinedRoom = true;
          this.flushOutboxQueue();
          this.notify();
        }
      });

      // Fallback flush after 1.5s in case server does not return joinRoom ack callback
      setTimeout(() => {
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
            this.socket.emit('updateMetadata', {
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
              this.serverTimeOffsetMs =
                res.serverTime - (start + estimatedHalfRoundTrip);
            }
            const pruned = this.pruneExpiredMessages();
            // Throttle notifications to only significant latency changes (>=15ms) or expired message pruning
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

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connectionStatus = 'disconnected';
      this.isJoinedRoom = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.notify();
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connect error:', err.message);
      this.connectionStatus = 'disconnected';
      this.isJoinedRoom = false;
      this.connectionError = err.message || 'Connection refused or server offline';
      this.notify();
    });

    if (this.socket.io) {
      this.socket.io.on('reconnect_attempt', () => {
        this.connectionStatus = 'connecting';
        this.notify();
      });
      this.socket.io.on('reconnect', () => {
        console.log('[Socket] Reconnected, re-joining room and flushing outbox...');
        if (this.currentPasscode && this.currentNickname) {
          this.socket?.emit(
            'joinRoom',
            {
              passcode: this.currentPasscode,
              nickname: this.currentNickname,
              sessionToken: this.sessionToken,
            },
            () => {
              this.isJoinedRoom = true;
              this.flushOutboxQueue();
              this.notify();
            }
          );
          setTimeout(() => {
            this.flushOutboxQueue();
          }, 1000);
        }
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
              (m.message === msg.message &&
                (m.nickname || '').trim().toLowerCase() === (msg.nickname || '').trim().toLowerCase()) ||
              (Boolean(m.fileUrl) && m.fileUrl === msg.fileUrl) ||
              (Boolean(m.pollData) && Boolean(msg.pollData) && m.pollData?.question === msg.pollData?.question) ||
              (Boolean(m.locationData) && Boolean(msg.locationData)))
        );
        if (optimisticIdx !== -1) {
          const next = [...this.messages];
          next[optimisticIdx] = msg;
          this.messages = next;
          replaced = true;
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

    this.socket.on('messageEdited', (updated: { messageId: number; newMessage: string }) => {
      this.messages = this.messages.map((m) =>
        String(m.id) === String(updated.messageId)
          ? { ...m, message: updated.newMessage, isEdited: true }
          : m
      );
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messageDeleted', ({ messageId }: { messageId: string | number }) => {
      this.messages = this.messages.map((m) =>
        String(m.id) === String(messageId)
          ? { ...m, isDeleted: true, message: 'This message was deleted' }
          : m
      );
      if (this.pinnedMessage && String(this.pinnedMessage.id) === String(messageId)) {
        this.pinnedMessage = null;
      }
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messageReactionsUpdated', ({ messageId, reactions }: any) => {
      this.messages = this.messages.map((m) =>
        String(m.id) === String(messageId) ? { ...m, reactions } : m
      );
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messageReaction', ({ messageId, reactions }: any) => {
      this.messages = this.messages.map((m) =>
        String(m.id) === String(messageId) ? { ...m, reactions } : m
      );
      this.persistMessages();
      this.notify();
    });

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
      this.persistMessages();
      this.notify();
    });

    this.socket.on('messagesExpired', ({ ids }: { ids: (string | number)[] }) => {
      if (Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(ids.map((id) => String(id)));
        const prevLen = this.messages.length;
        this.messages = this.messages.filter((m) => !idSet.has(String(m.id)));
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

        if (!this.typingUsers.includes(nickname)) {
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

    this.socket.on('userJoined', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userLeft', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userOnline', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userOffline', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('hostChanged', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userMuteToggled', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userKicked', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userBanned', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userUnbanned', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userPromoted', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    this.socket.on('userMetadataUpdated', () => {
      this.socket?.emit('getUsers', { passcode: this.currentPasscode });
    });

    // Wallpapers
    this.socket.on('roomWallpaperSync', (wp: RoomWallpaperState) => {
      this.wallpaper = wp;
      this.notify();
    });
    this.socket.on('roomWallpaperUpdated', (wp: RoomWallpaperState) => {
      this.wallpaper = wp;
      this.notify();
    });

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
      // Deduplicate if this exact callId was already received via the dual userCalling/callUser alias
      if (this.activeCall && this.activeCall.callId === callData.callId) {
        return;
      }
      if (this.activeCall && this.activeCall.state !== 'ended') {
        const callerSocketId = callData?.callerSocketId || callData?.from;
        this.socket?.emit('declineCall', {
          passcode: this.currentPasscode,
          receiverName: this.currentNickname,
          callId: callData.callId,
          reason: 'User is busy on another call',
        });
        if (callerSocketId) {
          this.socket?.emit('callBusy', { to: callerSocketId, callId: callData.callId });
        }
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

    this.socket.on('callAccepted', (data: any) => {
      if (this.activeCall) {
        this.activeCall = {
          ...this.activeCall,
          calleeNickname: data.receiverName || data.from,
          calleeSocketId: data.receiverSocketId,
          state: 'active',
          startedAt: Date.now(),
          durationSeconds: 0,
        };
        this.startCallDurationTimer();
        this.notify();
      }
    });

    this.socket.on('callDeclined', () => {
      this.resetCall();
    });

    this.socket.on('callEnded', () => {
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
      this.webrtcSignalListeners.forEach((fn) => {
        try {
          fn({ type: 'mediaState', payload });
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
    this.activeCall = null;
    this.notify();
  }

  // --- Message Sending ---
  public sendMessage(
    text: string,
    replyTo?: ChatMessage['replyTo'],
    extraProps: {
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      isVoiceNote?: boolean;
      isVideoNote?: boolean;
      isWithoutSound?: boolean;
      expiresIn?: number;
      pollData?: any;
      locationData?: any;
    } = {}
  ) {
    if (!text.trim() && !extraProps.fileUrl && !extraProps.pollData && !extraProps.locationData) {
      return;
    }

    const tempId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
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
      expiresAt: extraProps.expiresIn
        ? new Date(Date.now() + extraProps.expiresIn * 1000).toISOString()
        : undefined,
      replyTo: replyTo || undefined,
      ...extraProps,
    };

    if (!this.isConnected || !this.socket) {
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

  public sendDirectMessage(targetNickname: string, text: string, extraProps: Record<string, any> = {}) {
    if ((!text.trim() && !extraProps.fileUrl && !extraProps.pollData) || !targetNickname.trim()) return;

    const tempId = `offline_dm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
      passcode: this.currentPasscode,
      targetNickname: targetNickname.trim(),
      message: text.trim(),
      tempId,
      ...extraProps,
    };

    const optimisticMsg: ChatMessage = {
      id: tempId,
      tempId,
      nickname: this.currentNickname,
      targetNickname: targetNickname.trim(),
      isDirect: true,
      message: text.trim(),
      createdAt: new Date().toISOString(),
      expiresAt: extraProps.expiresIn
        ? new Date(Date.now() + extraProps.expiresIn * 1000).toISOString()
        : undefined,
      ...extraProps,
    };

    if (!this.isConnected || !this.socket) {
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
    if (!this.socket) return;

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

    this.socket.emit('markRead', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      messageIds: numericIds,
    });
  }

  public markRead(messageId: number | string) {
    this.markMessagesRead([messageId]);
  }

  public votePoll(messageId: number | string, optionId: number) {
    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;

    // Instant optimistic poll feedback matching backend toggle/multi-choice semantics
    const myNick = this.currentNickname.trim().toLowerCase();
    this.messages = this.messages.map((m) => {
      if (String(m.id) === String(messageId) && m.pollData?.options) {
        const isMulti = Boolean(m.pollData.allowMultiple);
        const targetOpt = m.pollData.options.find(
          (o: any) => String(o.id) === String(optionId)
        );
        const alreadyVotedTarget = Boolean(
          targetOpt?.votes?.some(
            (v: string) => (v || '').trim().toLowerCase() === myNick
          )
        );

        const nextOptions = m.pollData.options.map((opt: any) => {
          const votes = opt.votes || [];
          if (String(opt.id) === String(optionId)) {
            if (alreadyVotedTarget) {
              // Unvote / toggle off
              return {
                ...opt,
                votes: votes.filter(
                  (v: string) => (v || '').trim().toLowerCase() !== myNick
                ),
              };
            } else {
              // Cast vote
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
            // In single-choice mode, remove my vote from all other options
            return {
              ...opt,
              votes: votes.filter(
                (v: string) => (v || '').trim().toLowerCase() !== myNick
              ),
            };
          }
          // In multi-choice mode, keep votes on other options
          return opt;
        });

        return { ...m, pollData: { ...m.pollData, options: nextOptions } };
      }
      return m;
    });
    this.persistMessages();
    this.notify();

    this.socket.emit('votePoll', {
      passcode: this.currentPasscode,
      messageId: Number(messageId),
      optionId,
    });
  }

  public reactToMessage(messageId: number | string, emoji: string) {
    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;
    this.socket.emit('reactToMessage', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      messageId: Number(messageId),
      emoji,
    });
  }

  public editMessage(messageId: number | string, newText: string) {
    if (!this.socket || !newText.trim()) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;
    this.socket.emit('editMessage', {
      passcode: this.currentPasscode,
      messageId: Number(messageId),
      newMessage: newText.trim(),
    });
  }

  public deleteMessage(messageId: number | string) {
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) {
      this.removePendingMessage(messageId);
      return;
    }
    if (!this.socket) return;
    this.socket.emit('deleteMessage', {
      passcode: this.currentPasscode,
      messageId: Number(messageId),
    });
  }

  public pinMessage(messageId: number | string | null) {
    if (!this.socket) return;
    if (typeof messageId === 'string' && messageId.startsWith('offline_')) return;
    this.socket.emit('pinMessage', {
      passcode: this.currentPasscode,
      messageId: messageId ? Number(messageId) : null,
    });
  }

  public clearHistory() {
    if (!this.socket) return;
    this.socket.emit('clearHistory', {
      passcode: this.currentPasscode,
    });
  }

  // --- 24h Status / Stories ---
  public createStatus(data: {
    type?: 'text' | 'image' | 'video';
    content?: string;
    mediaUrl?: string;
    bgColor?: string;
    fontStyle?: string;
    stickers?: any[];
  }) {
    if (!this.socket) return;
    this.socket.emit('createStatus', {
      passcode: this.currentPasscode,
      ...data,
    });
  }

  public viewStatus(statusId: number) {
    if (!this.socket) return;
    this.socket.emit('viewStatus', {
      passcode: this.currentPasscode,
      statusId,
    });
  }

  public deleteStatus(statusId: number) {
    if (!this.socket) return;
    this.socket.emit('deleteStatus', {
      passcode: this.currentPasscode,
      statusId,
    });
  }

  // --- WebRTC Calling Actions ---
  public initiateCall(targetNickname?: string, isVoiceOnly: boolean = false): boolean {
    if (!this.socket) return false;
    if (this.activeCall && (this.activeCall.state === 'active' || this.activeCall.state === 'calling')) {
      return false;
    }
    this.activeCall = {
      callId: `outgoing_${Date.now()}`,
      callerNickname: this.currentNickname,
      calleeNickname: targetNickname,
      isVoiceOnly,
      state: 'calling',
    };
    this.socket.emit('callUser', {
      passcode: this.currentPasscode,
      callerName: this.currentNickname,
      targetNickname,
      isVoiceOnly,
    });
    this.notify();
    return true;
  }

  public acceptCall() {
    if (!this.socket || !this.activeCall) return;
    this.socket.emit('acceptCall', {
      passcode: this.currentPasscode,
      receiverName: this.currentNickname,
      callId: this.activeCall.callId,
    });
    this.activeCall = {
      ...this.activeCall,
      state: 'active',
      startedAt: Date.now(),
      durationSeconds: 0,
    };
    this.startCallDurationTimer();
    this.notify();
  }

  public declineCall(reason?: string) {
    if (!this.socket || !this.activeCall) return;
    this.socket.emit('declineCall', {
      passcode: this.currentPasscode,
      receiverName: this.currentNickname,
      callId: this.activeCall.callId,
      reason,
    });
    this.resetCall();
  }

  public endCall() {
    if (!this.socket || !this.activeCall) return;
    this.socket.emit('endCall', {
      passcode: this.currentPasscode,
      callId: this.activeCall.callId,
    });
    this.resetCall();
  }

  public togglePip(isPip: boolean) {
    if (!this.socket) return;
    this.socket.emit('togglePip', {
      passcode: this.currentPasscode,
      isPip,
    });
  }

  public setMediaState(isAudioMuted: boolean, isVideoMuted: boolean) {
    if (!this.socket) return;
    this.socket.emit('webrtcMediaState', {
      passcode: this.currentPasscode,
      isAudioMuted,
      isVideoMuted,
    });
  }

  // --- WebRTC Signaling Methods ---
  public subscribeWebrtcSignal(listener: (signal: { type: string; payload: any }) => void): () => void {
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
      targetSocketId,
      isVoiceOnly,
      callerName: this.currentNickname,
      from: this.currentNickname,
    });
  }

  public sendWebrtcAnswer(answer: any, targetSocketId?: string) {
    if (!this.socket) return;
    this.socket.emit('webrtcAnswer', {
      passcode: this.currentPasscode,
      answer,
      targetSocketId,
      receiverName: this.currentNickname,
      from: this.currentNickname,
    });
  }

  public sendWebrtcCandidate(candidate: any, targetSocketId?: string) {
    if (!this.socket) return;
    this.socket.emit('webrtcCandidate', {
      passcode: this.currentPasscode,
      candidate,
      targetSocketId,
      from: this.currentNickname,
    });
  }

  // --- Watch Party Actions ---
  public watchPartyAction(
    action: 'open' | 'invite' | 'accept' | 'play' | 'pause' | 'seek' | 'rate' | 'change_video' | 'close' | 'lock_controls',
    payload: {
      videoSource?: any;
      currentTime?: number;
      isPlaying?: boolean;
      playbackRate?: number;
      isHostOnly?: boolean;
    } = {}
  ) {
    if (!this.socket) return;
    this.socket.emit('watchPartyAction', {
      passcode: this.currentPasscode,
      action,
      ...payload,
    });
  }

  public watchPartyReaction(emoji: string) {
    if (!this.socket) return;
    this.socket.emit('watchPartyReaction', {
      passcode: this.currentPasscode,
      emoji,
    });
  }

  public watchPartyComment(comment: string) {
    if (!this.socket) return;
    this.socket.emit('watchPartyComment', {
      passcode: this.currentPasscode,
      comment,
    });
  }

  // --- Wallpaper & Customization ---
  public updateRoomWallpaper(theme: string, customWallpaper: string | null = null) {
    if (!this.socket) return;
    this.socket.emit('updateRoomWallpaper', {
      passcode: this.currentPasscode,
      theme,
      customWallpaper,
    });
  }

  // --- Moderation Actions ---
  public muteUser(targetNickname: string, isMuted: boolean, durationMinutes?: number) {
    if (!this.socket) return;
    this.socket.emit('muteUser', {
      passcode: this.currentPasscode,
      targetNickname,
      isMuted,
      durationMinutes,
    });
  }

  public kickUser(targetNickname: string) {
    if (!this.socket) return;
    this.socket.emit('kickUser', {
      passcode: this.currentPasscode,
      targetNickname,
    });
  }

  public banUser(targetNickname: string) {
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

  public removePendingMessage(tempId: string | number) {
    this.messages = this.messages.filter(
      (m) => String(m.id) !== String(tempId) && String(m.tempId) !== String(tempId)
    );
    this.outboxQueue = this.outboxQueue.filter(
      (item) => item.payload?.tempId !== tempId && item.payload?.id !== tempId
    );
    this.persistOutboxQueue();
    this.persistMessages();
    this.notify();
  }

  public leaveRoom() {
    if (this.socket) {
      this.socket.emit('leaveRoom', { passcode: this.currentPasscode });
    }
    this.currentPasscode = '';
    this.disconnect();
  }

  public disconnect() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.callDurationTimer) clearInterval(this.callDurationTimer);
    if (this.expirationSweepTimer) clearInterval(this.expirationSweepTimer);
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

    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.notify();
  }
}

export const chatSocketService = new ChatSocketManager();
