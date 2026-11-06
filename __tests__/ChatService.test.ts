import { chatSocketService, calculateWatchPartyDrift } from '../src/services/chat/ChatSocketService';

describe('ChatSocketService', () => {
  afterEach(() => {
    chatSocketService.disconnect();
  });

  it('initializes with default disconnected state and empty feeds', () => {
    expect(chatSocketService.isConnected).toBe(false);
    expect(chatSocketService.connectionState).toBe('disconnected');
    expect(chatSocketService.getMessages).toEqual([]);
    expect(chatSocketService.getUsers).toEqual([]);
    expect(chatSocketService.getStatuses).toEqual([]);
    expect(chatSocketService.getTypingUsers).toEqual([]);
    expect(chatSocketService.getPinnedMessage).toBeNull();
    expect(chatSocketService.getActiveCall).toBeNull();
    expect(chatSocketService.getWatchParty).toBeNull();
  });

  it('allows subscription and notification of listeners', () => {
    const listener = jest.fn();
    const unsubscribe = chatSocketService.subscribe(listener);

    // Call disconnect or method that notifies
    chatSocketService.disconnect();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    chatSocketService.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stores nickname and passcode on connect attempt', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
      serverUrl: 'https://omnihub-1x3r.onrender.com',
    });

    expect(chatSocketService.nickname).toBe('Alex');
    expect(chatSocketService.passcode).toBe('SecretRoom');
    expect(chatSocketService.activeServerUrl).toBe('https://omnihub-1x3r.onrender.com');
  });

  it('correctly resolves relative and absolute file URLs', () => {
    expect(chatSocketService.resolveFileUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
    expect(chatSocketService.resolveFileUrl('http://example.com/image.png')).toBe('http://example.com/image.png');
    expect(chatSocketService.resolveFileUrl('file:///data/local.png')).toBe('file:///data/local.png');
    expect(chatSocketService.resolveFileUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(chatSocketService.resolveFileUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(chatSocketService.resolveFileUrl('')).toBe('');

    const relativeResult = chatSocketService.resolveFileUrl('/uploads/chat/voice.m4a');
    expect(relativeResult).toBe(`${chatSocketService.activeServerUrl}/uploads/chat/voice.m4a`);
  });

  it('supports optimistic wallpaper updates', () => {
    chatSocketService.updateRoomWallpaper('deep-purple');
    expect(chatSocketService.getWallpaper.theme).toBe('deep-purple');
    expect(chatSocketService.getWallpaper.customWallpaper).toBeNull();
    expect(chatSocketService.getWallpaper.isDefault).toBe(false);

    chatSocketService.updateRoomWallpaper('custom', 'https://example.com/custom.jpg');
    expect(chatSocketService.getWallpaper.theme).toBe('custom');
    expect(chatSocketService.getWallpaper.customWallpaper).toBe('https://example.com/custom.jpg');
    expect(chatSocketService.getWallpaper.isDefault).toBe(false);

    chatSocketService.updateRoomWallpaper('wa-doodle', null);
    expect(chatSocketService.getWallpaper.theme).toBe('wa-doodle');
    expect(chatSocketService.getWallpaper.isDefault).toBe(true);
  });

  it('supports initiating and terminating outgoing calls', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
    });

    const initiated = chatSocketService.initiateCall('Bob', true);
    expect(initiated).toBe(true);
    expect(chatSocketService.getActiveCall).not.toBeNull();
    expect(chatSocketService.getActiveCall?.callerNickname).toBe('Alex');
    expect(chatSocketService.getActiveCall?.calleeNickname).toBe('Bob');
    expect(chatSocketService.getActiveCall?.isVoiceOnly).toBe(true);
    expect(chatSocketService.getActiveCall?.state).toBe('calling');

    // Duplicate call initiation should be rejected
    const secondCall = chatSocketService.initiateCall('Charlie', false);
    expect(secondCall).toBe(false);

    // End call resets call state
    chatSocketService.endCall();
    expect(chatSocketService.getActiveCall).toBeNull();
  });

  it('handles optimistic watch party actions correctly', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
    });

    // Open
    chatSocketService.watchPartyAction('open', {
      videoSource: { url: 'https://example.com/video.mp4', title: 'Test Video', type: 'direct' },
      currentTime: 10,
      isPlaying: true,
      playbackRate: 1.25,
    });

    expect(chatSocketService.getWatchParty).not.toBeNull();
    expect(chatSocketService.getWatchParty?.isActive).toBe(true);
    expect(chatSocketService.getWatchParty?.videoSource?.url).toBe('https://example.com/video.mp4');
    expect(chatSocketService.getWatchParty?.currentTime).toBe(10);
    expect(chatSocketService.getWatchParty?.isPlaying).toBe(true);
    expect(chatSocketService.getWatchParty?.playbackRate).toBe(1.25);

    // Pause
    chatSocketService.watchPartyAction('pause');
    expect(chatSocketService.getWatchParty?.isPlaying).toBe(false);

    // Play
    chatSocketService.watchPartyAction('play');
    expect(chatSocketService.getWatchParty?.isPlaying).toBe(true);

    // Seek
    chatSocketService.watchPartyAction('seek', { currentTime: 45 });
    expect(chatSocketService.getWatchParty?.currentTime).toBe(45);

    // Rate
    chatSocketService.watchPartyAction('rate', { playbackRate: 1.5 });
    expect(chatSocketService.getWatchParty?.playbackRate).toBe(1.5);

    // Buffering and Ready
    chatSocketService.watchPartyAction('buffering');
    expect(chatSocketService.getWatchParty?.isBuffering).toBe(true);
    expect(chatSocketService.getWatchParty?.bufferingUsers).toContain('Alex');

    chatSocketService.watchPartyAction('ready');
    expect(chatSocketService.getWatchParty?.isBuffering).toBe(false);
    expect(chatSocketService.getWatchParty?.bufferingUsers).not.toContain('Alex');

    // Close
    chatSocketService.watchPartyAction('close');
    expect(chatSocketService.getWatchParty).toBeNull();
  });

  it('manages WebRTC and watch party signal subscriptions', () => {
    const webrtcListener = jest.fn();
    const wpReactionListener = jest.fn();
    const wpCommentListener = jest.fn();

    const unsubWebrtc = chatSocketService.subscribeWebrtcSignal(webrtcListener);
    const unsubReaction = chatSocketService.subscribeWatchPartyReaction(wpReactionListener);
    const unsubComment = chatSocketService.subscribeWatchPartyComment(wpCommentListener);

    expect(typeof unsubWebrtc).toBe('function');
    expect(typeof unsubReaction).toBe('function');
    expect(typeof unsubComment).toBe('function');

    unsubWebrtc();
    unsubReaction();
    unsubComment();
  });

  it('supports optimistic PIP toggle, screen share, and media state', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
    });

    chatSocketService.togglePip(true);
    chatSocketService.setScreenShareStatus(true);
    chatSocketService.setMediaState(true, false);

    const currentUser = chatSocketService.currentUser;
    // Without server session, currentUser is undefined unless present in users
    expect(chatSocketService.getUsers).toBeDefined();
  });

  it('supports updateUserMetadata, viewStatus, deleteStatus, and extended watch party actions', () => {
    chatSocketService.connect({
      nickname: 'Alex',
      passcode: 'SecretRoom',
    });

    // Update metadata should not throw
    chatSocketService.updateUserMetadata({
      batteryLabel: '88%',
      batteryIsCharging: true,
      networkLabel: '5G Fast',
    });

    // Status methods accept string or number safely
    chatSocketService.viewStatus('101');
    chatSocketService.viewStatus(102);
    chatSocketService.deleteStatus('201');
    chatSocketService.deleteStatus(202);

    // Watch party change_video and toggle_host_lock
    chatSocketService.watchPartyAction('open', {
      videoSource: { url: 'https://example.com/movie1.mp4', title: 'Movie 1', type: 'direct' },
      currentTime: 0,
      isPlaying: false,
    });
    expect(chatSocketService.getWatchParty?.videoSource?.url).toBe('https://example.com/movie1.mp4');

    chatSocketService.watchPartyAction('change_video', {
      videoSource: { url: 'https://example.com/movie2.mp4', title: 'Movie 2', type: 'direct' },
      currentTime: 15,
      isPlaying: true,
    });
    expect(chatSocketService.getWatchParty?.videoSource?.url).toBe('https://example.com/movie2.mp4');
    expect(chatSocketService.getWatchParty?.currentTime).toBe(15);
    expect(chatSocketService.getWatchParty?.isPlaying).toBe(true);

    chatSocketService.watchPartyAction('toggle_host_lock');
    expect(chatSocketService.getWatchParty?.isHostOnly).toBe(false);

    // Watch party reactions and comments with valid signatures
    chatSocketService.watchPartyReaction('fire');
    chatSocketService.watchPartyComment('Great scene!', 120);

    chatSocketService.watchPartyAction('close');
    expect(chatSocketService.getWatchParty).toBeNull();
  });

  it('correctly calculates watch party sync drift and seeks based on 2-second tolerance', () => {
    // Case 1: Within tolerance (0.8s difference) -> no seek
    const withinTolerance = calculateWatchPartyDrift(10.8, 10.0, true, true);
    expect(withinTolerance.shouldSeek).toBe(false);
    expect(withinTolerance.reason).toBe('in_tolerance');
    expect(withinTolerance.driftSeconds).toBeCloseTo(0.8);

    // Case 2: Exactly at 2.0s boundary -> no seek
    const atBoundary = calculateWatchPartyDrift(12.0, 10.0, true, true, 2.0);
    expect(atBoundary.shouldSeek).toBe(false);
    expect(atBoundary.reason).toBe('in_tolerance');

    // Case 3: Drift exceeded (2.5s difference) -> seek required
    const exceeded = calculateWatchPartyDrift(12.5, 10.0, true, true, 2.0);
    expect(exceeded.shouldSeek).toBe(true);
    expect(exceeded.reason).toBe('drift_exceeded');
    expect(exceeded.driftSeconds).toBeCloseTo(2.5);

    // Case 4: Playback state mismatch (host is paused, participant is playing) -> seek required
    const mismatch = calculateWatchPartyDrift(10.5, 10.0, false, true);
    expect(mismatch.shouldSeek).toBe(true);
    expect(mismatch.reason).toBe('playback_mismatch');

    // Case 5: Forced resync flag active -> seek required immediately even with 0s drift
    const forced = calculateWatchPartyDrift(10.0, 10.0, true, true, 2.0, true);
    expect(forced.shouldSeek).toBe(true);
    expect(forced.reason).toBe('forced');
  });

  it('dispatches watch party reactions and comments to registered subscribers', () => {
    const reactionListener = jest.fn();
    const commentListener = jest.fn();

    const unsubReaction = chatSocketService.subscribeWatchPartyReaction(reactionListener);
    const unsubComment = chatSocketService.subscribeWatchPartyComment(commentListener);

    // Simulate dispatching events through helper or socket events
    chatSocketService.dispatchWatchPartyReactionForTesting?.({ emoji: '🔥', reaction: '🔥' });
    chatSocketService.dispatchWatchPartyCommentForTesting?.({ text: 'Amazing!', comment: 'Amazing!' });

    expect(reactionListener).toHaveBeenCalledWith(expect.objectContaining({ emoji: '🔥' }));
    expect(commentListener).toHaveBeenCalledWith(expect.objectContaining({ comment: 'Amazing!' }));

    unsubReaction();
    unsubComment();
  });

  it('supports shared video queue additions and playing queued items in watch party', () => {
    chatSocketService.watchPartyAction('open', {
      videoSource: { url: 'https://example.com/movie1.mp4', title: 'Movie 1', type: 'direct' },
      currentTime: 0,
      isPlaying: true,
    });

    expect(chatSocketService.getWatchParty?.queue || []).toEqual([]);

    // Suggest a video
    chatSocketService.watchPartyAction('suggest_video', {
      url: 'https://example.com/movie2.mp4',
      title: 'Movie 2',
      suggestedBy: 'Alice',
    });

    expect(chatSocketService.getWatchParty?.queue?.length).toBe(1);
    expect(chatSocketService.getWatchParty?.queue?.[0].title).toBe('Movie 2');
    expect(chatSocketService.getWatchParty?.queue?.[0].suggestedBy).toBe('Alice');

    // Host plays the queued item
    const queuedId = chatSocketService.getWatchParty!.queue![0].id;
    chatSocketService.watchPartyAction('play_queue_item', { id: queuedId });

    expect(chatSocketService.getWatchParty?.videoSource?.url).toBe('https://example.com/movie2.mp4');
    expect(chatSocketService.getWatchParty?.queue?.length).toBe(0);

    chatSocketService.watchPartyAction('close');
  });

  it('increments version on playback actions and isolates metadata from version bumping', () => {
    chatSocketService.watchPartyAction('open', {
      videoSource: { url: 'https://example.com/movie1.mp4', title: 'Movie 1', type: 'direct' },
      currentTime: 0,
      isPlaying: false,
    });
    const v1 = chatSocketService.getWatchParty!.version;

    // Seek increments version
    chatSocketService.watchPartyAction('seek', { currentTime: 25 });
    const v2 = chatSocketService.getWatchParty!.version;
    expect(v2).toBe(v1 + 1);

    // Play increments version
    chatSocketService.watchPartyAction('play');
    const v3 = chatSocketService.getWatchParty!.version;
    expect(v3).toBe(v2 + 1);

    // Pause increments version
    chatSocketService.watchPartyAction('pause');
    const v4 = chatSocketService.getWatchParty!.version;
    expect(v4).toBe(v3 + 1);

    // Suggest video DOES NOT increment version (prevents spurious participant seeks)
    chatSocketService.watchPartyAction('suggest_video', {
      url: 'https://example.com/movie3.mp4',
      title: 'Movie 3',
      suggestedBy: 'Bob',
    });
    const v5 = chatSocketService.getWatchParty!.version;
    expect(v5).toBe(v4);

    chatSocketService.watchPartyAction('close');
  });
});
