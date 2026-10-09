import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';

interface ConflictBannerProps {
  conflicts: { itemA: string; itemB: string; time: string }[];
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({ conflicts }) => {
  const { colors } = useAppTheme();
  if (conflicts.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.warningBg,
          borderColor: colors.warning,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={[styles.title, typography.title, { color: colors.warning }]}>
          Schedule Conflict Detected
        </Text>
      </View>
      {conflicts.map((c, i) => (
        <Text key={i} style={[styles.detail, typography.caption, { color: colors.text }]}>
          • At {c.time}: "{c.itemA}" overlaps with "{c.itemB}"
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    fontSize: 16,
    marginRight: 6,
  },
  title: {
    fontWeight: '700',
  },
  detail: {
    marginTop: 2,
    lineHeight: 18,
  },
});
