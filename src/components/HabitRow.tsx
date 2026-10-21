import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HabitWithStreak } from '../types';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { withOpacity } from '../utils/color';
import { parseHabitNameItems, formatNumberedItem } from '../utils/bulletNotes';

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
  const { colors } = useAppTheme();
  const accentColor = habit.color || colors.primary;
  const iconDetails = getIconDetails
    ? getIconDetails(habit)
    : { bg: withOpacity(accentColor, 0.2), icon: habit.icon || '🎯' };

  const habitItems = useMemo(
    () => parseHabitNameItems(habit.name),
    [habit.name]
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
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

      {/* Info Column: Habit Name (Numbered items if multiple) and Scheduled Time */}
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

          {habit.reminderTime ? (
            <View style={styles.streakRow}>
              <Text style={[styles.bestStreakText, { color: colors.textMuted }]}>
                ⏰ {habit.reminderTime}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Right Action: Checkmark circle toggle */}
      <View style={styles.rightActionsRow}>
        <TouchableOpacity
          onPress={() => onToggle(habit)}
          style={styles.touchTarget}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: habit.completedToday }}
          accessibilityLabel={`Mark habit ${habit.name} ${habit.completedToday ? 'incomplete' : 'complete'}`}
        >
          <View
            style={[
              styles.checkCircle,
              habit.completedToday
                ? { backgroundColor: accentColor, borderColor: accentColor }
                : { borderColor: colors.border },
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
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  containerCompleted: {
    opacity: 0.72,
  },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  iconWrapperCompleted: {
    opacity: 0.85,
  },
  iconText: {
    fontSize: 20,
  },
  iconTextCompleted: {
    opacity: 0.6,
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
    marginRight: spacing.sm,
  },
  name: {
    marginBottom: 4,
    lineHeight: 20,
    fontSize: 15,
  },
  numberedItemsContainer: {
    gap: 3,
    marginBottom: 4,
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
  bestStreakText: {
    fontSize: 11,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
  },
  touchTarget: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkIcon: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export const HabitRow = React.memo(HabitRowComponent);
