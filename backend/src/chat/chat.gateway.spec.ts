import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { Room } from '../rooms/room.entity';
import { Message } from '../messages/message.entity';
import { User } from '../users/user.entity';
import { Status } from '../status/status.entity';
import { CallingService } from './services/calling.service';
import { WatchPartyService } from './services/watch-party.service';
import { StatusService } from './services/status.service';
import { MessageService } from './services/message.service';
import { RoomModerationService } from './services/room-moderation.service';
import { WallpaperService } from './services/wallpaper.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  const mockRoomRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMessageRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockStatusRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockCallingService = {
    handleDisconnect: jest.fn(),
    handleLeaveRoom: jest.fn(),
    rebindReconnectingUser: jest.fn(),
    callUser: jest.fn(),
    acceptCall: jest.fn(),
    declineCall: jest.fn(),
    webrtcOffer: jest.fn(),
    webrtcAnswer: jest.fn(),
    webrtcCandidate: jest.fn(),
    endCall: jest.fn(),
    getIceServers: jest.fn(),
    togglePip: jest.fn(),
    screenShareStatus: jest.fn(),
    webrtcMediaState: jest.fn(),
  };

  const mockWatchPartyService = {
    clearWatchPartyDisconnectTimer: jest.fn(),
    handleUserDisconnect: jest.fn(),
    handleWatchPartyAction: jest.fn(),
    handleWatchPartyClockPing: jest.fn(),
    getWatchPartyState: jest.fn(),
    watchPartyReaction: jest.fn(),
    watchPartyComment: jest.fn(),
  };

  const mockStatusService = {
    cleanupExpiredStatuses: jest.fn().mockResolvedValue(undefined),
    createStatus: jest.fn(),
    getStatuses: jest.fn(),
    viewStatus: jest.fn(),
    deleteStatus: jest.fn(),
  };

  const mockMessageService = {
    cleanupExpiredMessages: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanUploadFiles: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn(),
    sendDirectMessage: jest.fn(),
    markRead: jest.fn(),
    votePoll: jest.fn(),
    getMessages: jest.fn(),
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    clearHistory: jest.fn(),
    pinMessage: jest.fn(),
    reactToMessage: jest.fn(),
  };

  const mockRoomModerationService = {
    resetUsersOnlineStatusOnBootstrap: jest.fn().mockResolvedValue(undefined),
    cleanupStaleUsers: jest.fn().mockResolvedValue(undefined),
    broadcastUsersList: jest.fn().mockResolvedValue(undefined),
    getFormattedUsersList: jest.fn().mockResolvedValue([]),
    getUsers: jest.fn(),
    updateMetadata: jest.fn(),
    kickUser: jest.fn(),
    banUser: jest.fn(),
    unbanUser: jest.fn(),
    promoteUser: jest.fn(),
    transferHost: jest.fn(),
    reclaimHost: jest.fn(),
    clearInactiveUsers: jest.fn(),
    muteUser: jest.fn(),
  };

  const mockWallpaperService = {
    cleanupDeadWallpapers: jest.fn().mockResolvedValue(undefined),
    getRoomWallpaperState: jest.fn().mockReturnValue({ theme: 'wa-doodle', customWallpaper: null }),
    updateRoomWallpaper: jest.fn(),
  };

  const mockServer: any = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      sockets: new Map(),
    },
  };

  const createMockSocket = (id = 'sock_1') => ({
    id,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    to: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: getRepositoryToken(Room), useValue: mockRoomRepo },
        { provide: getRepositoryToken(Message), useValue: mockMessageRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Status), useValue: mockStatusRepo },
        { provide: CallingService, useValue: mockCallingService },
        { provide: WatchPartyService, useValue: mockWatchPartyService },
        { provide: StatusService, useValue: mockStatusService },
        { provide: MessageService, useValue: mockMessageService },
        { provide: RoomModerationService, useValue: mockRoomModerationService },
        { provide: WallpaperService, useValue: mockWallpaperService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    gateway.server = mockServer;
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('Lifecycle methods', () => {
    it('onApplicationBootstrap should initialize cleanups safely', async () => {
      await gateway.onApplicationBootstrap();
      expect(mockRoomModerationService.resetUsersOnlineStatusOnBootstrap).toHaveBeenCalled();
      expect(mockWallpaperService.cleanupDeadWallpapers).toHaveBeenCalled();
    });

    it('onModuleDestroy should clean up timers and state maps', () => {
      expect(() => gateway.onModuleDestroy()).not.toThrow();
    });
  });

  describe('handleConnection & handleDisconnect', () => {
    it('should log client connection', () => {
      const socket = createMockSocket('sock_test');
      expect(() => gateway.handleConnection(socket as any)).not.toThrow();
    });

    it('should handle disconnect safely when user session does not exist', async () => {
      const socket = createMockSocket('sock_anon');
      await gateway.handleDisconnect(socket as any);
      expect(mockCallingService.handleDisconnect).not.toHaveBeenCalled();
    });
  });

  describe('joinRoom', () => {
    it('should reject joinRoom if data is missing passcode or nickname', async () => {
      const socket = createMockSocket('sock_1');
      const res1 = await gateway.joinRoom({} as any, socket as any);
      expect(res1.success).toBe(false);

      const res2 = await gateway.joinRoom({ passcode: '  ', nickname: 'user1' } as any, socket as any);
      expect(res2.success).toBe(false);

      const res3 = await gateway.joinRoom({ passcode: 'room1', nickname: '  ' } as any, socket as any);
      expect(res3.success).toBe(false);
    });

    it('should enforce rate limits on repeated join attempts', async () => {
      const socket = createMockSocket('sock_spammer');
      const data: any = { passcode: 'room101', nickname: 'alice' };

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 1, passcode: 'room101' }),
        getMany: jest.fn().mockResolvedValue([{ id: 1, passcode: 'room101' }]),
      };
      mockRoomRepo.createQueryBuilder.mockReturnValue(queryBuilder);
      mockUserRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.create.mockReturnValue({ id: 1, nickname: 'alice', roomId: 1, role: 'host' });
      mockUserRepo.save.mockResolvedValue({ id: 1, nickname: 'alice', roomId: 1, role: 'host' });

      mockMessageRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockStatusRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      // Rapid join calls
      for (let i = 0; i < 6; i++) {
        await gateway.joinRoom(data, socket as any);
      }
      const rateLimited = await gateway.joinRoom(data, socket as any);
      expect(rateLimited.success).toBe(false);
      expect(rateLimited.message).toContain('Too many join attempts');
    });
  });

  describe('leaveRoom', () => {
    it('should return false if socket session does not exist', async () => {
      const socket = createMockSocket('sock_unknown');
      const res = await gateway.leaveRoom(socket as any);
      expect(res.success).toBe(false);
    });
  });

  describe('clientPing', () => {
    it('should emit clientPong and return server timestamp', () => {
      const socket = createMockSocket('sock_ping');
      const res = gateway.handleClientPing(socket as any, { clientTs: 12345 });
      expect(res.success).toBe(true);
      expect(res.clientTs).toBe(12345);
      expect(typeof res.serverTime).toBe('number');
      expect(socket.emit).toHaveBeenCalledWith('clientPong', expect.objectContaining({ clientTs: 12345 }));
    });
  });

  describe('Rate limited handlers', () => {
    it('getMessages should enforce rate limiting', async () => {
      const socket = createMockSocket('sock_msgs');
      for (let i = 0; i < 10; i++) {
        await gateway.getMessages(socket as any, { passcode: 'room1' } as any);
      }
      const res = await gateway.getMessages(socket as any, { passcode: 'room1' } as any);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Rate limit exceeded');
    });

    it('callUser should enforce rate limiting', async () => {
      const socket = createMockSocket('sock_call');
      for (let i = 0; i < 5; i++) {
        await gateway.callUser(socket as any, { passcode: 'room1', targetNickname: 'bob' } as any);
      }
      const res = await gateway.callUser(socket as any, { passcode: 'room1', targetNickname: 'bob' } as any);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Too many call attempts');
    });
  });

  describe('Typing indicators', () => {
    it('should safely handle typing and stopTyping when data is undefined', () => {
      const socket = createMockSocket('sock_type_1');
      (gateway as any).users.set('sock_type_1', {
        nickname: 'Alice',
        passcode: 'room101',
        isMuted: false,
      });

      expect(() => gateway.typing(socket as any, undefined as any)).not.toThrow();
      expect(socket.to).toHaveBeenCalledWith('room101');
      expect(socket.to).toHaveBeenCalledWith('room101');

      expect(() => gateway.stopTyping(socket as any, undefined as any)).not.toThrow();
      expect(socket.to).toHaveBeenCalledWith('room101');
    });

    it('should ignore typing when socket is muted or session is missing', () => {
      const socket = createMockSocket('sock_muted');
      (gateway as any).users.set('sock_muted', {
        nickname: 'MutedUser',
        passcode: 'room101',
        isMuted: true,
      });

      gateway.typing(socket as any, { passcode: 'room101' } as any);
      expect(socket.to).not.toHaveBeenCalled();

      const socketAnon = createMockSocket('sock_nonexistent');
      gateway.typing(socketAnon as any, { passcode: 'room101' } as any);
      expect(socketAnon.to).not.toHaveBeenCalled();
    });
  });
});
