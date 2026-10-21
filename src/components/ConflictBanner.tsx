import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';

interface ConflictBannerProps {
  conflicts: { itemA: string; itemB: string; time: string }[];
  onDismiss?: () => void;
}

const ConflictBannerComponent: React.FC<ConflictBannerProps> = ({ conflicts, onDismiss }) => {
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
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={[styles.title, typography.title, { color: colors.warning }]}>
            Schedule Conflict Detected
          </Text>
        </View>
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss schedule conflict banner"
          >
            <Text style={[styles.closeText, { color: colors.warning }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {conflicts.map((c, i) => (
        <Text key={i} style={[styles.detail, typography.caption, { color: colors.text }]}>
          • {c.time ? `${c.time}: ` : ''}"{c.itemA}" overlaps with "{c.itemB}"
        </Text>
      ))}
    </View>
  );
};

export const ConflictBanner = React.memo(ConflictBannerComponent);

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
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
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
