import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  BackHandler,
  Vibration,
  ScrollView,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { alarmService, AlarmState } from '../services/alarm/AlarmService';
import { settingsRepository } from '../database/repositories';
import { taskService } from '../services/tasks/TaskService';

export const AlarmRingingModal: React.FC = () => {
  const insetsContext = React.useContext(SafeAreaInsetsContext);
  const insets = insetsContext ?? {
    top: StatusBar.currentHeight || 24,
    bottom: 16,
    left: 0,
    right: 0,
  };
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const [alarmState, setAlarmState] = useState<AlarmState>({
    isRinging: false,
    title: '',
    habitId: undefined,
    timeString: undefined,
    secondsRemaining: 60,
  });

  const [snoozeMinutes, setSnoozeMinutes] = useState(5);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isDismissing, setIsDismissing] = useState(false);
  const [isSnoozing, setIsSnoozing] = useState(false);

  // Pulsing scale & opacity animations for dismiss halo ("blue/purple color on and off")
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacityAnim = useRef(new Animated.Value(0.4)).current;

  // Subscribe to AlarmService for alarm state
  useEffect(() => {
    const unsubscribe = alarmService.subscribe(state => {
      setAlarmState(state);
    });
    return unsubscribe;
  }, []);

  // System Status Bar transparency & restoration on dismiss
  useEffect(() => {
    if (alarmState.isRinging) {
      StatusBar.setBarStyle('light-content', true);
      try {
        (StatusBar as any).setTranslucent?.(true);
        (StatusBar as any).setBackgroundColor?.('transparent', true);
      } catch {}
      return () => {
        try {
          (StatusBar as any).setTranslucent?.(false);
        } catch {}
      };
    }
  }, [alarmState.isRinging]);

  // Live ticking clock timer: updates every 1 second while ringing
  useEffect(() => {
    if (!alarmState.isRinging) return;
    setCurrentTime(new Date());
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, [alarmState.isRinging]);

  // Load user's default snooze preference from settings & reset action locks on new alarm
  useEffect(() => {
    if (alarmState.isRinging) {
      setIsDismissing(false);
      setIsSnoozing(false);
      settingsRepository
        .get('defaultSnoozeMinutes', '5')
        .then(val => {
          const parsed = parseInt(val, 10);
          setSnoozeMinutes(isNaN(parsed) || parsed <= 0 ? 5 : parsed);
        })
        .catch(() => setSnoozeMinutes(5));
    }
  }, [alarmState.isRinging]);

  // Safety Fix: Hardware back button safely SNOOZES the alarm to prevent accidental wake-up cancellations
  useEffect(() => {
    if (!alarmState.isRinging) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      triggerHaptic(60);
      alarmService.snoozeAlarm(snoozeMinutes);
      return true;
    });
    return () => backSub.remove();
  }, [alarmState.isRinging, snoozeMinutes]);

  // Harmonized organic cosmic pulse loop synchronized with rhythmic breathing
  useEffect(() => {
    if (alarmState.isRinging) {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.15,
              duration: 650,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1.0,
              duration: 650,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(glowOpacityAnim, {
              toValue: 1.0,
              duration: 650,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacityAnim, {
              toValue: 0.25,
              duration: 650,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
      glowOpacityAnim.setValue(0.4);
    }
  }, [alarmState.isRinging, pulseAnim, glowOpacityAnim]);

  if (!alarmState.isRinging) {
    return null;
  }

  const triggerHaptic = (duration = 35) => {
    try {
      Vibration.vibrate(duration);
    } catch {}
  };

  // Normalized 12-Hour formatted live time (matches Image 2: "04:30")
  let hours12 = currentTime.getHours() % 12;
  if (hours12 === 0) hours12 = 12;
  const hoursStr = String(hours12).padStart(2, '0');
  const minsStr = String(currentTime.getMinutes()).padStart(2, '0');
  const displayTime = `${hoursStr}:${minsStr}`;

  // Live updated date (e.g. "Mon, Jan 8")
  const formattedDate = format(currentTime, 'EEE, MMM d');

  const handleDecreaseSnooze = () => {
    triggerHaptic(25);
    setSnoozeMinutes(prev => (prev > 1 ? prev - 1 : 1));
  };

  const handleIncreaseSnooze = () => {
    triggerHaptic(25);
    setSnoozeMinutes(prev => (prev < 60 ? prev + 1 : 60));
  };

  const handleSnooze = () => {
    if (isSnoozing || isDismissing) return;
    setIsSnoozing(true);
    triggerHaptic(60);
    alarmService.snoozeAlarm(snoozeMinutes);
  };

  const handleDismiss = () => {
    if (isDismissing || isSnoozing) return;
    setIsDismissing(true);
    triggerHaptic(80);
    alarmService.stopRinging();
  };

  const handleCompleteTask = async () => {
    if (!alarmState.taskId || isDismissing || isSnoozing) return;
    setIsDismissing(true);
    triggerHaptic(80);
    alarmService.stopRinging();
    try {
      await taskService.completeTask(alarmState.taskId);
    } catch (e) {
      console.warn('Failed to complete task from alarm modal:', e);
    }
  };

  const isBatteryAlarm =
    alarmState.alarmType === 'battery' ||
    alarmState.timeString === 'Battery Alarm' ||
    alarmState.title?.toLowerCase().includes('battery') ||
    alarmState.title?.toLowerCase().includes('overcharge');

  return (
    <Animated.View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: Math.max(insets.top, 24) + (isLandscape ? 6 : 14),
            paddingBottom: Math.max(insets.bottom, 20) + (isLandscape ? 10 : 20),
            minHeight: windowHeight,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Atmospheric Cosmic Auras */}
        <Animated.View
          style={[
            styles.auraTop,
            isBatteryAlarm && { backgroundColor: 'rgba(16, 185, 129, 0.35)' },
            {
              opacity: glowOpacityAnim,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <View style={styles.auraCenter} />

        {/* Top Header: Clock or Battery Guard icon and label */}
        <View style={styles.header}>
          <View
            style={[
              styles.clockTag,
              isBatteryAlarm && {
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
              },
            ]}
          >
            <Text style={styles.clockIcon}>{isBatteryAlarm ? '⚡' : '🕒'}</Text>
            <Text
              style={[
                styles.clockText,
                isBatteryAlarm && { color: '#34D399', fontWeight: '800' },
              ]}
            >
              {isBatteryAlarm ? 'Battery Guard Alert' : 'Clock'}
            </Text>
          </View>

          {/* Auto-silence countdown indicator */}
          {alarmState.secondsRemaining > 0 && alarmState.secondsRemaining < 60 ? (
            <View style={styles.autoSilenceBadge}>
              <Text style={styles.autoSilenceText}>
                Auto-silences in {alarmState.secondsRemaining}s
              </Text>
            </View>
          ) : null}
        </View>

        {/* Center Content: Alarm, Time, Date */}
        <View style={[styles.centerSection, isLandscape && styles.centerSectionLandscape]}>
          <Text
            style={[
              styles.alarmLabel,
              isBatteryAlarm && { color: '#10B981', fontWeight: '800' },
            ]}
          >
            {isBatteryAlarm ? '⚡ CHARGING & SAFETY THRESHOLD' : alarmState.timeString ? `Alarm • ${alarmState.timeString}` : 'Alarm'}
          </Text>

          {alarmState.title &&
          alarmState.title !== 'Daily Routine Alarm' &&
          alarmState.title !== 'LifePlanner Alarm' ? (
            <Text
              style={[
                styles.routineTitle,
                isBatteryAlarm && { color: '#F1F5F9', fontSize: 24, fontWeight: '800' },
              ]}
              numberOfLines={3}
            >
              {alarmState.title}
            </Text>
          ) : null}

          {alarmState.description ? (
            <Text
              style={[
                styles.routineDescription,
                isBatteryAlarm && { color: '#34D399', fontSize: 15, fontWeight: '600' },
              ]}
              numberOfLines={3}
            >
              {alarmState.description}
            </Text>
          ) : isBatteryAlarm ? (
            <Text
              style={[
                styles.routineDescription,
                { color: '#34D399', fontSize: 15, fontWeight: '600' },
              ]}
            >
              Unplug your charger to protect battery health and prevent cell degradation.
            </Text>
          ) : null}

          <Text style={[styles.timeText, isLandscape && styles.timeTextLandscape]}>
            {displayTime}
          </Text>
          <Text style={[styles.dateText, isLandscape && styles.dateTextLandscape]}>
            {formattedDate}
          </Text>

          {/* Snooze Row: [-] Snooze 5 mins [+] */}
          <View style={styles.snoozeRow}>
            <TouchableOpacity
              style={styles.snoozeAdjustBtn}
              onPress={handleDecreaseSnooze}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Decrease Snooze Time"
            >
              <Text style={styles.snoozeAdjustText}>−</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.snoozePill, isSnoozing && styles.snoozePillDisabled]}
              onPress={handleSnooze}
              disabled={isSnoozing || isDismissing}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${snoozeMinutes} minutes`}
            >
              <Text style={styles.snoozePillText}>
                {isSnoozing
                  ? 'Snoozing...'
                  : `Snooze ${snoozeMinutes} ${snoozeMinutes === 1 ? 'min' : 'mins'}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.snoozeAdjustBtn}
              onPress={handleIncreaseSnooze}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Increase Snooze Time"
            >
              <Text style={styles.snoozeAdjustText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Section: Circular Dismiss Button with Pulsing Ring */}
        <View style={[styles.bottomSection, isLandscape && styles.bottomSectionLandscape]}>
          {Boolean(alarmState.taskId) && (
            <TouchableOpacity
              style={styles.completeTaskBtn}
              onPress={handleCompleteTask}
              disabled={isDismissing || isSnoozing}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Mark Task Completed"
            >
              <Text style={styles.completeTaskBtnText}>✓ Mark Task Completed</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dismissContainer}>
            {/* Pulsing Outer Ring */}
            <Animated.View
              style={[
                styles.dismissOuterRing,
                isBatteryAlarm && { backgroundColor: 'rgba(16, 185, 129, 0.4)', borderColor: '#10B981' },
                {
                  opacity: glowOpacityAnim,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            {/* Inner Dark Circular Dismiss Button */}
            <TouchableOpacity
              style={[
                styles.dismissInnerCircle,
                isBatteryAlarm && { borderColor: '#10B981' },
                isDismissing && styles.dismissInnerCircleDisabled,
              ]}
              onPress={handleDismiss}
              disabled={isDismissing || isSnoozing}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Dismiss Alarm"
            >
              <Text style={[styles.dismissText, isBatteryAlarm && { color: '#34D399', fontSize: 16, fontWeight: '800' }]}>
                {isDismissing ? 'Silencing...' : isBatteryAlarm ? '🔕 STOP' : 'Dismiss'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B081E',
    zIndex: 999999,
    elevation: 9999,
    overflow: 'hidden',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  auraTop: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#581C87',
  },
  auraCenter: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#3B1C71',
    opacity: 0.45,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  clockIcon: {
    fontSize: 16,
  },
  clockText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.72)',
    letterSpacing: 0.3,
  },
  autoSilenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  autoSilenceText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 0.2,
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  centerSectionLandscape: {
    marginVertical: 4,
  },
  alarmLabel: {
    fontSize: 22,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  routineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C4B5FD',
    marginBottom: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 19,
  },
  routineDescription: {
    fontSize: 12.5,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 16,
  },
  timeText: {
    fontSize: 76,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 4,
  },
  timeTextLandscape: {
    fontSize: 54,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 19,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.65)',
    marginBottom: 34,
    letterSpacing: 0.2,
  },
  dateTextLandscape: {
    fontSize: 16,
    marginBottom: 16,
  },
  snoozeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  snoozeAdjustBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  snoozeAdjustText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 22,
  },
  snoozePill: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozePillDisabled: {
    opacity: 0.6,
  },
  snoozePillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  bottomSection: {
    alignItems: 'center',
    marginVertical: 16,
  },
  bottomSectionLandscape: {
    marginVertical: 8,
  },
  dismissContainer: {
    width: 176,
    height: 176,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissOuterRing: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 4,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 22,
    elevation: 8,
  },
  dismissInnerCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: '#0D0B1E',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 8,
  },
  dismissInnerCircleDisabled: {
    opacity: 0.6,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  completeTaskBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 22,
    marginBottom: 20,
    alignSelf: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  completeTaskBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
