import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, typography } from '../theme';

interface ProgressBarProps {
  percentage: number;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, label }) => {
  const { colors } = useAppTheme();
  const clamped = Math.min(100, Math.max(0, percentage));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
          {label || 'Daily Progress'}
        </Text>
        <Text style={[styles.percentage, typography.caption, { color: colors.primaryLight }]}>
          {clamped}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              backgroundColor: clamped === 100 ? colors.success : colors.primary,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontWeight: '600',
  },
  percentage: {
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
