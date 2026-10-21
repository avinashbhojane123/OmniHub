import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing, typography } from '../../theme';
import { RecurrenceType } from '../../types';
import { format, parseISO, isValid } from 'date-fns';

export const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; icon: string }[] = [
  { value: 'none', label: 'No Repeat', icon: '🚫' },
  { value: 'daily', label: 'Daily', icon: '🔁' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)', icon: '💼' },
  { value: 'weekends', label: 'Weekends (Sat-Sun)', icon: '🏖️' },
  { value: 'weekly', label: 'Weekly', icon: '📅' },
  { value: 'monthly', label: 'Monthly', icon: '🗓️' },
];

export const DAYS_OF_WEEK = [
  { day: 1, label: 'M', name: 'Monday' },
  { day: 2, label: 'T', name: 'Tuesday' },
  { day: 3, label: 'W', name: 'Wednesday' },
  { day: 4, label: 'T', name: 'Thursday' },
  { day: 5, label: 'F', name: 'Friday' },
  { day: 6, label: 'S', name: 'Saturday' },
  { day: 0, label: 'S', name: 'Sunday' },
];

interface RecurrencePickerProps {
  recurrenceType: RecurrenceType;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: number[];
  recurrenceEndDate?: string;
  onSelectType: (type: RecurrenceType) => void;
  onChangeInterval: (interval: number) => void;
  onToggleDayOfWeek: (day: number) => void;
  onOpenEndDatePicker: () => void;
  onClearEndDate: () => void;
  onClearRecurrence: () => void;
  accentColor: string;
}

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({
  recurrenceType,
  recurrenceInterval,
  recurrenceDaysOfWeek,
  recurrenceEndDate,
  onSelectType,
  onChangeInterval,
  onToggleDayOfWeek,
  onOpenEndDatePicker,
  onClearEndDate,
  onClearRecurrence,
  accentColor,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.formGroup}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
          REPEAT (RECURRENCE SCHEDULE)
        </Text>
        {recurrenceType !== 'none' && (
          <TouchableOpacity
            onPress={onClearRecurrence}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear repeat"
          >
            <Text style={[styles.resetText, { color: colors.textMuted }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
        {RECURRENCE_OPTIONS.map((item) => {
          const isSelected = recurrenceType === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              onPress={() => onSelectType(item.value)}
              style={[
                styles.chipPill,
                {
                  backgroundColor: isSelected ? `${accentColor}30` : colors.surfaceElevated,
                  borderColor: isSelected ? accentColor : colors.borderSubtle,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Repeat ${item.label}${isSelected ? ', selected' : ''}`}
            >
              <Text
                style={[
                  styles.chipPillText,
                  { color: isSelected ? accentColor : colors.textSecondary },
                ]}
              >
                {item.icon} {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Advanced Recurrence Options (Interval, Days of Week, End Date) */}
      {recurrenceType !== 'none' && (
        <View style={[styles.advancedRecurrenceBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          {/* Interval Selector */}
          <View style={styles.recurrenceSubRow}>
            <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
              Repeat Every:
            </Text>
            <View style={styles.intervalChipsRow}>
              {[1, 2, 3, 4].map((n) => {
                const isSelected = recurrenceInterval === n;
                const unit =
                  recurrenceType === 'daily'
                    ? 'day'
                    : recurrenceType === 'weekly'
                    ? 'week'
                    : recurrenceType === 'monthly'
                    ? 'month'
                    : '';
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => onChangeInterval(n)}
                    style={[
                      styles.intervalChip,
                      {
                        backgroundColor: isSelected ? `${accentColor}30` : colors.surface,
                        borderColor: isSelected ? accentColor : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Every ${n} ${unit}${n > 1 ? 's' : ''}${isSelected ? ', selected' : ''}`}
                  >
                    <Text style={[styles.intervalChipText, { color: isSelected ? accentColor : colors.text }]}>
                      {n} {recurrenceType === 'daily' ? 'day' : recurrenceType === 'weekly' ? 'wk' : recurrenceType === 'monthly' ? 'mo' : ''}{n > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Days of Week (Weekly) */}
          {recurrenceType === 'weekly' && (
            <View style={styles.recurrenceSubRow}>
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
                On Days:
              </Text>
              <View style={styles.daysOfWeekRow}>
                {DAYS_OF_WEEK.map((item, idx) => {
                  const isSelected = recurrenceDaysOfWeek.includes(item.day);
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => onToggleDayOfWeek(item.day)}
                      style={[
                        styles.dayCircle,
                        {
                          backgroundColor: isSelected ? accentColor : colors.surface,
                          borderColor: isSelected ? accentColor : colors.borderSubtle,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${item.name}${isSelected ? ', selected' : ''}`}
                    >
                      <Text style={[styles.dayCircleText, { color: isSelected ? '#FFFFFF' : colors.text }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Repeat End Date */}
          <View style={[styles.recurrenceSubRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
              Repeat Until:
            </Text>
            <View style={styles.endDateRow}>
              <TouchableOpacity
                onPress={onOpenEndDatePicker}
                style={[styles.endDateBtn, { borderColor: recurrenceEndDate ? accentColor : colors.borderSubtle }]}
                accessibilityRole="button"
                accessibilityLabel={
                  recurrenceEndDate
                    ? `Repeat end date: ${
                        isValid(parseISO(recurrenceEndDate))
                          ? format(parseISO(recurrenceEndDate), 'MMM d, yyyy')
                          : recurrenceEndDate
                      }`
                    : 'Set repeat end date'
                }
              >
                <Text style={[styles.endDateBtnText, { color: recurrenceEndDate ? accentColor : colors.textSecondary }]}>
                  {recurrenceEndDate
                    ? `📅 ${
                        isValid(parseISO(recurrenceEndDate))
                          ? format(parseISO(recurrenceEndDate), 'MMM d, yyyy')
                          : recurrenceEndDate
                      }`
                    : 'Forever (No End Date)'}
                </Text>
              </TouchableOpacity>
              {recurrenceEndDate ? (
                <TouchableOpacity
                  onPress={onClearEndDate}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear end date"
                >
                  <Text style={[styles.clearEndText, { color: colors.textMuted }]}>✕ Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      )}
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
  chipsScroll: {
    gap: spacing.sm,
  },
  chipPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  advancedRecurrenceBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  recurrenceSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.15)',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  intervalChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  intervalChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  intervalChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  daysOfWeekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  dayCircleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  endDateBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  endDateBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearEndText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
