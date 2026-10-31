import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  BackHandler,
  Vibration,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ActiveCallData } from '../../types/chat';
import { chatSocketService } from '../../services/chat/ChatSocketService';

const WebViewComponent: any = WebView;

interface CallOverlayModalProps {
  call: ActiveCallData | null;
  onAccept: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: (minimized: boolean) => void;
}

const getWebRtcHtml = (isVoiceOnly: boolean, isCaller: boolean, targetSocketId: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; position: relative; }
    #remoteVideo { width: 100%; height: 100%; object-fit: cover; }
    #localVideo {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 100px;
      height: 140px;
      border-radius: 14px;
      object-fit: cover;
      border: 2px solid #38BDF8;
      background: #0F172A;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <video id="remoteVideo" autoplay playsinline></video>
  <video id="localVideo" autoplay playsinline muted></video>
  <script>
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });
    let localStream = null;
    let currentFacing = 'user';
    const isVoiceOnly = ${Boolean(isVoiceOnly)};
    const isCaller = ${Boolean(isCaller)};
    const targetSocketId = "${targetSocketId}";
    const earlyCandidateQueue = [];

    pc.onicecandidate = function(event) {
      if (event.candidate && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          targetSocketId: targetSocketId
        }));
      }
    };

    pc.ontrack = function(event) {
      const remote = document.getElementById('remoteVideo');
      if (remote && event.streams && event.streams[0]) {
        remote.srcObject = event.streams[0];
      }
    };

    async function drainEarlyCandidates() {
      while (earlyCandidateQueue.length > 0) {
        const c = earlyCandidateQueue.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {}
      }
    }

    async function init() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: !isVoiceOnly
        });
        const local = document.getElementById('localVideo');
        if (local && !isVoiceOnly) {
          local.srcObject = localStream;
        } else if (local) {
          local.style.display = 'none';
        }

        localStream.getTracks().forEach(function(track) {
          pc.addTrack(track, localStream);
        });

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bridge_ready' }));
        }

        if (isCaller) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'offer',
              offer: offer,
              targetSocketId: targetSocketId,
              isVoiceOnly: isVoiceOnly
            }));
          }
        }
      } catch (err) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: err.message
          }));
        }
      }
    }

    const initPromise = init();

    async function handleCommand(rawData) {
      try {
        const msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (msg.type === 'offer') {
          await initPromise;
          const offerPayload = msg.payload ? msg.payload.offer : msg.offer;
          if (offerPayload) {
            await pc.setRemoteDescription(new RTCSessionDescription(offerPayload));
            await drainEarlyCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'answer',
                answer: answer,
                targetSocketId: targetSocketId
              }));
            }
          }
        } else if (msg.type === 'answer') {
          const answerPayload = msg.payload ? msg.payload.answer : msg.answer;
          if (answerPayload) {
            await pc.setRemoteDescription(new RTCSessionDescription(answerPayload));
            await drainEarlyCandidates();
          }
        } else if (msg.type === 'candidate') {
          const candidatePayload = msg.payload ? msg.payload.candidate : msg.candidate;
          if (candidatePayload) {
            if (!pc.remoteDescription) {
              earlyCandidateQueue.push(candidatePayload);
            } else {
              pc.addIceCandidate(new RTCIceCandidate(candidatePayload)).catch(function(e) {});
            }
          }
        } else if (msg.type === 'toggle_mute') {
          if (localStream) {
            localStream.getAudioTracks().forEach(function(t) { t.enabled = !msg.isMuted; });
          }
        } else if (msg.type === 'toggle_video') {
          if (localStream) {
            localStream.getVideoTracks().forEach(function(t) { t.enabled = !msg.isVideoOff; });
          }
        } else if (msg.type === 'flip_camera') {
          if (!isVoiceOnly && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            navigator.mediaDevices.getUserMedia({
              audio: true,
              video: { facingMode: currentFacing }
            }).then(function(newStream) {
              const videoTrack = newStream.getVideoTracks()[0];
              const sender = pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
              if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
              }
              const local = document.getElementById('localVideo');
              if (local) local.srcObject = newStream;
              if (localStream) {
                localStream.getVideoTracks().forEach(function(t) { t.stop(); });
              }
              localStream = newStream;
            }).catch(function(e) {});
          }
        }
      } catch (e) {}
    }

    window.addEventListener('message', function(e) { handleCommand(e.data); });
    document.addEventListener('message', function(e) { handleCommand(e.data); });
  </script>
