import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  addDays,
} from 'date-fns';

interface DateTimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  mode: 'date' | 'time' | 'both';
  selectedDate?: string; // YYYY-MM-DD
  selectedTime?: string; // HH:mm
  onConfirm: (date: string, time?: string) => void;
  title?: string;
}

function parseTimeHelper(timeStr?: string) {
  if (!timeStr) return { hour: 9, minute: 0, isNone: true };
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  return {
    hour: isNaN(parts[0]) ? 9 : parts[0],
    minute: isNaN(parts[1]) ? 0 : parts[1],
    isNone: false,
  };
}

export const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  visible,
  onClose,
  mode = 'date',
  selectedDate,
  selectedTime,
  onConfirm,
  title,
}) => {
  const { colors } = useAppTheme();

  const [activeTab, setActiveTab] = useState<'date' | 'time'>(
    mode === 'time' ? 'time' : 'date'
  );

  const initialDate = selectedDate && isValid(parseISO(selectedDate))
    ? parseISO(selectedDate)
    : new Date();

  const [currentMonth, setCurrentMonth] = useState<Date>(initialDate);
  const [pickedDate, setPickedDate] = useState<Date>(initialDate);

  const initialTimeObj = parseTimeHelper(selectedTime);
  const [pickedHour, setPickedHour] = useState<number>(initialTimeObj.hour);
  const [pickedMinute, setPickedMinute] = useState<number>(initialTimeObj.minute);
  const [isTimeNone, setIsTimeNone] = useState<boolean>(initialTimeObj.isNone);

  useEffect(() => {
    if (visible) {
      const d = selectedDate && isValid(parseISO(selectedDate))
        ? parseISO(selectedDate)
        : new Date();
      setPickedDate(d);
      setCurrentMonth(d);

      const tObj = parseTimeHelper(selectedTime);
      setPickedHour(tObj.hour);
      setPickedMinute(tObj.minute);
      setIsTimeNone(tObj.isNone);
      setActiveTab(mode === 'time' ? 'time' : 'date');
    }
  }, [visible, selectedDate, selectedTime, mode]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Leading empty slots for Sunday (0) through Saturday (6)
  const startDayOfWeek = monthStart.getDay();
  const emptyLeadingDays = Array.from({ length: startDayOfWeek }, (_, i) => i);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleConfirm = () => {
    const formattedDate = format(pickedDate, 'yyyy-MM-dd');
    let formattedTime: string | undefined;
    if (!isTimeNone) {
      const hh = pickedHour.toString().padStart(2, '0');
      const mm = pickedMinute.toString().padStart(2, '0');
      formattedTime = `${hh}:${mm}`;
    }
    onConfirm(formattedDate, formattedTime);
    onClose();
  };

  const weekDayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, typography.title, { color: colors.text }]}>
              {title || (activeTab === 'date' ? 'Select Date' : 'Select Time')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mode Switcher Tabs if 'both' */}
          {mode === 'both' && (
            <View
              style={[
                styles.tabRow,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
              ]}
            >
              <TouchableOpacity
                onPress={() => setActiveTab('date')}
                style={[
                  styles.tabBtn,
                  activeTab === 'date' && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === 'date' ? styles.tabBtnTextActive : { color: colors.textSecondary },
                  ]}
                >
                  📅 Date ({format(pickedDate, 'MMM d')})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('time')}
                style={[
                  styles.tabBtn,
                  activeTab === 'time' && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === 'time' ? styles.tabBtnTextActive : { color: colors.textSecondary },
                  ]}
                >
                  ⏰ Time ({isTimeNone ? 'None' : `${pickedHour.toString().padStart(2, '0')}:${pickedMinute.toString().padStart(2, '0')}`})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tab 1: Date Picker */}
          {activeTab === 'date' && (
            <View style={styles.datePickerBody}>
              {/* Month Navigation */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity
                  onPress={handlePrevMonth}
                  style={[styles.monthNavBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <Text style={[styles.monthNavTxt, { color: colors.text }]}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.monthLabel, typography.title, { color: colors.text }]}>
                  {format(currentMonth, 'MMMM yyyy')}
                </Text>
                <TouchableOpacity
                  onPress={handleNextMonth}
                  style={[styles.monthNavBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <Text style={[styles.monthNavTxt, { color: colors.text }]}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day-of-week headers */}
              <View style={styles.weekHeaderRow}>
                {weekDayLabels.map((lbl) => (
                  <Text key={lbl} style={[styles.weekHeaderTxt, { color: colors.textMuted }]}>
                    {lbl}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.gridContainer}>
                {emptyLeadingDays.map((i) => (
                  <View key={`empty-${i}`} style={styles.daySlot} />
                ))}
                {daysInMonth.map((d) => {
                  const isSelected = isSameDay(d, pickedDate);
                  const isToday = isSameDay(d, new Date());
                  return (
                    <TouchableOpacity
                      key={d.toISOString()}
                      onPress={() => setPickedDate(d)}
                      style={[
                        styles.daySlot,
                        isSelected && [styles.daySlotSelected, { backgroundColor: colors.primary }],
                        isToday && !isSelected && [styles.daySlotToday, { borderColor: colors.primary }],
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          { color: colors.text },
                          isSelected && styles.dayNumSelected,
                          isToday && !isSelected && [{ color: colors.primaryLight }, styles.dayNumToday],
                        ]}
                      >
                        {format(d, 'd')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick Preset Buttons */}
              <View style={styles.quickDateRow}>
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Tomorrow', days: 1 },
                  { label: '+3 Days', days: 3 },
                  { label: 'Next Week', days: 7 },
                ].map((item) => {
                  const target = addDays(new Date(), item.days);
                  const isSel = isSameDay(pickedDate, target);
                  return (
                    <TouchableOpacity
                      key={item.label}
                      onPress={() => {
                        setPickedDate(target);
                        setCurrentMonth(target);
                      }}
                      style={[
                        styles.quickChip,
                        {
                          backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                          borderColor: isSel ? colors.primary : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickChipTxt,
                          isSel ? styles.chipTxtActive : { color: colors.textSecondary },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tab 2: Time Picker */}
          {activeTab === 'time' && (
            <View style={styles.timePickerBody}>
              <View style={styles.timeStatusHeader}>
                <TouchableOpacity
                  onPress={() => setIsTimeNone(!isTimeNone)}
                  style={[
                    styles.timeNoneToggle,
                    {
                      backgroundColor: isTimeNone ? colors.surfaceElevated : colors.primary,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeNoneToggleTxt,
                      isTimeNone ? { color: colors.textSecondary } : styles.chipTxtActive,
                    ]}
                  >
                    {isTimeNone ? '🔕 No Specific Time' : '⏰ Specific Time Active'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!isTimeNone && (
                <>
                  <Text style={[styles.subLabel, typography.caption, { color: colors.textSecondary }]}>
                    QUICK PRESETS
                  </Text>
                  <View style={styles.quickTimeRow}>
                    {[
                      { label: '09:00 AM', h: 9, m: 0 },
                      { label: '12:00 PM', h: 12, m: 0 },
                      { label: '03:00 PM', h: 15, m: 0 },
                      { label: '06:00 PM', h: 18, m: 0 },
                      { label: '09:00 PM', h: 21, m: 0 },
                    ].map((p) => {
                      const isSel = pickedHour === p.h && pickedMinute === p.m;
                      return (
                        <TouchableOpacity
                          key={p.label}
                          onPress={() => {
                            setPickedHour(p.h);
                            setPickedMinute(p.m);
                          }}
                          style={[
                            styles.quickChip,
                            {
                              backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                              borderColor: isSel ? colors.primary : colors.borderSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickChipTxt,
                              isSel ? styles.chipTxtActive : { color: colors.textSecondary },
                            ]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Hours and Minutes Horizontal Pickers */}
                  <Text style={[styles.subLabel, typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                    HOUR (24-HOUR CLOCK)
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizWheelScroll}
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => {
                      const isSel = pickedHour === h;
                      return (
                        <TouchableOpacity
                          key={h}
                          onPress={() => setPickedHour(h)}
                          style={[
                            styles.wheelItem,
                            {
                              backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                              borderColor: isSel ? colors.primary : colors.borderSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.wheelTxt,
                              isSel ? styles.chipTxtActive : { color: colors.text },
                            ]}
                          >
                            {h.toString().padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={[styles.subLabel, typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                    MINUTE
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizWheelScroll}
                  >
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                      const isSel = pickedMinute === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setPickedMinute(m)}
                          style={[
                            styles.wheelItem,
                            {
                              backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                              borderColor: isSel ? colors.primary : colors.borderSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.wheelTxt,
                              isSel ? styles.chipTxtActive : { color: colors.text },
                            ]}
                          >
                            {m.toString().padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          {/* Action Row */}
          <View style={[styles.footerRow, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={[styles.cancelBtnTxt, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.confirmBtnTxt}>Set & Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    marginBottom: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  datePickerBody: {
    paddingVertical: spacing.xs,
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNavTxt: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  weekHeaderTxt: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  daySlot: {
    width: `${100 / 7}%`,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    marginVertical: 2,
  },
  daySlotSelected: {
    borderRadius: radius.md,
  },
  daySlotToday: {
    borderWidth: 1,
    borderRadius: radius.md,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '500',
  },
  dayNumSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayNumToday: {
    fontWeight: '700',
  },
  quickDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  quickChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  quickChipTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTxtActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  timePickerBody: {
    paddingVertical: spacing.xs,
  },
  timeStatusHeader: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  timeNoneToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  timeNoneToggleTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '700',
    marginBottom: 4,
  },
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  horizWheelScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  wheelItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 42,
    alignItems: 'center',
  },
  wheelTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cancelBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  confirmBtnTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
