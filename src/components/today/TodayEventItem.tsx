import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAppTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme';
import { CalendarEvent } from '../../types';
import { formatTimeTo12H } from '../../utils/time';
import { parseISO, format, isValid } from 'date-fns';

interface TodayEventItemProps {
  event: CalendarEvent;
  todayIso?: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onTestAlarm: (event: CalendarEvent) => void;
  onToggleStatus?: (event: CalendarEvent) => void;
}

export const TodayEventItemComponent: React.FC<TodayEventItemProps> = ({
  event,
  todayIso,
  onEdit,
  onDelete,
  onTestAlarm,
  onToggleStatus,
}) => {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  // Format date for display
  let dateLabel = event.date;
  try {
    const parsed = parseISO(event.date);
    if (isValid(parsed)) {
      dateLabel = format(parsed, 'MMM d, yyyy');
    }
  } catch {}

  const timeLabel = formatTimeTo12H(event.time) || event.time;
  const isDone = event.status === 'completed';
  const isDismissed = event.status === 'dismissed';
  const isPast = Boolean(todayIso && event.date < todayIso && !isDone && !isDismissed);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: (isDone || isDismissed) ? colors.borderSubtle : colors.border,
          opacity: (isDone || isDismissed) ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        {/* Left Icon Badge */}
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: event.ringAlarm ? colors.primary + '18' : colors.surfaceElevated,
              borderColor: event.ringAlarm ? colors.primary + '40' : colors.borderSubtle,
            },
          ]}
        >
          <Text style={styles.iconEmoji}>{event.ringAlarm ? '🔔' : '📅'}</Text>
        </View>

        {/* Content Column */}
        <TouchableOpacity
          style={styles.contentCol}
          onPress={() => setExpanded((prev) => !prev)}
          activeOpacity={0.7}
        >
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.titleText,
                {
                  color: (isDone || isDismissed) ? colors.textMuted : colors.text,
                  textDecorationLine: isDone ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={expanded ? undefined : 2}
            >
              {event.title}
            </Text>
          </View>

          {/* Badges Row: Date, Time & Alarm Status */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                📅 {dateLabel}
              </Text>
            </View>

            <View style={[styles.badge, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '35' }]}>
              <Text style={[styles.badgeText, { color: colors.primary, fontWeight: '700' }]}>
                ⏰ {timeLabel}
              </Text>
            </View>

            {event.ringAlarm && (
              <View style={[styles.alarmBadge, { backgroundColor: '#10B98118', borderColor: '#10B98140' }]}>
                <Text style={styles.alarmBadgeText}>🔔 Alarm</Text>
              </View>
            )}

            {isPast && (
              <View style={[styles.alarmBadge, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
                <Text style={[styles.alarmBadgeText, { color: '#EF4444' }]}>⚠️ Missed</Text>
              </View>
            )}

            {isDismissed && (
              <View style={[styles.alarmBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.alarmBadgeText, { color: colors.textMuted }]}>✕ Dismissed</Text>
              </View>
            )}
          </View>

          {/* Description Preview / Expand */}
          {event.description ? (
            <View style={styles.descContainer}>
              <Text
                style={[styles.descText, { color: colors.textSecondary }]}
                numberOfLines={expanded ? undefined : 2}
              >
                {event.description}
              </Text>
              <Text style={[styles.expandHint, { color: colors.primary }]}>
                {expanded ? 'Show less ▴' : 'Show details ▾'}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Action Buttons Row */}
      <View style={[styles.actionsRow, { borderTopColor: colors.borderSubtle }]}>
        {event.ringAlarm ? (
          <TouchableOpacity
            onPress={() => onTestAlarm(event)}
            style={[styles.actionBtn, styles.testBtn, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Test Alarm for ${event.title}`}
          >
            <Text style={[styles.testBtnText, { color: colors.primary }]}>🔊 Ring Test</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.rightActionsGroup}>
          {onToggleStatus ? (
            <TouchableOpacity
              onPress={() => onToggleStatus(event)}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: (isDone || isDismissed) ? colors.surfaceElevated : colors.primary + '12',
                  borderColor: (isDone || isDismissed) ? colors.borderSubtle : colors.primary + '30',
                },
              ]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${isDone ? 'active' : isDismissed ? 'active' : 'completed'}`}
            >
              <Text style={[styles.actionBtnText, { color: (isDone || isDismissed) ? colors.textMuted : colors.primary }]}>
                {isDone ? '↩ Undo' : isDismissed ? '↩ Restore' : '✓ Done'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => onEdit(event)}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${event.title}`}
          >
            <Text style={[styles.actionBtnText, { color: colors.text }]}>✏️ Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onDelete(event)}
            style={[styles.actionBtn, { backgroundColor: colors.dangerBg, borderColor: colors.danger + '35' }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${event.title}`}
          >
            <Text style={[styles.actionBtnText, { color: colors.danger }]}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 20,
  },
  contentCol: {
    flex: 1,
  },
  titleRow: {
    marginBottom: 6,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  alarmBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  alarmBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  descContainer: {
    marginTop: 4,
  },
  descText: {
    fontSize: 12,
    lineHeight: 17,
  },
  expandHint: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: 8,
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testBtn: {
    paddingHorizontal: 10,
  },
  testBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export const TodayEventItem = React.memo(TodayEventItemComponent);
