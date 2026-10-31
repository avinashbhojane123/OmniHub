import {
  isChatMessage,
  isRoomUser,
  isPollData,
  isLocationData,
  isWatchPartyState,
  isChatStatusStory,
  isCallActive,
  createDefaultWatchPartyState,
  createDefaultRoomWallpaper,
  createDefaultAudioPlayerState,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  DEFAULT_ROOM_WALLPAPER,
  DEFAULT_WATCH_PARTY_STATE,
  ChatMessage,
  RoomUser,
  PollData,
  LocationData,
  ActiveCallData,
  ChatStatusStory,
  WatchPartyState,
} from '../src/types/chat';

describe('Chat Types & Runtime Guards Suite', () => {
  describe('Constants Verification', () => {
    it('should declare correct message length and poll option boundaries', () => {
      expect(MAX_CHAT_MESSAGE_LENGTH).toBe(10000);
      expect(MAX_POLL_OPTIONS).toBe(5);
      expect(MIN_POLL_OPTIONS).toBe(2);
    });

    it('should export correct immutable default room wallpaper', () => {
      expect(DEFAULT_ROOM_WALLPAPER.theme).toBe('wa-doodle');
      expect(DEFAULT_ROOM_WALLPAPER.customWallpaper).toBeNull();
      expect(DEFAULT_ROOM_WALLPAPER.isDefault).toBe(true);
    });

    it('should export correct default watch party state', () => {
      expect(DEFAULT_WATCH_PARTY_STATE.isActive).toBe(false);
      expect(DEFAULT_WATCH_PARTY_STATE.videoSource).toBeNull();
      expect(DEFAULT_WATCH_PARTY_STATE.currentTime).toBe(0);
      expect(DEFAULT_WATCH_PARTY_STATE.isPlaying).toBe(false);
      expect(DEFAULT_WATCH_PARTY_STATE.playbackRate).toBe(1);
    });
  });

  describe('isChatMessage Type Guard', () => {
    it('should return true for valid chat messages with numeric ID and ISO date string', () => {
      const msg: ChatMessage = {
        id: 101,
        nickname: 'Alice',
        message: 'Hello OmniHub!',
        createdAt: '2026-10-30T10:00:00.000Z',
      };
      expect(isChatMessage(msg)).toBe(true);
    });

    it('should return true for valid chat messages with string offline ID and Date object', () => {
      const msg: ChatMessage = {
        id: 'offline_179333000',
        nickname: 'Bob',
        message: 'Pending offline message',
        createdAt: new Date(),
        status: 'sending',
        isVoiceNote: true,
        duration: 15,
      };
      expect(isChatMessage(msg)).toBe(true);
    });

    it('should return false for null, undefined, or primitive values', () => {
      expect(isChatMessage(null)).toBe(false);
      expect(isChatMessage(undefined)).toBe(false);
      expect(isChatMessage('message')).toBe(false);
      expect(isChatMessage(12345)).toBe(false);
    });

    it('should return false if required properties are missing or of incorrect types', () => {
      expect(isChatMessage({ id: 1, message: 'Missing nickname' })).toBe(false);
      expect(isChatMessage({ id: 1, nickname: 'Alice' })).toBe(false);
      expect(isChatMessage({ id: 1, nickname: 'Alice', message: 123 })).toBe(false);
      expect(isChatMessage({ id: true, nickname: 'Alice', message: 'Hi', createdAt: '2026-10-30' })).toBe(false);
    });
  });

  describe('isRoomUser Type Guard', () => {
    it('should return true for valid room user objects', () => {
      const user: RoomUser = {
        nickname: 'Alice',
        role: 'host',
        isOnline: true,
        isPip: false,
        batteryLevel: 95,
        batteryIsCharging: true,
      };
      expect(isRoomUser(user)).toBe(true);
    });

    it('should return false for missing nickname, role, or online state', () => {
      expect(isRoomUser({ nickname: 'Alice', role: 'admin' })).toBe(false);
      expect(isRoomUser({ role: 'member', isOnline: true })).toBe(false);
      expect(isRoomUser(null)).toBe(false);
    });
  });

  describe('isPollData Type Guard', () => {
    it('should return true for valid poll structures with numeric or string option IDs', () => {
      const poll: PollData = {
        question: 'Which movie to watch?',
        options: [
          { id: 1, text: 'Inception', votes: ['Alice'] },
          { id: 'opt_2', text: 'Interstellar', votes: [] },
        ],
        allowMultiple: false,
        expiresAt: '2026-10-31T00:00:00.000Z',
      };
      expect(isPollData(poll)).toBe(true);
    });

    it('should return false if options are missing or contain invalid elements', () => {
      expect(isPollData({ question: 'No options' })).toBe(false);
      expect(isPollData({ question: 'Bad options', options: 'not an array' })).toBe(false);
      expect(
        isPollData({
          question: 'Broken option',
          options: [{ id: 1, text: 123, votes: [] }],
        })
      ).toBe(false);
      expect(
        isPollData({
          question: 'Broken votes',
          options: [{ id: 1, text: 'Valid', votes: null }],
        })
      ).toBe(false);
    });
  });

  describe('isLocationData Type Guard', () => {
    it('should return true for valid numeric coordinates', () => {
      const loc: LocationData = {
        lat: 37.7749,
        lng: -122.4194,
        address: 'San Francisco, CA',
      };
      expect(isLocationData(loc)).toBe(true);
    });

    it('should return false for missing coordinates or NaN values', () => {
      expect(isLocationData({ lat: NaN, lng: 10 })).toBe(false);
      expect(isLocationData({ lat: 10, lng: '20' })).toBe(false);
      expect(isLocationData({ address: 'Only address' })).toBe(false);
      expect(isLocationData(null)).toBe(false);
    });
  });

  describe('isWatchPartyState Type Guard', () => {
    it('should return true for valid watch party state records', () => {
      const wpState: WatchPartyState = {
        isActive: true,
        videoSource: {
          url: 'https://example.com/video.mp4',
          title: 'Sample Video',
          type: 'direct',
        },
        currentTime: 45.2,
        isPlaying: true,
        playbackRate: 1,
        lastUpdatedTimestamp: Date.now(),
        version: 3,
        lastActorNickname: 'Alice',
        isBuffering: false,
        bufferingUsers: [],
      };
      expect(isWatchPartyState(wpState)).toBe(true);
    });

    it('should return false if required properties or buffering array are missing', () => {
      expect(isWatchPartyState({ isActive: true, currentTime: 10 })).toBe(false);
      expect(
        isWatchPartyState({
          isActive: true,
          currentTime: 10,
          isPlaying: true,
          version: 1,
          bufferingUsers: 'not an array',
        })
      ).toBe(false);
      expect(isWatchPartyState(null)).toBe(false);
    });
  });

  describe('isChatStatusStory Type Guard', () => {
    it('should return true for valid text and media status stories', () => {
      const story: ChatStatusStory = {
        id: 42,
        nickname: 'Alice',
        type: 'image',
        mediaUrl: 'https://example.com/story.jpg',
        createdAt: '2026-10-30T11:00:00Z',
        viewers: ['Bob', 'Charlie'],
      };
      expect(isChatStatusStory(story)).toBe(true);
    });

    it('should return false if type is not one of text, image, or video', () => {
      expect(
        isChatStatusStory({
          id: 42,
          nickname: 'Alice',
          type: 'audio', // Invalid type
          createdAt: new Date(),
        })
      ).toBe(false);
      expect(isChatStatusStory(null)).toBe(false);
    });
  });

  describe('isCallActive Helper', () => {
    it('should return true for active, calling, or incoming states', () => {
      const activeCall: ActiveCallData = {
        callId: 'call_123',
        callerNickname: 'Alice',
        calleeNickname: 'Bob',
        isVoiceOnly: false,
        state: 'active',
      };
      expect(isCallActive(activeCall)).toBe(true);
      expect(isCallActive({ ...activeCall, state: 'calling' })).toBe(true);
      expect(isCallActive({ ...activeCall, state: 'incoming' })).toBe(true);
    });

    it('should return false for terminal states, idle, or null/undefined', () => {
      const baseCall: ActiveCallData = {
        callId: 'call_123',
        callerNickname: 'Alice',
        isVoiceOnly: true,
        state: 'ended',
      };
      expect(isCallActive(baseCall)).toBe(false);
      expect(isCallActive({ ...baseCall, state: 'declined' })).toBe(false);
      expect(isCallActive({ ...baseCall, state: 'missed' })).toBe(false);
      expect(isCallActive({ ...baseCall, state: 'busy' })).toBe(false);
      expect(isCallActive({ ...baseCall, state: 'timeout' })).toBe(false);
      expect(isCallActive({ ...baseCall, state: 'idle' })).toBe(false);
      expect(isCallActive(null)).toBe(false);
      expect(isCallActive(undefined)).toBe(false);
    });
  });

  describe('Default State Factories', () => {
    it('should create independent watch party state instances without mutating defaults', () => {
      const state1 = createDefaultWatchPartyState();
      const state2 = createDefaultWatchPartyState();

      expect(state1).toEqual(DEFAULT_WATCH_PARTY_STATE);
      state1.bufferingUsers.push('Alice');
      expect(state2.bufferingUsers).toEqual([]);
      expect(DEFAULT_WATCH_PARTY_STATE.bufferingUsers).toEqual([]);
    });

    it('should create independent room wallpaper state instances', () => {
      const wp1 = createDefaultRoomWallpaper();
      const wp2 = createDefaultRoomWallpaper();

      expect(wp1.theme).toBe('wa-doodle');
      wp1.theme = 'ocean-blue';
      expect(wp2.theme).toBe('wa-doodle');
    });

    it('should create fresh audio player state', () => {
      const player = createDefaultAudioPlayerState();
      expect(player).toEqual({
        activeId: null,
        url: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        isLoading: false,
        playbackRate: 1,
      });
    });
  });
});

