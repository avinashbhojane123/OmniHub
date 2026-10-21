import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { ProductivityStats } from '../../types';
import { ProgressBar } from '../ProgressBar';

interface ProductivityInsightsProps {
  stats: ProductivityStats | null;
  todayTasksCount?: number;
  todayCompletedTasksCount?: number;
  completionPercentage?: number;
  hideHeader?: boolean;
}

const ProductivityInsightsComponent: React.FC<ProductivityInsightsProps> = ({
  stats,
  todayTasksCount = 0,
  todayCompletedTasksCount = 0,
  completionPercentage = 0,
  hideHeader = false,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {!hideHeader && (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>
            Productivity Insights
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            100% On-Device Local Analytics
          </Text>
        </View>
      )}

      {/* 4 Badges Grid (2x2) */}
      <View style={styles.badgesGrid}>
        {/* 1. Tasks Completed */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            ALL-TIME COMPLETED
          </Text>
          <Text style={[styles.metricNumber, { color: colors.success }]}>
            {stats?.tasksCompleted ?? 0}
          </Text>
          <Text style={[styles.metricSub, { color: colors.textMuted }]}>
            {todayCompletedTasksCount}/{todayTasksCount} today ({completionPercentage}%)
          </Text>
        </View>

        {/* 2. Overdue */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            OVERDUE
          </Text>
          <Text
            style={[
              styles.metricNumber,
              {
                color:
                  (stats?.tasksOverdue ?? 0) > 0 ? colors.danger : colors.textMuted,
              },
            ]}
          >
            {stats?.tasksOverdue ?? 0}
          </Text>
          <Text style={[styles.metricSub, { color: colors.textMuted }]}>
            Tasks requiring attention
          </Text>
        </View>

        {/* 3. Task Completion */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            LIFETIME RATE
          </Text>
          <Text style={[styles.metricNumber, { color: colors.primaryLight }]}>
            {stats?.completionPercentage ?? 0}%
          </Text>
          <Text style={[styles.metricSub, { color: colors.textMuted }]}>
            All-time completion efficiency
          </Text>
        </View>

        {/* 4. Habits Today */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            HABITS TODAY
          </Text>
          <Text style={[styles.metricNumber, { color: colors.warning }]}>
            {stats?.habitsCompletedToday ?? 0}/{stats?.totalHabits ?? 0}
          </Text>
          <Text style={[styles.metricSub, { color: colors.textMuted }]}>
            {stats?.habitCompletionPercentage ?? 0}% daily habit rate
          </Text>
        </View>
      </View>

      {/* Today's Completion Progress Bar */}
      <View style={styles.progressBarWrapper}>
        <ProgressBar
          percentage={completionPercentage}
          label={`Today's Tasks (${todayCompletedTasksCount}/${todayTasksCount}) • ${completionPercentage}%`}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    marginTop: 4,
  },
  headerRow: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  metricSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressBarWrapper: {
    marginTop: 12,
  },
});

export const ProductivityInsights = React.memo(ProductivityInsightsComponent);

