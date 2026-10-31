import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusTimer, TIMER_PRESETS } from '../context/FocusTimerContext';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';

export const FloatingTimerWidget: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    activeMode,
    secondsRemaining,
    isRunning,
    selectedTaskTitle,
    isFloatingVisible,
    isModalVisible,
    startTimer,
    pauseTimer,
    expandFromFloating,
    dismissFloating,
  } = useFocusTimer();

  if (!isFloatingVisible || isModalVisible) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const currentPreset = TIMER_PRESETS.find((p) => p.mode === activeMode);

  return (
    <View
      style={[
        styles.container,
        {
          bottom: Math.max(insets.bottom, 16) + 72,
          backgroundColor: colors.surfaceElevated || '#1E293B',
          borderColor: isRunning ? colors.primary : colors.borderSubtle,
          shadowColor: colors.primary,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.mainContent}
        onPress={expandFromFloating}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Focus timer: ${timeFormatted} remaining. Tap to expand.`}
      >
        <View style={[styles.iconBadge, { backgroundColor: (colors.primary || '#8B5CF6') + '25' }]}>
          <Text style={styles.iconText}>{currentPreset?.icon || '⏱️'}</Text>
        </View>

        <View style={styles.textCol}>
          <Text style={[styles.timeText, { color: colors.text }]}>{timeFormatted}</Text>
          <Text style={[styles.taskText, { color: colors.textSecondary }]} numberOfLines={1}>
            {selectedTaskTitle || currentPreset?.label || 'Focus Session'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.playPauseBtn, { backgroundColor: colors.surfaceHighlight || '#334155' }]}
          onPress={isRunning ? pauseTimer : startTimer}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={isRunning ? 'Pause Timer' : 'Resume Timer'}
        >
          <Text style={[styles.playPauseIcon, { color: colors.primary }]}>{isRunning ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.expandBtn}
          onPress={expandFromFloating}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Expand full timer modal"
        >
          <Text style={[styles.expandIcon, { color: colors.textSecondary }]}>⤢</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismissFloating}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Hide floating widget"
        >
          <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full || 28,
    borderWidth: 1.5,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 9999,
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 160,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  iconText: {
    fontSize: 16,
  },
  textCol: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },
  taskText: {
    fontSize: 10,
    fontWeight: '500',
    maxWidth: 105,
    lineHeight: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  playPauseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  playPauseIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  expandBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  expandIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
});
