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
  onFocus?: () => void;
  formatTaskTime: (time?: string) => string;
}

export const NextUpCardComponent: React.FC<NextUpCardProps> = ({
  task,
  item,
  onPress,
  onComplete,
  onSnooze,
  onFocus,
  formatTaskTime,
}) => {
  const { colors, isDark } = useAppTheme();

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
  const isHighPriority = resolvedItem.rawTask?.priority === 'high';

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
          backgroundColor: isDark ? '#14102C' : colors.surfaceElevated,
          borderColor: withOpacity(badgeColor, 0.45),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.contentCol}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Next up: ${resolvedItem.title}. Tap to view.`}
      >
        {/* Top Header Row with Time Chip, Priority, and Badge */}
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: withOpacity(badgeColor, 0.18) }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>

          {isHighPriority && (
            <View style={styles.priorityPipRow}>
              <View style={styles.priorityPip} />
              <Text style={styles.priorityText}>High</Text>
            </View>
          )}

          {isSnoozed ? (
            <View style={[styles.timeChip, { backgroundColor: withOpacity(colors.warning, 0.14) }]}>
              <Text style={[styles.snoozeNoticeText, { color: colors.warning }]}>
                💤 Snoozed until {snoozeFormatted}
              </Text>
            </View>
          ) : resolvedItem.startTime ? (
            <View
              style={[
                styles.timeChip,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                ⏰ {formatTaskTime(resolvedItem.startTime)}
                {resolvedItem.endTime ? ` – ${formatTaskTime(resolvedItem.endTime)}` : ''}
              </Text>
            </View>
          ) : null}

          {isHabit && resolvedItem.streakCount !== undefined && resolvedItem.streakCount > 0 && (
            <View style={[styles.badge, { backgroundColor: withOpacity('#F59E0B', 0.16) }]}>
              <Text style={[styles.badgeText, { color: '#F59E0B' }]}>🔥 {resolvedItem.streakCount}d streak</Text>
            </View>
          )}
        </View>

        {/* Task Title */}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {resolvedItem.title}
        </Text>

        {/* Category & Tags */}
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

      {/* Action Buttons Trio: Done, Snooze, Focus */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={onComplete}
          style={[styles.completeBtn, { backgroundColor: badgeColor }]}
          activeOpacity={0.8}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={isHabit ? "Complete habit" : isEvent ? "Complete event" : "Complete task"}
        >
          <Text style={styles.completeBtnText}>✓ Done</Text>
        </TouchableOpacity>

        {isTask && onSnooze && (
          <TouchableOpacity
            onPress={onSnooze}
            style={[
              styles.actionBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Snooze next task 10 minutes"
          >
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>💤 +10m</Text>
          </TouchableOpacity>
        )}

        {isTask && onFocus && (
          <TouchableOpacity
            onPress={onFocus}
            style={[
              styles.actionBtn,
              {
                backgroundColor: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)',
                borderColor: withOpacity(colors.primary, 0.3),
              },
            ]}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Launch Focus Pomodoro Timer"
          >
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>⏱ Focus</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  contentCol: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  priorityPipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  timeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 23,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  completeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  snoozeNoticeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export const NextUpCard = React.memo(NextUpCardComponent);
