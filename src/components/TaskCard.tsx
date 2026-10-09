import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../types';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { parseBulletNotes } from '../utils/bulletNotes';

interface TaskCardProps {
  task: Task;
  onPress?: () => void;
  onToggleComplete?: () => void;
  onSnooze?: () => void;
  onDelete?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  onToggleComplete,
  onSnooze,
  onDelete,
}) => {
  const { colors } = useAppTheme();
  const isCompleted = task.status === 'completed';

  const getPriorityColor = () => {
    switch (task.priority) {
      case 'high':
        return colors.priorityHigh;
      case 'low':
        return colors.priorityLow;
      default:
        return colors.priorityMedium;
    }
  };

  const bullets = parseBulletNotes(task.notes || (task.description?.includes('•') ? task.description : undefined));
  const hasBullets = bullets.length > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.container,
        isCompleted && styles.containerCompleted,
        {
          backgroundColor: colors.card,
          borderColor: isCompleted ? colors.borderSubtle : colors.cardBorder,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Task: ${task.title}, priority ${task.priority}, ${task.status}`}
    >
      <View style={styles.contentRow}>
        {/* Large 44dp Touch Target Checkbox */}
        <TouchableOpacity
          onPress={onToggleComplete}
          style={styles.checkboxTouchTarget}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted }}
          accessibilityLabel={`Mark ${task.title} as ${isCompleted ? 'incomplete' : 'complete'}`}
        >
          <View
            style={[
              styles.checkbox,
              isCompleted ? styles.checkboxDone : { borderColor: colors.border },
            ]}
          >
            {isCompleted && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>

        <View style={styles.textContainer}>
          {/* Main Heading (Title) */}
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                typography.title,
                isCompleted && styles.titleCompleted,
                {
                  color: isCompleted ? colors.textMuted : colors.text,
                },
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>

            {/* Priority Badge */}
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: `${getPriorityColor()}22` },
              ]}
            >
              <View
                style={[
                  styles.priorityDot,
                  { backgroundColor: getPriorityColor() },
                ]}
              />
              <Text
                style={[
                  styles.priorityText,
                  typography.micro,
                  { color: getPriorityColor() },
                ]}
              >
                {task.priority}
              </Text>
            </View>
          </View>

          {/* Down Side: Google Keep Style Bullet Notes Preview */}
          {hasBullets ? (
            <View style={styles.bulletsContainer}>
              {bullets.slice(0, 4).map((bullet, idx) => (
                <View key={bullet.id || idx} style={styles.bulletRow}>
                  <Text style={[styles.bulletMark, { color: bullet.completed ? colors.success : colors.primary }]}>
                    {bullet.completed ? '✓' : '•'}
                  </Text>
                  <Text
                    style={[
                      styles.bulletText,
                      typography.caption,
                      (bullet.completed || isCompleted) && styles.bulletTextCompleted,
                      {
                        color:
                          bullet.completed || isCompleted
                            ? colors.textMuted
                            : colors.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {bullet.text}
                  </Text>
                </View>
              ))}
              {bullets.length > 4 && (
                <Text
                  style={[styles.bulletsMore, typography.micro, { color: colors.primaryLight }]}
                >
                  +{bullets.length - 4} more bullet notes...
                </Text>
              )}
            </View>
          ) : task.description ? (
            <Text
              style={[
                styles.description,
                typography.caption,
                { color: colors.textSecondary },
              ]}
              numberOfLines={2}
            >
              {task.description}
            </Text>
          ) : task.notes ? (
            <Text
              style={[
                styles.description,
                typography.caption,
                { color: colors.textSecondary },
              ]}
              numberOfLines={2}
            >
              {task.notes}
            </Text>
          ) : null}

          {/* Metadata Row: Category & Time */}
          <View style={styles.metaRow}>
            {task.startTime ? (
              <View
                style={[
                  styles.timeBadge,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Text style={[styles.timeText, { color: colors.primaryLight }]}>
                  ⏰ {task.startTime}
                  {task.endTime ? ` - ${task.endTime}` : ''}
                </Text>
              </View>
            ) : null}

            {task.categoryName ? (
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: task.categoryColor
                      ? `${task.categoryColor}25`
                      : colors.primaryMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    {
                      color: task.categoryColor || colors.primary,
                    },
                  ]}
                >
                  {task.categoryName}
                </Text>
              </View>
            ) : null}

            {task.reminderMinutes !== undefined && task.reminderMinutes > 0 ? (
              <Text style={[styles.reminderText, { color: colors.textMuted }]}>
                🔔 {task.reminderMinutes}m before
              </Text>
            ) : null}
          </View>
        </View>

        {/* Quick Action Buttons (Snooze & Delete) */}
        <View style={styles.cardActionsCol}>
          {!isCompleted && onSnooze ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onSnooze}
              accessibilityRole="button"
              accessibilityLabel="Snooze 10 minutes"
            >
              <Text style={[styles.snoozeText, { color: colors.warning }]}>💤</Text>
            </TouchableOpacity>
          ) : null}

          {onDelete ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete task"
            >
              <Text style={styles.deleteIconText}>🗑</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  containerCompleted: {
    opacity: 0.65,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxTouchTarget: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    marginRight: spacing.sm,
    fontWeight: '700',
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reminderText: {
    fontSize: 11,
  },
  cardActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: spacing.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snoozeText: {
    fontSize: 16,
  },
  deleteIconText: {
    fontSize: 14,
  },
  bulletsContainer: {
    marginVertical: 4,
    gap: 3,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletMark: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  bulletTextCompleted: {
    textDecorationLine: 'line-through',
  },
  bulletsMore: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    marginLeft: 14,
  },
});
