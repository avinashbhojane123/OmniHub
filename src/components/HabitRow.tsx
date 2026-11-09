import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HabitWithStreak } from '../types';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { withOpacity } from '../utils/color';
import { parseHabitNameItems, formatNumberedItem } from '../utils/bulletNotes';
import { format, subDays } from 'date-fns';

interface HabitRowProps {
  habit: HabitWithStreak;
  onToggle: (habit: HabitWithStreak) => void;
  onEdit?: (habit: HabitWithStreak) => void;
  onDelete?: (habit: HabitWithStreak) => void;
  onToggleSubtask?: (habit: HabitWithStreak, subtaskIndex: number) => void;
  onAddSubtask?: (habit: HabitWithStreak, subtaskText: string) => void;
  onDeleteSubtask?: (habit: HabitWithStreak, subtaskIndex: number) => void;
  getIconDetails?: (habit: HabitWithStreak) => { bg: string; icon: string };
}

const HabitRowComponent: React.FC<HabitRowProps> = ({
  habit,
  onToggle,
  onEdit,
  getIconDetails,
}) => {
  const { colors, isDark } = useAppTheme();
  const accentColor = habit.color || colors.primary;
  const iconDetails = getIconDetails
    ? getIconDetails(habit)
    : { bg: withOpacity(accentColor, 0.2), icon: habit.icon || '🎯' };

  const habitItems = useMemo(
    () => parseHabitNameItems(habit.name),
    [habit.name]
  );

  // Generate past 7 days for the commit-style streak heatmap
  const past7Days = useMemo(() => {
    const days: { dateStr: string; isToday: boolean; isDone: boolean }[] = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    for (let i = 6; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const isToday = dateStr === todayStr;
      const isDone = Boolean(
        habit.weeklyLogs?.[dateStr] || (isToday && habit.completedToday)
      );
      days.push({ dateStr, isToday, isDone });
    }
    return days;
  }, [habit.weeklyLogs, habit.completedToday]);

  const subtasksCount = habit.subtasks?.length || 0;
  const completedSubtasksCount = habit.subtasks?.filter(s => s.completed).length || 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#15112E' : colors.card,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder,
        },
        habit.completedToday && styles.containerCompleted,
      ]}
    >
      {/* Icon Button: Tapping icon toggles completion / strikes habit */}
      <TouchableOpacity
        style={[
          styles.iconWrapper,
          { backgroundColor: iconDetails.bg },
          habit.completedToday && styles.iconWrapperCompleted,
        ]}
        onPress={() => onToggle(habit)}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: habit.completedToday }}
        accessibilityLabel={`Mark habit ${habit.name} ${habit.completedToday ? 'incomplete' : 'complete'}`}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={[styles.iconText, habit.completedToday && styles.iconTextCompleted]}>
          {iconDetails.icon}
        </Text>
        {habit.completedToday && (
          <View style={[styles.iconCheckBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.iconCheckBadgeText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Info Column: Habit Name, Commit Heatmap, Reminder, and Streak */}
      <View style={styles.infoCol}>
        <TouchableOpacity
          onPress={() => onEdit?.(habit)}
          activeOpacity={onEdit ? 0.7 : 1}
          accessibilityRole={onEdit ? 'button' : undefined}
          accessibilityLabel={onEdit ? `Edit habit ${habit.name}` : undefined}
        >
          {habitItems.length > 1 ? (
            <View style={styles.numberedItemsContainer}>
              {habitItems.map((item, idx) => (
                <Text
                  key={idx}
                  style={[
                    styles.numberedItemText,
                    typography.title,
                    {
                      color: habit.completedToday ? colors.textMuted : colors.text,
                      textDecorationLine: habit.completedToday ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {formatNumberedItem(item, idx, habitItems.length)}
                </Text>
              ))}
            </View>
          ) : (
            <Text
              style={[
                styles.name,
                typography.title,
                {
                  color: habit.completedToday ? colors.textMuted : colors.text,
                  textDecorationLine: habit.completedToday ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={2}
            >
              {habit.name}
            </Text>
          )}

          {/* 7-Day Commit-Style Streak Matrix Row */}
          <View style={styles.streakRow}>
            {/* Heatmap 7 Mini Squares */}
            <View style={styles.heatmapGrid}>
              {past7Days.map((d, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.heatmapSquare,
                    d.isDone
                      ? { backgroundColor: accentColor }
                      : {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.08)',
                          borderColor: d.isToday ? accentColor : 'transparent',
                          borderWidth: d.isToday ? 1 : 0,
                        },
                  ]}
                />
              ))}
            </View>

            {/* Streak flame badge */}
            {habit.currentStreak > 0 ? (
              <View style={[styles.streakBadge, { backgroundColor: withOpacity('#F59E0B', 0.14) }]}>
                <Text style={styles.streakBadgeText}>🔥 {habit.currentStreak}d streak</Text>
              </View>
            ) : null}

            {/* Reminder time */}
            {habit.reminderTime ? (
              <View style={[styles.reminderPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surfaceElevated }]}>
                <Text style={[styles.reminderText, { color: colors.textSecondary }]}>
                  ⏰ {habit.reminderTime}
                </Text>
              </View>
            ) : null}

            {/* Subtask Capsule Progress */}
            {subtasksCount > 0 && (
              <View style={[styles.subtaskPill, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)' }]}>
                <Text style={[styles.subtaskPillText, { color: colors.primary }]}>
                  📝 {completedSubtasksCount}/{subtasksCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Right Action: Checkmark circle toggle */}
      <View style={styles.rightActionsRow}>
        <TouchableOpacity
          onPress={() => onToggle(habit)}
          style={styles.touchTarget}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: habit.completedToday }}
          accessibilityLabel={`Mark habit ${habit.name} ${habit.completedToday ? 'incomplete' : 'complete'}`}
        >
          <View
            style={[
              styles.checkCircle,
              habit.completedToday
                ? { backgroundColor: accentColor, borderColor: accentColor }
                : { borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : colors.border },
            ]}
          >
            {habit.completedToday && <Text style={styles.checkIcon}>✓</Text>}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  containerCompleted: {
    opacity: 0.75,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  iconWrapperCompleted: {
    opacity: 0.9,
  },
  iconText: {
    fontSize: 22,
  },
  iconTextCompleted: {
    opacity: 0.7,
  },
  iconCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  iconCheckBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    marginBottom: 6,
    lineHeight: 20,
    fontSize: 15,
    fontWeight: '700',
  },
  numberedItemsContainer: {
    gap: 3,
    marginBottom: 6,
  },
  numberedItemText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  heatmapGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginRight: 2,
  },
  heatmapSquare: {
    width: 9,
    height: 9,
    borderRadius: 2.5,
  },
  streakBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  streakBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
  },
  reminderPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  reminderText: {
    fontSize: 10,
    fontWeight: '700',
  },
  subtaskPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subtaskPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
  },
  touchTarget: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
  },
});

export const HabitRow = React.memo(HabitRowComponent);
