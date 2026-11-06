import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WatchPartyService } from './watch-party.service';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { UserSession } from '../chat.types';

describe('WatchPartyService', () => {
  let service: WatchPartyService;

  const mockRoomRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
  };

  const mockServer: any = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mockSocket: any = {
    id: 'socket_alice',
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };

  const hostSession: UserSession = {
    socketId: 'socket_alice',
    nickname: 'Alice',
    passcode: 'partyroom',
    role: 'host',
    joinedAt: Date.now(),
    isMuted: false,
    isBanned: false,
  };

  const participantSession: UserSession = {
    socketId: 'socket_bob',
    nickname: 'Bob',
    passcode: 'partyroom',
    role: 'member',
    joinedAt: Date.now(),
    isMuted: false,
    isBanned: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchPartyService,
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

    service = module.get<WatchPartyService>(WatchPartyService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('initializes a watch party and maintains queue on suggest_video', () => {
    // Open session
    const openRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'open',
        videoSource: { url: 'https://example.com/v1.mp4', title: 'Video 1', type: 'direct' },
        currentTime: 0,
        isPlaying: false,
      },
      () => true,
    );

    expect(openRes.success).toBe(true);
    expect(openRes.state.queue).toEqual([]);
    const initialVersion = openRes.state.version;

    // Participant suggests a video
    const suggestRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      participantSession,
      {
        passcode: 'partyroom',
        action: 'suggest_video',
        url: 'https://example.com/v2.mp4',
        title: 'Video 2',
        suggestedBy: 'Bob',
      },
      () => true,
    );

    expect(suggestRes.success).toBe(true);
    expect(suggestRes.state.queue.length).toBe(1);
    expect(suggestRes.state.queue[0].title).toBe('Video 2');
    expect(suggestRes.state.queue[0].suggestedBy).toBe('Bob');
    // Suggesting does not increment playback version
    expect(suggestRes.state.version).toBe(initialVersion);

    // Verify broadcast occurred with the updated queue
    expect(mockServer.to).toHaveBeenCalledWith('partyroom');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'watchPartyUpdate',
      expect.objectContaining({
        action: 'suggest_video',
        queue: expect.arrayContaining([
          expect.objectContaining({ title: 'Video 2' }),
        ]),
      }),
    );
  });

  it('switches video source, clears queued item, and increments version on play_queue_item', () => {
    // Open and suggest
    service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'open',
        videoSource: { url: 'https://example.com/v1.mp4', title: 'Video 1', type: 'direct' },
      },
      () => true,
    );

    const suggestRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      participantSession,
      {
        passcode: 'partyroom',
        action: 'suggest_video',
        url: 'https://example.com/v2.mp4',
        title: 'Video 2',
        suggestedBy: 'Bob',
      },
      () => true,
    );

    const queuedId = suggestRes.state.queue[0].id;
    const vBefore = suggestRes.state.version;

    // Host plays the queued item
    const playRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'play_queue_item',
        id: queuedId,
      },
      () => true,
    );

    expect(playRes.success).toBe(true);
    expect(playRes.state.videoSource.url).toBe('https://example.com/v2.mp4');
    expect(playRes.state.queue.length).toBe(0);
    expect(playRes.state.isPlaying).toBe(true);
    expect(playRes.state.currentTime).toBe(0);
    // Playback change increments version
    expect(playRes.state.version).toBe(vBefore + 1);
  });

  it('removes item from queue on remove_queue_item without version bump', () => {
    service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'open',
        videoSource: { url: 'https://example.com/v1.mp4', title: 'Video 1' },
      },
      () => true,
    );

    const suggestRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      participantSession,
      {
        passcode: 'partyroom',
        action: 'suggest_video',
        url: 'https://example.com/v2.mp4',
        title: 'Video 2',
      },
      () => true,
    );

    const queuedId = suggestRes.state.queue[0].id;
    const vBefore = suggestRes.state.version;

    const removeRes = service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'remove_queue_item',
        id: queuedId,
      },
      () => true,
    );

    expect(removeRes.success).toBe(true);
    expect(removeRes.state.queue.length).toBe(0);
    expect(removeRes.state.version).toBe(vBefore);
  });

  it('broadcasts unicode emoji reactions to room participants', () => {
    service.watchPartyReaction(mockServer, hostSession, {
      passcode: 'partyroom',
      reaction: '🍿',
      emoji: '🍿',
    });

    expect(mockServer.to).toHaveBeenCalledWith('partyroom');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'watchPartyReaction',
      expect.objectContaining({
        from: 'Alice',
        reaction: '🍿',
        emoji: '🍿',
      }),
    );
  });

  it('returns state with queue on getWatchPartyState', () => {
    service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'open',
        videoSource: { url: 'https://example.com/v1.mp4', title: 'Video 1' },
      },
      () => true,
    );

    service.handleWatchPartyAction(
      mockServer,
      mockSocket,
      hostSession,
      {
        passcode: 'partyroom',
        action: 'suggest_video',
        url: 'https://example.com/v2.mp4',
        title: 'Video 2',
      },
      () => true,
    );

    const clientSocket: any = { emit: jest.fn() };
    const stateRes = service.getWatchPartyState(clientSocket, hostSession, {
      passcode: 'partyroom',
    });

    expect(stateRes.success).toBe(true);
    expect(stateRes.state.queue.length).toBe(1);
    expect(clientSocket.emit).toHaveBeenCalledWith(
      'watchPartyState',
      expect.objectContaining({
        queue: expect.arrayContaining([
          expect.objectContaining({ title: 'Video 2' }),
        ]),
      }),
    );
  });
});
