import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing, typography } from '../../theme';
import { EisenhowerQuadrant } from '../../types';

export const EISENHOWER_QUADRANTS: {
  id: EisenhowerQuadrant;
  label: string;
  tag: string;
  desc: string;
  color: string;
  icon: string;
}[] = [
  {
    id: 'q1',
    label: 'Q1: Do First',
    tag: 'Urgent & Important',
    desc: 'Crises & immediate deadlines',
    color: '#EF4444',
    icon: '🔥',
  },
  {
    id: 'q2',
    label: 'Q2: Schedule',
    tag: 'Important, Not Urgent',
    desc: 'Deep work, planning & growth',
    color: '#10B981',
    icon: '🎯',
  },
  {
    id: 'q3',
    label: 'Q3: Delegate',
    tag: 'Urgent, Not Important',
    desc: 'Ad-hoc requests & interruptions',
    color: '#F59E0B',
    icon: '⚡',
  },
  {
    id: 'q4',
    label: 'Q4: Eliminate',
    tag: 'Low Value',
    desc: 'Trivia & time-wasters',
    color: '#64748B',
    icon: '☕',
  },
];

interface EisenhowerMatrixPickerProps {
  selectedQuadrant?: EisenhowerQuadrant;
  onSelectQuadrant: (q: EisenhowerQuadrant) => void;
  onClearQuadrant: () => void;
}

export const EisenhowerMatrixPicker: React.FC<EisenhowerMatrixPickerProps> = ({
  selectedQuadrant,
  onSelectQuadrant,
  onClearQuadrant,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.formGroup}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
          EISENHOWER MATRIX (URGENT VS IMPORTANT)
        </Text>
        {selectedQuadrant ? (
          <TouchableOpacity
            onPress={onClearQuadrant}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear Eisenhower quadrant"
          >
            <Text style={[styles.resetText, { color: colors.textMuted }]}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.eisenhowerGrid}>
        {EISENHOWER_QUADRANTS.map((quad) => {
          const isSelected = selectedQuadrant === quad.id;
          return (
            <TouchableOpacity
              key={quad.id}
              onPress={() => onSelectQuadrant(quad.id)}
              style={[
                styles.eisenhowerCard,
                {
                  backgroundColor: isSelected ? `${quad.color}25` : colors.surfaceElevated,
                  borderColor: isSelected ? quad.color : colors.borderSubtle,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${quad.label}: ${quad.desc}`}
            >
              <View style={styles.eisenhowerCardTop}>
                <Text style={styles.eisenhowerIcon}>{quad.icon}</Text>
                <Text style={[styles.eisenhowerTitle, { color: isSelected ? quad.color : colors.text }]}>
                  {quad.label}
                </Text>
              </View>
              <Text style={[styles.eisenhowerTag, { color: quad.color }]}>
                {quad.tag}
              </Text>
              <Text
                style={[styles.eisenhowerDesc, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {quad.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  formGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  resetText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eisenhowerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  eisenhowerCard: {
    width: '48.5%',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  eisenhowerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  eisenhowerIcon: {
    fontSize: 15,
  },
  eisenhowerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  eisenhowerTag: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  eisenhowerDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
});
