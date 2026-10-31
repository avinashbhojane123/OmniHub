import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { WatchPartyState } from '../../types/chat';
import { getFromClipboard } from '../../utils/clipboard';

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

  const [hasWebviewError, setHasWebviewError] = useState(false);
  const webViewRef = useRef<any>(null);
  const activeUrl = state?.videoSource?.url || '';

  const isPlaying = Boolean(state?.isPlaying);
  const currentTime = Math.floor(state?.currentTime || 0);
  const isControlsDisabled = Boolean(state?.isHostOnly && !isHost);

  useEffect(() => {
    setHasWebviewError(false);
  }, [activeUrl]);

  // Synchronize incoming remote state (seek, play, pause) to WebView player
  useEffect(() => {
    if (state && webViewRef.current) {
      try {
        const syncPayload = JSON.stringify({
          action: state.isPlaying ? 'play' : 'pause',
          currentTime: state.currentTime,
        });
        webViewRef.current.postMessage(syncPayload);
      } catch {
        // non-critical
      }
    }
  }, [state?.currentTime, state?.isPlaying]);

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

  const handlePasteClipboard = async () => {
    try {
      const text = await getFromClipboard();
      if (text && text.trim().startsWith('http')) {
        setVideoUrl(text.trim());
      } else {
        Alert.alert('Clipboard Empty', 'No valid web URL found on clipboard.');
      }
    } catch {
      // non-critical
    }
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim()) return;
    onSendComment(commentText.trim());
    setCommentText('');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getEmbedSource = (rawUrl: string, startSecs: number, play: boolean) => {
    const ytMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      return {
        html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0"><style>*{margin:0;padding:0;box-sizing:border-box;background:#000;overflow:hidden;}html,body,#player{width:100%;height:100%;}</style></head><body><div id="player"></div><script src="https://www.youtube.com/iframe_api"></script><script>
        var player;
        function onYouTubeIframeAPIReady(){
          player=new YT.Player('player',{
            videoId:'${videoId}',
            playerVars:{autoplay:${play ? 1 : 0},start:${Math.floor(startSecs)},controls:1,modestbranding:1,rel:0,playsinline:1},
            events:{
              onStateChange:function(e){
                var isP=(e.data===1);
                var cur=player.getCurrentTime?player.getCurrentTime():0;
                window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'state',isPlaying:isP,currentTime:cur}));
              },
              onError:function(e){
                var errMsg='YouTube playback error (' + e.data + ').';
                if(e.data===101||e.data===150){
                  errMsg='The video creator has blocked embedding on third-party apps.';
                } else if(e.data===2){
                  errMsg='Invalid YouTube video ID or link.';
                } else if(e.data===5){
                  errMsg='HTML5 player error on this video.';
                }
                window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'player_error',message:errMsg}));
              }
            }
          });
        }
        function handleMsg(msg){
          try{
            var d=typeof msg==='string'?JSON.parse(msg):msg;
            if(d.action==='seek'&&player&&player.seekTo){player.seekTo(d.currentTime,true);}
            else if(d.action==='play'&&player&&player.playVideo){player.playVideo();}
            else if(d.action==='pause'&&player&&player.pauseVideo){player.pauseVideo();}
          }catch(e){}
        }
        window.addEventListener('message',function(ev){handleMsg(ev.data);});
        document.addEventListener('message',function(ev){handleMsg(ev.data);});
        </script></body></html>`,
      };
    }
    if (/\.(mp4|webm|mkv|mov|m4v)(\?.*)?$/i.test(rawUrl) || rawUrl.includes('/video/')) {
      return {
        html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}video{width:100%;height:100%;object-fit:contain;}</style></head><body><video id="vplayer" src="${rawUrl}" controls ${play ? 'autoplay' : ''} playsinline></video><script>
        var v=document.getElementById('vplayer');
        v.currentTime=${startSecs};
        v.addEventListener('play',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'state',isPlaying:true,currentTime:v.currentTime}));});
        v.addEventListener('pause',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'state',isPlaying:false,currentTime:v.currentTime}));});
        v.addEventListener('seeked',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'state',isPlaying:!v.paused,currentTime:v.currentTime}));});
        v.addEventListener('error',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'player_error',message:'Could not load direct video file. Check that the URL is directly accessible and CORS enabled.'}));});
        function handleMsg(msg){
          try{
            var d=typeof msg==='string'?JSON.parse(msg):msg;
            if(d.action==='seek'){v.currentTime=d.currentTime;}
            else if(d.action==='play'){v.play();}
            else if(d.action==='pause'){v.pause();}
          }catch(e){}
        }
        window.addEventListener('message',function(ev){handleMsg(ev.data);});
        document.addEventListener('message',function(ev){handleMsg(ev.data);});
        </script></body></html>`,
      };
    }
    return { uri: rawUrl };
  };

  // Memoize source to only recreate when the video URL itself changes, preventing reload loops
  const embedSource = useMemo(() => {
    if (!activeUrl) return { uri: 'about:blank' };
    const initialSecs = Math.floor(state?.currentTime || 0);
    return getEmbedSource(activeUrl, initialSecs, Boolean(state?.isPlaying));
  }, [activeUrl]);

  const handleSeek = (newTime: number) => {
    onAction('seek', { currentTime: newTime });
    webViewRef.current?.postMessage(JSON.stringify({ action: 'seek', currentTime: newTime }));
  };

  const handleTogglePlay = () => {
    const nextPlay = !isPlaying;
    onAction(nextPlay ? 'play' : 'pause');
    webViewRef.current?.postMessage(JSON.stringify({ action: nextPlay ? 'play' : 'pause' }));
  };

  if (!visible) return null;

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
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.type === 'state' && isHost) {
                          if (data.isPlaying !== isPlaying) {
                            onAction(data.isPlaying ? 'play' : 'pause');
                          }
                        } else if (data.type === 'player_error') {
                          Alert.alert('Playback Notice', data.message || 'Video stream could not be loaded.');
                        }
                      } catch {}
                    }}
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
                <View style={styles.streamFallbackBox}>
                  <Text style={styles.streamFallbackIcon}>
                    {isPlaying ? '▶️' : '⏸️'}
                  </Text>
                  <Text style={styles.streamFallbackTitle}>
                    {state.videoSource?.title || 'Shared Stream'}
                  </Text>
                  <Text style={styles.streamFallbackTime}>
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.inputLabel}>Video Stream URL</Text>
                <TouchableOpacity onPress={handlePasteClipboard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, color: '#38BDF8', fontWeight: '700' }}>📋 Paste from Clipboard</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.urlInput}
                placeholder="Paste YouTube, MP4, or WebM stream URL..."
                placeholderTextColor="#64748B"
                value={videoUrl}
                onChangeText={setVideoUrl}
                autoCapitalize="none"
              />

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
  streamFallbackBox: {
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
  streamFallbackIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  streamFallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  streamFallbackTime: {
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
});
