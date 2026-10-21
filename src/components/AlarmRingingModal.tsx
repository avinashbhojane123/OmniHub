import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { alarmService, AlarmState } from '../services/alarm/AlarmService';
import { BellIllustration } from './BellIllustration';

export const AlarmRingingModal: React.FC = () => {
  const [alarmState, setAlarmState] = useState<AlarmState>({
    isRinging: false,
    title: '',
    habitId: undefined,
    timeString: undefined,
    secondsRemaining: 60,
  });

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsubscribe = alarmService.subscribe((state) => {
      setAlarmState(state);
    });
    return unsubscribe;
  }, []);

  // Pulsing animation for alarm icon when ringing
  useEffect(() => {
    if (alarmState.isRinging) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [alarmState.isRinging, pulseAnim]);

  if (!alarmState.isRinging) {
    return null;
  }

  // Current display time
  const now = new Date();
  let h = now.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const currentFormattedTime = `${String(h).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')} ${period}`;

  const displayTime = alarmState.timeString || currentFormattedTime;
  const seconds = typeof alarmState.secondsRemaining === 'number' && !isNaN(alarmState.secondsRemaining) ? alarmState.secondsRemaining : 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round((seconds / 60) * 100)));

  return (
    <Modal
      visible={alarmState.isRinging}
      animationType="fade"
      transparent={false}
      onRequestClose={() => alarmService.stopRinging()}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Glow ambient background aura */}
        <View style={styles.glowCircle} />

        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>
            {alarmState.title?.includes('Battery') || alarmState.title?.includes('Charged') || alarmState.title?.includes('⚡') || alarmState.title?.includes('🪫') || alarmState.title?.includes('🔥')
              ? 'BATTERY GUARD ALARM'
              : 'LIFEPLANNER ALARM'}
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>RINGING</Text>
          </View>
        </View>

        {/* Center Content */}
        <View style={styles.centerSection}>
          <Animated.View style={[styles.iconWrapper, { transform: [{ scale: pulseAnim }] }]}>
            {alarmState.title?.includes('🔥') ? (
              <Text style={{ fontSize: 75 }}>🔥</Text>
            ) : alarmState.title?.includes('🪫') ? (
              <Text style={{ fontSize: 75 }}>🪫</Text>
            ) : alarmState.title?.includes('Battery') || alarmState.title?.includes('⚡') ? (
              <Text style={{ fontSize: 75 }}>⚡</Text>
            ) : (
              <BellIllustration size={85} />
            )}
          </Animated.View>

          <Text style={styles.timeBig}>{displayTime}</Text>

          <Text style={styles.routineTitle} numberOfLines={2}>
            {alarmState.title || 'Daily Routine Alarm'}
          </Text>

          {alarmState.description ? (
            <Text style={styles.routineDesc} numberOfLines={3}>
              {alarmState.description}
            </Text>
          ) : null}

          {/* Countdown timer & progress bar (rings up to 1 minute) */}
          <View style={styles.timerCard}>
            <View style={styles.timerHeader}>
              <Text style={styles.timerLabel}>Auto-stops in</Text>
              <Text style={styles.timerCount}>{alarmState.secondsRemaining}s</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.timerSubText}>Ringing up to 1 min • Tap Stop to dismiss</Text>
          </View>
        </View>

        {/* Bottom Action Controls */}
        <View style={styles.bottomSection}>
          {/* Huge Primary Stop Alarm Button */}
          <TouchableOpacity
            style={styles.stopButton}
            onPress={() => alarmService.stopRinging()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Stop Alarm"
          >
            <Text style={styles.stopButtonText}>🔕 STOP ALARM</Text>
          </TouchableOpacity>

          {/* Secondary Snooze Button */}
          <TouchableOpacity
            style={styles.snoozeButton}
            onPress={() => alarmService.snoozeAlarm(5)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Snooze 5 Minutes"
          >
            <Text style={styles.snoozeButtonText}>💤 Snooze (5 min)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1016',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 54,
    paddingBottom: 44,
  },
  glowCircle: {
    position: 'absolute',
    top: '25%',
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FF6B00',
    opacity: 0.12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A8C9E',
    letterSpacing: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#281711',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FF6B00',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B00',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF6B00',
    letterSpacing: 1,
  },
  centerSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1E1F2C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF6B00',
    marginBottom: 24,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  alarmEmoji: {
    fontSize: 54,
  },
  timeBig: {
    fontSize: 46,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  routineTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E2E3ED',
    textAlign: 'center',
    marginBottom: 8,
  },
  routineDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A0A2B4',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  timerCard: {
    width: '100%',
    backgroundColor: '#1A1B26',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D2E3D',
  },
  timerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8C9E',
  },
  timerCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FF6B00',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#262736',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF6B00',
    borderRadius: 3,
  },
  timerSubText: {
    fontSize: 11,
    color: '#6F7182',
    textAlign: 'center',
  },
  bottomSection: {
    gap: 12,
  },
  stopButton: {
    backgroundColor: '#FF6B00',
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  snoozeButton: {
    backgroundColor: '#1E1F2C',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#343548',
  },
  snoozeButtonText: {
    color: '#C0C2D4',
    fontSize: 15,
    fontWeight: '600',
  },
});
