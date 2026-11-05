import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CallingService } from './calling.service';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { UserSession } from '../chat.types';

describe('CallingService', () => {
  let service: CallingService;

  const mockRoomQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockUserQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRoomRepo = {
    createQueryBuilder: jest.fn(() => mockRoomQueryBuilder),
  };

  const mockUserRepo = {
    createQueryBuilder: jest.fn(() => mockUserQueryBuilder),
    save: jest.fn(),
  };

  const createMockSocket = (id: string) => ({
    id,
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  });

  const createMockServer = () => {
    const toEmitMap = new Map<string, jest.Mock>();
    return {
      to: jest.fn((roomOrSocket: string) => {
        if (!toEmitMap.has(roomOrSocket)) {
          toEmitMap.set(roomOrSocket, jest.fn());
        }
        return {
          emit: toEmitMap.get(roomOrSocket)!,
        };
      }),
      _getEmitter: (key: string) => toEmitMap.get(key),
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRoomQueryBuilder.getOne.mockResolvedValue({ id: 1, passcode: 'alpha123' });
    mockUserQueryBuilder.getOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallingService,
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

    service = module.get<CallingService>(CallingService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('1. should initiate a call and ring target user', async () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const callerSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const targetSession: UserSession = {
      nickname: 'Bob',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const usersMap = new Map<string, UserSession>([
      ['sock_caller', callerSession],
      ['sock_target', targetSession],
    ]);

    await service.callUser(
      server as any,
      callerSocket as any,
      callerSession,
      {
        passcode: 'alpha123',
        targetSocketId: 'sock_target',
        isVoiceOnly: true,
      },
      usersMap,
      () => undefined,
    );

    const targetEmitter = server._getEmitter('sock_target');
    expect(targetEmitter).toBeDefined();
    expect(targetEmitter).toHaveBeenCalledWith(
      'userCalling',
      expect.objectContaining({
        callerName: 'Alice',
        isVoiceOnly: true,
      }),
    );

    const session = service.findCallBySocketId('sock_caller');
    expect(session).toBeDefined();
    expect(session?.callerNickname).toBe('Alice');
    expect(session?.calleeNickname).toBe('Bob');
    expect(session?.state).toBe('calling');
  });

  it('2. should reject call if caller is muted', async () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const callerSession: UserSession = {
      nickname: 'MutedUser',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: true,
    };

    mockUserQueryBuilder.getOne.mockResolvedValueOnce({
      id: 10,
      nickname: 'MutedUser',
      isMuted: true,
      mutedUntil: new Date(Date.now() + 600000),
    });

    const usersMap = new Map<string, UserSession>([['sock_caller', callerSession]]);

    await service.callUser(
      server as any,
      callerSocket as any,
      callerSession,
      {
        passcode: 'alpha123',
        targetNickname: 'Bob',
      },
      usersMap,
      () => undefined,
    );

    expect(callerSocket.emit).toHaveBeenCalledWith(
      'callError',
      expect.objectContaining({
        message: expect.stringContaining('You are muted'),
      }),
    );
  });

  it('3. should reject call to self', async () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const callerSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const usersMap = new Map<string, UserSession>([['sock_caller', callerSession]]);

    await service.callUser(
      server as any,
      callerSocket as any,
      callerSession,
      {
        passcode: 'alpha123',
        targetSocketId: 'sock_caller',
      },
      usersMap,
      () => ({ socketId: 'sock_caller', nickname: 'Alice' }),
    );

    expect(callerSocket.emit).toHaveBeenCalledWith(
      'callError',
      expect.objectContaining({
        message: 'You cannot place a call to yourself.',
      }),
    );
  });

  it('4. should signal callBusy when target is already on an active call', async () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const callerSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const targetSession: UserSession = {
      nickname: 'Bob',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const usersMap = new Map<string, UserSession>([
      ['sock_caller', callerSession],
      ['sock_target', targetSession],
    ]);

    // Setup an existing active call for Bob
    const activeCall = (service as any).activeCallSessions;
    activeCall.set('call_bob_existing', {
      callId: 'call_bob_existing',
      room: 'alpha123',
      callerSocketId: 'sock_target',
      callerNickname: 'Bob',
      calleeSocketId: 'sock_other',
      calleeNickname: 'Charlie',
      state: 'active',
      startedAt: Date.now(),
    });

    await service.callUser(
      server as any,
      callerSocket as any,
      callerSession,
      {
        passcode: 'alpha123',
        targetSocketId: 'sock_target',
      },
      usersMap,
      () => undefined,
    );

    expect(callerSocket.emit).toHaveBeenCalledWith(
      'callBusy',
      expect.objectContaining({
        nickname: 'Bob',
        reason: expect.stringContaining('on another call'),
      }),
    );
  });

  it('5. should resolve WebRTC glare by auto-bridging callers', async () => {
    const server = createMockServer();
    const bobSocket = createMockSocket('sock_bob');
    const bobSession: UserSession = {
      nickname: 'Bob',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const aliceSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const usersMap = new Map<string, UserSession>([
      ['sock_alice', aliceSession],
      ['sock_bob', bobSession],
    ]);

    // Alice previously called Bob and is ringing
    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_alice_to_bob', {
      callId: 'call_alice_to_bob',
      room: 'alpha123',
      callerSocketId: 'sock_alice',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_bob',
      calleeNickname: 'Bob',
      state: 'calling',
      startedAt: Date.now(),
    });

    // Bob simultaneously calls Alice
    await service.callUser(
      server as any,
      bobSocket as any,
      bobSession,
      {
        passcode: 'alpha123',
        targetSocketId: 'sock_alice',
      },
      usersMap,
      () => undefined,
    );

    const aliceEmitter = server._getEmitter('sock_alice');
    expect(aliceEmitter).toBeDefined();
    expect(aliceEmitter).toHaveBeenCalledWith(
      'callAccepted',
      expect.objectContaining({
        receiverName: 'Bob',
        callId: 'call_alice_to_bob',
      }),
    );

    expect(bobSocket.emit).toHaveBeenCalledWith(
      'callAccepted',
      expect.objectContaining({
        receiverName: 'Alice',
        callId: 'call_alice_to_bob',
      }),
    );
  });

  it('6. should accept call and transition to active state', async () => {
    const server = createMockServer();
    const calleeSocket = createMockSocket('sock_callee');
    const calleeSession: UserSession = {
      nickname: 'Bob',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_123', {
      callId: 'call_123',
      room: 'alpha123',
      callerSocketId: 'sock_caller',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_callee',
      calleeNickname: 'Bob',
      state: 'calling',
      startedAt: Date.now(),
    });

    await service.acceptCall(
      server as any,
      calleeSocket as any,
      calleeSession,
      {
        passcode: 'alpha123',
        callId: 'call_123',
      },
      new Map(),
    );

    const callerEmitter = server._getEmitter('sock_caller');
    expect(callerEmitter).toBeDefined();
    expect(callerEmitter).toHaveBeenCalledWith(
      'callAccepted',
      expect.objectContaining({
        receiverName: 'Bob',
        callId: 'call_123',
      }),
    );

    const session = service.findCallBySocketId('sock_callee');
    expect(session?.state).toBe('active');
  });

  it('7. should decline call and clean up session cleanly', () => {
    const server = createMockServer();
    const calleeSocket = createMockSocket('sock_callee');
    const calleeSession: UserSession = {
      nickname: 'Bob',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_123', {
      callId: 'call_123',
      room: 'alpha123',
      callerSocketId: 'sock_caller',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_callee',
      calleeNickname: 'Bob',
      state: 'calling',
      startedAt: Date.now(),
    });

    service.declineCall(
      server as any,
      calleeSocket as any,
      calleeSession,
      {
        passcode: 'alpha123',
        callId: 'call_123',
        reason: 'In a meeting',
      },
    );

    const callerEmitter = server._getEmitter('sock_caller');
    expect(callerEmitter).toBeDefined();
    expect(callerEmitter).toHaveBeenCalledWith(
      'callDeclined',
      expect.objectContaining({
        reason: 'In a meeting',
        callId: 'call_123',
      }),
    );

    expect(service.findCallBySocketId('sock_callee')).toBeUndefined();
  });

  it('8. should end call and notify peer directly', () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const callerSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_active_1', {
      callId: 'call_active_1',
      room: 'alpha123',
      callerSocketId: 'sock_caller',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_callee',
      calleeNickname: 'Bob',
      state: 'active',
      startedAt: Date.now(),
    });

    service.endCall(
      server as any,
      callerSocket as any,
      callerSession,
      {
        passcode: 'alpha123',
        callId: 'call_active_1',
        reason: 'Finished discussion',
      },
    );

    const calleeEmitter = server._getEmitter('sock_callee');
    expect(calleeEmitter).toBeDefined();
    expect(calleeEmitter).toHaveBeenCalledWith(
      'callEnded',
      expect.objectContaining({
        reason: 'Finished discussion',
        callId: 'call_active_1',
      }),
    );

    expect(service.findCallBySocketId('sock_caller')).toBeUndefined();
  });

  it('9. should relay WebRTC offer and answer to specific peer', () => {
    const server = createMockServer();
    const callerSocket = createMockSocket('sock_caller');
    const session: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_rtc', {
      callId: 'call_rtc',
      room: 'alpha123',
      callerSocketId: 'sock_caller',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_callee',
      calleeNickname: 'Bob',
      state: 'active',
      startedAt: Date.now(),
    });

    const usersMap = new Map<string, UserSession>([
      ['sock_callee', { nickname: 'Bob', passcode: 'alpha123', joinedAt: new Date(), isHost: false, isMuted: false }],
    ]);

    service.webrtcOffer(
      server as any,
      callerSocket as any,
      session,
      {
        passcode: 'alpha123',
        offer: { sdp: 'v=0...' },
        callId: 'call_rtc',
      },
      usersMap,
    );

    const calleeEmitter = server._getEmitter('sock_callee');
    expect(calleeEmitter).toBeDefined();
    expect(calleeEmitter).toHaveBeenCalledWith(
      'webrtcOffer',
      expect.objectContaining({
        offer: { sdp: 'v=0...' },
        callId: 'call_rtc',
      }),
    );
  });

  it('10. should handle participant disconnect with grace period and rebind upon reconnection', () => {
    const server = createMockServer();
    const callerSession: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_reconnect', {
      callId: 'call_reconnect',
      room: 'alpha123',
      callerSocketId: 'sock_caller_old',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_callee',
      calleeNickname: 'Bob',
      state: 'active',
      startedAt: Date.now(),
    });

    service.handleDisconnect(server as any, 'sock_caller_old', callerSession);

    const calleeEmitter = server._getEmitter('sock_callee');
    expect(calleeEmitter).toBeDefined();
    expect(calleeEmitter).toHaveBeenCalledWith(
      'peerReconnecting',
      expect.objectContaining({
        nickname: 'Alice',
        callId: 'call_reconnect',
      }),
    );

    // Alice reconnects with a new socket ID
    const newSocket = createMockSocket('sock_caller_new');
    service.rebindReconnectingUser(server as any, newSocket as any, 'alpha123', 'Alice');

    expect(newSocket.emit).toHaveBeenCalledWith(
      'callRestored',
      expect.objectContaining({
        callId: 'call_reconnect',
        targetSocketId: 'sock_callee',
      }),
    );

    const callAfter = service.findCallBySocketId('sock_caller_new');
    expect(callAfter).toBeDefined();
    expect(callAfter?.callerSocketId).toBe('sock_caller_new');
  });

  it('11. should provide STUN and TURN iceServers to authenticated client', () => {
    const client = createMockSocket('sock_client');
    const session: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    service.getIceServers(client as any, session);

    expect(client.emit).toHaveBeenCalledWith(
      'iceServers',
      expect.objectContaining({
        iceServers: expect.arrayContaining([
          expect.objectContaining({ urls: expect.stringContaining('stun:') }),
        ]),
      }),
    );
  });

  it('12. should prevent unauthorized third parties from ending or hijacking active calls', async () => {
    const server = createMockServer();
    const charlieSocket = createMockSocket('sock_charlie');
    const charlieSession: UserSession = {
      nickname: 'Charlie',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_alice_bob', {
      callId: 'call_alice_bob',
      room: 'alpha123',
      callerSocketId: 'sock_alice',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_bob',
      calleeNickname: 'Bob',
      state: 'active',
      startedAt: Date.now(),
    });

    // Charlie tries to end Alice and Bob's call
    service.endCall(
      server as any,
      charlieSocket as any,
      charlieSession,
      {
        passcode: 'alpha123',
        callId: 'call_alice_bob',
      },
    );

    // Call must remain untouched
    expect(activeCalls.has('call_alice_bob')).toBe(true);

    // Charlie tries to accept Alice and Bob's call
    await service.acceptCall(
      server as any,
      charlieSocket as any,
      charlieSession,
      {
        passcode: 'alpha123',
        callId: 'call_alice_bob',
      },
      new Map(),
    );

    expect(charlieSocket.emit).toHaveBeenCalledWith(
      'callError',
      expect.objectContaining({
        message: expect.stringContaining('already been answered'),
      }),
    );
  });

  it('13. should resend incoming call prompt when callee reconnects while phone is ringing', () => {
    const server = createMockServer();
    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_ringing', {
      callId: 'call_ringing',
      room: 'alpha123',
      callerSocketId: 'sock_alice',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_bob_old',
      calleeNickname: 'Bob',
      state: 'calling',
      isVoiceOnly: true,
      startedAt: Date.now(),
    });

    const bobNewSocket = createMockSocket('sock_bob_new');
    service.rebindReconnectingUser(
      server as any,
      bobNewSocket as any,
      'alpha123',
      'Bob',
    );

    expect(bobNewSocket.emit).toHaveBeenCalledWith(
      'userCalling',
      expect.objectContaining({
        callerName: 'Alice',
        callId: 'call_ringing',
        isVoiceOnly: true,
      }),
    );
  });

  it('14. should validate room membership when relaying screen share status', () => {
    const client = createMockSocket('sock_alice');
    const session: UserSession = {
      nickname: 'Alice',
      passcode: 'alpha123',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    const server = createMockServer();
    const targetSocket = createMockSocket('sock_target');
    const usersMap = new Map<string, UserSession>([
      [
        'sock_target',
        {
          nickname: 'Bob',
          passcode: 'alpha123',
          joinedAt: new Date(),
          isHost: false,
          isMuted: false,
        },
      ],
    ]);

    service.screenShareStatus(
      client as any,
      session,
      {
        passcode: 'alpha123',
        isSharing: true,
        targetSocketId: 'sock_target',
      },
      server as any,
      usersMap,
    );

    const emitter = server._getEmitter('sock_target');
    expect(emitter).toHaveBeenCalledWith(
      'screenShareStatus',
      expect.objectContaining({
        isSharing: true,
        from: 'Alice',
      }),
    );
  });

  it('15. should prevent cross-room call access or manipulation', async () => {
    const server = createMockServer();
    const activeCalls = (service as any).activeCallSessions;
    activeCalls.set('call_room1', {
      callId: 'call_room1',
      room: 'room_secret_1',
      callerSocketId: 'sock_user1',
      callerNickname: 'User1',
      calleeSocketId: 'sock_user2',
      calleeNickname: 'User2',
      state: 'calling',
      startedAt: Date.now(),
    });

    const eveSocket = createMockSocket('sock_eve');
    const eveSession: UserSession = {
      nickname: 'Eve',
      passcode: 'room_other_2',
      joinedAt: new Date(),
      isHost: false,
      isMuted: false,
    };

    // Eve in room_other_2 attempts to accept call in room_secret_1
    await service.acceptCall(
      server as any,
      eveSocket as any,
      eveSession,
      {
        passcode: 'room_other_2',
        callId: 'call_room1',
      },
      new Map(),
    );

    expect(eveSocket.emit).toHaveBeenCalledWith(
      'callError',
      expect.objectContaining({
        message: expect.stringContaining('expired or is no longer available'),
      }),
    );

    // Call state in room 1 must remain untouched
    const session = activeCalls.get('call_room1');
    expect(session?.state).toBe('calling');
    expect(session?.calleeSocketId).toBe('sock_user2');
  });

  it('16. should initiate open room call when multiple peers are in room and no target specified', async () => {
    const server = createMockServer();
    const aliceSocket = createMockSocket('sock_alice');
    const aliceSession: UserSession = {
      nickname: 'Alice',
      passcode: 'group_room',
      joinedAt: new Date(),
      isHost: true,
      isMuted: false,
    };

    const usersMap = new Map<string, UserSession>([
      ['sock_alice', aliceSession],
      [
        'sock_bob',
        {
          nickname: 'Bob',
          passcode: 'group_room',
          joinedAt: new Date(),
          isHost: false,
          isMuted: false,
        },
      ],
      [
        'sock_charlie',
        {
          nickname: 'Charlie',
          passcode: 'group_room',
          joinedAt: new Date(),
          isHost: false,
          isMuted: false,
        },
      ],
    ]);

    await service.callUser(
      server as any,
      aliceSocket as any,
      aliceSession,
      {
        passcode: 'group_room',
      },
      usersMap,
      () => undefined,
    );

    expect(aliceSocket.to).toHaveBeenCalledWith('group_room');
  });
});

