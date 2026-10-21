import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CalendarEvent } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme';
import { TodayEventItem } from './TodayEventItem';

export type CalendarFilterType = 'all' | 'today' | 'upcoming';

interface TodayCalendarSectionProps {
  events: CalendarEvent[];
  allEventsCount: number;
  filterCounts: {
    all: number;
    today: number;
    upcoming: number;
  };
  eventFilter: CalendarFilterType;
  todayIso?: string;
  onSetEventFilter: (filter: CalendarFilterType) => void;
  onOpenNewEvent: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onTestAlarm: (event: CalendarEvent) => void;
  onToggleStatus: (event: CalendarEvent) => void;
}

const FILTER_KEYS: CalendarFilterType[] = ['all', 'today', 'upcoming'];

export const TodayCalendarSectionComponent: React.FC<TodayCalendarSectionProps> = ({
  events,
  allEventsCount,
  filterCounts,
  eventFilter,
  todayIso,
  onSetEventFilter,
  onOpenNewEvent,
  onEditEvent,
  onDeleteEvent,
  onTestAlarm,
  onToggleStatus,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.calendarSection}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.calendarTitleCol}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Calendar Reminders ({allEventsCount})
          </Text>
          <Text style={[styles.calendarSubtitle, { color: colors.textSecondary }]}>
            Timely events & ringing alarms
          </Text>
        </View>
        <TouchableOpacity
          onPress={onOpenNewEvent}
          style={[
            styles.addEventHeaderBtn,
            { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add Calendar Event Reminder"
        >
          <Text style={styles.addEventHeaderBtnText}>+ Add Reminder</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips: All, Today, Upcoming with memoized counts */}
      {allEventsCount > 0 && (
        <View style={styles.calendarFilterRow}>
          {FILTER_KEYS.map((filterKey) => {
            const count = filterCounts[filterKey];
            const isActive = eventFilter === filterKey;
            const label =
              filterKey === 'all'
                ? `All (${count})`
                : filterKey === 'today'
                ? `Today (${count})`
                : `Upcoming (${count})`;
            return (
              <TouchableOpacity
                key={filterKey}
                onPress={() => onSetEventFilter(filterKey)}
                style={[
                  styles.calendarFilterChip,
                  isActive
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${filterKey} reminders`}
              >
                <Text
                  style={[
                    styles.calendarFilterChipText,
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

      {allEventsCount === 0 ? (
        <View style={[styles.emptyContainer, { borderColor: colors.borderSubtle }]}>
          <Text style={styles.eventEmptyIcon}>📅</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No event reminders set
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Schedule events with exact dates, perfect times, descriptions, and ringing alarms.
          </Text>
          <TouchableOpacity
            onPress={onOpenNewEvent}
            style={[styles.taskAddBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.taskAddBtnText, { color: colors.primary }]}>+ Schedule Event Reminder</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={[styles.taskEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={styles.taskEmptyIcon}>📅</Text>
          <Text style={[styles.taskEmptyTitle, { color: colors.text }]}>
            No matching reminders
          </Text>
          <Text style={[styles.taskEmptyDesc, { color: colors.textSecondary }]}>
            {eventFilter === 'today'
              ? 'No events scheduled for today. Tap "+ Add Reminder" to schedule one!'
              : eventFilter === 'upcoming'
              ? 'No upcoming events found.'
              : 'No matching reminders found.'}
          </Text>
        </View>
      ) : (
        events.map((event) => (
          <TodayEventItem
            key={event.id}
            event={event}
            todayIso={todayIso}
            onEdit={onEditEvent}
            onDelete={onDeleteEvent}
            onTestAlarm={onTestAlarm}
            onToggleStatus={onToggleStatus}
          />
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  calendarSection: {
    marginTop: 20,
    marginBottom: 16,
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
  calendarTitleCol: {
    flex: 1,
  },
  calendarSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  addEventHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addEventHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calendarFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  calendarFilterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarFilterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    marginVertical: 10,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
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
  eventEmptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
});

export const TodayCalendarSection = React.memo(TodayCalendarSectionComponent);
