import React, { useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';
import { Task } from '../types';
import { useFocusTimer, TIMER_PRESETS, TimerMode } from '../context/FocusTimerContext';

interface FocusTimerModalProps {
  visible: boolean;
  onClose: () => void;
  tasks?: Task[];
  initialTaskId?: string;
}

export const FocusTimerModal: React.FC<FocusTimerModalProps> = ({
  visible,
  onClose,
  tasks = [],
  initialTaskId,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    activeMode,
    totalSeconds,
    secondsRemaining,
    isRunning,
    selectedTaskId,
    completedSessions,
    startTimer,
    pauseTimer,
    resetTimer,
    adjustTime,
    selectPreset,
    selectTask,
    minimizeToFloating,
    closeModal,
  } = useFocusTimer();

  // Sync initialTaskId when modal opens
  useEffect(() => {
    if (visible && initialTaskId && initialTaskId !== selectedTaskId) {
      const match = tasks.find((t) => t.id === initialTaskId);
      selectTask(initialTaskId, match?.title);
    }
  }, [visible, initialTaskId, selectedTaskId, tasks, selectTask]);

  const handleSelectPreset = useCallback(
    (mode: TimerMode, minutes: number) => {
      selectPreset(mode, minutes);
    },
    [selectPreset]
  );

  const handleTogglePlayPause = async () => {
    if (isRunning) {
      await pauseTimer();
    } else {
      await startTimer();
    }
  };

  const handleReset = async () => {
    await resetTimer();
  };

  const handleAdjustTime = (deltaMinutes: number) => {
    adjustTime(deltaMinutes);
  };

  const handleClose = () => {
    closeModal();
    onClose();
  };

  const handleMinimize = () => {
    minimizeToFloating();
    onClose();
  };

  // Format mm:ss
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent =
    totalSeconds > 0
      ? Math.max(0, Math.min(100, Math.round(((totalSeconds - secondsRemaining) / totalSeconds) * 100)))
      : 0;

  const currentTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={handleMinimize}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated, marginRight: 8 }]}
                accessibilityRole="button"
                accessibilityLabel="Minimize to floating widget"
              >
                <Text style={[styles.closeBtnText, { color: colors.primary, fontSize: 13, fontWeight: '800' }]}>⤓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
                accessibilityRole="button"
                accessibilityLabel="Close Focus Timer"
              >
                <Text style={[styles.closeBtnText, { color: colors.text }]}>✕</Text>
              </TouchableOpacity>
            </View>
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
                  activeOpacity={0.7}
                >
                  <Text style={styles.modeIcon}>{preset.icon}</Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: isActive ? '#FFFFFF' : colors.textSecondary, fontWeight: isActive ? '700' : '500' },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Task Association Badge */}
          {tasks.length > 0 && (
            <View style={styles.taskPickerSection}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                LINKED TASK:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.taskScroll}>
                <TouchableOpacity
                  onPress={() => selectTask(undefined, undefined)}
                  style={[
                    styles.taskChip,
                    {
                      backgroundColor: !selectedTaskId ? colors.surfaceHighlight : colors.surfaceElevated,
                      borderColor: !selectedTaskId ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.taskChipText,
                      { color: !selectedTaskId ? colors.primary : colors.textMuted },
                    ]}
                  >
                    None (General Focus)
                  </Text>
                </TouchableOpacity>
                {tasks
                  .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
                  .slice(0, 10)
                  .map((t) => {
                    const isSelected = selectedTaskId === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => selectTask(t.id, t.title)}
                        style={[
                          styles.taskChip,
                          {
                            backgroundColor: isSelected ? colors.surfaceHighlight : colors.surfaceElevated,
                            borderColor: isSelected ? colors.primary : colors.borderSubtle,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.taskChipText,
                            { color: isSelected ? colors.primary : colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {t.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          )}

          {/* Display Timer Dial */}
          <View
            style={[
              styles.timerDialWrapper,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: isRunning ? colors.primary : colors.borderSubtle,
              },
            ]}
          >
            {/* Progress track bar */}
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: isRunning ? colors.primary : colors.textMuted,
                },
              ]}
            />

            <Text style={[styles.timerDigits, { color: colors.text }]}>{timeFormatted}</Text>

            {currentTask && (
              <Text style={[styles.timerSubtask, { color: colors.primary }]} numberOfLines={1}>
                🎯 {currentTask.title}
              </Text>
            )}

            <Text style={[styles.timerStatus, { color: isRunning ? colors.primary : colors.textMuted }]}>
              {isRunning ? 'FOCUSING' : secondsRemaining === totalSeconds ? 'READY' : 'PAUSED'}
            </Text>
          </View>

          {/* Quick Adjustment Buttons (+/- 1m, 5m) */}
          <View style={styles.adjustRow}>
            <TouchableOpacity
              onPress={() => handleAdjustTime(-5)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated }]}
              disabled={secondsRemaining <= 60}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>-5m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(-1)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated }]}
              disabled={secondsRemaining <= 60}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>-1m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(1)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated }]}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>+1m</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustTime(5)}
              style={[styles.adjustBtn, { backgroundColor: colors.surfaceElevated }]}
            >
              <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>+5m</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={handleReset}
              style={[
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryActionText, { color: colors.textSecondary }]}>
                ↺ Reset
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTogglePlayPause}
              style={[
                styles.primaryActionBtn,
                {
                  backgroundColor: isRunning ? colors.warning : colors.primary,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryActionText}>
                {isRunning ? '⏸ Pause' : secondsRemaining === 0 ? '↺ Restart' : '▶ Start'}
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  modeLabel: {
    fontSize: 11,
  },
  taskPickerSection: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  taskScroll: {
    flexDirection: 'row',
  },
  taskChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: 8,
    maxWidth: 160,
  },
  taskChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timerDialWrapper: {
    borderRadius: radius.xl,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.1,
  },
  timerDigits: {
    fontSize: 54,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  timerSubtask: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  timerStatus: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  adjustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  adjustBtn: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  adjustBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginRight: 10,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryActionBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
