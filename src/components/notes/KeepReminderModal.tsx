import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { format, addHours, setHours, setMinutes, addDays, nextMonday, parseISO, isValid } from 'date-fns';
import { useAppTheme } from '../../hooks/useTheme';

interface KeepReminderModalProps {
  visible: boolean;
  currentReminderTime?: string; // ISO string
  onClose: () => void;
  onSetReminder: (isoString?: string) => void;
}

export const KeepReminderModal: React.FC<KeepReminderModalProps> = ({
  visible,
  currentReminderTime,
  onClose,
  onSetReminder,
}) => {
  const { colors, isDark } = useAppTheme();
  const [showCustom, setShowCustom] = useState(false);
  const [customDaysAhead, setCustomDaysAhead] = useState(1);
  const [customHour, setCustomHour] = useState(9);

  const now = new Date();

  // Preset 1: Later Today (6:00 PM or +3 hours if already past 5pm)
  let laterToday = setHours(setMinutes(now, 0), 18);
  if (now.getHours() >= 17) {
    laterToday = addHours(now, 3);
  }

  // Preset 2: Tomorrow Morning (8:00 AM)
  const tomorrowMorning = setHours(setMinutes(addDays(now, 1), 0), 8);

  // Preset 3: Next Monday (8:00 AM)
  const nextWeekMon = setHours(setMinutes(nextMonday(now), 0), 8);

  const presets = [
    {
      label: 'Later today',
      sub: format(laterToday, 'h:mm a'),
      date: laterToday,
      icon: '⏰',
    },
    {
      label: 'Tomorrow morning',
      sub: format(tomorrowMorning, 'EEE, 8:00 a'),
      date: tomorrowMorning,
      icon: '🌅',
    },
    {
      label: 'Next week',
      sub: format(nextWeekMon, 'EEE, MMM d, 8:00 a'),
      date: nextWeekMon,
      icon: '📅',
    },
  ];

  const handleApplyPreset = (d: Date) => {
    onSetReminder(d.toISOString());
    onClose();
  };

  const handleApplyCustom = () => {
    const target = setHours(setMinutes(addDays(now, customDaysAhead), 0), customHour);
    onSetReminder(target.toISOString());
    setShowCustom(false);
    onClose();
  };

  const handleClearReminder = () => {
    onSetReminder(undefined);
    onClose();
  };

  const currentFormatted =
    currentReminderTime && isValid(parseISO(currentReminderTime))
      ? format(parseISO(currentReminderTime), 'MMM d, h:mm a')
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.outside} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Add reminder</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {currentFormatted && (
            <View
              style={[
                styles.currentBanner,
                { backgroundColor: isDark ? 'rgba(255,107,0,0.15)' : '#FFF7ED' },
              ]}
            >
              <Text style={[styles.currentText, { color: colors.primary }]}>
                🔔 Active reminder: {currentFormatted}
              </Text>
              <TouchableOpacity onPress={handleClearReminder}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showCustom ? (
            <View style={styles.optionsList}>
              {presets.map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.presetRow,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' },
                  ]}
                  onPress={() => handleApplyPreset(p.date)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetIcon}>{p.icon}</Text>
                  <View style={styles.presetTextCol}>
                    <Text style={[styles.presetLabel, { color: colors.text }]}>{p.label}</Text>
                    <Text style={[styles.presetSub, { color: colors.textMuted }]}>{p.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.customRow}
                onPress={() => setShowCustom(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetIcon}>⚙️</Text>
                <View style={styles.presetTextCol}>
                  <Text style={[styles.presetLabel, { color: colors.text }]}>
                    Pick a date & time...
                  </Text>
                  <Text style={[styles.presetSub, { color: colors.textMuted }]}>
                    Custom schedule
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.customContainer}>
              <Text style={[styles.customSubHeader, { color: colors.textSecondary }]}>
                Choose Day & Time
              </Text>

              {/* Day Selector */}
              <View style={styles.chipRow}>
                {[1, 2, 3, 7].map((days) => {
                  const isSelected = customDaysAhead === days;
                  const dayDate = addDays(now, days);
                  return (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#F1F5F9',
                        },
                      ]}
                      onPress={() => setCustomDaysAhead(days)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {days === 1
                          ? 'Tomorrow'
                          : days === 7
                          ? 'In 1 week'
                          : format(dayDate, 'EEE, d')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Time Selector */}
              <Text style={[styles.customSubHeader, { color: colors.textSecondary, marginTop: 14 }]}>
                Time of Day
              </Text>
              <View style={styles.chipRow}>
                {[
                  { h: 8, l: 'Morning (8:00 AM)' },
                  { h: 13, l: 'Afternoon (1:00 PM)' },
                  { h: 18, l: 'Evening (6:00 PM)' },
                  { h: 21, l: 'Night (9:00 PM)' },
                ].map((item) => {
                  const isSelected = customHour === item.h;
                  return (
                    <TouchableOpacity
                      key={item.h}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#F1F5F9',
                        },
                      ]}
                      onPress={() => setCustomHour(item.h)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {item.l}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.customActions, { justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={[styles.saveCustomBtn, { backgroundColor: colors.primary }]}
                  onPress={handleApplyCustom}
                >
                  <Text style={styles.saveCustomText}>Set Reminder</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  outside: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
  currentBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  currentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  removeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  optionsList: {
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  presetIcon: {
    fontSize: 22,
  },
  presetTextCol: {
    flex: 1,
  },
  presetLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  presetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  customContainer: {
    marginTop: 8,
  },
  customSubHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 12,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveCustomBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveCustomText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
