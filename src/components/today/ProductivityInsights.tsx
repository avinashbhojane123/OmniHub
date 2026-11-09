import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { ProductivityStats } from '../../types';

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
  const { colors, isDark } = useAppTheme();

  // On-device dynamic productivity score calculation
  const taskRate = useMemo(() => {
    return typeof completionPercentage === 'number' && !isNaN(completionPercentage)
      ? Math.min(100, Math.max(0, Math.round(completionPercentage)))
      : 0;
  }, [completionPercentage]);

  const habitRate = stats?.habitCompletionPercentage ?? 0;

  const calculatedScore = useMemo(() => {
    if (taskRate > 0 && habitRate > 0) {
      return Math.min(100, Math.max(0, Math.round(taskRate * 0.6 + habitRate * 0.4)));
    }
    return taskRate || habitRate || (todayTasksCount === 0 ? 100 : 0);
  }, [taskRate, habitRate, todayTasksCount]);

  const velocityLabel = useMemo(() => {
    if (calculatedScore >= 80) return 'Peak Velocity 🔥';
    if (calculatedScore >= 50) return 'Steady Velocity ⚡';
    if (calculatedScore > 0) return 'Building Momentum 🚀';
    return 'Ready to Start 🏁';
  }, [calculatedScore]);

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

      {/* Local On-Device Productivity Telemetry Arc / Goal Velocity Widget */}
      <View
        style={[
          styles.telemetryCard,
          {
            backgroundColor: isDark ? '#14102C' : colors.surfaceElevated,
            borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : colors.borderSubtle,
          },
        ]}
      >
        <View style={styles.telemetryHeader}>
          <Text style={[styles.telemetryLabel, { color: colors.textSecondary }]}>
            DAILY GOAL VELOCITY
          </Text>
          <View style={[styles.scoreBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.16)' : 'rgba(139, 92, 246, 0.1)' }]}>
            <Text style={[styles.scoreBadgeText, { color: colors.primary }]}>
              Score: {calculatedScore} • {velocityLabel}
            </Text>
          </View>
        </View>

        <View style={styles.telemetryCenterRow}>
          <Text style={[styles.telemetryPercent, { color: colors.text }]}>
            {taskRate}%
          </Text>
          <Text style={[styles.telemetrySubtext, { color: colors.textSecondary }]}>
            Daily Goal Achieved ({todayCompletedTasksCount}/{todayTasksCount} Tasks)
          </Text>
        </View>

        {/* High-Precision Progress Track */}
        <View style={[styles.gaugeTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' }]}>
          <View
            style={[
              styles.gaugeFill,
              {
                width: `${Math.max(taskRate, taskRate > 0 ? 5 : 0)}%`,
                backgroundColor: taskRate >= 100 ? '#10B981' : colors.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* 4 Badges Grid (2x2) */}
      <View style={styles.badgesGrid}>
        {/* 1. Tasks Completed */}
        <View
          style={[
            styles.metricCard,
            {
              backgroundColor: isDark ? '#15112E' : colors.surface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
            },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            ALL-TIME COMPLETED
          </Text>
          <Text style={[styles.metricNumber, { color: colors.success }]}>
            {stats?.tasksCompleted ?? 0}
          </Text>
          <Text style={[styles.metricSub, { color: colors.textMuted }]}>
            {todayCompletedTasksCount}/{todayTasksCount} today ({taskRate}%)
          </Text>
        </View>

        {/* 2. Overdue */}
        <View
          style={[
            styles.metricCard,
            {
              backgroundColor: isDark ? '#15112E' : colors.surface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
            },
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
            {
              backgroundColor: isDark ? '#15112E' : colors.surface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
            },
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
            {
              backgroundColor: isDark ? '#15112E' : colors.surface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.borderSubtle,
            },
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
  telemetryCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  telemetryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  telemetryCenterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
  },
  telemetryPercent: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  telemetrySubtext: {
    fontSize: 12,
    fontWeight: '600',
  },
  gaugeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 14,
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
});

export const ProductivityInsights = React.memo(ProductivityInsightsComponent);
