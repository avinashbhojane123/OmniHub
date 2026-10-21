import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme';
import { TodayTaskItem } from './TodayTaskItem';

export type TaskFilterType = 'all' | 'pending' | 'completed';

interface TodayTasksSectionProps {
  tasks: Task[];
  allTasks: Task[];
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  completionPercentage?: number;
  taskFilter: TaskFilterType;
  overdueTaskIds?: Set<string>;
  onSetTaskFilter: (filter: TaskFilterType) => void;
  onOpenCreateTask: () => void;
  onCompleteAllPending?: () => void;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onDeleteTask: (task: { id: string; title: string }) => void;
  onSnoozeTask: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtaskIndex: number) => void;
  formatTaskTime: (timeStr?: string) => string;
}

const FILTER_KEYS: TaskFilterType[] = ['all', 'pending', 'completed'];

export const TodayTasksSectionComponent: React.FC<TodayTasksSectionProps> = ({
  tasks,
  allTasks,
  totalCount,
  pendingCount,
  completedCount,
  completionPercentage,
  taskFilter,
  overdueTaskIds,
  onSetTaskFilter,
  onOpenCreateTask,
  onCompleteAllPending,
  onToggleTask,
  onPressTask,
  onDeleteTask,
  onSnoozeTask,
  onToggleSubtask,
  formatTaskTime,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.tasksSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Scheduled Tasks ({totalCount})
        </Text>
        <View style={styles.headerRightActionsRow}>
          {onCompleteAllPending && pendingCount > 1 && (
            <TouchableOpacity
              onPress={onCompleteAllPending}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Complete all ${pendingCount} pending tasks`}
            >
              <Text style={[styles.batchCompleteText, { color: colors.primary }]}>
                ✓ Complete All
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onOpenCreateTask}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add Task"
          >
            <Text style={[styles.seeAllText, { color: colors.primary }]}>
              + Add Task
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily Task Completion Progress Bar */}
      {totalCount > 0 && completionPercentage !== undefined && (() => {
        const safePercent = typeof completionPercentage === 'number' && !isNaN(completionPercentage)
          ? Math.min(100, Math.max(0, Math.round(completionPercentage)))
          : 0;
        return (
          <View style={styles.progressContainer}>
            <View style={styles.progressHeaderRow}>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                Daily Progress
              </Text>
              <Text style={[styles.progressValue, { color: colors.primary }]}>
                {safePercent}% ({completedCount}/{totalCount})
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${Math.max(safePercent, safePercent > 0 ? 5 : 0)}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        );
      })()}

      {/* Task Status Filters (All, Pending, Done) with accurate counts */}
      {totalCount > 0 && (
        <View style={styles.taskFilterRow}>
          {FILTER_KEYS.map((filterKey) => {
            const count =
              filterKey === 'all'
                ? totalCount
                : filterKey === 'pending'
                ? pendingCount
                : completedCount;
            const isActive = taskFilter === filterKey;
            const label =
              filterKey === 'all'
                ? `All (${count})`
                : filterKey === 'pending'
                ? `Pending (${count})`
                : `Done (${count})`;
            return (
              <TouchableOpacity
                key={filterKey}
                onPress={() => onSetTaskFilter(filterKey)}
                style={[
                  styles.taskFilterChip,
                  isActive
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${filterKey} tasks`}
              >
                <Text
                  style={[
                    styles.taskFilterChipText,
                    { color: isActive ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {totalCount === 0 ? (
        <View style={[styles.taskEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={styles.taskEmptyIcon}>📝</Text>
          <Text style={[styles.taskEmptyTitle, { color: colors.text }]}>
            No tasks scheduled for today
          </Text>
          <Text style={[styles.taskEmptyDesc, { color: colors.textSecondary }]}>
            Plan your day to stay focused and productive.
          </Text>
          <TouchableOpacity
            onPress={onOpenCreateTask}
            style={[styles.taskAddBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.taskAddBtnText, { color: colors.primary }]}>+ Schedule Task</Text>
          </TouchableOpacity>
        </View>
      ) : tasks.length === 0 ? (
        taskFilter === 'completed' ? (
          <View style={[styles.taskEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={styles.taskEmptyIcon}>⏳</Text>
            <Text style={[styles.taskEmptyTitle, { color: colors.text }]}>
              No completed tasks yet
            </Text>
            <Text style={[styles.taskEmptyDesc, { color: colors.textSecondary }]}>
              Check off tasks as you finish them today.
            </Text>
          </View>
        ) : allTasks.every((t) => t.status === 'completed' || t.status === 'cancelled') ? (
          <View style={[styles.taskEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={styles.taskEmptyIcon}>🎉</Text>
            <Text style={[styles.taskEmptyTitle, { color: colors.text }]}>
              All caught up!
            </Text>
            <Text style={[styles.taskEmptyDesc, { color: colors.textSecondary }]}>
              All scheduled tasks for today are completed. Great work!
            </Text>
          </View>
        ) : (
          <View style={[styles.taskEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={styles.taskEmptyIcon}>📝</Text>
            <Text style={[styles.taskEmptyTitle, { color: colors.text }]}>
              No tasks found
            </Text>
            <Text style={[styles.taskEmptyDesc, { color: colors.textSecondary }]}>
              No tasks match the selected filter.
            </Text>
          </View>
        )
      ) : (
        tasks.map((task) => (
          <TodayTaskItem
            key={task.id}
            task={task}
            isOverdue={overdueTaskIds?.has(task.id)}
            onToggle={onToggleTask}
            onPress={onPressTask}
            onDelete={onDeleteTask}
            onSnooze={onSnoozeTask}
            onToggleSubtask={onToggleSubtask}
            formatTaskTime={formatTaskTime}
          />
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tasksSection: {
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  taskFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  taskFilterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskFilterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  taskEmptyBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  taskEmptyIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  taskEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  taskEmptyDesc: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  taskAddBtn: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    marginTop: 6,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  headerRightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  batchCompleteText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export const TodayTasksSection = React.memo(TodayTasksSectionComponent);
