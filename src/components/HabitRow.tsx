import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HabitWithStreak } from '../types';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';

interface HabitRowProps {
  habit: HabitWithStreak;
  onToggle: () => void;
}

export const HabitRow: React.FC<HabitRowProps> = ({ habit, onToggle }) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <View style={styles.leftCol}>
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: `${habit.color}25` },
          ]}
        >
          <Text style={styles.iconText}>{habit.icon || '🎯'}</Text>
        </View>

        <View style={styles.infoCol}>
          <Text style={[styles.name, typography.title, { color: colors.text }]}>
            {habit.name}
          </Text>
          <View style={styles.streakRow}>
            <Text style={[styles.streakText, { color: colors.warning }]}>
              🔥 {habit.currentStreak} day streak
            </Text>
            {habit.bestStreak > habit.currentStreak ? (
              <Text style={[styles.bestStreakText, { color: colors.textMuted }]}>
                (best: {habit.bestStreak})
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={onToggle}
        style={styles.touchTarget}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: habit.completedToday }}
        accessibilityLabel={`Mark habit ${habit.name} ${habit.completedToday ? 'incomplete' : 'complete'}`}
      >
        <View
          style={[
            styles.checkCircle,
            habit.completedToday ? styles.checkCircleDone : { borderColor: colors.border },
          ]}
        >
          {habit.completedToday && <Text style={styles.checkIcon}>✓</Text>}
        </View>
      </TouchableOpacity>
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
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: 20,
  },
  infoCol: {
    flex: 1,
  },
  name: {
    marginBottom: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bestStreakText: {
    fontSize: 11,
  },
  touchTarget: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
