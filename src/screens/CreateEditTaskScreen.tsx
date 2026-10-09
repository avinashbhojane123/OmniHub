import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTasks } from '../hooks/useTasks';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { GoogleKeepNotesEditor } from '../components/GoogleKeepNotesEditor';
import { format, addDays } from 'date-fns';
import { TaskPriority } from '../types';

interface CreateEditTaskScreenProps {
  route: any;
  navigation: any;
}

export const CreateEditTaskScreen: React.FC<CreateEditTaskScreenProps> = ({
  route,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { tasks, categories, createTask, updateTask, deleteTask } = useTasks();

  const taskId = route.params?.taskId;
  const isEditing = Boolean(taskId);
  const existingTask = isEditing ? tasks.find((t) => t.id === taskId) : null;

  // Form State
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [notes, setNotes] = useState('');
  const [taskDate, setTaskDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState<string | undefined>(undefined);
  const [endTime, setEndTime] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (existingTask) {
      setTitle(existingTask.title);
      setCategoryId(existingTask.categoryId);
      setPriority(existingTask.priority || 'medium');
      setNotes(existingTask.notes || existingTask.description || '');
      setTaskDate(existingTask.date || format(new Date(), 'yyyy-MM-dd'));
      setStartTime(existingTask.startTime);
      setEndTime(existingTask.endTime);
    } else if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [existingTask, categories, categoryId]);

  const addMinutesToTime = (timeStr?: string, minutesToAdd = 30): string | undefined => {
    if (!timeStr) return undefined;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return undefined;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const period = match[3]?.toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    const totalMin = hours * 60 + mins + minutesToAdd;
    const newHours = Math.floor(totalMin / 60) % 24;
    const newMins = totalMin % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
  };

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!title.trim()) {
      errs.title = 'Title is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Alert.alert('Validation Error', 'Please enter a title for the task.');
      return;
    }

    try {
      if (isEditing && taskId) {
        await updateTask(taskId, {
          title: title.trim(),
          date: taskDate,
          startTime,
          endTime,
          priority,
          categoryId,
          notes: notes.trim() || undefined,
        });
      } else {
        await createTask({
          title: title.trim(),
          date: taskDate,
          startTime,
          endTime,
          priority,
          categoryId,
          notes: notes.trim() || undefined,
        });
      }

      navigateBack();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'An error occurred while saving.');
    }
  };

  const navigateBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  const handleDelete = () => {
    if (!taskId) return;
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTask(taskId);
          navigateBack();
        },
      },
    ]);
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        {/* Top Bar */}
        <View
          style={[
            styles.topBar,
            {
              borderBottomColor: colors.borderSubtle,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
        <TouchableOpacity
          onPress={navigateBack}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.navButtonText, { color: colors.textSecondary }]}>✕ Cancel</Text>
        </TouchableOpacity>

        <Text style={[styles.navTitle, typography.title, { color: colors.text }]}>
          {isEditing ? 'Edit Task' : 'New Task'}
        </Text>

        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Save Task"
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        {/* Main Heading (Task Title) */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            MAIN HEADING / TASK TITLE *
          </Text>
          <TextInput
            placeholder="e.g. Study React Native, Weekly Groceries..."
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={(txt) => {
              setTitle(txt);
              if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
            }}
            style={[
              styles.input,
              styles.titleInput,
              typography.title,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: errors.title ? colors.danger : colors.borderSubtle,
                color: colors.text,
              },
            ]}
          />
          {errors.title ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{errors.title}</Text>
          ) : null}
        </View>

        {/* Down Side: Google Keep Style Notes with Bullet Marks */}
        <GoogleKeepNotesEditor
          notes={notes}
          onChangeNotes={(newNotes) => setNotes(newNotes)}
          label="BULLET NOTES (GOOGLE KEEP STYLE)"
        />



        {/* Category Selector */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            CATEGORY
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {categories.map((c) => {
              const isSelected = categoryId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isSelected ? `${c.color}35` : colors.surfaceElevated,
                      borderColor: isSelected ? c.color : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={[styles.categoryPillText, { color: isSelected ? c.color : colors.textSecondary }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Priority Level Selector */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            PRIORITY LEVEL
          </Text>
          <View style={styles.chipRow}>
            {(['low', 'medium', 'high'] as const).map((p) => {
              const isSelected = priority === p;
              const pColor =
                p === 'high' ? colors.priorityHigh : p === 'low' ? colors.priorityLow : colors.priorityMedium;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: isSelected ? pColor : colors.surfaceElevated,
                      borderColor: isSelected ? pColor : colors.borderSubtle,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      isSelected ? styles.chipTextSelected : { color: colors.text },
                    ]}
                  >
                    {p === 'high' ? '🔥 High' : p === 'low' ? '🌱 Low' : '⚡ Medium'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Due Date Selector */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            DUE DATE (YYYY-MM-DD)
          </Text>
          <View style={styles.chipRow}>
            {[
              { label: 'Today', date: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Tomorrow', date: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
              { label: 'Next Week', date: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
            ].map((d) => {
              const isSelected = taskDate === d.date;
              return (
                <TouchableOpacity
                  key={d.label}
                  onPress={() => setTaskDate(d.date)}
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
                      borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      isSelected ? styles.chipTextSelected : { color: colors.text },
                    ]}
                  >
                    📅 {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[
              styles.input,
              styles.marginTopSm,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={taskDate}
            onChangeText={setTaskDate}
          />
        </View>

        {/* Reminder Time Selector */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            REMINDER TIME (HH:MM or Pick Preset)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {[
              { label: 'None', time: undefined },
              { label: '09:00 AM', time: '09:00' },
              { label: '01:00 PM', time: '13:00' },
              { label: '06:00 PM', time: '18:00' },
              { label: '08:00 PM', time: '20:00' },
            ].map((t) => {
              const isSelected = startTime === t.time;
              return (
                <TouchableOpacity
                  key={t.label}
                  onPress={() => setStartTime(t.time)}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
                      borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      isSelected ? styles.chipTextSelected : { color: colors.textSecondary },
                    ]}
                  >
                    {t.time ? `⏰ ${t.label}` : '🔕 None'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TextInput
            style={[
              styles.input,
              styles.marginTopSm,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="Custom time e.g. 10:30 or 07:15 PM"
            placeholderTextColor={colors.textMuted}
            value={startTime || ''}
            onChangeText={(val) => setStartTime(val.trim() || undefined)}
          />
        </View>

        {/* End Time / Duration Selector */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
            END TIME / DURATION (FOR CONFLICT DETECTION)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {[
              { label: 'None', mins: 0, time: undefined },
              { label: '+30m', mins: 30, time: addMinutesToTime(startTime, 30) },
              { label: '+45m', mins: 45, time: addMinutesToTime(startTime, 45) },
              { label: '+1h', mins: 60, time: addMinutesToTime(startTime, 60) },
              { label: '+2h', mins: 120, time: addMinutesToTime(startTime, 120) },
            ].map((p) => {
              const isSelected = p.mins === 0 ? !endTime : (endTime !== undefined && p.time === endTime);
              return (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => {
                    if (p.mins === 0) {
                      setEndTime(undefined);
                    } else {
                      const calculated = addMinutesToTime(startTime || '09:00', p.mins);
                      setEndTime(calculated);
                    }
                  }}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
                      borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      isSelected ? styles.chipTextSelected : { color: colors.textSecondary },
                    ]}
                  >
                    {p.mins === 0 ? '🏁 None' : `⏳ ${p.label}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TextInput
            style={[
              styles.input,
              styles.marginTopSm,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="Custom end time e.g. 11:30 or 08:00 PM"
            placeholderTextColor={colors.textMuted}
            value={endTime || ''}
            onChangeText={(val) => setEndTime(val.trim() || undefined)}
          />
        </View>

        {/* Delete Button (If editing) */}
        {isEditing && (
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.deleteButton, { borderColor: colors.danger }]}
            accessibilityRole="button"
            accessibilityLabel="Delete Task"
          >
            <Text style={[styles.deleteText, { color: colors.danger }]}>🗑 Delete Task</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  navButton: {
    padding: spacing.xs,
  },
  navButtonText: {
    fontWeight: '600',
  },
  navTitle: {
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  rowGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  label: {
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  pDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  selectorText: {
    fontWeight: '700',
    fontSize: 12,
  },
  categoryScroll: {
    gap: spacing.sm,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  categoryPillText: {
    fontWeight: '700',
    fontSize: 12,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  deleteText: {
    fontWeight: '700',
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dateChipText: {
    fontWeight: '700',
    fontSize: 13,
  },
  keyboardAvoid: {
    flex: 1,
  },
  titleInput: {
    fontSize: 17,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  marginTopSm: {
    marginTop: 8,
  },
});
