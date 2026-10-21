import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { WatchPartyState } from '../../types/chat';

interface WatchPartyModalProps {
  visible: boolean;
  onClose: () => void;
  state: WatchPartyState | null;
  isHost: boolean;
  onAction: (
    action: 'open' | 'play' | 'pause' | 'seek' | 'change_video' | 'close' | 'lock_controls',
    payload?: any
  ) => void;
  onSendReaction: (emoji: string) => void;
  onSendComment: (comment: string) => void;
}

const REACTIONS = ['🍿', '🔥', '😂', '❤️', '👏', '🎬'];

const SAMPLE_VIDEOS = [
  { label: '🐰 Big Buck Bunny (MP4)', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', title: 'Big Buck Bunny' },
  { label: '🚀 NASA Earth Live (YT)', url: 'https://www.youtube.com/watch?v=21X5lGlDOfg', title: 'NASA Earth Stream' },
  { label: '🎵 Lofi Chill (YT)', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', title: 'Lofi Chill Beats' },
];

export const WatchPartyModal: React.FC<WatchPartyModalProps> = ({
  visible,
  onClose,
  state,
  isHost,
  onAction,
  onSendReaction,
  onSendComment,
}) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [commentText, setCommentText] = useState('');

  if (!visible) return null;

  const handleLaunchVideo = () => {
    if (!videoUrl.trim()) return;
    onAction('open', {
      videoSource: {
        url: videoUrl.trim(),
        title: videoTitle.trim() || 'Synced Stream',
        type: videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? 'youtube' : 'direct',
      },
      currentTime: 0,
      isPlaying: true,
    });
    setVideoUrl('');
    setVideoTitle('');
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim()) return;
    onSendComment(commentText.trim());
    setCommentText('');
  };

  const isPlaying = Boolean(state?.isPlaying);
  const currentTime = Math.floor(state?.currentTime || 0);
  const isControlsDisabled = Boolean(state?.isHostOnly && !isHost);
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getEmbedSource = (rawUrl: string, startSecs: number, play: boolean) => {
    const ytMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return {
        uri: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=${play ? 1 : 0}&start=${Math.floor(startSecs)}&controls=1&modestbranding=1&rel=0`,
      };
    }
    if (rawUrl.endsWith('.mp4') || rawUrl.endsWith('.webm') || rawUrl.includes('/video/')) {
      return {
        html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;}video{width:100%;height:100%;object-fit:contain;}</style></head><body><video src="${rawUrl}" controls ${play ? 'autoplay' : ''} playsinline></video></body></html>`,
      };
    }
    return { uri: rawUrl };
  };

  const [hasWebviewError, setHasWebviewError] = useState(false);
  const webViewRef = React.useRef<any>(null);
  const activeUrl = state?.videoSource?.url || '';

  React.useEffect(() => {
    setHasWebviewError(false);
  }, [activeUrl]);

  // Memoize source to only recreate when the video URL itself changes, preventing 1-second reload loops
  const embedSource = React.useMemo(() => {
    if (!activeUrl) return { uri: 'about:blank' };
    const initialSecs = Math.floor(state?.currentTime || 0);
    return getEmbedSource(activeUrl, initialSecs, Boolean(state?.isPlaying));
  }, [activeUrl]);

  const handleSeek = (newTime: number) => {
    onAction('seek', { currentTime: newTime });
    webViewRef.current?.injectJavaScript(`
      try {
        const v = document.querySelector('video');
        if (v) { v.currentTime = ${newTime}; }
      } catch(e) {}
      true;
    `);
  };

  const handleTogglePlay = () => {
    const nextPlay = !isPlaying;
    onAction(nextPlay ? 'play' : 'pause');
    webViewRef.current?.injectJavaScript(`
      try {
        const v = document.querySelector('video');
        if (v) { ${nextPlay ? 'v.play()' : 'v.pause()'}; }
      } catch(e) {}
      true;
    `);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Watch Party 🍿</Text>
              <Text style={styles.subtitle}>
                {state?.isActive
                  ? `Playing: ${state?.videoSource?.title || 'Video'}`
                  : 'Start a synchronized stream'}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Active Player Card */}
          {state?.isActive ? (
            <View style={styles.playerCard}>
              {/* Real Embedded Stream with Fallback */}
              {Boolean(activeUrl) && !hasWebviewError ? (
                <View style={styles.realPlayerBox}>
                  <WebView
                    ref={webViewRef}
                    source={embedSource}
                    style={styles.realPlayerWebView}
                    allowsFullscreenVideo
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    mixedContentMode="always"
                    javaScriptEnabled
                    domStorageEnabled
                    onError={() => setHasWebviewError(true)}
                    renderLoading={() => (
                      <View style={styles.playerLoadingBox}>
                        <ActivityIndicator size="small" color="#38BDF8" />
                        <Text style={styles.playerLoadingText}>Loading stream...</Text>
                      </View>
                    )}
                    startInLoadingState
                  />
                </View>
              ) : (
                <View style={styles.screenMock}>
                  <Text style={styles.screenMockIcon}>
                    {isPlaying ? '▶️' : '⏸️'}
                  </Text>
                  <Text style={styles.screenMockTitle}>
                    {state.videoSource?.title || 'Shared Stream'}
                  </Text>
                  <Text style={styles.screenMockTime}>
                    {formatTime(currentTime)}
                  </Text>
                </View>
              )}

              {/* Controls */}
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={[styles.controlBtn, isControlsDisabled && styles.controlBtnDisabled]}
                  disabled={isControlsDisabled}
                  onPress={() => handleSeek(Math.max(0, currentTime - 10))}
                >
                  <Text style={[styles.controlBtnText, isControlsDisabled && styles.controlBtnTextDisabled]}>⏪ -10s</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.controlBtn, styles.playPauseBtn, isControlsDisabled && styles.controlBtnDisabled]}
                  disabled={isControlsDisabled}
                  onPress={handleTogglePlay}
                >
                  <Text style={[styles.playPauseText, isControlsDisabled && styles.controlBtnTextDisabled]}>
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.controlBtn, isControlsDisabled && styles.controlBtnDisabled]}
                  disabled={isControlsDisabled}
                  onPress={() => handleSeek(currentTime + 10)}
                >
                  <Text style={[styles.controlBtnText, isControlsDisabled && styles.controlBtnTextDisabled]}>+10s ⏩</Text>
                </TouchableOpacity>
              </View>

              {isControlsDisabled && (
                <Text style={styles.lockedNoticeText}>🔒 Playback controls locked by host</Text>
              )}

              {/* Host Control Lock */}
              {isHost && (
                <TouchableOpacity
                  style={[
                    styles.hostLockBtn,
                    state.isHostOnly && styles.hostLockBtnActive,
                  ]}
                  onPress={() => onAction('lock_controls', { isHostOnly: !state.isHostOnly })}
                >
                  <Text style={styles.hostLockText}>
                    {state.isHostOnly ? '🔒 Host-Only Controls Active' : '🔓 Allow All to Control'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Quick Floating Reactions */}
              <View style={styles.reactionsRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {REACTIONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.reactionBtn}
                      onPress={() => onSendReaction(emoji)}
                    >
                      <Text style={styles.reactionText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Live Comment Input */}
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Drop a live reaction comment..."
                  placeholderTextColor="#64748B"
                  value={commentText}
                  onChangeText={setCommentText}
                  onSubmitEditing={handleCommentSubmit}
                />
                <TouchableOpacity
                  style={styles.sendCommentBtn}
                  onPress={handleCommentSubmit}
                >
                  <Text style={styles.sendCommentIcon}>➤</Text>
                </TouchableOpacity>
              </View>

              {/* Close Party Button */}
              {isHost && (
                <TouchableOpacity
                  style={styles.closePartyBtn}
                  onPress={() => onAction('close')}
                >
                  <Text style={styles.closePartyText}>End Watch Party</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Launcher Card */
            <View style={styles.launcherCard}>
              <Text style={styles.inputLabel}>Video Stream URL</Text>
              <TextInput
                style={styles.urlInput}
                placeholder="https://... (YouTube, MP4, HLS)"
                placeholderTextColor="#64748B"
                value={videoUrl}
                onChangeText={setVideoUrl}
                autoCapitalize="none"
              />

              {/* Sample Preset Stream Chips */}
              <View style={styles.sampleChipsRow}>
                {SAMPLE_VIDEOS.map((s) => (
                  <TouchableOpacity
                    key={s.label}
                    style={[styles.sampleChip, videoUrl === s.url && styles.sampleChipActive]}
                    onPress={() => {
                      setVideoUrl(s.url);
                      setVideoTitle(s.title);
                    }}
                  >
                    <Text style={[styles.sampleChipText, videoUrl === s.url && styles.sampleChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Title (Optional)</Text>
              <TextInput
                style={styles.urlInput}
                placeholder="Movie or Episode name..."
                placeholderTextColor="#64748B"
                value={videoTitle}
                onChangeText={setVideoTitle}
              />

              <TouchableOpacity
                style={[
                  styles.launchBtn,
                  { opacity: videoUrl.trim() ? 1 : 0.5 },
                ]}
                onPress={handleLaunchVideo}
                disabled={!videoUrl.trim()}
              >
                <Text style={styles.launchBtnText}>Start Synchronized Party 🎉</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
  },
  playerCard: {
    alignItems: 'center',
  },
  screenMock: {
    width: '100%',
    height: 140,
    backgroundColor: '#1E293B',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginBottom: 16,
  },
  screenMockIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  screenMockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  screenMockTime: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 4,
    fontWeight: '700',
  },
  realPlayerBox: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  realPlayerWebView: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerLoadingBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#94A3B8',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  controlBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  controlBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  playPauseBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 22,
  },
  playPauseText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  controlBtnDisabled: {
    opacity: 0.4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  controlBtnTextDisabled: {
    color: '#64748B',
  },
  lockedNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    textAlign: 'center',
    marginBottom: 12,
  },
  hostLockBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 14,
  },
  hostLockBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  hostLockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },
  reactionsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  reactionText: {
    fontSize: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    marginBottom: 14,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sendCommentBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendCommentIcon: {
    color: '#0F172A',
    fontWeight: '900',
  },
  closePartyBtn: {
    paddingVertical: 10,
  },
  closePartyText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  launcherCard: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  urlInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  launchBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  launchBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  sampleChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sampleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sampleChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  sampleChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  sampleChipTextActive: {
    color: '#38BDF8',
  },
});
