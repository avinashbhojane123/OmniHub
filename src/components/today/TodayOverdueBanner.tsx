import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { radius } from '../../theme';
import { TodayTaskItem } from './TodayTaskItem';

interface TodayOverdueBannerProps {
  tasks: Task[];
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onDeleteTask: (task: { id: string; title: string }) => void;
  onSnoozeTask: (task: Task) => void;
  formatTaskTime: (timeStr?: string) => string;
}

export const TodayOverdueBannerComponent: React.FC<TodayOverdueBannerProps> = ({
  tasks,
  expanded,
  onToggleExpand,
  onDismiss,
  onToggleTask,
  onPressTask,
  onDeleteTask,
  onSnoozeTask,
  formatTaskTime,
}) => {
  const { colors } = useAppTheme();

  if (tasks.length === 0) return null;

  return (
    <View style={styles.overdueSection}>
      <View
        style={[
          styles.overdueBanner,
          {
            backgroundColor: colors.dangerBg || 'rgba(239, 68, 68, 0.1)',
            borderColor: colors.danger,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.overdueBannerLeft}
          onPress={onToggleExpand}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${tasks.length} overdue tasks. Tap to toggle list`}
        >
          <Text style={styles.overdueIcon}>⚠️</Text>
          <View style={styles.overdueTextGroup}>
            <Text style={[styles.overdueTitle, { color: colors.danger }]}>
              {tasks.length} Overdue Task{tasks.length > 1 ? 's' : ''}
            </Text>
            <Text style={[styles.overdueSub, { color: colors.textSecondary }]}>
              {expanded ? 'Tap to collapse' : 'Tap to expand & review'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.overdueRightGroup}>
          <TouchableOpacity
            onPress={onToggleExpand}
            style={styles.overdueActionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Toggle overdue tasks list"
          >
            <Text style={[styles.overdueActionText, { color: colors.danger }]}>
              {expanded ? 'Hide ▲' : 'View ▼'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.overdueCloseBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss overdue banner"
          >
            <Text style={[styles.overdueCloseText, { color: colors.danger }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Overdue Tasks List */}
      {expanded && (
        <View
          style={[
            styles.overdueTasksList,
            { borderColor: colors.danger + '40', backgroundColor: colors.surface },
          ]}
        >
          {tasks.map((t) => (
            <TodayTaskItem
              key={t.id}
              task={t}
              isOverdue={true}
              onToggle={onToggleTask}
              onPress={onPressTask}
              onDelete={onDeleteTask}
              onSnooze={onSnoozeTask}
              formatTaskTime={formatTaskTime}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overdueSection: {
    marginBottom: 14,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  overdueBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  overdueIcon: {
    fontSize: 20,
  },
  overdueTextGroup: {
    flex: 1,
  },
  overdueTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  overdueSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  overdueRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  overdueActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  overdueActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  overdueCloseBtn: {
    padding: 4,
  },
  overdueCloseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  overdueTasksList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
});

export const TodayOverdueBanner = React.memo(TodayOverdueBannerComponent);
