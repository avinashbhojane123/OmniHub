import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarGraphic } from './CalendarGraphic';
import { habitService } from '../services/habits/HabitService';
import { alarmService } from '../services/alarm/AlarmService';
import { HabitWithStreak } from '../types';

interface NewHabitModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  habitToEdit?: HabitWithStreak | null;
}

const DAYS = [
  { key: 'M', label: 'M', dayIndex: 1 },
  { key: 'T1', label: 'T', dayIndex: 2 },
  { key: 'W', label: 'W', dayIndex: 3 },
  { key: 'T2', label: 'T', dayIndex: 4 },
  { key: 'F', label: 'F', dayIndex: 5 },
  { key: 'S1', label: 'S', dayIndex: 6 },
  { key: 'S2', label: 'S', dayIndex: 0 },
];

const ICONS = ['🎯', '🥛', '🧘', '👟', '📚', '💪', '💧', '🛌'];
const COLORS = ['#FF6B00', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B'];

const parseTimeString = (timeStr?: string, fallbackName?: string) => {
  const tryParse = (str?: string) => {
    if (!str) return null;
    const clean = str.replace(/[⏰🕒]/g, '').trim();

    // Match "4:30 pm" or "04:30 PM"
    const ampmMatch = clean.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2];
      const p = ampmMatch[3].toUpperCase() as 'AM' | 'PM';
      if (h === 0) h = 12;
      return { hour: String(h).padStart(2, '0'), minute: m, period: p };
    }

    // Match 24h format like "16:30" or "08:30"
    const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
      let h = parseInt(h24Match[1], 10);
      const m = h24Match[2];
      const p: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return { hour: String(h).padStart(2, '0'), minute: m, period: p };
    }

    return null;
  };

  const parsed = tryParse(fallbackName) || tryParse(timeStr);
  if (parsed) return parsed;
  return { hour: '08', minute: '30', period: 'AM' as 'AM' | 'PM' };
};

