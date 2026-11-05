import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessageService } from './message.service';
import { Message } from '../../messages/message.entity';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { UserSession } from '../chat.types';

describe('MessageService', () => {
  let service: MessageService;

  const mockMessageQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    select: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
  };

  const mockRoomQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0),
  };

  const mockUserQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockMessageRepo = {
    create: jest.fn((dto) => ({ id: 101, createdAt: new Date(), ...dto })),
    save: jest.fn((entity) =>
      Array.isArray(entity)
        ? Promise.resolve(entity)
        : Promise.resolve({ id: entity.id || 101, ...entity }),
    ),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => mockMessageQueryBuilder),
  };

  const mockRoomRepo = {
    createQueryBuilder: jest.fn(() => mockRoomQueryBuilder),
    save: jest.fn((room) => Promise.resolve(room)),
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    createQueryBuilder: jest.fn(() => mockUserQueryBuilder),
    save: jest.fn((user) => Promise.resolve(user)),
  };

  const createMockSocket = (id: string = 'sock_1') => ({
    id,
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  });

  const createMockServer = () => {
    const toEmitMap = new Map<string, jest.Mock>();
    const serverObj: any = {
      to: jest.fn((key: string) => {
        if (!toEmitMap.has(key)) {
          toEmitMap.set(key, jest.fn());
        }
        return {
          emit: toEmitMap.get(key)!,
          to: (subKey: string) => serverObj.to(subKey),
        };
      }),
      _getEmitter: (key: string) => toEmitMap.get(key),
    };
    return serverObj;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRoomQueryBuilder.getOne.mockResolvedValue({ id: 1, passcode: 'alpha123', pinnedMessageId: null });
    mockRoomRepo.findOne.mockResolvedValue({ id: 1, passcode: 'alpha123', pinnedMessageId: null });
    mockUserQueryBuilder.getOne.mockResolvedValue({
      id: 10,
      roomId: 1,
      nickname: 'alice',
      role: 'member',
      isBanned: false,
      isMuted: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: getRepositoryToken(Message),
          useValue: mockMessageRepo,
        },
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  describe('1. sendMessage', () => {
    it('should save and broadcast a message to the room', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: 'Hello world' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(101);
      expect(mockMessageRepo.save).toHaveBeenCalled();
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should reject when passcode does not match session', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'wrong_pass', message: 'Hello' } as any,
        async () => null,
      );

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Unauthorized'),
      }));
    });

    it('should reject substring passcode bypass attempts', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      // Attacker tries to inject message with prefix 'alpha' into 'alpha123'
      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha', message: 'Injected' } as any,
        async () => ({ id: 2, passcode: 'alpha' } as any),
      );

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should reject empty message content', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: '   ' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('empty'),
      }));
    });

    it('should reject message if user is permanently banned', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        roomId: 1,
        nickname: 'alice',
        isBanned: true,
      });

      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: 'Hello' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('banned');
    });

    it('should auto-unmute user if timed mute has expired', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const pastDate = new Date(Date.now() - 10000);
      const userObj = {
        id: 10,
        roomId: 1,
        nickname: 'alice',
        isMuted: true,
        mutedUntil: pastDate,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce(userObj);

      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: true,
      };

      const result = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: 'Free at last' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(result.success).toBe(true);
      expect(userObj.isMuted).toBe(false);
      expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMuted: false }));
    });

    it('should suppress duplicate tempId within 120 seconds', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const first = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: 'Hello', tempId: 'temp_99' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );
      expect(first.success).toBe(true);

      const second = await service.sendMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', message: 'Hello', tempId: 'temp_99' } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );
      expect(second.success).toBe(true);
      expect(second.isDuplicateSuppressed).toBe(true);
      expect(second.messageId).toBe(first.messageId);
    });

    it('should safely coerce invalid/NaN fileSize to null', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      await service.sendMessage(
        server,
        client as any,
        session,
        {
          passcode: 'alpha123',
          message: 'File upload',
          fileUrl: '/uploads/doc.pdf',
          fileSize: 'invalid_nan',
        } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileSize: null,
        }),
      );
    });
  });

  describe('2. sendDirectMessage', () => {
    it('should deliver whisper strictly to recipient and sender sockets', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      mockUserQueryBuilder.getOne
        .mockResolvedValueOnce({ id: 10, nickname: 'alice', isBanned: false, isMuted: false })
        .mockResolvedValueOnce({ id: 20, nickname: 'bob', isBanned: false });

      const findSockets = jest.fn((pass, nick) => {
        if (nick === 'bob') return [{ socketId: 'sock_bob', nickname: 'bob' }];
        if (nick === 'alice') return [{ socketId: 'sock_1', nickname: 'alice' }];
        return [];
      });

      const result = await service.sendDirectMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', targetNickname: 'bob', message: 'Secret whisper' } as any,
        findSockets,
      );

      expect(result.success).toBe(true);
      expect(server.to).toHaveBeenCalledWith('sock_bob');
      expect(server.to).toHaveBeenCalledWith('sock_1');
      expect(server.to).not.toHaveBeenCalledWith('alpha123'); // Never leaked to room!
    });

    it('should reject self-whispers', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const result = await service.sendDirectMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', targetNickname: 'alice', message: 'Talking to self' } as any,
        jest.fn(),
      );

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('directMessageError', expect.objectContaining({
        message: expect.stringContaining('Cannot whisper yourself'),
      }));
    });

    it('should reject whisper if target is not in the room', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      mockUserQueryBuilder.getOne
        .mockResolvedValueOnce({ id: 10, nickname: 'alice' })
        .mockResolvedValueOnce(null); // Bob not found

      const result = await service.sendDirectMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', targetNickname: 'bob', message: 'Hello' } as any,
        jest.fn(),
      );

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('directMessageError', expect.objectContaining({
        message: expect.stringContaining('not a member'),
      }));
    });
  });

  describe('3. markRead', () => {
    it('should update readBy and broadcast read receipt to public room', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'bob',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 101,
        roomId: 1,
        nickname: 'alice',
        isDirect: false,
        readBy: ['alice'],
      };
      mockMessageQueryBuilder.getMany.mockResolvedValueOnce([msg]);

      const result = await service.markRead(server, client as any, session, {
        passcode: 'alpha123',
        messageIds: [101],
      } as any);

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(1);
      expect(msg.readBy).toContain('bob');
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should strictly isolate direct message read receipts to whisper participants', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_bob',
        nickname: 'bob',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const directMsg = {
        id: 202,
        roomId: 1,
        nickname: 'alice',
        targetNickname: 'bob',
        isDirect: true,
        readBy: ['alice'],
      };
      mockMessageQueryBuilder.getMany.mockResolvedValueOnce([directMsg]);

      const findSockets = jest.fn((pass, nick) => {
        if (nick === 'alice') return [{ socketId: 'sock_alice', nickname: 'alice' }];
        if (nick === 'bob') return [{ socketId: 'sock_bob', nickname: 'bob' }];
        return [];
      });

      const result = await service.markRead(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageIds: [202] } as any,
        findSockets,
      );

      expect(result.success).toBe(true);
      expect(server.to).toHaveBeenCalledWith('sock_alice');
      expect(server.to).not.toHaveBeenCalledWith('alpha123'); // Never leaked to public room!
    });
  });

  describe('4. votePoll', () => {
    it('should record vote, support unvoting, and broadcast update', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const pollMessage = {
        id: 301,
        roomId: 1,
        pollData: {
          question: 'Lunch?',
          options: [
            { id: 1, text: 'Pizza', votes: [] },
            { id: 2, text: 'Burgers', votes: [] },
          ],
          allowMultiple: false,
        },
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(pollMessage);

      // 1. Cast vote for Pizza
      const res1 = await service.votePoll(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 301,
        optionId: 1,
      } as any);
      expect(res1.success).toBe(true);
      expect(pollMessage.pollData.options[0].votes).toContain('alice');

      // 2. Voting same option again toggles off (unvote)
      mockMessageRepo.findOne.mockResolvedValueOnce(pollMessage);
      const res2 = await service.votePoll(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 301,
        optionId: 1,
      } as any);
      expect(res2.success).toBe(true);
      expect(pollMessage.pollData.options[0].votes).not.toContain('alice');
    });

    it('should reject vote on invalid option ID without wiping existing votes', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const pollMessage = {
        id: 301,
        roomId: 1,
        pollData: {
          question: 'Lunch?',
          options: [{ id: 1, text: 'Pizza', votes: ['alice'] }],
        },
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(pollMessage);

      const res = await service.votePoll(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 301,
        optionId: 999, // Non-existent option
      } as any);

      expect(res.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Invalid poll option'),
      }));
      expect(pollMessage.pollData.options[0].votes).toContain('alice'); // Vote was preserved
    });
  });

  describe('5. getMessages', () => {
    it('should reject message history query if session is unauthorized', async () => {
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'roomA',
        role: 'member',
        isMuted: false,
      };

      const res = await service.getMessages(
        client as any,
        session,
        { passcode: 'roomB' } as any,
        async () => null,
        async () => [],
      );

      expect(res).toEqual([]);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Unauthorized'),
      }));
    });

    it('should paginate and filter message history safely', async () => {
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const dummyMessages = [
        { id: 2, message: 'Second', createdAt: new Date() },
        { id: 1, message: 'First', createdAt: new Date() },
      ];
      mockMessageQueryBuilder.getMany.mockResolvedValueOnce(dummyMessages);

      const res = await service.getMessages(
        client as any,
        session,
        { passcode: 'alpha123', limit: 10 } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
        async () => [1],
      );

      expect(res.length).toBe(2);
      expect(mockMessageQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });

  describe('6. editMessage', () => {
    it('should allow author to edit within 15 minutes and broadcast update', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 401,
        roomId: 1,
        nickname: 'alice',
        message: 'Original text',
        createdAt: new Date(),
        isDeleted: false,
        isDirect: false,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      await service.editMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 401, newMessage: 'Edited text' } as any,
      );

      expect(msg.message).toBe('Edited text');
      expect(msg.isEdited).toBe(true);
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should reject editing another user message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'bob',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 401,
        roomId: 1,
        nickname: 'alice',
        message: 'Alice original',
        createdAt: new Date(),
        isDeleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      await service.editMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 401, newMessage: 'Bob hacked it' } as any,
      );

      expect(msg.message).toBe('Alice original');
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('only edit your own'),
      }));
    });

    it('should reject editing after 15 minutes have passed', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 401,
        roomId: 1,
        nickname: 'alice',
        message: 'Old text',
        createdAt: new Date(Date.now() - 16 * 60 * 1000), // 16 minutes old
        isDeleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      await service.editMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 401, newMessage: 'Too late' } as any,
      );

      expect(msg.message).toBe('Old text');
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('within 15 minutes'),
      }));
    });

    it('should strictly isolate direct message edits and never leak to room', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_alice',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const directMsg = {
        id: 402,
        roomId: 1,
        nickname: 'alice',
        targetNickname: 'bob',
        message: 'Private whisper',
        createdAt: new Date(),
        isDeleted: false,
        isDirect: true,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(directMsg);

      const findSockets = jest.fn((pass, nick) => {
        if (nick === 'alice') return [{ socketId: 'sock_alice', nickname: 'alice' }];
        if (nick === 'bob') return [{ socketId: 'sock_bob', nickname: 'bob' }];
        return [];
      });

      await service.editMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 402, newMessage: 'Edited whisper' } as any,
        findSockets,
      );

      expect(server.to).toHaveBeenCalledWith('sock_alice');
      expect(server.to).toHaveBeenCalledWith('sock_bob');
      expect(server.to).not.toHaveBeenCalledWith('alpha123'); // Never leaked to public room!
    });
  });

  describe('7. deleteMessage', () => {
    it('should allow author or host to delete and soft-delete message text', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 501,
        roomId: 1,
        nickname: 'alice',
        message: 'Delete me',
        isDeleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      await service.deleteMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 501 } as any,
      );

      expect(msg.isDeleted).toBe(true);
      expect(msg.message).toBe('This message was deleted');
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should reset room pinnedMessageId if deleted message was pinned', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_host',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'host',
        isMuted: false,
      };

      const roomObj = { id: 1, passcode: 'alpha123', pinnedMessageId: 501 };
      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(roomObj);
      mockMessageRepo.findOne.mockResolvedValueOnce({
        id: 501,
        roomId: 1,
        nickname: 'bob',
        isDeleted: false,
      });

      await service.deleteMessage(
        server,
        client as any,
        session,
        { passcode: 'alpha123', messageId: 501 } as any,
      );

      expect(roomObj.pinnedMessageId).toBeNull();
      expect(mockRoomRepo.save).toHaveBeenCalledWith(roomObj);
    });
  });

  describe('8. pinMessage', () => {
    it('should allow host to pin a valid public message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'host',
        isMuted: false,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        nickname: 'alice',
        role: 'host',
      });

      const msg = { id: 601, roomId: 1, isDirect: false, isDeleted: false };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      const result = await service.pinMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 601,
      } as any);

      expect(result.success).toBe(true);
      expect(result.pinnedMessage?.id).toBe(601);
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should reject pinning private direct messages', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'host',
        isMuted: false,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        nickname: 'alice',
        role: 'host',
      });

      mockMessageRepo.findOne.mockResolvedValueOnce({
        id: 602,
        roomId: 1,
        isDirect: true,
      });

      const result = await service.pinMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 602,
      } as any);

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Private direct messages'),
      }));
    });

    it('should reject pinning a deleted message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'host',
        isMuted: false,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        nickname: 'alice',
        role: 'host',
      });

      mockMessageRepo.findOne.mockResolvedValueOnce({
        id: 603,
        roomId: 1,
        isDirect: false,
        isDeleted: true,
      });

      const result = await service.pinMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 603,
      } as any);

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('deleted message'),
      }));
    });
  });

  describe('9. reactToMessage', () => {
    it('should toggle user reaction and broadcast to room', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 701,
        roomId: 1,
        isDeleted: false,
        reactions: {} as any,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      // 1. Add reaction '❤️'
      await service.reactToMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 701,
        emoji: '❤️',
      } as any);
      expect(msg.reactions?.['❤️']).toContain('alice');

      // 2. Reacting again toggles it off
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);
      await service.reactToMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 701,
        emoji: '❤️',
      } as any);
      expect(msg.reactions).toBeNull();
    });

    it('should reject reaction on deleted message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      const msg = {
        id: 702,
        roomId: 1,
        isDeleted: true,
      };
      mockMessageRepo.findOne.mockResolvedValueOnce(msg);

      await service.reactToMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 702,
        emoji: '👍',
      } as any);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('deleted message'),
      }));
    });
  });

  describe('10. clearHistory', () => {
    it('should allow room host to clear history and reset pinned message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_host',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'host',
        isMuted: false,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        nickname: 'alice',
        role: 'host',
      });
      mockMessageQueryBuilder.getMany.mockResolvedValueOnce([]);

      const result = await service.clearHistory(server, client as any, session, {
        passcode: 'alpha123',
      } as any);

      expect(result.success).toBe(true);
      expect(mockMessageRepo.delete).toHaveBeenCalledWith({ roomId: 1 });
      expect(server.to).toHaveBeenCalledWith('alpha123');
    });

    it('should reject clearHistory from regular members', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_member',
        nickname: 'bob',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 20,
        nickname: 'bob',
        role: 'member',
      });

      const result = await service.clearHistory(server, client as any, session, {
        passcode: 'alpha123',
      } as any);

      expect(result.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Only room host'),
      }));
    });
  });

  describe('11. Edge Cases and Defensive Hardening', () => {
    it('should reject voting on a deleted poll message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      mockMessageRepo.findOne.mockResolvedValueOnce({
        id: 801,
        roomId: 1,
        isDeleted: true,
        pollData: { question: 'Deleted poll', options: [{ id: 1, text: 'Opt', votes: [] }] },
      });

      const res = await service.votePoll(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 801,
        optionId: 1,
      } as any);

      expect(res.success).toBe(false);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('deleted poll'),
      }));
    });

    it('should reject deleting an already deleted message', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      mockMessageRepo.findOne.mockResolvedValueOnce({
        id: 802,
        roomId: 1,
        nickname: 'alice',
        isDeleted: true,
      });

      await service.deleteMessage(server, client as any, session, {
        passcode: 'alpha123',
        messageId: 802,
      } as any);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('already deleted'),
      }));
    });

    it('should sanitize replyTo payload safely in sendMessage', async () => {
      const server = createMockServer();
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      await service.sendMessage(
        server,
        client as any,
        session,
        {
          passcode: 'alpha123',
          message: 'Replying to Bob',
          replyTo: {
            id: 10,
            nickname: '   bob   ',
            message: 'Original long text '.repeat(50),
          },
        } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
      );

      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: expect.objectContaining({
            id: 10,
            nickname: 'bob',
            message: expect.any(String),
          }),
        }),
      );
    });

    it('should safely handle non-numeric beforeId in getMessages', async () => {
      const client = createMockSocket();
      const session: UserSession = {
        socketId: 'sock_1',
        nickname: 'alice',
        passcode: 'alpha123',
        role: 'member',
        isMuted: false,
      };

      await service.getMessages(
        client as any,
        session,
        { passcode: 'alpha123', beforeId: 'invalid_id' as any } as any,
        async (pass) => ({ id: 1, passcode: pass } as any),
        async () => [1],
      );

      // Should not query for NaN
      expect(mockMessageQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'm.id < :beforeId',
        expect.objectContaining({ beforeId: NaN }),
      );
    });
  });
});

