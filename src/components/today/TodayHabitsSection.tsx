import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HabitWithStreak } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme';
import { BellIllustration } from '../BellIllustration';
import { HabitRow } from '../HabitRow';

interface TodayHabitsSectionProps {
  habits: HabitWithStreak[];
  onOpenNewHabit: () => void;
  onToggleHabit: (habit: HabitWithStreak) => void;
  onEditHabit: (habit: HabitWithStreak) => void;
  onDeleteHabit?: (habit: HabitWithStreak) => void;
  onToggleHabitSubtask?: (habit: HabitWithStreak, subtaskIndex: number) => void;
  onAddHabitSubtask?: (habit: HabitWithStreak, subtaskText: string) => void;
  onDeleteHabitSubtask?: (habit: HabitWithStreak, subtaskIndex: number) => void;
  getIconDetails: (habit: HabitWithStreak) => { bg: string; icon: string };
}

export const TodayHabitsSectionComponent: React.FC<TodayHabitsSectionProps> = ({
  habits,
  onOpenNewHabit,
  onToggleHabit,
  onEditHabit,
  onDeleteHabit,
  onToggleHabitSubtask,
  onAddHabitSubtask,
  onDeleteHabitSubtask,
  getIconDetails,
}) => {
  const { colors } = useAppTheme();
  const [hideCompleted, setHideCompleted] = useState(false);

  const pendingHabits = useMemo(
    () => habits.filter((h) => !h.completedToday),
    [habits]
  );
  const completedHabits = useMemo(
    () => habits.filter((h) => h.completedToday),
    [habits]
  );

  const completedTodayCount = completedHabits.length;

  return (
    <View style={styles.container}>
      {/* Habit Streaks: Header & Actions */}
      <View style={styles.habitStreaksHeaderRow}>
        <View style={styles.habitStreaksTitleCol}>
          <Text style={[styles.habitStreaksTitle, { color: colors.text }]}>
            Habit Streaks {habits.length > 0 ? `(${completedTodayCount}/${habits.length})` : ''}
          </Text>
          <Text style={[styles.habitStreaksSubtitle, { color: colors.textSecondary }]}>
            {habits.length > 0
              ? completedTodayCount === habits.length
                ? '🎉 All routines completed today!'
                : `${completedTodayCount} of ${habits.length} routines completed`
              : 'Consistency creates destiny'}
          </Text>
        </View>

        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            onPress={onOpenNewHabit}
            style={[
              styles.addHabitHeaderBtn,
              { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add New Habit"
          >
            <Text style={styles.addHabitHeaderBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily Routine Items with Streaks */}
      <View style={styles.routineListContainer}>
        {habits.length === 0 ? (
          <View style={[styles.emptyContainer, { borderColor: colors.borderSubtle }]}>
            <BellIllustration size={80} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No habits established yet
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              Consistency creates destiny! Tap + New to start your first daily routine and streak.
            </Text>
          </View>
        ) : (
          <>
            {/* Active / Pending Routines */}
            {pendingHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                onToggle={onToggleHabit}
                onEdit={onEditHabit}
                onDelete={onDeleteHabit}
                onToggleSubtask={onToggleHabitSubtask}
                onAddSubtask={onAddHabitSubtask}
                onDeleteSubtask={onDeleteHabitSubtask}
                getIconDetails={getIconDetails}
              />
            ))}

            {/* When all routines are completed and hidden */}
            {pendingHabits.length === 0 && completedHabits.length > 0 && hideCompleted && (
              <View
                style={[
                  styles.allDoneBox,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={styles.allDoneEmoji}>🎉</Text>
                <Text style={[styles.allDoneTitle, { color: colors.text }]}>
                  All routines completed today!
                </Text>
                <Text style={[styles.allDoneSubtitle, { color: colors.textSecondary }]}>
                  Great job staying consistent. Tap below to view completed routines.
                </Text>
              </View>
            )}

            {/* Completed Routines placed at last, with collapsible Hide/Show toggle */}
            {completedHabits.length > 0 && (
              <View style={styles.completedSection}>
                <TouchableOpacity
                  style={[
                    styles.completedHeaderToggle,
                    {
                      backgroundColor: colors.surfaceHighlight || colors.card,
                      borderColor: colors.cardBorder || colors.borderSubtle,
                    },
                  ]}
                  onPress={() => setHideCompleted((prev) => !prev)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={hideCompleted ? 'Show completed habits' : 'Hide completed habits'}
                >
                  <View style={styles.completedHeaderLeft}>
                    <Text style={styles.completedCheckIcon}>✓</Text>
                    <Text style={[styles.completedHeaderText, { color: colors.textSecondary }]}>
                      Completed ({completedHabits.length})
                    </Text>
                  </View>
                  <View style={styles.completedHeaderRight}>
                    <Text style={[styles.toggleActionText, { color: colors.primary }]}>
                      {hideCompleted ? 'Show ▼' : 'Hide ▲'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {!hideCompleted && (
                  <View style={styles.completedList}>
                    {completedHabits.map((habit) => (
                      <HabitRow
                        key={habit.id}
                        habit={habit}
                        onToggle={onToggleHabit}
                        onEdit={onEditHabit}
                        onDelete={onDeleteHabit}
                        onToggleSubtask={onToggleHabitSubtask}
                        onAddSubtask={onAddHabitSubtask}
                        onDeleteSubtask={onDeleteHabitSubtask}
                        getIconDetails={getIconDetails}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  habitStreaksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  habitStreaksTitleCol: {
    flex: 1,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addHabitHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addHabitHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  habitStreaksTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  habitStreaksSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  routineListContainer: {
    marginBottom: 12,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    marginVertical: 10,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
  },
  allDoneBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 4,
  },
  allDoneEmoji: {
    fontSize: 28,
    marginBottom: 2,
  },
  allDoneTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  allDoneSubtitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  completedSection: {
    marginTop: 4,
  },
  completedHeaderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  completedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completedCheckIcon: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  completedHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },
  completedHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  completedList: {
    marginTop: 2,
  },
});

export const TodayHabitsSection = React.memo(TodayHabitsSectionComponent);