export const NewHabitModal: React.FC<NewHabitModalProps> = ({
  visible,
  onClose,
  onCreated,
  habitToEdit,
}) => {
  const insets = useSafeAreaInsets();
  const [habitName, setHabitName] = useState('');
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [selectedGoalDate, setSelectedGoalDate] = useState('Daily');
  const [alarmHour, setAlarmHour] = useState('08');
  const [alarmMinute, setAlarmMinute] = useState('30');
  const [alarmPeriod, setAlarmPeriod] = useState<'AM' | 'PM'>('AM');
  const [showTimePicker, setShowTimePicker] = useState(true);
  const [repeatEnabled, setRepeatEnabled] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]); // All days by default
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [selectedColor, setSelectedColor] = useState('#FF6B00');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (habitToEdit) {
      setHabitName(habitToEdit.name);
      const parsed = parseTimeString(
        habitToEdit.reminderTime || habitToEdit.description,
        habitToEdit.name
      );
      setAlarmHour(parsed.hour);
      setAlarmMinute(parsed.minute);
      setAlarmPeriod(parsed.period);
      setAlarmEnabled(Boolean(habitToEdit.reminderTime || habitToEdit.description || true));

      setSelectedDays(habitToEdit.recurrenceRule?.daysOfWeek || [1, 2, 3, 4, 5, 6, 0]);
      setSelectedIcon(habitToEdit.icon || '🎯');
      setSelectedColor(habitToEdit.color || '#FF6B00');
    } else {
      setHabitName('');
      setAlarmHour('08');
      setAlarmMinute('30');
      setAlarmPeriod('AM');
      setAlarmEnabled(true);
      setSelectedDays([1, 2, 3, 4, 5, 6, 0]);
      setSelectedIcon('🎯');
      setSelectedColor('#FF6B00');
    }
  }, [visible, habitToEdit]);

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
      }
    } else {
      setSelectedDays([...selectedDays, dayIndex]);
    }
  };

  const incrementHour = () => {
    const cur = parseInt(alarmHour, 10);
    const next = cur === 12 ? 1 : cur + 1;
    setAlarmHour(String(next).padStart(2, '0'));
  };

  const decrementHour = () => {
    const cur = parseInt(alarmHour, 10);
    const prev = cur === 1 ? 12 : cur - 1;
    setAlarmHour(String(prev).padStart(2, '0'));
  };

  const incrementMinute = () => {
    const cur = parseInt(alarmMinute, 10);
    const next = (Math.floor(cur / 5) * 5 + 5) % 60;
    setAlarmMinute(String(next).padStart(2, '0'));
  };

  const decrementMinute = () => {
    const cur = parseInt(alarmMinute, 10);
    const prev = (Math.ceil(cur / 5) * 5 - 5 + 60) % 60;
    setAlarmMinute(String(prev).padStart(2, '0'));
  };

  const handleSave = async () => {
    const trimmed = habitName.trim();
    if (!trimmed) {
      Alert.alert('Habit Name Required', 'Please enter a name for your habit.');
      return;
    }

    try {
      setLoading(true);
      const formattedTime = `${alarmHour}:${alarmMinute} ${alarmPeriod}`;
      const savedTime = alarmEnabled ? formattedTime : undefined;
      const descTime = alarmEnabled ? `⏰ ${formattedTime}` : undefined;

      if (habitToEdit) {
        await habitService.updateHabit(habitToEdit.id, {
          name: trimmed,
          description: descTime,
          icon: selectedIcon,
          color: selectedColor,
          recurrenceRule: {
            type: selectedDays.length === 7 ? 'daily' : 'custom',
            daysOfWeek: selectedDays,
          },
          reminderTime: savedTime,
        });
      } else {
        await habitService.createHabit({
          name: trimmed,
          description: descTime,
          icon: selectedIcon,
          color: selectedColor,
          recurrenceRule: {
            type: selectedDays.length === 7 ? 'daily' : 'custom',
            daysOfWeek: selectedDays,
          },
          target: 1,
          reminderTime: savedTime,
        });
      }

      onCreated();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save habit');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!habitToEdit) return;
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${habitToEdit.name}" and all of its streak logs? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await habitService.deleteHabit(habitToEdit.id);
              onCreated();
              onClose();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete habit');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Header Row: Title & Close Button */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{habitToEdit ? 'Edit habit' : 'New habit'}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 20 },
            ]}
          >
            {/* Illustrated Calendar Graphic */}
            <CalendarGraphic />

            {/* Field 1: Name your habit */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Name your habit</Text>
              <TextInput
                style={styles.inputPill}
                placeholder="Morning Meditations"
                placeholderTextColor="#A09FA6"
                value={habitName}
                onChangeText={setHabitName}
                returnKeyType="done"
              />
            </View>

            {/* Field: Icon & Color Selection */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Icon & Accent Color</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.iconScrollContent}
              >
                {ICONS.map((ic) => (
                  <TouchableOpacity
                    key={ic}
                    onPress={() => setSelectedIcon(ic)}
                    style={[
                      styles.iconSelectPill,
                      selectedIcon === ic && styles.iconSelectPillActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.iconSelectText}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.colorRow}>
                {COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setSelectedColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      selectedColor === c && styles.colorCircleActive,
                    ]}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
            </View>

            {/* Field 2: Alarm clock */}
            <View style={styles.sectionGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionLabel}>Alarm clock</Text>
                <TouchableOpacity
                  onPress={() => setAlarmEnabled(!alarmEnabled)}
                  style={[
                    styles.checkboxBox,
                    alarmEnabled && styles.checkboxBoxActive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: alarmEnabled }}
                >
                  {alarmEnabled && <Text style={styles.checkmarkIcon}>✓</Text>}
                </TouchableOpacity>
              </View>

              <View style={styles.twoColumnRow}>
                <TouchableOpacity
                  style={styles.halfPill}
                  onPress={() =>
                    setSelectedGoalDate((prev) =>
                      prev === 'Daily' ? 'Weekdays' : prev === 'Weekdays' ? 'Weekends' : 'Daily'
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.halfPillText}>{selectedGoalDate}</Text>
                  <Text style={styles.pillIcon}>📅</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.halfPill,
                    alarmEnabled && styles.halfPillActive,
                  ]}
                  onPress={() => setShowTimePicker(!showTimePicker)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.halfPillText,
                      alarmEnabled && styles.halfPillTextActive,
                    ]}
                  >
                    ⏰ {alarmHour}:{alarmMinute} {alarmPeriod}
                  </Text>
                  <Text style={styles.pillIcon}>{showTimePicker ? '▴' : '⌄'}</Text>
                </TouchableOpacity>
              </View>

              {/* Time Stepper & Presets Card */}
              {alarmEnabled && showTimePicker && (
                <View style={styles.alarmCard}>
                  {/* Digital Clock Stepper & Direct Numeric Input */}
                  <View style={styles.clockRow}>
                    {/* Hour Stepper & Direct Input */}
                    <View style={styles.digitCol}>
                      <TouchableOpacity
                        onPress={incrementHour}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.stepperArrowTxt}>▲</Text>
                      </TouchableOpacity>
                      <View style={styles.digitBox}>
                        <TextInput
                          style={styles.digitInput}
                          value={alarmHour}
                          onChangeText={(txt) => {
                            const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 2);
                            setAlarmHour(cleaned);
                          }}
                          onBlur={() => {
                            let h = parseInt(alarmHour, 10);
                            if (isNaN(h) || h < 1) h = 12;
                            if (h > 12) h = 12;
                            setAlarmHour(String(h).padStart(2, '0'));
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
                      >
                        <Text style={styles.stepperArrowTxt}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.timeColon}>:</Text>

                    {/* Minute Stepper & Direct Input */}
                    <View style={styles.digitCol}>
                      <TouchableOpacity
                        onPress={incrementMinute}
                        style={styles.stepperArrow}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.stepperArrowTxt}>▲</Text>
                      </TouchableOpacity>
                      <View style={styles.digitBox}>
                        <TextInput
                          style={styles.digitInput}
                          value={alarmMinute}
                          onChangeText={(txt) => {
                            const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 2);
                            setAlarmMinute(cleaned);
                          }}
                          onBlur={() => {
                            let m = parseInt(alarmMinute, 10);
                            if (isNaN(m) || m < 0) m = 0;
                            if (m > 59) m = 59;
                            setAlarmMinute(String(m).padStart(2, '0'));
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
                      >
                        <Text style={styles.stepperArrowTxt}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    {/* AM / PM Segmented Control */}
                    <View style={styles.ampmContainer}>
                      <TouchableOpacity
                        onPress={() => setAlarmPeriod('AM')}
                        style={[
                          styles.ampmBtn,
                          alarmPeriod === 'AM' && styles.ampmBtnActive,
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.ampmBtnTxt,
                            alarmPeriod === 'AM' && styles.ampmBtnTxtActive,
                          ]}
                        >
                          AM
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setAlarmPeriod('PM')}
                        style={[
                          styles.ampmBtn,
                          alarmPeriod === 'PM' && styles.ampmBtnActive,
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.ampmBtnTxt,
                            alarmPeriod === 'PM' && styles.ampmBtnTxtActive,
                          ]}
                        >
                          PM
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Test Alarm Ringing Button (Rings for up to 1 min) */}
                  <TouchableOpacity
                    style={styles.testAlarmBtn}
                    onPress={() => {
                      const testTime = `${alarmHour}:${alarmMinute} ${alarmPeriod}`;
                      alarmService.startRinging(
                        habitName.trim() || 'Daily Routine Alarm',
                        habitToEdit?.id,
                        testTime
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.testAlarmBtnTxt}>🔔 Test Clock Ringing (Rings 1 Min)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Field 3: Repeat days */}
            <View style={styles.sectionGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionLabel}>Repeat days</Text>
                <TouchableOpacity
                  onPress={() => setRepeatEnabled(!repeatEnabled)}
                  style={[
                    styles.checkboxBox,
                    repeatEnabled && styles.checkboxBoxActive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: repeatEnabled }}
                >
                  {repeatEnabled && <Text style={styles.checkmarkIcon}>✓</Text>}
                </TouchableOpacity>
              </View>

              {/* 7 Circular Day Pills */}
              <View style={styles.daysRow}>
                {DAYS.map((d) => {
                  const isSelected = selectedDays.includes(d.dayIndex);
                  return (
                    <TouchableOpacity
                      key={d.key}
                      onPress={() => toggleDay(d.dayIndex)}
                      style={[
                        styles.dayCircle,
                        isSelected ? styles.dayCircleActive : styles.dayCircleInactive,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dayLetter,
                          isSelected ? styles.dayLetterActive : styles.dayLetterInactive,
                        ]}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Save / Update Habit Button */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: selectedColor || '#FF6B00' },
                loading && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={habitToEdit ? 'Update Habit' : 'Save Habit'}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Saving...' : habitToEdit ? 'Update Habit' : 'Save Habit'}
              </Text>
            </TouchableOpacity>

            {/* Delete Habit Button (Only in edit mode) */}
            {habitToEdit && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Delete Habit"
              >
                <Text style={styles.deleteButtonText}>🗑️ Delete Habit</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF7F4', // Warm soft cream from Image 2
  },
  keyboardView: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1F24',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E1F24',
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  sectionGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#75757F',
    marginBottom: 8,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C5C0B9',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  checkmarkIcon: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 14,
  },
  inputPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 16,
    fontWeight: '500',
    color: '#1E1F24',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  halfPillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E1F24',
  },
  halfPillTextActive: {
    fontWeight: '700',
    color: '#1E1F24',
  },
  pillIcon: {
    fontSize: 15,
    color: '#75757F',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayCircle: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dayCircleActive: {
    backgroundColor: '#2C2D35', // Dark slate pill from Image 2
  },
  dayCircleInactive: {
    backgroundColor: '#FFFFFF',
  },
  dayLetter: {
    fontSize: 14,
    fontWeight: '700',
  },
  dayLetterActive: {
    color: '#FFFFFF',
  },
  dayLetterInactive: {
    color: '#1E1F24',
  },
  halfPillActive: {
    borderColor: '#FF6B00',
    backgroundColor: '#FFF8F2',
  },
  alarmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EFEAE1',
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  digitCol: {
    alignItems: 'center',
  },
  stepperArrow: {
    paddingHorizontal: 14,
    paddingVertical: 3,
  },
  stepperArrowTxt: {
    fontSize: 14,
    color: '#8A8580',
    fontWeight: '700',
  },
  digitBox: {
    backgroundColor: '#F7F4EE',
    borderRadius: 14,
    width: 62,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E2D5',
  },
  digitInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1F24',
    textAlign: 'center',
    padding: 0,
    width: '100%',
    height: '100%',
  },
  digitText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E1F24',
    letterSpacing: 0.5,
  },
  timeColon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#8A8580',
    marginTop: -2,
  },
  ampmContainer: {
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#F7F4EE',
    padding: 3,
    borderWidth: 1,
    borderColor: '#E8E2D5',
    gap: 4,
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  ampmBtnActive: {
    backgroundColor: '#2C2D35',
  },
  ampmBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#75757F',
  },
  ampmBtnTxtActive: {
    color: '#FFFFFF',
  },
  testAlarmBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#FFD8B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testAlarmBtnTxt: {
    color: '#D95700',
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#FF6B00', // Vibrant orange pill button from Image 2
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  iconScrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  iconSelectPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E5E0',
  },
  iconSelectPillActive: {
    borderColor: '#FF6B00',
    backgroundColor: '#FFE9D6',
    transform: [{ scale: 1.08 }],
  },
  iconSelectText: {
    fontSize: 22,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  colorCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FF6B00',
    transform: [{ scale: 1.15 }],
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 28,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
});
