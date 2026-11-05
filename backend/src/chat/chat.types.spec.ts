import {
  UserSession,
  ChatRoomUser,
  UserMetadataUpdatedPayload,
  UserModerationEventPayload,
  UserPromotedPayload,
  HostChangedPayload,
  UserMuteToggledPayload,
  ActiveCallSession,
  IceServerConfig,
  WatchPartyState,
  WatchPartyVideoSource,
  WatchPartyActionType,
  WatchPartyUpdatePayload,
  WatchPartyReactionPayload,
  WatchPartyCommentPayload,
  RoomWallpaperState,
  WebRtcMediaStatePayload,
  CallSignalPayload,
  UserRole,
  CallState,
  WatchPartyVideoType,
  StatusType,
  StatusSticker,
  PollOption,
  MessagePollData,
  MessageReplyTo,
  MessageLocationData,
  MessageReactions,
  ChatMessagePayload,
  SocketAckResponse,
} from './chat.types';

describe('chat.types contract and structure suite', () => {
  it('UserSession should validate correct structure and optional role/flags', () => {
    const session: UserSession = {
      userId: 42,
      nickname: 'Alice',
      passcode: 'room101',
      socketId: 'sock_123',
      isPip: false,
      isMuted: false,
      isOnline: true,
      isScreenSharing: false,
      role: 'host',
      avatarUrl: 'https://example.com/avatar.png',
      deviceType: 'mobile',
      deviceModel: 'Pixel 8',
      appVersion: '1.4.0',
      os: 'Android',
      networkLabel: '5G',
      batteryLabel: '85%',
      batteryIsCharging: true,
    };

    expect(session.nickname).toBe('Alice');
    expect(session.passcode).toBe('room101');
    const role: UserRole = session.role!;
    expect(role).toBe('host');
    expect(session.isOnline).toBe(true);
    expect(session.deviceModel).toBe('Pixel 8');
  });

  it('ChatRoomUser and moderation event payloads should match room user contracts', () => {
    const user: ChatRoomUser = {
      id: 1,
      nickname: 'Bob',
      role: 'member',
      isCreator: false,
      isMuted: false,
      mutedUntil: null,
      isBanned: false,
      isOnline: true,
      lastSeen: new Date(),
      deviceType: 'mobile',
      deviceModel: 'Galaxy S24',
      appVersion: '1.4.0',
      os: 'Android',
      avatarUrl: null,
      networkLabel: 'WiFi',
      batteryLabel: null,
      batteryIsCharging: false,
    };

    const metaUpdate: UserMetadataUpdatedPayload = {
      nickname: 'Bob',
      batteryLabel: '90%',
      batteryIsCharging: true,
    };

    const modEvent: UserModerationEventPayload = {
      targetNickname: 'Bob',
      kickedBy: 'Alice',
    };

    const promoteEvent: UserPromotedPayload = {
      targetNickname: 'Bob',
      role: 'admin',
      promotedBy: 'Alice',
    };

    const hostEvent: HostChangedPayload = {
      newHostNickname: 'Bob',
      newHost: 'Bob',
      previousHostNickname: 'Alice',
      previousHost: 'Alice',
    };

    const muteEvent: UserMuteToggledPayload = {
      targetNickname: 'Bob',
      isMuted: true,
      mutedUntil: new Date(),
      mutedBy: 'Alice',
    };

    expect(user.id).toBe(1);
    expect(metaUpdate.nickname).toBe('Bob');
    expect(modEvent.kickedBy).toBe('Alice');
    expect(promoteEvent.role).toBe('admin');
    expect(hostEvent.newHostNickname).toBe('Bob');
    expect(muteEvent.isMuted).toBe(true);
  });

  it('ActiveCallSession and IceServerConfig should validate call states and properties', () => {
    const callSession: ActiveCallSession = {
      callId: 'call_1',
      room: 'room101',
      callerSocketId: 'sock_1',
      callerNickname: 'Alice',
      calleeSocketId: 'sock_2',
      calleeNickname: 'Bob',
      isVoiceOnly: true,
      state: 'calling',
      startedAt: Date.now(),
    };

    const iceServer: IceServerConfig = {
      urls: ['stun:stun.l.google.com:19302', 'turn:openrelay.metered.ca:443'],
      username: 'openrelay',
      credential: 'openrelay',
    };

    expect(callSession.callId).toBe('call_1');
    expect(callSession.state).toBe('calling');
    expect(callSession.isVoiceOnly).toBe(true);
    expect(iceServer.urls).toHaveLength(2);

    const validStates: CallState[] = ['calling', 'active', 'ended'];
    expect(validStates).toContain(callSession.state);
  });

  it('WatchParty structures and events should validate state, updates, reactions, and comments', () => {
    const videoSource: WatchPartyVideoSource = {
      url: 'https://video.example.com/stream.mp4',
      title: 'Movie Night',
      type: 'direct',
      duration: 3600,
      provider: 'OmniHub',
      originalUrl: 'https://video.example.com/stream.mp4',
    };

    const wpState: WatchPartyState = {
      isActive: true,
      videoSource,
      currentTime: 120,
      isPlaying: true,
      playbackRate: 1.0,
      lastUpdatedTimestamp: Date.now(),
      scheduledStartServerTime: Date.now() + 200,
      version: 1,
      lastActorNickname: 'Alice',
      isBuffering: false,
      bufferingUsers: [],
      hostNickname: 'Alice',
      isHostOnly: false,
    };

    const updatePayload: WatchPartyUpdatePayload = {
      action: 'play',
      videoSource,
      currentTime: 120,
      isPlaying: true,
      playbackRate: 1.0,
      isBuffering: false,
      bufferingUsers: [],
      lastUpdatedTimestamp: Date.now(),
      version: 1,
      lastActorNickname: 'Alice',
      hostNickname: 'Alice',
      isHostOnly: false,
      serverTime: Date.now(),
    };

    const reactionPayload: WatchPartyReactionPayload = {
      from: 'Alice',
      reaction: 'heart',
      timestamp: Date.now(),
    };

    const commentPayload: WatchPartyCommentPayload = {
      id: 'c1',
      from: 'Alice',
      text: 'Great scene!',
      top: 30,
      timestamp: Date.now(),
    };

    expect(wpState.isActive).toBe(true);
    expect(updatePayload.action).toBe('play');
    expect(reactionPayload.reaction).toBe('heart');
    expect(commentPayload.text).toBe('Great scene!');

    const videoTypes: WatchPartyVideoType[] = ['direct', 'youtube', 'embed'];
    expect(videoTypes).toContain(videoSource.type);
  });

  it('WatchPartyActionType should cover all supported watch party actions', () => {
    const actions: WatchPartyActionType[] = [
      'open',
      'invite',
      'accept',
      'decline',
      'play',
      'pause',
      'seek',
      'rate',
      'change_video',
      'buffering',
      'ready',
      'close',
      'toggle_host_lock',
      'sync_tick',
      'heartbeat',
    ];

    expect(actions.length).toBe(15);
    expect(actions).toContain('play');
    expect(actions).toContain('pause');
    expect(actions).toContain('seek');
  });

  it('RoomWallpaperState should allow standard and custom theme presets', () => {
    const defaultState: RoomWallpaperState = {
      theme: 'wa-doodle',
      customWallpaper: null,
    };

    const customState: RoomWallpaperState = {
      theme: 'custom',
      customWallpaper: '/uploads/wallpaper-abc.png',
    };

    expect(defaultState.theme).toBe('wa-doodle');
    expect(customState.customWallpaper).toBe('/uploads/wallpaper-abc.png');
  });

  it('Status and Message sub-domain types should conform to data schema', () => {
    const statusType: StatusType = 'image';
    const sticker: StatusSticker = { id: 1, emoji: '🔥' };

    const pollOption: PollOption = { id: 1, text: 'Option A', votes: ['Alice'] };
    const poll: MessagePollData = {
      question: 'Favorite Framework?',
      options: [pollOption],
      allowMultiple: false,
    };

    const reply: MessageReplyTo = {
      id: 100,
      nickname: 'Bob',
      message: 'Original message',
    };

    const location: MessageLocationData = { lat: 37.7749, lng: -122.4194 };
    const reactions: MessageReactions = { '👍': ['Alice', 'Bob'] };

    const chatMsg: ChatMessagePayload = {
      id: 1,
      roomId: 101,
      nickname: 'Alice',
      message: 'Hello World',
      createdAt: new Date(),
      replyTo: reply,
      pollData: poll,
      locationData: location,
      reactions,
      isDirect: false,
    };

    expect(statusType).toBe('image');
    expect(sticker.emoji).toBe('🔥');
    expect(poll.options[0].votes).toContain('Alice');
    expect(reply.nickname).toBe('Bob');
    expect(location.lat).toBe(37.7749);
    expect(reactions['👍']).toHaveLength(2);
    expect(chatMsg.message).toBe('Hello World');
  });

  it('WebRtcMediaStatePayload, CallSignalPayload and SocketAckResponse should validate payloads', () => {
    const mediaPayload: WebRtcMediaStatePayload = {
      from: 'Alice',
      fromSocketId: 'sock_1',
      micMuted: false,
      cameraOff: true,
      isAudioMuted: false,
      isVideoMuted: true,
      callId: 'call_1',
    };

    const signalPayload: CallSignalPayload = {
      callerName: 'Alice',
      from: 'Alice',
      callId: 'call_1',
      callerSocketId: 'sock_1',
      targetSocketId: 'sock_2',
      isVoiceOnly: false,
    };

    const ack: SocketAckResponse = {
      success: true,
      message: 'Action completed',
      data: { id: 10 },
    };

    expect(mediaPayload.from).toBe('Alice');
    expect(mediaPayload.cameraOff).toBe(true);
    expect(signalPayload.targetSocketId).toBe('sock_2');
    expect(ack.success).toBe(true);
  });
});
