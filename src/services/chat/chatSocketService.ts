import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
  id: string | number;
  nickname: string;
  message: string;
  createdAt: string;
  avatarUrl?: string;
  replyTo?: {
    id: string | number;
    nickname: string;
    message: string;
  } | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  reactions?: Record<string, string[]> | { nickname: string; emoji: string }[] | null;
  readBy?: string[];
  isDirect?: boolean;
  targetNickname?: string;
  isPinned?: boolean;
  pollData?: {
    question: string;
    options: { id: string; text: string; votes?: string[] }[];
  };
}

export interface RoomUser {
  nickname: string;
  isOnline: boolean;
  avatarUrl?: string;
  role?: 'host' | 'admin' | 'member';
  deviceType?: string;
  browser?: string;
  os?: string;
  lastSeen?: string | Date | null;
}

export interface JoinRoomPayload {
  nickname: string;
  passcode: string;
  serverUrl?: string;
  avatarUrl?: string;
}

export interface ChatSocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onConnectError?: (err: any) => void;
  onHistory?: (messages: ChatMessage[]) => void;
  onNewMessage?: (msg: ChatMessage) => void;
  onTyping?: (typingUsers: string[]) => void;
  onUsersList?: (users: RoomUser[]) => void;
  onPinnedMessage?: (msg: ChatMessage | null) => void;
  onReactionsUpdated?: (msgId: string | number, reactions: any) => void;
  onMessageDeleted?: (msgId: string | number) => void;
  onHistoryCleared?: () => void;
  onLatencyUpdate?: (ms: number) => void;
  onToast?: (message: string) => void;
}

class ChatSocketManager {
  private socket: Socket | null = null;
  private currentNickname: string = '';
  private currentPasscode: string = '';
  private serverUrl: string = 'https://backend-9i6w.onrender.com';
  private pingInterval: any = null;
  private typingTimeout: any = null;
  private callbacks: ChatSocketCallbacks = {};
  private cachedMessages: ChatMessage[] = [];
  private cachedUsers: RoomUser[] = [];
  private isInRoom: boolean = false;

  public setCallbacks(callbacks: ChatSocketCallbacks) {
    this.callbacks = callbacks;
  }

  public get isConnected(): boolean {
    return Boolean(this.socket && this.socket.connected);
  }

  public get activeServerUrl(): string {
    return this.serverUrl;
  }

  public get nickname(): string {
    return this.currentNickname;
  }

  public get passcode(): string {
    return this.currentPasscode;
  }

  public getCachedMessages(): ChatMessage[] {
    return [...this.cachedMessages];
  }

  public getCachedUsers(): RoomUser[] {
    return [...this.cachedUsers];
  }

  public get wasInRoom(): boolean {
    return this.isInRoom;
  }

  public setInRoomState(val: boolean) {
    this.isInRoom = val;
  }

  public connect(params: JoinRoomPayload, callbacks?: ChatSocketCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }

    this.disconnect();

    this.currentNickname = params.nickname.trim();
    this.currentPasscode = params.passcode.trim();
    if (params.serverUrl && params.serverUrl.trim()) {
      this.serverUrl = params.serverUrl.trim().replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }

    try {
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.setupListeners();
    } catch (err: any) {
      this.callbacks.onConnectError?.(err);
    }
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.callbacks.onConnect?.();

      // Emit joinRoom on connect
      this.socket?.emit(
        'joinRoom',
        {
          nickname: this.currentNickname,
          passcode: this.currentPasscode,
          deviceType: 'mobile',
          deviceModel: 'Android Device',
          os: 'Android',
          browser: 'OmniHub Mobile App',
        },
        (res: any) => {
          if (res && !res.success) {
            this.callbacks.onToast?.(res.message || 'Failed to join room');
          }
        }
      );

      this.socket?.emit('getUsers', { passcode: this.currentPasscode });