</body>
</html>
`;

export const CallOverlayModal: React.FC<CallOverlayModalProps> = ({
  call,
  onAccept,
  onDecline,
  onEndCall,
  isMinimized = false,
  onToggleMinimize,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<{ isAudioMuted: boolean; isVideoMuted: boolean }>({
    isAudioMuted: false,
    isVideoMuted: false,
  });
  const webViewRef = useRef<any>(null);
  const pendingSignalsRef = useRef<any[]>([]);

  if (!call || call.state === 'idle' || call.state === 'ended') {
    return null;
  }

  const isIncoming = call.state === 'incoming';
  const isCalling = call.state === 'calling';
  const isActive = call.state === 'active';

  const isCaller = call.callerNickname?.trim().toLowerCase() === chatSocketService.nickname.trim().toLowerCase();
  const targetSocketId = isCaller ? (call.calleeSocketId || '') : (call.callerSocketId || '');

  useEffect(() => {
    setIsBridgeReady(false);
    pendingSignalsRef.current = [];
  }, [call?.callId]);

  useEffect(() => {
    if (!isActive) {
      setIsBridgeReady(false);
      pendingSignalsRef.current = [];
      setRemoteMedia({ isAudioMuted: false, isVideoMuted: false });
      return;
    }
    const unsub = chatSocketService.subscribeWebrtcSignal((signal) => {
      if (signal.type === 'mediaState') {
        const payload = signal.payload;
        if (payload) {
          setRemoteMedia({
            isAudioMuted: Boolean(payload.isAudioMuted),
            isVideoMuted: Boolean(payload.isVideoMuted),
          });
        }
        return;
      }
      if (isBridgeReady && webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(signal));
      } else {
        pendingSignalsRef.current.push(signal);
      }
    });
    return () => {
      unsub();
    };
  }, [isActive, isBridgeReady, call?.callId]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const displayName = (isIncoming
    ? call.callerNickname
    : call.calleeNickname || 'Room Participant') || 'Participant';

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    chatSocketService.setMediaState(nextMute, isVideoOff);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'toggle_mute', isMuted: nextMute }));
  };

  const handleToggleVideo = () => {
    const nextVideo = !isVideoOff;
    setIsVideoOff(nextVideo);
    chatSocketService.setMediaState(isMuted, nextVideo);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'toggle_video', isVideoOff: nextVideo }));
  };

  const handleFlipCamera = () => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'flip_camera' }));
  };

  useEffect(() => {
    if (isIncoming) {
      Vibration.vibrate([0, 800, 1000], true);
    } else {
      Vibration.cancel();
    }
    return () => {
      Vibration.cancel();
    };
  }, [isIncoming]);

  const handleWebRtcMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'bridge_ready') {
        setIsBridgeReady(true);
        if (pendingSignalsRef.current.length > 0 && webViewRef.current) {
          pendingSignalsRef.current.forEach((sig) => {
            webViewRef.current.postMessage(JSON.stringify(sig));
          });
          pendingSignalsRef.current = [];
        }
      } else if (data.type === 'offer') {
        chatSocketService.sendWebrtcOffer(data.offer, data.targetSocketId, data.isVoiceOnly);
      } else if (data.type === 'answer') {
        chatSocketService.sendWebrtcAnswer(data.answer, data.targetSocketId);
      } else if (data.type === 'candidate') {
        chatSocketService.sendWebrtcCandidate(data.candidate, data.targetSocketId);
      }
    } catch {}
  };

  useEffect(() => {
    if (!isMinimized && (isActive || isCalling || isIncoming)) {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isActive && onToggleMinimize) {
          onToggleMinimize(true);
          return true;
        }
        if (isCalling || isIncoming) {
          onEndCall();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }
  }, [isMinimized, isActive, isCalling, isIncoming, onToggleMinimize, onEndCall]);

  return (
    <View
      style={[
        styles.overlay,
        isMinimized && styles.overlayHidden,
      ]}
      pointerEvents={isMinimized ? 'none' : 'auto'}
    >
      <SafeAreaView style={styles.container}>
          {/* Top Status */}
          <View style={styles.header}>
            {isActive && Boolean(onToggleMinimize) && (
              <View style={styles.headerTopRow}>
                <TouchableOpacity
                  style={styles.minimizeBtn}
                  onPress={() => onToggleMinimize?.(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.minimizeBtnText}>⇣ Minimize to Chat</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.callTypeBadge}>
              {call.isVoiceOnly ? '🎙️ VOICE CALL' : '📹 VIDEO CALL'}
            </Text>
            <Text style={styles.callStateText}>
              {isIncoming && 'Incoming Call...'}
              {isCalling && 'Calling...'}
              {isActive && 'In Call'}
            </Text>
            {isActive && remoteMedia.isAudioMuted && (
              <View style={styles.remoteStatusBadge}>
                <Text style={styles.remoteStatusBadgeText}>🔇 @{displayName} is muted</Text>
              </View>
            )}
          </View>

          {/* Center Display: Video Stream or Avatar */}
          {isActive && !call.isVoiceOnly ? (
            <View style={styles.videoStreamContainer}>
              <WebViewComponent
                key={`call-bridge-${call?.callId || 'default'}-video`}
                ref={webViewRef}
                source={{ html: getWebRtcHtml(false, isCaller, targetSocketId) }}
                onMessage={handleWebRtcMessage}
                style={styles.videoWebview}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
              />
              {remoteMedia.isVideoMuted && (
                <View style={[StyleSheet.absoluteFill, styles.remoteVideoMutedOverlay]}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.remoteVideoMutedText}>📹 @{displayName} turned camera off</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.centerSection}>
              <View style={styles.avatarGlowRing}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.participantName}>@{displayName}</Text>
              {isActive && (
                <Text style={styles.durationText}>
                  {formatDuration(call.durationSeconds)}
                </Text>
              )}
              {(isIncoming || isCalling) && (
                <Text style={styles.ringingSubtext}>Ringing...</Text>
              )}

              {/* Hidden WebRTC Audio Stream Bridge for Voice Calls */}
              {isActive && (
                <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
                  <WebViewComponent
                    key={`call-bridge-${call?.callId || 'default'}-voice`}
                    ref={webViewRef}
                    source={{ html: getWebRtcHtml(true, isCaller, targetSocketId) }}
                    onMessage={handleWebRtcMessage}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    javaScriptEnabled
                    domStorageEnabled
                    originWhitelist={['*']}
                  />
                </View>
              )}
            </View>
          )}

          {/* In-Call Media Quick Toggles */}
          {isActive && (
            <View style={styles.mediaTogglesRow}>
              <TouchableOpacity
                style={[styles.mediaToggleBtn, isMuted && styles.mediaToggleBtnActive]}
                onPress={handleToggleMute}
              >
                <Text style={styles.mediaToggleIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
                <Text style={styles.mediaToggleLabel}>{isMuted ? 'Muted' : 'Mic On'}</Text>
              </TouchableOpacity>

              {!call.isVoiceOnly && (
                <>
                  <TouchableOpacity
                    style={[styles.mediaToggleBtn, isVideoOff && styles.mediaToggleBtnActive]}
                    onPress={handleToggleVideo}
                  >
                    <Text style={styles.mediaToggleIcon}>{isVideoOff ? '🚫' : '📹'}</Text>
                    <Text style={styles.mediaToggleLabel}>{isVideoOff ? 'Video Off' : 'Camera On'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.mediaToggleBtn}
                    onPress={handleFlipCamera}
                  >
                    <Text style={styles.mediaToggleIcon}>🔄</Text>
                    <Text style={styles.mediaToggleLabel}>Flip Cam</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.mediaToggleBtn, isSpeakerOn && styles.mediaToggleBtnActive]}
                onPress={() => setIsSpeakerOn(!isSpeakerOn)}
              >
                <Text style={styles.mediaToggleIcon}>{isSpeakerOn ? '🔊' : '🔈'}</Text>
                <Text style={styles.mediaToggleLabel}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {isIncoming ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.declineBtn]}
                  onPress={onDecline}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnIcon}>✕</Text>
                  <Text style={styles.btnLabel}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={onAccept}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnIcon}>✓</Text>
                  <Text style={styles.btnLabel}>Answer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.endBtn]}
                onPress={onEndCall}
                activeOpacity={0.8}
              >
                <Text style={styles.btnIcon}>✆</Text>
                <Text style={styles.btnLabel}>End Call</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 15, 30, 0.98)',
    zIndex: 99999,
    elevation: 99999,
  },
  overlayHidden: {
    opacity: 0,
    zIndex: -1,
    elevation: -1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  headerTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  minimizeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  minimizeBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  callTypeBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  callStateText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '600',
  },
  centerSection: {
    alignItems: 'center',
  },
  videoStreamContainer: {
    width: '100%',
    height: 380,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginVertical: 10,
  },
  videoWebview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  avatarGlowRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  participantName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  durationText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 1,
  },
  ringingSubtext: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  remoteStatusBadge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  remoteStatusBadgeText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
  },
  remoteVideoMutedOverlay: {
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  remoteVideoMutedText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
    marginTop: 12,
  },
  mediaTogglesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  mediaToggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mediaToggleBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
  },
  mediaToggleIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  mediaToggleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    gap: 40,
    marginBottom: 30,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtn: {
    backgroundColor: '#10B981',
  },
  declineBtn: {
    backgroundColor: '#EF4444',
  },
  endBtn: {
    backgroundColor: '#EF4444',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  btnIcon: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  btnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
});
