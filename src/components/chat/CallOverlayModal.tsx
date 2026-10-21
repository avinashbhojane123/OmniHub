import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { ActiveCallData } from '../../types/chat';
import { chatSocketService } from '../../services/chat/ChatSocketService';

interface CallOverlayModalProps {
  call: ActiveCallData | null;
  onAccept: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: (minimized: boolean) => void;
}

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

  if (!call || call.state === 'idle' || call.state === 'ended') {
    return null;
  }

  const isIncoming = call.state === 'incoming';
  const isCalling = call.state === 'calling';
  const isActive = call.state === 'active';

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
  };

  const handleToggleVideo = () => {
    const nextVideo = !isVideoOff;
    setIsVideoOff(nextVideo);
    chatSocketService.setMediaState(isMuted, nextVideo);
  };

  return (
    <Modal
      visible={!isMinimized}
      transparent
      animationType="fade"
      onRequestClose={onEndCall}
    >
      <View style={styles.overlay}>
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
          </View>

          {/* Center Avatar & Info */}
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
          </View>

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
                <TouchableOpacity
                  style={[styles.mediaToggleBtn, isVideoOff && styles.mediaToggleBtnActive]}
                  onPress={handleToggleVideo}
                >
                  <Text style={styles.mediaToggleIcon}>{isVideoOff ? '🚫' : '📹'}</Text>
                  <Text style={styles.mediaToggleLabel}>{isVideoOff ? 'Video Off' : 'Camera On'}</Text>
                </TouchableOpacity>
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.95)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
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
