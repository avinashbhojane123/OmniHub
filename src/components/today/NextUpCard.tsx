import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { withOpacity } from '../../utils/color';

interface NextUpCardProps {
  task: Task;
  onPress: () => void;
  onComplete: () => void;
  onSnooze: () => void;
  formatTaskTime: (time?: string) => string;
}

export const NextUpCardComponent: React.FC<NextUpCardProps> = ({
  task,
  onPress,
  onComplete,
  onSnooze,
  formatTaskTime,
}) => {
  const { colors } = useAppTheme();

  const isSnoozed = Boolean(
    task.snoozeUntil &&
      !isNaN(new Date(task.snoozeUntil).getTime()) &&
      new Date(task.snoozeUntil).getTime() > Date.now()
  );

  const snoozeTime = isSnoozed && task.snoozeUntil ? new Date(task.snoozeUntil) : null;
  const snoozeFormatted = snoozeTime
    ? formatTaskTime(
        `${String(snoozeTime.getHours()).padStart(2, '0')}:${String(snoozeTime.getMinutes()).padStart(2, '0')}`
      )
    : '';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: withOpacity(colors.primary, 0.4),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.leftCol}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Next task: ${task.title}. Tap to edit.`}
      >
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: withOpacity(colors.primary, 0.18) }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>⚡ NEXT UP</Text>
          </View>
          {isSnoozed ? (
            <Text style={[styles.snoozeNoticeText, { color: colors.warning }]}>
              💤 Snoozed until {snoozeFormatted}
            </Text>
          ) : task.startTime ? (
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
              ⏰ {formatTaskTime(task.startTime)}
              {task.endTime ? ` – ${formatTaskTime(task.endTime)}` : ''}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {task.title}
        </Text>

        {task.categoryName && (
          <Text
            style={[
              styles.categoryText,
              { color: task.categoryColor || colors.primary },
            ]}
          >
            {task.categoryIcon ? `${task.categoryIcon} ` : ''}
            {task.categoryName}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity
          onPress={onComplete}
          style={[styles.completeBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Complete next task"
        >
          <Text style={styles.completeBtnText}>✓ Done</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSnooze}
          style={[styles.snoozeBtn, { borderColor: colors.borderSubtle }]}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Snooze next task 10 minutes"
        >
          <Text style={[styles.snoozeBtnText, { color: colors.textMuted }]}>💤 +10m</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  leftCol: {
    flex: 1,
    marginRight: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionsCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  completeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  completeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  snoozeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  snoozeBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  snoozeNoticeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export const NextUpCard = React.memo(NextUpCardComponent);

