import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Alert,
  AppState,
} from 'react-native';
import notifee, { TriggerType, AndroidImportance } from '@notifee/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';
import { Task } from '../types';

interface FocusTimerModalProps {
  visible: boolean;
  onClose: () => void;
  tasks?: Task[];
  initialTaskId?: string;
}

type TimerMode = 'pomodoro' | 'short_break' | 'long_break' | 'deep_work';

const TIMER_PRESETS: { mode: TimerMode; label: string; icon: string; minutes: number }[] = [
  { mode: 'pomodoro', label: 'Pomodoro', icon: '🍅', minutes: 25 },
  { mode: 'short_break', label: 'Short Break', icon: '☕', minutes: 5 },
  { mode: 'long_break', label: 'Long Break', icon: '🌴', minutes: 15 },
  { mode: 'deep_work', label: 'Deep Work', icon: '⚡', minutes: 45 },
];

export const FocusTimerModal: React.FC<FocusTimerModalProps> = ({
  visible,
  onClose,
  tasks = [],
  initialTaskId,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  const [activeMode, setActiveMode] = useState<TimerMode>('pomodoro');
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(initialTaskId);
  const [completedSessions, setCompletedSessions] = useState<number>(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(null);

  // Sync initialTaskId when modal opens
  useEffect(() => {
    if (visible && initialTaskId) {
      setSelectedTaskId(initialTaskId);
    }
  }, [visible, initialTaskId]);

  // Handle app coming back to foreground: recalculate seconds from wall-clock time
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isRunning && endTimeRef.current) {
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
        if (remaining <= 0) {
          setIsRunning(false);
          endTimeRef.current = null;
          try {
            Vibration.vibrate([0, 500, 250, 500]);
          } catch {}
          setCompletedSessions((cnt) => cnt + 1);
          Alert.alert('🎉 Session Complete!', 'Great focus! Take a well-deserved break.');
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRunning]);

  // Set preset duration
  const handleSelectPreset = useCallback((mode: TimerMode, minutes: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;
    setIsRunning(false);
    try {
      notifee.cancelNotification('focus_timer_alarm');
    } catch {}
    setActiveMode(mode);
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setSecondsRemaining(secs);
  }, []);

  // Timer tick interval
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            endTimeRef.current = null;
            setIsRunning(false);
            try {
              Vibration.vibrate([0, 500, 250, 500]);
            } catch {
              // Ignore vibration failure
            }
            setCompletedSessions((cnt) => cnt + 1);
            Alert.alert(
              '🎉 Session Complete!',
              activeMode === 'pomodoro' || activeMode === 'deep_work'
                ? 'Great focus! Take a well-deserved break.'
                : 'Break is over! Ready for another focus round?'
            );
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, activeMode]);

  const handleTogglePlayPause = async () => {
    if (!isRunning) {
      const initialSecs = secondsRemaining === 0 ? totalSeconds : secondsRemaining;
      if (secondsRemaining === 0) {
        setSecondsRemaining(totalSeconds);
      }
      const targetTime = Date.now() + initialSecs * 1000;
      endTimeRef.current = targetTime;
      setIsRunning(true);

      // Schedule background notification so alarm fires even if screen locks
      try {
        await notifee.createTriggerNotification(
          {
            id: 'focus_timer_alarm',
            title: '🎉 Focus Session Complete!',
            body: activeMode === 'pomodoro' || activeMode === 'deep_work'
              ? 'Great focus! Take a well-deserved break.'
              : 'Break is over! Ready for another focus round?',
            android: {
              channelId: 'alarm_clock_channel_v3',
              smallIcon: 'ic_notification',
              importance: AndroidImportance.HIGH,
              sound: 'default',
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: targetTime,
          }
        );
      } catch {}
    } else {
      setIsRunning(false);
      endTimeRef.current = null;
      try {
        await notifee.cancelNotification('focus_timer_alarm');
      } catch {}
    }
  };

  const handleReset = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endTimeRef.current = null;
    setIsRunning(false);
    setSecondsRemaining(totalSeconds);
    try {
      await notifee.cancelNotification('focus_timer_alarm');
    } catch {}
  };

  const handleAdjustTime = (deltaMinutes: number) => {
    const deltaSecs = deltaMinutes * 60;
    setSecondsRemaining((prev) => {
      const next = Math.max(60, prev + deltaSecs);
      if (isRunning) {
        const targetTime = Date.now() + next * 1000;
        endTimeRef.current = targetTime;
      }
      return next;
    });
    setTotalSeconds((prev) => Math.max(60, prev + deltaSecs));
  };

  // Format mm:ss
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent = totalSeconds > 0
    ? Math.max(0, Math.min(100, Math.round(((totalSeconds - secondsRemaining) / totalSeconds) * 100)))
    : 0;

  const currentTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              paddingBottom: Math.max(insets.bottom, 20) + 12,
            },
          ]}
        >
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>⏱️ Focus Timer</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {completedSessions > 0
                  ? `Completed: ${completedSessions} session${completedSessions > 1 ? 's' : ''} today 🔥`
                  : 'Stay centered with timed deep work blocks'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              accessibilityRole="button"
              accessibilityLabel="Close Focus Timer"
            >
              <Text style={[styles.closeBtnText, { color: colors.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mode Selector Chips */}
          <View style={styles.modeRow}>
            {TIMER_PRESETS.map((preset) => {
              const isActive = activeMode === preset.mode;
              return (
                <TouchableOpacity
                  key={preset.mode}
                  onPress={() => handleSelectPreset(preset.mode, preset.minutes)}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
                      borderColor: isActive ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={styles.modeIcon}>{preset.icon}</Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: isActive ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {preset.minutes}m
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Associated Task Pill if selected */}
          {currentTask ? (
            <View style={[styles.taskPill, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <Text style={styles.taskPillIcon}>🎯</Text>
              <Text
                style={[styles.taskPillText, { color: colors.text }]}
                numberOfLines={1}
              >
                Focusing on: <Text style={{ fontWeight: '700' }}>{currentTask.title}</Text>
              </Text>
              <TouchableOpacity onPress={() => setSelectedTaskId(undefined)}>
                <Text style={[styles.taskPillRemove, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : tasks.length > 0 ? (
            <View style={styles.taskPickerRow}>
              <Text style={[styles.pickerPrompt, { color: colors.textSecondary }]}>Link Task:</Text>
              <TouchableOpacity
                onPress={() => {
                  const pending = tasks.filter((t) => t.status !== 'completed');
                  if (pending.length > 0) {
                    setSelectedTaskId(pending[0].id);
                  }
                }}
                style={[styles.linkTaskBtn, { borderColor: colors.borderSubtle }]}
              >
                <Text style={[styles.linkTaskText, { color: colors.primary }]}>
                  {tasks[0]?.title ? `+ "${tasks[0].title.slice(0, 18)}..."` : '+ Choose Task'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Big Circular/Glowing Timer Display */}
          <View style={[styles.timerCircle, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
            <Text style={[styles.timeDigits, { color: colors.text }]}>{timeFormatted}</Text>
            <Text style={[styles.progressIndicator, { color: colors.primary }]}>
              {isRunning ? '🔥 Focus Mode' : secondsRemaining === 0 ? 'Done' : 'Paused'} • {progressPercent}%
            </Text>
          </View>

          {/* Quick Adjustment Controls */}
          <View style={styles.adjustRow}>
            <TouchableOpacity
              onPress={() => handleAdjustTime(-5)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              disabled={isRunning}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>-5m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(-1)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              disabled={isRunning}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>-1m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(1)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              disabled={isRunning}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>+1m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(5)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              disabled={isRunning}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>+5m</Text>
            </TouchableOpacity>
          </View>

          {/* Main Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.resetBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.resetBtnText, { color: colors.text }]}>↺ Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTogglePlayPause}
              style={[
                styles.playBtn,
                {
                  backgroundColor: isRunning ? '#EF4444' : colors.primary,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.playBtnText}>
                {isRunning ? '⏸ Pause' : secondsRemaining === 0 ? '▶ Restart' : '▶ Start Focus'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: spacing.md,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  modeIcon: {
    fontSize: 14,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: 6,
  },
  taskPillIcon: {
    fontSize: 14,
  },
  taskPillText: {
    flex: 1,
    fontSize: 12,
  },
  taskPillRemove: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  taskPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  pickerPrompt: {
    fontSize: 12,
    fontWeight: '600',
  },
  linkTaskBtn: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  linkTaskText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timerCircle: {
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  timeDigits: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  progressIndicator: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  adjustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: spacing.lg,
  },
  adjustBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  adjustBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  playBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
