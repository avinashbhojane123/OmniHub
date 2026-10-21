import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HabitWithStreak } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { withOpacity, getContrastTextColor } from '../../utils/color';

interface HabitStreakCardProps {
  habit: HabitWithStreak;
  weekDays: {
    iso: string;
    dayName: string;
    dayNumber: string;
    isToday: boolean;
  }[];
  onToggle: (habit: HabitWithStreak) => void;
  onToggleDate: (habitId: string, dateIso: string, isDone: boolean) => void;
  onEdit: (habit: HabitWithStreak) => void;
  onDelete: (habit: HabitWithStreak) => void;
  getIconDetails: (habit: HabitWithStreak) => { bg: string; icon: string };
}

const HabitStreakCardComponent: React.FC<HabitStreakCardProps> = ({
  habit,
  weekDays,
  onToggle,
  onToggleDate,
  onEdit,
  onDelete,
  getIconDetails,
}) => {
  const { colors } = useAppTheme();
  const { bg, icon } = getIconDetails(habit);
  const alarmTime = habit.reminderTime;
  const displaySubtitle = alarmTime
    ? `⏰ ${alarmTime}`
    : (habit.description?.replace(/^⏰\s*/, '') || 'Daily routine');
  const accentColor = habit.color || colors.primary;

  const targetDaysCount =
    habit.recurrenceRule?.daysOfWeek && habit.recurrenceRule.daysOfWeek.length > 0
      ? habit.recurrenceRule.daysOfWeek.length
      : 7;

  const completedInWeek = (weekDays || []).filter((wd) => Boolean(habit.weeklyLogs?.[wd.iso])).length;
  const weekPercent = Math.min(100, Math.max(0, Math.round((completedInWeek / 7) * 100)));

  const checkmarkColor = getContrastTextColor(accentColor);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
        },
      ]}
    >
      {/* Card Header: Icon, Routine Name & Actions */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.habitMeta}>
          <View style={[styles.habitIconBadge, { backgroundColor: bg }]}>
            <Text style={styles.habitIconEmoji}>{icon}</Text>
          </View>
          <View style={styles.habitNameCol}>
            <Text style={[styles.habitName, { color: colors.text }]} numberOfLines={1}>
              {habit.name}
            </Text>
            <Text style={[styles.habitDesc, { color: colors.textSecondary }]}>
              {displaySubtitle}
            </Text>
          </View>
        </View>

        {/* Action Buttons: Edit, Delete */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => onEdit(habit)}
            style={[
              styles.actionIconBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${habit.name}`}
          >
            <Text style={styles.actionIconTxt}>✏️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onDelete(habit)}
            style={[
              styles.actionIconBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${habit.name}`}
          >
            <Text style={styles.actionIconTxt}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Streak Stats & Check-In Row */}
      <View style={styles.streakStatusRow}>
        <View style={styles.streakPillsCol}>
          <View style={[styles.streakPill, { backgroundColor: withOpacity(accentColor, 0.15) }]}>
            <Text style={[styles.streakFire, { color: accentColor }]}>
              🔥 {habit.currentStreak} day streak
            </Text>
          </View>
          <Text style={[styles.bestStreakText, { color: colors.textMuted }]}>
            Best: {habit.bestStreak}d • {completedInWeek}/7 days active (Past 7d)
            {targetDaysCount < 7 ? ` • Goal: ${targetDaysCount}d/wk` : ''}
          </Text>
        </View>

        {/* Today Check-In Button */}
        <TouchableOpacity
          onPress={() => onToggle(habit)}
          style={[
            styles.checkButton,
            habit.completedToday
              ? { backgroundColor: accentColor, borderColor: accentColor }
              : { backgroundColor: 'transparent', borderColor: colors.borderSubtle },
          ]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={habit.completedToday ? 'Completed today' : 'Check in today'}
        >
          <Text
            style={[
              styles.checkText,
              { color: habit.completedToday ? checkmarkColor : colors.text },
            ]}
          >
            {habit.completedToday ? '✓ Done' : '○ Check In'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Progress Track */}
      <View style={[styles.progressTrack, { backgroundColor: colors.borderSubtle }]}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.max(weekPercent, 4)}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      {/* Interactive 7-Day Completion Dots */}
      <View style={[styles.trackerContainer, { borderTopColor: colors.borderSubtle }]}>
        <View style={styles.trackerHeader}>
          <Text style={[styles.trackerTitle, { color: colors.textMuted }]}>
            PAST 7 DAYS (TAP TO TOGGLE)
          </Text>
          <Text style={[styles.trackerCompletedText, { color: accentColor }]}>
            {completedInWeek}/7 days active {targetDaysCount < 7 ? `(Goal: ${targetDaysCount}d/wk)` : ''}
          </Text>
        </View>

        <View style={styles.weekGrid}>
          {weekDays.map((wd) => {
            const isDone = Boolean(habit.weeklyLogs[wd.iso]);
            return (
              <TouchableOpacity
                key={wd.iso}
                onPress={() => onToggleDate(habit.id, wd.iso, isDone)}
                style={styles.dayCol}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                activeOpacity={0.65}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isDone }}
                accessibilityLabel={`${wd.dayName} ${wd.dayNumber}, ${isDone ? 'completed' : 'not completed'}`}
                accessibilityHint="Tap to toggle completion"
              >
                <Text
                  style={[
                    styles.dayLabel,
                    wd.isToday ? styles.dayLabelToday : styles.dayLabelMuted,
                    {
                      color: wd.isToday ? colors.text : colors.textMuted,
                    },
                  ]}
                >
                  {wd.dayName.slice(0, 1)}
                </Text>

                <View
                  style={[
                    styles.dot,
                    isDone ? styles.dotDone : styles.dotPending,
                    wd.isToday && styles.dotToday,
                    {
                      backgroundColor: isDone ? accentColor : colors.surfaceElevated,
                      borderColor: isDone ? accentColor : wd.isToday ? accentColor : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dotNumber,
                      { color: isDone ? checkmarkColor : colors.text },
                      styles.textBold,
                    ]}
                  >
                    {isDone ? '✓' : wd.dayNumber}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  habitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  habitIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  habitIconEmoji: {
    fontSize: 22,
  },
  habitNameCol: {
    flex: 1,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
  },
  habitDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconTxt: {
    fontSize: 12,
  },
  streakStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  streakPillsCol: {
    flex: 1,
  },
  streakPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  streakFire: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF6B00',
  },
  bestStreakText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  checkButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  checkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 12,
    marginBottom: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  trackerContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackerTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  trackerCompletedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
    minWidth: 38,
    paddingVertical: 2,
  },
  dayLabel: {
    fontSize: 11,
  },
  dayLabelToday: {
    fontWeight: '800',
  },
  dayLabelMuted: {
    fontWeight: '600',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotDone: {
    borderWidth: 0,
  },
  dotPending: {
    borderWidth: 1.5,
  },
  dotToday: {
    borderWidth: 2,
  },
  dotNumber: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  dotNumberDone: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  textBold: {
    fontWeight: '800',
  },
});

export const HabitStreakCard = React.memo(HabitStreakCardComponent);

