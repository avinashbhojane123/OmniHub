import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { withOpacity } from '../../utils/color';

interface TodayTaskItemProps {
  task: Task;
  isOverdue?: boolean;
  onToggle: (task: Task) => void;
  onPress: (task: Task) => void;
  onDelete: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtaskIndex: number) => void;
  formatTaskTime: (timeStr?: string) => string;
}

export const TodayTaskItemComponent: React.FC<TodayTaskItemProps> = ({
  task,
  isOverdue,
  onToggle,
  onPress,
  onDelete,
  onSnooze,
  formatTaskTime,
}) => {
  const { colors, isDark } = useAppTheme();
  const isTaskDone = task.status === 'completed';
  const isTaskCancelled = task.status === 'cancelled';

  const isSnoozed = useMemo(() => {
    if (!task.snoozeUntil || isTaskDone) return false;
    const d = new Date(task.snoozeUntil);
    return !isNaN(d.getTime()) && d.getTime() > Date.now();
  }, [task.snoozeUntil, isTaskDone]);

  const snoozeDisplayTime = useMemo(() => {
    if (!isSnoozed || !task.snoozeUntil) return '';
    const d = new Date(task.snoozeUntil);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return formatTaskTime(`${hh}:${mm}`);
  }, [isSnoozed, task.snoozeUntil, formatTaskTime]);

  const accentHighlight = task.recurrenceRule?.accentColor || task.accentColor;

  const priorityColor =
    task.priority === 'high'
      ? '#EF4444'
      : task.priority === 'medium'
      ? '#F59E0B'
      : '#64748B';

  const priorityLabel =
    task.priority === 'high'
      ? 'High'
      : task.priority === 'medium'
      ? 'Med'
      : 'Low';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#15112E' : colors.surface,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
          ...(accentHighlight && !isTaskDone ? { borderLeftColor: accentHighlight, borderLeftWidth: 3.5 } : {}),
        },
      ]}
    >
      {/* Checkbox triggers completion toggle */}
      <TouchableOpacity
        onPress={() => onToggle(task)}
        style={[
          styles.checkbox,
          { borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : colors.borderSubtle },
          isTaskDone && {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
          isTaskCancelled && {
            opacity: 0.5,
            borderColor: colors.borderSubtle,
          },
        ]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isTaskDone }}
        accessibilityLabel={
          isTaskCancelled
            ? `Task ${task.title} is cancelled. Tap to restore.`
            : `Mark task ${task.title} ${isTaskDone ? 'incomplete' : 'complete'}`
        }
      >
        {isTaskDone && <Text style={styles.statusCheckmark}>✓</Text>}
      </TouchableOpacity>

      {/* Task Info Column */}
      <View style={styles.infoCol}>
        {/* Top Row: Title (tap to edit) + Priority Pip + Delete Button */}
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={styles.titleTouchable}
            onPress={() => onPress(task)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Edit task ${task.title}`}
          >
            <Text
              style={[
                styles.title,
                (isTaskDone || isTaskCancelled) && styles.titleDone,
                { color: isTaskCancelled ? colors.textMuted : colors.text },
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onDelete(task)}
            style={styles.deleteBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete task ${task.title}`}
          >
            <Text style={[styles.deleteIcon, { color: colors.textMuted }]}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Metadata Row: Priority Pip, Category Badges, Time, Recurrence & Quick Snooze */}
        <View style={styles.metaRow}>
          {/* Priority Pip Capsule */}
          <View style={[styles.priorityPill, { backgroundColor: withOpacity(priorityColor, 0.12) }]}>
            <View style={[styles.priorityPip, { backgroundColor: priorityColor }]} />
            <Text style={[styles.priorityPillText, { color: priorityColor }]}>
              {priorityLabel}
            </Text>
          </View>

          {isTaskCancelled && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.priorityPillText, { color: colors.textMuted, fontWeight: '700' }]}>
                🚫 Cancelled
              </Text>
            </View>
          )}

          {isOverdue && !isTaskDone && !isTaskCancelled && !isSnoozed && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor: colors.dangerBg || 'rgba(239, 68, 68, 0.15)',
                  borderColor: colors.danger || '#EF4444',
                },
              ]}
            >
              <Text style={[styles.priorityPillText, { color: colors.danger || '#EF4444', fontWeight: '800' }]}>
                ⚠️ Overdue
              </Text>
            </View>
          )}

          {task.categoryName && (
            <View
              style={[
                styles.categoryPill,
                {
                  backgroundColor: withOpacity(task.categoryColor || colors.primary, 0.14),
                  borderColor: task.categoryColor || colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  { color: task.categoryColor || colors.primary },
                ]}
              >
                {task.categoryIcon ? `${task.categoryIcon} ` : ''}
                {task.categoryName}
              </Text>
            </View>
          )}

          {task.startTime && (
            <Text style={[styles.taskTime, { color: colors.textMuted }]}>
              ⏰ {formatTaskTime(task.startTime)}
              {task.endTime ? ` – ${formatTaskTime(task.endTime)}${task.recurrenceRule?.isOvernight ? ' (+1d)' : ''}` : ''}
            </Text>
          )}

          {task.recurrenceRule && task.recurrenceRule.type !== 'none' && (
            <Text style={[styles.taskTime, { color: colors.primary }]}>
              🔄 {task.recurrenceRule.type}
            </Text>
          )}

          {isSnoozed && (
            <View
              style={[
                styles.snoozeActivePill,
                {
                  backgroundColor: withOpacity(colors.warning, 0.15),
                  borderColor: colors.warning,
                },
              ]}
            >
              <Text style={[styles.snoozeActiveText, { color: colors.warning }]}>
                💤 Snoozed ({snoozeDisplayTime})
              </Text>
            </View>
          )}

          {!isTaskDone && (
            <TouchableOpacity
              onPress={() => onSnooze(task)}
              style={[styles.snoozeBtn, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.borderSubtle }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Snooze task ${task.title} 10 minutes`}
            >
              <Text style={[styles.snoozeText, { color: colors.textMuted }]}>💤 +10m</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  statusCheckmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  infoCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleTouchable: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  deleteBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  categoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taskTime: {
    fontSize: 11,
    fontWeight: '600',
  },
  snoozeActivePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  snoozeActiveText: {
    fontSize: 10,
    fontWeight: '800',
  },
  snoozeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  snoozeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

export const TodayTaskItem = React.memo(TodayTaskItemComponent);