      // Start ping loop for latency
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket?.connected) {
          const startTime = Date.now();
          this.socket.emit('clientPing', { clientTime: startTime }, () => {
            const elapsed = Date.now() - startTime;
            this.callbacks.onLatencyUpdate?.(Math.max(4, elapsed));
          });
        }
      }, 10000);
    });

    this.socket.on('disconnect', (reason: string) => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.callbacks.onDisconnect?.(reason);
    });

    this.socket.on('connect_error', (err: any) => {
      this.callbacks.onConnectError?.(err);
    });

    this.socket.on('chatHistory', (history: ChatMessage[]) => {
      const msgs = Array.isArray(history) ? history : [];
      this.cachedMessages = msgs;
      this.callbacks.onHistory?.(msgs);
    });

    this.socket.on('roomHistory', (history: ChatMessage[]) => {
      const msgs = Array.isArray(history) ? history : [];
      this.cachedMessages = msgs;
      this.callbacks.onHistory?.(msgs);
    });

    this.socket.on('newMessage', (msg: ChatMessage) => {
      if (msg && !this.cachedMessages.some((m) => String(m.id) === String(msg.id))) {
        this.cachedMessages = [...this.cachedMessages, msg];
      }
      this.callbacks.onNewMessage?.(msg);
    });

    this.socket.on('message', (msg: ChatMessage) => {
      if (msg && !this.cachedMessages.some((m) => String(m.id) === String(msg.id))) {
        this.cachedMessages = [...this.cachedMessages, msg];
      }
      this.callbacks.onNewMessage?.(msg);
    });

    this.socket.on('userTyping', ({ nickname: typingUser }: { nickname: string }) => {
      if (typingUser && typingUser.toLowerCase() !== this.currentNickname.toLowerCase()) {
        this.callbacks.onTyping?.([typingUser]);
      }
    });

    this.socket.on('userStopTyping', ({ nickname: _typingUser }: { nickname: string }) => {
      this.callbacks.onTyping?.([]);
    });

    this.socket.on('userStoppedTyping', ({ nickname: _typingUser }: { nickname: string }) => {
      this.callbacks.onTyping?.([]);
    });

    this.socket.on('usersList', (list: RoomUser[]) => {
      const users = Array.isArray(list) ? list : [];
      this.cachedUsers = users;
      this.callbacks.onUsersList?.(users);
    });

    this.socket.on('roomUsers', (list: RoomUser[]) => {
      const users = Array.isArray(list) ? list : [];
      this.cachedUsers = users;
      this.callbacks.onUsersList?.(users);
    });

    this.socket.on('userJoined', (payload: any) => {
      const joinedNick = typeof payload === 'string' ? payload : payload?.nickname || payload?.user?.nickname;
      if (joinedNick) {
        this.callbacks.onToast?.(`👋 @${joinedNick} entered the room`);
        this.socket?.emit('getUsers', { passcode: this.currentPasscode });
      }
    });

    this.socket.on('userLeft', ({ nickname: leftNick }: { nickname: string }) => {
      if (leftNick) {
        this.callbacks.onToast?.(`🚶 @${leftNick} left the room`);
        this.socket?.emit('getUsers', { passcode: this.currentPasscode });
      }
    });

    this.socket.on('messageReactionsUpdated', ({ messageId, reactions }: any) => {
      this.callbacks.onReactionsUpdated?.(messageId, reactions);
    });

    this.socket.on('messageReaction', ({ messageId, reactions }: any) => {
      this.callbacks.onReactionsUpdated?.(messageId, reactions);
    });

    this.socket.on('messageDeleted', ({ messageId }: { messageId: string | number }) => {
      this.callbacks.onMessageDeleted?.(messageId);
    });

    this.socket.on('pinnedMessageUpdated', (msg: ChatMessage | null) => {
      this.callbacks.onPinnedMessage?.(msg);
    });

    this.socket.on('historyCleared', () => {
      this.callbacks.onHistoryCleared?.();
    });
  }

  public sendMessage(text: string, replyTo?: ChatMessage['replyTo'], extraProps: Record<string, any> = {}) {
    if (!this.socket || !text.trim()) return;

    const payload = {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      message: text.trim(),
      replyTo: replyTo || null,
      ...extraProps,
    };

    this.socket.emit('sendMessage', payload);
    this.sendTyping(false);
  }

  public sendTyping(isTyping: boolean) {
    if (!this.socket) return;

    this.socket.emit('typing', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      isTyping,
    });

    if (isTyping) {
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.sendTyping(false);
      }, 3000);
    }
  }

  public reactToMessage(messageId: string | number, emoji: string) {
    if (!this.socket) return;
    this.socket.emit('reactToMessage', {
      passcode: this.currentPasscode,
      nickname: this.currentNickname,
      messageId,
      emoji,
    });
  }

  public deleteMessage(messageId: string | number) {
    if (!this.socket) return;
    this.cachedMessages = this.cachedMessages.filter((m) => String(m.id) !== String(messageId));
    this.socket.emit('deleteMessage', {
      passcode: this.currentPasscode,
      messageId,
    });
  }

  public pinMessage(messageId: string | number | null) {
    if (!this.socket) return;
    this.socket.emit('pinMessage', {
      passcode: this.currentPasscode,
      messageId,
    });
  }

  public clearHistory() {
    if (!this.socket) return;
    this.cachedMessages = [];
    this.socket.emit('clearHistory', {
      passcode: this.currentPasscode,
    });
  }

  public disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.isInRoom = false;
    this.cachedMessages = [];
    this.cachedUsers = [];
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
  }
}

export const chatSocketService = new ChatSocketManager();
