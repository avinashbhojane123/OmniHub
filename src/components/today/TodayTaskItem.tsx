import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { parseBulletNotes } from '../../utils/bulletNotes';
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

const TodayTaskItemComponent: React.FC<TodayTaskItemProps> = ({
  task,
  isOverdue,
  onToggle,
  onPress,
  onDelete,
  onSnooze,
  onToggleSubtask,
  formatTaskTime,
}) => {
  const { colors } = useAppTheme();
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

  const bullets = useMemo(
    () => parseBulletNotes(task.notes || task.description),
    [task.notes, task.description]
  );

  const accentHighlight = task.recurrenceRule?.accentColor;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          ...(accentHighlight && !isTaskDone ? { borderLeftColor: accentHighlight, borderLeftWidth: 3.5 } : {}),
        },
      ]}
    >
      {/* Checkbox triggers completion toggle */}
      <TouchableOpacity
        onPress={() => onToggle(task)}
        style={[
          styles.checkbox,
          { borderColor: colors.borderSubtle },
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
        {/* Top Row: Title (tap to edit) + Delete Button */}
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

        {/* Metadata Row: Badges, Time, Recurrence & Quick Snooze */}
        <View style={styles.metaRow}>
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
          {task.priority === 'high' && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor: withOpacity(colors.priorityHigh, 0.15),
                  borderColor: colors.priorityHigh || '#EF4444',
                },
              ]}
            >
              <Text style={[styles.priorityPillText, { color: colors.priorityHigh || '#EF4444' }]}>
                High
              </Text>
            </View>
          )}
          {task.priority === 'medium' && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor: withOpacity(colors.priorityMedium, 0.15),
                  borderColor: colors.priorityMedium || '#F97316',
                },
              ]}
            >
              <Text style={[styles.priorityPillText, { color: colors.priorityMedium || '#F97316' }]}>
                Med
              </Text>
            </View>
          )}
          {task.priority === 'low' && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor: withOpacity(colors.priorityLow, 0.15),
                  borderColor: colors.priorityLow || '#10B981',
                },
              ]}
            >
              <Text style={[styles.priorityPillText, { color: colors.priorityLow || '#10B981' }]}>
                Low
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
              style={[styles.snoozeBtn, { borderColor: colors.borderSubtle }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Snooze task ${task.title} 10 minutes`}
            >
              <Text style={[styles.snoozeText, { color: colors.textMuted }]}>💤 +10m</Text>
            </TouchableOpacity>
          )}
        </View>

        {bullets.length > 0 && (
          <View style={styles.bulletsWrapper}>
            {bullets.slice(0, 3).map((b, i) => (
              <TouchableOpacity
                key={b.id || `bullet_${i}`}
                style={styles.bulletRow}
                onPress={() => {
                  if (onToggleSubtask) {
                    onToggleSubtask(task, i);
                  } else {
                    onPress(task);
                  }
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text style={[styles.bulletBullet, { color: colors.primary }]}>
                  {b.completed !== undefined ? (b.completed ? '☑' : '☐') : '•'}
                </Text>
                <Text
                  style={[
                    styles.bulletText,
                    (b.completed || isTaskDone) && styles.bulletTextDone,
                    {
                      color:
                        b.completed || isTaskDone
                          ? colors.textMuted
                          : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
            {bullets.length > 3 && (
              <TouchableOpacity onPress={() => onPress(task)}>
                <Text style={[styles.moreBulletsText, { color: colors.textMuted }]}>
                  +{bullets.length - 3} more subtasks...
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusCheckmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  infoCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleTouchable: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  deleteBtn: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  priorityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  categoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taskTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  snoozeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  snoozeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  snoozeActivePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  snoozeActiveText: {
    fontSize: 10,
    fontWeight: '700',
  },
  bulletsWrapper: {
    marginTop: 4,
    gap: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletBullet: {
    fontSize: 13,
    fontWeight: '800',
  },
  bulletText: {
    fontSize: 12,
  },
  bulletTextDone: {
    textDecorationLine: 'line-through',
  },
  moreBulletsText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginLeft: 12,
  },
});

export const TodayTaskItem = React.memo(TodayTaskItemComponent);

