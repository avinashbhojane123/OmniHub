import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';
import { CalendarEvent } from '../types';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { alarmService } from '../services/alarm/AlarmService';
import { DateTimePickerModal } from './DateTimePickerModal';
import { format, parseISO, isValid, addMinutes, addDays } from 'date-fns';
import { formatTimeTo12H, normalizeTimeTo24H, parseTimeToMinutes } from '../utils/time';

interface CalendarEventModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  eventToEdit?: CalendarEvent | null;
  initialDate?: string;
}

export const CalendarEventModal: React.FC<CalendarEventModalProps> = ({
  visible,
  onClose,
  onSaved,
  eventToEdit,
  initialDate,
}) => {
  const { colors } = useAppTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => initialDate || format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(() => {
    // Default to next 30 min block
    const now = new Date();
    const future = addMinutes(now, 30);
    return format(future, 'HH:mm');
  });
  const [ringAlarm, setRingAlarm] = useState(true);
  const [saving, setSaving] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // Direct Manual Alarm Clock State
  const [alarmHour, setAlarmHour] = useState('10');
  const [alarmMinute, setAlarmMinute] = useState('00');
  const [alarmPeriod, setAlarmPeriod] = useState<'AM' | 'PM'>('AM');

  const syncTo12H = useCallback((time24: string) => {
    const parts = (time24 || '10:00').split(':').map((p) => parseInt(p, 10));
    let h = isNaN(parts[0]) ? 10 : parts[0];
    const m = isNaN(parts[1]) ? 0 : parts[1];
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    setAlarmHour(String(h12).padStart(2, '0'));
    setAlarmMinute(String(m).padStart(2, '0'));
    setAlarmPeriod(period);
  }, []);

  const update24H = useCallback((hStr: string, mStr: string, period: 'AM' | 'PM') => {
    let h = parseInt(hStr, 10);
    if (isNaN(h) || h < 1) h = 12;
    if (h > 12) h = 12;
    let m = parseInt(mStr, 10);
    if (isNaN(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    let h24 = h;
    if (period === 'PM' && h < 12) h24 += 12;
    if (period === 'AM' && h === 12) h24 = 0;
    const formatted = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTime(formatted);
  }, []);

  useEffect(() => {
    if (visible) {
      if (eventToEdit) {
        setTitle(eventToEdit.title || '');
        setDescription(eventToEdit.description || '');
        setDate(eventToEdit.date || format(new Date(), 'yyyy-MM-dd'));
        const initialT = eventToEdit.time || '10:00';
        setTime(initialT);
        syncTo12H(initialT);
        setRingAlarm(eventToEdit.ringAlarm !== false);
      } else {
        setTitle('');
        setDescription('');
        setDate(initialDate || format(new Date(), 'yyyy-MM-dd'));
        const now = new Date();
        const future = addMinutes(now, 30);
        const futureT = format(future, 'HH:mm');
        setTime(futureT);
        syncTo12H(futureT);
        setRingAlarm(true);
      }
    }
  }, [visible, eventToEdit, initialDate, syncTo12H]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime('10:00');
    setAlarmHour('10');
    setAlarmMinute('00');
    setAlarmPeriod('AM');
    setRingAlarm(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleOpenDatePicker = () => {
    setDatePickerVisible(true);
  };

  const handlePickerConfirm = (confirmedDate: string) => {
    setDate(confirmedDate);
    setDatePickerVisible(false);
  };

  const handleQuickDate = (offsetDays: number) => {
    const target = addDays(new Date(), offsetDays);
    setDate(format(target, 'yyyy-MM-dd'));
  };

  const incrementHour = () => {
    const cur = parseInt(alarmHour, 10) || 12;
    const next = cur === 12 ? 1 : cur + 1;
    const nextStr = String(next).padStart(2, '0');
    setAlarmHour(nextStr);
    update24H(nextStr, alarmMinute, alarmPeriod);
  };

  const decrementHour = () => {
    const cur = parseInt(alarmHour, 10) || 12;
    const prev = cur === 1 ? 12 : cur - 1;
    const prevStr = String(prev).padStart(2, '0');
    setAlarmHour(prevStr);
    update24H(prevStr, alarmMinute, alarmPeriod);
  };

  const incrementMinute = () => {
    const cur = parseInt(alarmMinute, 10) || 0;
    const next = (cur + 1) % 60;
    const nextStr = String(next).padStart(2, '0');
    setAlarmMinute(nextStr);
    update24H(alarmHour, nextStr, alarmPeriod);
  };

  const decrementMinute = () => {
    const cur = parseInt(alarmMinute, 10) || 0;
    const prev = (cur - 1 + 60) % 60;
    const prevStr = String(prev).padStart(2, '0');
    setAlarmMinute(prevStr);
    update24H(alarmHour, prevStr, alarmPeriod);
  };

  const handlePeriodToggle = (p: 'AM' | 'PM') => {
    setAlarmPeriod(p);
    update24H(alarmHour, alarmMinute, p);
  };

  const handleQuickTimeOffset = (offsetMinutes: number) => {
    const target = addMinutes(new Date(), offsetMinutes);
    const new24 = format(target, 'HH:mm');
    setTime(new24);
    syncTo12H(new24);
  };

  const handleTestAlarmNow = async () => {
    const testTitle = title.trim() || 'Calendar Event Alarm';
    const testDesc = description.trim() || 'This is how your calendar event alarm will ring!';
    await alarmService.startRinging(
      `🔔 ${testTitle}`,
      undefined,
      formatTimeTo12H(time) || time,
      'test_preview',
      testDesc
    );
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Title Required', 'Please enter a title for the event reminder.');
      return;
    }

    if (!date) {
      Alert.alert('Date Required', 'Please select a date for the event reminder.');
      return;
    }

    if (!time) {
      Alert.alert('Time Required', 'Please select a time for the event reminder.');
      return;
    }

    try {
      setSaving(true);
      const normalizedTime = normalizeTimeTo24H(time) || time;
      const dateClean = date.includes('T') ? date.split('T')[0] : date;

      const parsedMins = parseTimeToMinutes(normalizedTime);
      if (parsedMins !== null && ringAlarm) {
        const [y, m, d] = dateClean.split('-').map(Number);
        const eventDate = new Date(y, m - 1, d, Math.floor(parsedMins / 60), parsedMins % 60, 0, 0);
        const now = new Date();
        if (eventDate.getTime() < now.getTime() - 60000) {
          Alert.alert(
            'Past Time Notice',
            'The selected time has already passed. The event will be saved, but alarms will only ring for future times.'
          );
        }
      }

      if (eventToEdit) {
        const updated = await calendarRepository.update(eventToEdit.id, {
          title: trimmedTitle,
          description: description.trim() || undefined,
          date: dateClean,
          time: normalizedTime,
          ringAlarm,
        });

        if (updated) {
          if (ringAlarm) {
            await alarmService.scheduleEventAlarm(
              updated.id,
              updated.title,
              updated.date,
              updated.time,
              updated.description
            );
          } else {
            await alarmService.cancelEventAlarm(updated.id);
          }
        }
      } else {
        const created = await calendarRepository.create({
          title: trimmedTitle,
          description: description.trim() || undefined,
          date: dateClean,
          time: normalizedTime,
          ringAlarm,
        });

        if (ringAlarm) {
          await alarmService.scheduleEventAlarm(
            created.id,
            created.title,
            created.date,
            created.time,
            created.description
          );
        }
      }

      handleClose();
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save event reminder.');
    } finally {
      setSaving(false);
    }
  };

  // Formatted date string display
  let formattedDateDisplay = date;
  try {
    const parsedDate = parseISO(date);
    if (isValid(parsedDate)) {
      formattedDateDisplay = format(parsedDate, 'EEEE, MMM d, yyyy');
    }
  } catch {}

  const formattedTimeDisplay = formatTimeTo12H(time) || time;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerTitleGroup}>
                <Text style={styles.calendarIconEmoji}>📅</Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {eventToEdit ? 'Edit Event Reminder' : 'Schedule Event Reminder'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollBody}
              keyboardShouldPersistTaps="handled"
            >
              {/* Event Title */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  EVENT TITLE *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. Project Review, Doctor Appointment, Call..."
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={100}
                />
              </View>

              {/* Date Selection */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  DATE *
                </Text>
                <View style={styles.quickChipsRow}>
                  <TouchableOpacity
                    onPress={() => handleQuickDate(0)}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          date === format(new Date(), 'yyyy-MM-dd')
                            ? colors.primary + '22'
                            : colors.surfaceElevated,
                        borderColor:
                          date === format(new Date(), 'yyyy-MM-dd')
                            ? colors.primary
                            : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        {
                          color:
                            date === format(new Date(), 'yyyy-MM-dd')
                              ? colors.primary
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      Today
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleQuickDate(1)}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          date === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                            ? colors.primary + '22'
                            : colors.surfaceElevated,
                        borderColor:
                          date === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                            ? colors.primary
                            : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        {
                          color:
                            date === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                              ? colors.primary
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      Tomorrow
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleQuickDate(7)}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>
                      In 1 Week
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={handleOpenDatePicker}
                  style={[
                    styles.pickerButton,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Select Date"
                >
                  <View style={styles.pickerButtonLeft}>
                    <Text style={styles.pickerIcon}>📅</Text>
                    <Text style={[styles.pickerValueText, { color: colors.text }]}>
                      {formattedDateDisplay}
                    </Text>
                  </View>
                  <Text style={[styles.pickerActionText, { color: colors.primary }]}>Change Date ›</Text>
                </TouchableOpacity>
              </View>

              {/* Time Selection: Direct Manual Alarm Clock */}
              <View style={styles.formGroup}>
                <View style={styles.timeLabelRow}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    ALARM TIME (SET MANUALLY) *
                  </Text>
                  <Text style={[styles.timePreviewBadge, { color: colors.primary }]}>
                    ⏰ {formattedTimeDisplay}
                  </Text>
                </View>

                {/* Quick Presets / Offset */}
                <View style={styles.quickChipsRow}>
                  <TouchableOpacity
                    onPress={() => handleQuickTimeOffset(5)}
                    style={[styles.quickChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>+5 min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleQuickTimeOffset(15)}
                    style={[styles.quickChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>+15 min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleQuickTimeOffset(30)}
                    style={[styles.quickChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>+30 min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleQuickTimeOffset(60)}
                    style={[styles.quickChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>+1 hour</Text>
                  </TouchableOpacity>
                </View>

                {/* Manual Clock Stepper & Direct Typing Input */}
                <View
                  style={[
                    styles.alarmClockCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <View style={styles.clockRow}>
                    {/* Hour Stepper & Direct Input */}
                    <View style={styles.digitCol}>
                      <TouchableOpacity
                        onPress={incrementHour}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                        accessibilityLabel="Increment Hour"
                      >
                        <Text style={[styles.stepperArrowTxt, { color: colors.primary }]}>▲</Text>
                      </TouchableOpacity>
                      <View
                        style={[
                          styles.digitBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <TextInput
                          style={[styles.digitInput, { color: colors.text }]}
                          value={alarmHour}
                          onChangeText={(txt) => {
                            const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 2);
                            setAlarmHour(cleaned);
                            if (cleaned.length > 0) {
                              update24H(cleaned, alarmMinute, alarmPeriod);
                            }
                          }}
                          onBlur={() => {
                            let h = parseInt(alarmHour, 10);
                            if (isNaN(h) || h < 1) h = 12;
                            if (h > 12) h = 12;
                            const hStr = String(h).padStart(2, '0');
                            setAlarmHour(hStr);
                            update24H(hStr, alarmMinute, alarmPeriod);
                          }}
                          keyboardType="number-pad"
                          maxLength={2}
                          selectTextOnFocus
                          accessibilityLabel="Alarm Hour"
                        />
                      </View>
                      <TouchableOpacity
                        onPress={decrementHour}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                        accessibilityLabel="Decrement Hour"
                      >
                        <Text style={[styles.stepperArrowTxt, { color: colors.primary }]}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.timeColon, { color: colors.text }]}>:</Text>

                    {/* Minute Stepper & Direct Input */}
                    <View style={styles.digitCol}>
                      <TouchableOpacity
                        onPress={incrementMinute}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                        accessibilityLabel="Increment Minute"
                      >
                        <Text style={[styles.stepperArrowTxt, { color: colors.primary }]}>▲</Text>
                      </TouchableOpacity>
                      <View
                        style={[
                          styles.digitBox,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <TextInput
                          style={[styles.digitInput, { color: colors.text }]}
                          value={alarmMinute}
                          onChangeText={(txt) => {
                            const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 2);
                            setAlarmMinute(cleaned);
                            if (cleaned.length > 0) {
                              update24H(alarmHour, cleaned, alarmPeriod);
                            }
                          }}
                          onBlur={() => {
                            let m = parseInt(alarmMinute, 10);
                            if (isNaN(m) || m < 0) m = 0;
                            if (m > 59) m = 59;
                            const mStr = String(m).padStart(2, '0');
                            setAlarmMinute(mStr);
                            update24H(alarmHour, mStr, alarmPeriod);
                          }}
                          keyboardType="number-pad"
                          maxLength={2}
                          selectTextOnFocus
                          accessibilityLabel="Alarm Minute"
                        />
                      </View>
                      <TouchableOpacity
                        onPress={decrementMinute}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                        accessibilityLabel="Decrement Minute"
                      >
                        <Text style={[styles.stepperArrowTxt, { color: colors.primary }]}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    {/* AM / PM Segmented Control */}
                    <View
                      style={[
                        styles.ampmContainer,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => handlePeriodToggle('AM')}
                        style={[
                          styles.ampmBtn,
                          alarmPeriod === 'AM' && { backgroundColor: colors.primary },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.ampmBtnTxt,
                            alarmPeriod === 'AM' ? styles.ampmBtnTxtActive : { color: colors.textSecondary },
                          ]}
                        >
                          AM
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handlePeriodToggle('PM')}
                        style={[
                          styles.ampmBtn,
                          alarmPeriod === 'PM' && { backgroundColor: colors.primary },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.ampmBtnTxt,
                            alarmPeriod === 'PM' ? styles.ampmBtnTxtActive : { color: colors.textSecondary },
                          ]}
                        >
                          PM
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* Ring Loud Alarm Toggle */}
              <View
                style={[
                  styles.alarmToggleCard,
                  {
                    backgroundColor: ringAlarm ? colors.primary + '14' : colors.surfaceElevated,
                    borderColor: ringAlarm ? colors.primary : colors.borderSubtle,
                  },
                ]}
              >
                <View style={styles.alarmToggleLeft}>
                  <Text style={styles.alarmBellEmoji}>🔔</Text>
                  <View style={styles.alarmToggleTextGroup}>
                    <Text style={[styles.alarmToggleTitle, { color: colors.text }]}>
                      Ring Loud Alarm
                    </Text>
                    <Text style={[styles.alarmToggleSubtitle, { color: colors.textSecondary }]}>
                      Plays loud ringtone, loops hardware vibration, and opens full-screen alert.
                    </Text>
                  </View>
                </View>
                <Switch
                  value={ringAlarm}
                  onValueChange={setRingAlarm}
                  trackColor={{ false: colors.borderSubtle, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  DESCRIPTION / NOTES (OPTIONAL)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Meeting details, location, links, or reminder instructions..."
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Test Alarm Preview Button */}
              <TouchableOpacity
                onPress={handleTestAlarmNow}
                style={[
                  styles.testAlarmBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.primary,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Test Alarm Ringing Now"
              >
                <Text style={[styles.testAlarmBtnText, { color: colors.primary }]}>
                  🔊 Test Ring Alarm Now (Preview)
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Bottom Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.cancelBtn, { borderColor: colors.borderSubtle }]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save Reminder"
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : eventToEdit ? 'Save Changes' : 'Schedule Alarm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Embedded DateTimePickerModal for Date selection */}
      <DateTimePickerModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        mode="date"
        selectedDate={date}
        onConfirm={handlePickerConfirm}
        title="Select Reminder Date"
      />
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  calendarIconEmoji: {
    fontSize: 22,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  scrollBody: {
    paddingBottom: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  textInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timePreviewBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  alarmClockCard: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  digitCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
  },
  stepperArrow: {
    paddingVertical: 3,
    paddingHorizontal: 12,
  },
  stepperArrowTxt: {
    fontSize: 15,
    fontWeight: '800',
  },
  digitBox: {
    width: 60,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitInput: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
    width: '100%',
  },
  timeColon: {
    fontSize: 24,
    fontWeight: '800',
    marginHorizontal: 8,
    marginTop: -2,
  },
  ampmContainer: {
    marginLeft: 12,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    flexDirection: 'column',
    gap: 3,
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ampmBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
  },
  ampmBtnTxtActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  pickerButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pickerIcon: {
    fontSize: 18,
  },
  pickerValueText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pickerActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  alarmToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alarmToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  alarmBellEmoji: {
    fontSize: 24,
  },
  alarmToggleTextGroup: {
    flex: 1,
  },
  alarmToggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  alarmToggleSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  testAlarmBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  testAlarmBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
