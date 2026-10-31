import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task, UnifiedNextUpItem } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { withOpacity } from '../../utils/color';

interface NextUpCardProps {
  task?: Task | null;
  item?: UnifiedNextUpItem | null;
  onPress: () => void;
  onComplete: () => void;
  onSnooze?: () => void;
  formatTaskTime: (time?: string) => string;
}

export const NextUpCardComponent: React.FC<NextUpCardProps> = ({
  task,
  item,
  onPress,
  onComplete,
  onSnooze,
  formatTaskTime,
}) => {
  const { colors } = useAppTheme();

  // If item is passed, use it; otherwise adapt task
  const resolvedItem: UnifiedNextUpItem | null = item || (task ? {
    id: task.id,
    type: 'task',
    title: task.title,
    description: task.description,
    startTime: task.startTime,
    endTime: task.endTime,
    categoryName: task.categoryName,
    categoryColor: task.categoryColor,
    categoryIcon: task.categoryIcon,
    isSnoozed: Boolean(
      task.snoozeUntil &&
        !isNaN(new Date(task.snoozeUntil).getTime()) &&
        new Date(task.snoozeUntil).getTime() > Date.now()
    ),
    rawTask: task,
  } : null);

  if (!resolvedItem) return null;

  const isTask = resolvedItem.type === 'task';
  const isEvent = resolvedItem.type === 'calendar_event';
  const isHabit = resolvedItem.type === 'habit';

  const badgeColor = isEvent ? '#3B82F6' : isHabit ? '#10B981' : colors.primary;
  const badgeLabel = isEvent ? '📅 EVENT' : isHabit ? '🔁 HABIT' : '⚡ NEXT UP';

  const isSnoozed = Boolean(resolvedItem.isSnoozed);
  const snoozeTime = isSnoozed && resolvedItem.rawTask?.snoozeUntil ? new Date(resolvedItem.rawTask.snoozeUntil) : null;
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
          borderColor: withOpacity(badgeColor, 0.45),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.leftCol}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Next up: ${resolvedItem.title}. Tap to view.`}
      >
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: withOpacity(badgeColor, 0.18) }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
          {isSnoozed ? (
            <Text style={[styles.snoozeNoticeText, { color: colors.warning }]}>
              💤 Snoozed until {snoozeFormatted}
            </Text>
          ) : resolvedItem.startTime ? (
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
              ⏰ {formatTaskTime(resolvedItem.startTime)}
              {resolvedItem.endTime ? ` – ${formatTaskTime(resolvedItem.endTime)}` : ''}
            </Text>
          ) : null}
          {isHabit && resolvedItem.streakCount !== undefined && resolvedItem.streakCount > 0 && (
            <View style={[styles.badge, { backgroundColor: withOpacity('#F59E0B', 0.16) }]}>
              <Text style={[styles.badgeText, { color: '#F59E0B' }]}>🔥 {resolvedItem.streakCount}d streak</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {resolvedItem.title}
        </Text>

        {resolvedItem.categoryName && (
          <Text
            style={[
              styles.categoryText,
              { color: resolvedItem.categoryColor || badgeColor },
            ]}
          >
            {resolvedItem.categoryIcon ? `${resolvedItem.categoryIcon} ` : ''}
            {resolvedItem.categoryName}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity
          onPress={onComplete}
          style={[styles.completeBtn, { backgroundColor: badgeColor }]}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isHabit ? "Complete habit" : isEvent ? "Complete event" : "Complete task"}
        >
          <Text style={styles.completeBtnText}>✓ Done</Text>
        </TouchableOpacity>

        {isTask && onSnooze ? (
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
        ) : (
          <TouchableOpacity
            onPress={onPress}
            style={[styles.snoozeBtn, { borderColor: colors.borderSubtle }]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Open details"
          >
            <Text style={[styles.snoozeBtnText, { color: colors.textMuted }]}>👁️ View</Text>
          </TouchableOpacity>
        )}
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

