import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  Keyboard,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTasks } from '../hooks/useTasks';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { format, parseISO, addDays, isValid } from 'date-fns';
import {
  Task,
  TaskStatus,
  Category,
  RecurrenceRule,
  RecurrenceType,
  EisenhowerQuadrant,
} from '../types';
import { taskRepository } from '../database/repositories/TaskRepository';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { habitRepository } from '../database/repositories/HabitRepository';
import { taskService } from '../services/tasks/TaskService';
import { DateTimePickerModal } from '../components/DateTimePickerModal';
import { CreateCategoryModal } from '../components/CreateCategoryModal';
import { ConflictBanner } from '../components/ConflictBanner';
import { formatTimeTo12H, parseTimeToMinutes } from '../utils/time';

interface RouteParams {
  taskId?: string;
  initialTitle?: string;
  initialNotes?: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialCategoryId?: string;
}

interface CreateEditTaskScreenProps {
  route: {
    params?: RouteParams;
  };
  navigation: {
    navigate: (screen: string, params?: any) => void;
    goBack: () => void;
    canGoBack: () => boolean;
    dispatch: (action: any) => void;
    addListener: (event: string, callback: (e: any) => void) => () => void;
  };
}

function getNextMondayDate(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return format(d, 'yyyy-MM-dd');
}

function getNextUpcomingHourTime(): string {
  const now = new Date();
  const nextH = (now.getHours() + 1) % 24;
  return `${String(nextH).padStart(2, '0')}:00`;
}

function addMinutesToTime(timeStr: string, minutesToAdd: number): { time: string; isOvernight: boolean } {
  const baseM = parseTimeToMinutes(timeStr);
  if (baseM === null) return { time: '10:00', isOvernight: false };
  const targetM = baseM + minutesToAdd;
  if (targetM >= 1440) {
    const nextDayM = targetM - 1440;
    return {
      time: `${String(Math.floor(nextDayM / 60)).padStart(2, '0')}:${String(nextDayM % 60).padStart(2, '0')}`,
      isOvernight: true,
    };
  }
  return {
    time: `${String(Math.floor(targetM / 60)).padStart(2, '0')}:${String(targetM % 60).padStart(2, '0')}`,
    isOvernight: false,
  };
}

const TASK_ACCENT_COLORS = [
  { color: undefined, label: 'Default' },
  { color: '#FF6B00', label: 'Orange' },
  { color: '#3B82F6', label: 'Blue' },
  { color: '#10B981', label: 'Green' },
  { color: '#8B5CF6', label: 'Purple' },
  { color: '#EC4899', label: 'Pink' },
  { color: '#F59E0B', label: 'Amber' },
  { color: '#06B6D4', label: 'Cyan' },
];

export const CreateEditTaskScreen: React.FC<CreateEditTaskScreenProps> = ({
  route,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { categories, refresh, createTask, updateTask, deleteTask } = useTasks();

  const taskId = route.params?.taskId;
  const isEditing = Boolean(taskId);

  // Pre-extract initial route params lazily for instant frame-1 rendering
  const initParamTitle = route.params?.initialTitle || '';
  const initParamNotes = route.params?.initialNotes || '';
  const rawInitParamDate = route.params?.initialDate || format(new Date(), 'yyyy-MM-dd');
  const candidateInitDate = rawInitParamDate.includes('T') ? rawInitParamDate.split('T')[0] : rawInitParamDate;
  const initParamDate = isValid(parseISO(candidateInitDate)) ? candidateInitDate : format(new Date(), 'yyyy-MM-dd');
  const initParamStart = route.params?.initialStartTime;
  const initParamEnd = route.params?.initialEndTime;
  const initParamCat = route.params?.initialCategoryId;
  const initParamHasTime = Boolean(initParamStart);

  // Form State
  const [title, setTitle] = useState(() => (taskId ? '' : initParamTitle));
  const [categoryId, setCategoryId] = useState<string | undefined>(() => (taskId ? undefined : initParamCat));
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [notes, setNotes] = useState(() => (taskId ? '' : initParamNotes));
  const [taskDate, setTaskDate] = useState<string>(() => (taskId ? format(new Date(), 'yyyy-MM-dd') : initParamDate));
  const [isAllDay, setIsAllDay] = useState<boolean>(() => (taskId ? true : !initParamHasTime));
  const [startTime, setStartTime] = useState<string | undefined>(() => (taskId ? undefined : initParamStart));
  const [endTime, setEndTime] = useState<string | undefined>(() => (taskId ? undefined : initParamEnd));
  const [isOvernight, setIsOvernight] = useState<boolean>(false);
  const [seriesId, setSeriesId] = useState<string | undefined>(undefined);
  const [existingRecurrenceRule, setExistingRecurrenceRule] = useState<RecurrenceRule | undefined>(undefined);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Eisenhower Matrix State
  const [eisenhowerQuadrant, setEisenhowerQuadrant] = useState<EisenhowerQuadrant | undefined>(undefined);

  // Task Accent Color
  const [taskAccentColor, setTaskAccentColor] = useState<string | undefined>(undefined);

  // Timestamps for edit view & optimistic concurrency
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isNavigatingRef = useRef(false);

  const navigateBack = useCallback(() => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // Pickers & Modals State
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);
  const [timePickerMode, setTimePickerMode] = useState<'start' | 'end' | null>(null);
  const [newCatModalVisible, setNewCatModalVisible] = useState(false);

  // Conflict state
  const [conflicts, setConflicts] = useState<{ itemA: string; itemB: string; time: string }[]>([]);
  const [conflictDismissed, setConflictDismissed] = useState(false);

  // Initial Snapshot for dirty checking
  const [initialSnapshot, setInitialSnapshot] = useState<{
    title: string;
    notes: string;
    categoryId?: string;
    status: TaskStatus;
    taskDate: string;
    isAllDay: boolean;
    startTime?: string;
    endTime?: string;
    isOvernight: boolean;
    recurrenceType: RecurrenceType;
    recurrenceInterval: number;
    recurrenceDaysOfWeek: number[];
    recurrenceEndDate?: string;
    eisenhowerQuadrant?: EisenhowerQuadrant;
    taskAccentColor?: string;
  }>(() => ({
    title: taskId ? '' : initParamTitle,
    notes: taskId ? '' : initParamNotes,
    categoryId: taskId ? undefined : initParamCat,
    status: 'pending' as TaskStatus,
    taskDate: taskId ? format(new Date(), 'yyyy-MM-dd') : initParamDate,
    isAllDay: taskId ? true : !initParamHasTime,
    startTime: taskId ? undefined : initParamStart,
    endTime: taskId ? undefined : initParamEnd,
    isOvernight: false,
    recurrenceType: 'none' as RecurrenceType,
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [] as number[],
    recurrenceEndDate: undefined,
    eisenhowerQuadrant: undefined,
    taskAccentColor: undefined,
  }));

  // Composite route key to accurately track route param transitions between edits and new tasks
  const routeParamKey = useMemo(() => {
    if (taskId) return `edit_${taskId}`;
    return `new_${route.params?.initialTitle || ''}_${route.params?.initialNotes || ''}_${route.params?.initialDate || ''}_${route.params?.initialStartTime || ''}_${route.params?.initialEndTime || ''}_${route.params?.initialCategoryId || ''}`;
  }, [taskId, route.params]);

  // Load Task and Initial Values
  const lastLoadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    let isMounted = true;

    if (lastLoadedKeyRef.current === routeParamKey) {
      return;
    }
    lastLoadedKeyRef.current = routeParamKey;
    isSavedRef.current = false;
    isNavigatingRef.current = false;

    async function loadData() {
      if (taskId) {
        try {
          const directTask = await taskRepository.findById(taskId);
          if (!directTask && isMounted) {
            Alert.alert('Task Not Found', 'This task could not be found or has been deleted.', [
              { text: 'OK', onPress: () => navigateBack() },
            ]);
            return;
          }
          if (directTask && isMounted) {
            const hasTime = Boolean(directTask.startTime);
            setTitle(directTask.title || '');
            setCategoryId(directTask.categoryId);
            setStatus(directTask.status || 'pending');
            setNotes(directTask.notes || directTask.description || '');

            const rawDate = directTask.date || format(new Date(), 'yyyy-MM-dd');
            const candidateDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
            const resolvedDate = isValid(parseISO(candidateDate)) ? candidateDate : format(new Date(), 'yyyy-MM-dd');
            setTaskDate(resolvedDate);
            setIsAllDay(!hasTime);
            setStartTime(directTask.startTime);
            setEndTime(directTask.endTime);

            // Recurrence Rule & metadata preservation
            const rule: RecurrenceRule | undefined = directTask.recurrenceRule;
            setExistingRecurrenceRule(rule);

            const resolvedRecType = rule?.type || 'none';
            setRecurrenceType(resolvedRecType);
            const resolvedInterval = rule?.interval || 1;
            setRecurrenceInterval(resolvedInterval);
            const resolvedDays = rule?.daysOfWeek || [];
            setRecurrenceDaysOfWeek(resolvedDays);
            const resolvedEndDate = rule?.endDate;
            setRecurrenceEndDate(resolvedEndDate);
            const resolvedOvernight =
              directTask.isOvernight !== undefined
                ? Boolean(directTask.isOvernight)
                : Boolean(rule?.isOvernight);
            setIsOvernight(resolvedOvernight);

            const resolvedQuadrant = directTask.eisenhowerQuadrant || rule?.eisenhowerQuadrant || undefined;
            const resolvedAccentColor = directTask.accentColor || rule?.accentColor || undefined;
            setEisenhowerQuadrant(resolvedQuadrant);
            setTaskAccentColor(resolvedAccentColor);

            setSeriesId(directTask.seriesId);
            setCreatedAt(directTask.createdAt);
            setUpdatedAt(directTask.updatedAt);

            setInitialSnapshot({
              title: directTask.title || '',
              notes: directTask.notes || directTask.description || '',
              categoryId: directTask.categoryId,
              status: directTask.status || 'pending',
              taskDate: resolvedDate,
              isAllDay: !hasTime,
              startTime: directTask.startTime,
              endTime: directTask.endTime,
              isOvernight: resolvedOvernight,
              recurrenceType: resolvedRecType,
              recurrenceInterval: resolvedInterval,
              recurrenceDaysOfWeek: resolvedDays,
              recurrenceEndDate: resolvedEndDate,
              eisenhowerQuadrant: resolvedQuadrant,
              taskAccentColor: resolvedAccentColor,
            });
          }
        } catch (e: any) {
          console.warn('Failed to load task directly:', e);
          if (isMounted) {
            Alert.alert('Error Loading Task', e?.message || 'Could not load task details.', [
              { text: 'Go Back', onPress: () => navigateBack() },
            ]);
          }
        }
      } else {
        // Complete state reset and pre-fill from route parameters for a new task
        const initTitle = route.params?.initialTitle || '';
        const initNotes = route.params?.initialNotes || '';
        const rawInitDate = route.params?.initialDate || format(new Date(), 'yyyy-MM-dd');
        const candidateDate = rawInitDate.includes('T') ? rawInitDate.split('T')[0] : rawInitDate;
        const initDate = isValid(parseISO(candidateDate)) ? candidateDate : format(new Date(), 'yyyy-MM-dd');
        const initStart = route.params?.initialStartTime;
        const initEnd = route.params?.initialEndTime;
        const initCat = route.params?.initialCategoryId;
        const initHasTime = Boolean(initStart);

        setTitle(initTitle);
        setNotes(initNotes);
        setTaskDate(initDate);
        setCategoryId(initCat);
        setStatus('pending');
        setIsAllDay(!initHasTime);
        setStartTime(initStart);
        setEndTime(initEnd);
        setIsOvernight(false);
        setSeriesId(undefined);
        setExistingRecurrenceRule(undefined);
        setRecurrenceType('none');
        setRecurrenceInterval(1);
        setRecurrenceDaysOfWeek([]);
        setRecurrenceEndDate(undefined);
        setEisenhowerQuadrant(undefined);
        setTaskAccentColor(undefined);
        setCreatedAt(undefined);
        setUpdatedAt(undefined);
        setErrors({});

        setInitialSnapshot({
          title: initTitle,
          notes: initNotes,
          categoryId: initCat,
          status: 'pending',
          taskDate: initDate,
          isAllDay: !initHasTime,
          startTime: initStart,
          endTime: initEnd,
          isOvernight: false,
          recurrenceType: 'none',
          recurrenceInterval: 1,
          recurrenceDaysOfWeek: [],
          recurrenceEndDate: undefined,
          eisenhowerQuadrant: undefined,
          taskAccentColor: undefined,
        });
      }
    }

    loadData();

    return () => {
      isMounted = false;
      lastLoadedKeyRef.current = null;
    };
  }, [
    routeParamKey,
    taskId,
    navigateBack,
    route.params?.initialTitle,
    route.params?.initialNotes,
    route.params?.initialDate,
    route.params?.initialStartTime,
    route.params?.initialEndTime,
    route.params?.initialCategoryId,
  ]);

  useEffect(() => {
    const unsubBlur = navigation.addListener('blur', () => {
      lastLoadedKeyRef.current = null;
    });
    return unsubBlur;
  }, [navigation]);

  // Check schedule conflict when date and time change (debounced, without title dependency)
  useEffect(() => {
    let isMounted = true;
    async function checkConflicts() {
      if (isAllDay || !startTime || !taskDate) {
        setConflicts([]);
        return;
      }

      try {
        const [dayTasks, dayEvents, activeHabits] = await Promise.all([
          taskRepository.findByDate(taskDate),
          calendarRepository.findByDate(taskDate),
          habitRepository.findActive(),
        ]);

        let nextDayTasks: Task[] = [];
        let nextDayEvents: any[] = [];
        if (isOvernight) {
          try {
            const nextDateStr = format(addDays(parseISO(taskDate), 1), 'yyyy-MM-dd');
            const [nextT, nextE] = await Promise.all([
              taskRepository.findByDate(nextDateStr),
              calendarRepository.findByDate(nextDateStr),
            ]);
            nextDayTasks = nextT;
            nextDayEvents = nextE;
          } catch {}
        }

        const otherTasks = dayTasks.filter(
          (t) =>
            t.id !== taskId &&
            t.startTime &&
            t.status !== 'cancelled' &&
            t.status !== 'completed'
        );

        const newStartM = parseTimeToMinutes(startTime);
        const newEndM = endTime
          ? parseTimeToMinutes(endTime)
          : newStartM !== null
          ? newStartM + 30
          : null;

        if (newStartM === null || newEndM === null) {
          setConflicts([]);
          return;
        }

        const effectiveNewEndM = isOvernight && newEndM <= newStartM ? newEndM + 1440 : newEndM;
        const detected: { itemA: string; itemB: string; time: string }[] = [];

        // 1. Check against other tasks on the same start date
        for (const t of otherTasks) {
          const tStartM = parseTimeToMinutes(t.startTime);
          let tEndM = t.endTime
            ? parseTimeToMinutes(t.endTime)
            : tStartM !== null
            ? tStartM + 30
            : null;

          if (tStartM !== null && tEndM !== null) {
            const isTOv = Boolean(t.recurrenceRule?.isOvernight) || tEndM <= tStartM;
            const effectiveTEndM = isTOv && tEndM <= tStartM ? tEndM + 1440 : tEndM;

            if (Math.max(newStartM, tStartM) < Math.min(effectiveNewEndM, effectiveTEndM)) {
              detected.push({
                itemA: 'This Task',
                itemB: t.title,
                time: `${formatTimeTo12H(t.startTime)}${t.endTime ? ' – ' + formatTimeTo12H(t.endTime) : ''}${isTOv ? ' (+1d)' : ''}`,
              });
            }
          }
        }

        // 2. Check against active calendar events on taskDate
        for (const ev of dayEvents) {
          if (ev.status !== 'completed' && ev.status !== 'dismissed' && ev.time) {
            const evStartM = parseTimeToMinutes(ev.time);
            if (evStartM !== null) {
              const evEndM = evStartM + 45; // default 45 min meeting block
              if (Math.max(newStartM, evStartM) < Math.min(effectiveNewEndM, evEndM)) {
                detected.push({
                  itemA: 'This Task',
                  itemB: `📅 Event: ${ev.title}`,
                  time: `${formatTimeTo12H(ev.time)} – ${formatTimeTo12H(
                    `${Math.floor(evEndM / 60)}:${String(evEndM % 60).padStart(2, '0')}`
                  )}`,
                });
              }
            }
          }
        }

        // 3. Check against habits scheduled on this day of week
        const taskDateObj = parseISO(taskDate);
        const dayOfWeek = isValid(taskDateObj) ? taskDateObj.getDay() : new Date().getDay();
        for (const h of activeHabits) {
          if (h.reminderTime) {
            const days = h.recurrenceRule?.daysOfWeek && h.recurrenceRule.daysOfWeek.length > 0
              ? h.recurrenceRule.daysOfWeek
              : [0, 1, 2, 3, 4, 5, 6];
            if (days.includes(dayOfWeek)) {
              const hStartM = parseTimeToMinutes(h.reminderTime);
              if (hStartM !== null) {
                const hEndM = hStartM + 20; // 20 min habit routine window
                if (Math.max(newStartM, hStartM) < Math.min(effectiveNewEndM, hEndM)) {
                  detected.push({
                    itemA: 'This Task',
                    itemB: `🌱 Routine: ${h.name}`,
                    time: `${formatTimeTo12H(h.reminderTime)}`,
                  });
                }
              }
            }
          }
        }

        // 4. If overnight, check against tasks and events scheduled on the morning of the next day
        if (isOvernight && newEndM > 0) {
          for (const nt of nextDayTasks) {
            if (nt.id === taskId || !nt.startTime || nt.status === 'cancelled' || nt.status === 'completed') continue;
            const ntStartM = parseTimeToMinutes(nt.startTime);
            if (ntStartM !== null && ntStartM < newEndM) {
              detected.push({
                itemA: 'This Task',
                itemB: `🌅 Next Day: ${nt.title}`,
                time: `${formatTimeTo12H(nt.startTime)}${nt.endTime ? ' – ' + formatTimeTo12H(nt.endTime) : ''}`,
              });
            }
          }
          for (const ne of nextDayEvents) {
            if (!ne.time || ne.status === 'completed' || ne.status === 'dismissed') continue;
            const neStartM = parseTimeToMinutes(ne.time);
            if (neStartM !== null && neStartM < newEndM) {
              detected.push({
                itemA: 'This Task',
                itemB: `🌅 Next Day Event: ${ne.title}`,
                time: `${formatTimeTo12H(ne.time)}`,
              });
            }
          }
        }

        if (isMounted) {
          setConflicts(detected);
          setConflictDismissed(false);
        }
      } catch (err) {
        console.warn('Conflict detection error in CreateEditTaskScreen:', err);
      }
    }

    const timer = setTimeout(() => {
      checkConflicts();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [taskDate, isAllDay, startTime, endTime, isOvernight, taskId]);

  // Real-time calculated duration (supporting overnight cross-midnight shifts)
  const activeDurationDisplay = useMemo(() => {
    if (isAllDay || !startTime || !endTime) return null;
    const sM = parseTimeToMinutes(startTime);
    const eM = parseTimeToMinutes(endTime);
    if (sM === null || eM === null) return null;

    let diff = eM - sM;
    if (diff <= 0) {
      if (isOvernight) {
        diff = eM + 1440 - sM;
      } else {
        return null;
      }
    }

    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    const overNightSuffix = isOvernight ? ' (+1 day)' : '';
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m${overNightSuffix}`;
    if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}${overNightSuffix}`;
    return `${mins} mins${overNightSuffix}`;
  }, [isAllDay, startTime, endTime, isOvernight]);

  // Toggle day of week in weekly recurrence
  const handleToggleDayOfWeek = (dayNumber: number) => {
    if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
    setRecurrenceDaysOfWeek((prev) => {
      if (prev.includes(dayNumber)) {
        return prev.filter((d) => d !== dayNumber);
      } else {
        return [...prev, dayNumber].sort((a, b) => a - b);
      }
    });
  };

  // Handle Eisenhower Selection
  const handleSelectQuadrant = (q: EisenhowerQuadrant) => {
    setEisenhowerQuadrant((prev) => (prev === q ? undefined : q));
  };

  // Dirty check
  const isSavedRef = useRef(false);
  const isDirty = useMemo(() => {
    return (
      title.trim() !== (initialSnapshot.title || '').trim() ||
      notes.trim() !== (initialSnapshot.notes || '').trim() ||
      taskDate !== initialSnapshot.taskDate ||
      status !== initialSnapshot.status ||
      categoryId !== initialSnapshot.categoryId ||
      isAllDay !== initialSnapshot.isAllDay ||
      startTime !== initialSnapshot.startTime ||
      endTime !== initialSnapshot.endTime ||
      isOvernight !== initialSnapshot.isOvernight ||
      recurrenceType !== initialSnapshot.recurrenceType ||
      recurrenceInterval !== initialSnapshot.recurrenceInterval ||
      JSON.stringify([...(recurrenceDaysOfWeek || [])].sort((a, b) => a - b)) !==
        JSON.stringify([...(initialSnapshot.recurrenceDaysOfWeek || [])].sort((a, b) => a - b)) ||
      recurrenceEndDate !== initialSnapshot.recurrenceEndDate ||
      eisenhowerQuadrant !== initialSnapshot.eisenhowerQuadrant ||
      taskAccentColor !== initialSnapshot.taskAccentColor
    );
  }, [
    title,
    notes,
    taskDate,
    status,
    categoryId,
    isAllDay,
    startTime,
    endTime,
    isOvernight,
    recurrenceType,
    recurrenceInterval,
    recurrenceDaysOfWeek,
    recurrenceEndDate,
    eisenhowerQuadrant,
    taskAccentColor,
    initialSnapshot,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty || isSavedRef.current) {
        return;
      }
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them and leave?',
        [
          {
            text: 'Keep editing',
            style: 'cancel',
            onPress: () => {
              isNavigatingRef.current = false;
            },
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              isSavedRef.current = true;
              lastLoadedKeyRef.current = null;
              navigation.dispatch(e.data.action);
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            isNavigatingRef.current = false;
          },
        }
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  useEffect(() => {
    const onBackPress = () => {
      navigateBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [navigateBack]);

  const handleCategoryCreated = async (created: Category) => {
    setCategoryId(created.id);
    try {
      await refresh();
    } catch (e) {
      console.warn('Failed to refresh categories:', e);
    }
  };

  const validate = (): { isValid: boolean; message?: string } => {
    const errs: { [key: string]: string } = {};

    if (!title.trim()) {
      errs.title = 'Title is required';
    } else if (title.trim().length > 250) {
      errs.title = 'Title cannot exceed 250 characters';
    }

    if (taskDate && !isValid(parseISO(taskDate))) {
      errs.date = 'Valid due date is required';
    }

    if (!isAllDay) {
      if (!startTime && endTime) {
        errs.time = 'Please select a start time or clear the end time';
      } else if (startTime && endTime) {
        const startMin = parseTimeToMinutes(startTime);
        const endMin = parseTimeToMinutes(endTime);
        if (startMin !== null && endMin !== null) {
          if (endMin <= startMin && !isOvernight) {
            errs.time = 'End time must be after start time, or toggle Overnight (+1d)';
          }
        }
      }
    }

    if (recurrenceType === 'weekly' && recurrenceDaysOfWeek.length === 0) {
      errs.recurrence = 'Please select at least one day of the week for weekly repeat';
    }

    if (recurrenceType !== 'none' && recurrenceEndDate) {
      if (!isValid(parseISO(recurrenceEndDate))) {
        errs.recurrence = 'Please enter a valid repeat end date';
      } else if (taskDate && recurrenceEndDate < taskDate) {
        errs.recurrence = 'Repeat end date cannot be earlier than task due date';
      }
    }

    setErrors(errs);
    const keys = Object.keys(errs);
    return {
      isValid: keys.length === 0,
      message:
        keys.length > 0
          ? (errs.title || errs.date || errs.time || errs.recurrence || 'Please check the required fields.')
          : undefined,
    };
  };

  const performSaveTask = async (forceOverwrite = false, updateEntireSeries = false) => {
    if (isSavingRef.current) return;

    try {
      if (isEditing && taskId && !forceOverwrite) {
        // Optimistic concurrency check against background modifications
        const currentTaskInDb = await taskRepository.findById(taskId);
        if (currentTaskInDb && updatedAt && currentTaskInDb.updatedAt !== updatedAt) {
          Alert.alert(
            'Task Modified Externally',
            'This task was updated in the background. Do you still want to overwrite it with your edits?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Overwrite & Save',
                style: 'destructive',
                onPress: () => {
                  setUpdatedAt(currentTaskInDb.updatedAt);
                  performSaveTask(true, updateEntireSeries);
                },
              },
            ]
          );
          return;
        }
      }

      isSavingRef.current = true;
      setIsSaving(true);

      // Build comprehensive recurrence rule with all metadata preserved
      const hasRecurrence = recurrenceType !== 'none';
      const hasExtendedMeta = Boolean(
        eisenhowerQuadrant || taskAccentColor || isOvernight
      );

      const recurrenceRule: RecurrenceRule | undefined =
        hasRecurrence || hasExtendedMeta
          ? {
              ...(existingRecurrenceRule || {}),
              type: recurrenceType,
              interval: recurrenceType !== 'none' && recurrenceInterval > 1 ? recurrenceInterval : undefined,
              daysOfWeek: recurrenceType === 'weekly' && recurrenceDaysOfWeek.length > 0 ? recurrenceDaysOfWeek : undefined,
              endDate: recurrenceType !== 'none' && recurrenceEndDate ? recurrenceEndDate : undefined,
              isOvernight: isOvernight || undefined,
              eisenhowerQuadrant: eisenhowerQuadrant || undefined,
              accentColor: taskAccentColor || undefined,
            }
          : undefined;

      const normStart = isAllDay ? undefined : startTime;
      const normEnd = isAllDay ? undefined : endTime;
      const cleanNotes = notes.trim();

      if (isEditing && taskId) {
        // Check if recurrence schedule itself was altered
        const isRecurrenceAltered =
          recurrenceType !== initialSnapshot.recurrenceType ||
          recurrenceInterval !== initialSnapshot.recurrenceInterval ||
          JSON.stringify([...(recurrenceDaysOfWeek || [])].sort((a, b) => a - b)) !==
            JSON.stringify([...(initialSnapshot.recurrenceDaysOfWeek || [])].sort((a, b) => a - b)) ||
          recurrenceEndDate !== initialSnapshot.recurrenceEndDate;

        // Resolve seriesId when recurrence is toggled
        const resolvedSeriesId =
          recurrenceType === 'none'
            ? null
            : (!updateEntireSeries && isRecurrenceAltered)
            ? `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
            : seriesId || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        if (updateEntireSeries && seriesId) {
          const seriesTasks = await taskRepository.findBySeriesId(seriesId);
          await Promise.all(
            seriesTasks.map((st) =>
              taskService.updateTask(st.id, {
                title: title.trim(),
                description: cleanNotes || null,
                notes: cleanNotes || null,
                date: st.id === taskId ? taskDate : undefined,
                startTime: normStart || null,
                endTime: normEnd || null,
                categoryId: categoryId || null,
                status: st.id === taskId ? status : st.status,
                reminderMinutes: -1,
                recurrenceRule: recurrenceRule || null,
                seriesId: resolvedSeriesId,
                eisenhowerQuadrant: eisenhowerQuadrant || undefined,
                accentColor: taskAccentColor || undefined,
                isOvernight: isOvernight || false,
                isLoudAlarm: false,
              })
            )
          );
          await refresh();
        } else {
          await updateTask(taskId, {
            title: title.trim(),
            description: cleanNotes || null,
            notes: cleanNotes || null,
            date: taskDate || '',
            startTime: normStart || null,
            endTime: normEnd || null,
            categoryId: categoryId || null,
            status,
            reminderMinutes: -1,
            recurrenceRule: recurrenceRule || null,
            seriesId: resolvedSeriesId,
            eisenhowerQuadrant: eisenhowerQuadrant || undefined,
            accentColor: taskAccentColor || undefined,
            isOvernight: isOvernight || false,
            isLoudAlarm: false,
          });
        }
      } else {
        await createTask({
          title: title.trim(),
          description: cleanNotes || undefined,
          notes: cleanNotes || undefined,
          date: taskDate || '',
          startTime: normStart,
          endTime: normEnd,
          categoryId,
          reminderMinutes: -1,
          recurrenceRule,
          eisenhowerQuadrant: eisenhowerQuadrant || undefined,
          accentColor: taskAccentColor || undefined,
          isOvernight: isOvernight || false,
          isLoudAlarm: false,
        });
      }

      isSavedRef.current = true;
      lastLoadedKeyRef.current = null;
      navigateBack();
    } catch (err: any) {
      isSavedRef.current = false;
      isNavigatingRef.current = false;
      Alert.alert('Save Failed', err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleSave = () => {
    if (isSavingRef.current || isSaving) return;

    const { isValid: isFormValid, message } = validate();
    if (!isFormValid) {
      Alert.alert('Validation Error', message || 'Please check the required fields.');
      return;
    }

    if (isEditing && taskId && seriesId) {
      Alert.alert(
        'Save Recurring Task',
        'This task is part of a recurring series. How would you like to save your edits?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This Task Only',
            onPress: () => performSaveTask(false, false),
          },
          {
            text: 'All in Series',
            onPress: () => performSaveTask(false, true),
          },
        ],
        { cancelable: true }
      );
    } else {
      performSaveTask(false, false);
    }
  };

  const handleDelete = () => {
    if (!taskId || isSavingRef.current || isSaving) return;

    if (seriesId) {
      Alert.alert(
        'Delete Recurring Task',
        'This task is part of a recurring series. How would you like to delete it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This Task Only',
            style: 'destructive',
            onPress: async () => {
              if (isSavingRef.current || isSaving) return;
              try {
                isSavingRef.current = true;
                setIsSaving(true);
                isSavedRef.current = true;
                await deleteTask(taskId, false);
                navigateBack();
              } catch (err: any) {
                isSavedRef.current = false;
                setIsSaving(false);
                isSavingRef.current = false;
                isNavigatingRef.current = false;
                Alert.alert('Delete Failed', err?.message || 'Could not delete task.');
              }
            },
          },
          {
            text: 'All in Series',
            style: 'destructive',
            onPress: async () => {
              if (isSavingRef.current || isSaving) return;
              try {
                isSavingRef.current = true;
                setIsSaving(true);
                isSavedRef.current = true;
                await deleteTask(taskId, true);
                navigateBack();
              } catch (err: any) {
                isSavedRef.current = false;
                setIsSaving(false);
                isSavingRef.current = false;
                isNavigatingRef.current = false;
                Alert.alert('Delete Failed', err?.message || 'Could not delete series tasks.');
              }
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      Alert.alert(
        'Delete Task',
        'Are you sure you want to delete this task?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (isSavingRef.current || isSaving) return;
              try {
                isSavingRef.current = true;
                setIsSaving(true);
                isSavedRef.current = true;
                await deleteTask(taskId, false);
                navigateBack();
              } catch (err: any) {
                isSavedRef.current = false;
                setIsSaving(false);
                isSavingRef.current = false;
                isNavigatingRef.current = false;
                Alert.alert('Delete Failed', err?.message || 'Could not delete task.');
              }
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  // Quick Date Helpers
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMonStr = getNextMondayDate();

  const formattedDisplayDate = useMemo(() => {
    if (!taskDate) return 'No Date (Backlog)';
    try {
      const d = parseISO(taskDate);
      if (isValid(d)) {
        if (taskDate === todayStr) return `Today, ${format(d, 'MMM d')}`;
        if (taskDate === tomorrowStr) return `Tomorrow, ${format(d, 'MMM d')}`;
        return format(d, 'EEE, MMM d, yyyy');
      }
    } catch {}
    return taskDate;
  }, [taskDate, todayStr, tomorrowStr]);

  // Status options config (Edit mode)
  const statusConfig: { value: TaskStatus; label: string; color: string; icon: string }[] = [
    { value: 'pending', label: 'Pending', color: colors.textSecondary, icon: '⏳' },
    { value: 'in_progress', label: 'In Progress', color: colors.info, icon: '🚀' },
    { value: 'completed', label: 'Completed', color: colors.success, icon: '✓' },
    { value: 'cancelled', label: 'Cancelled', color: colors.danger, icon: '🚫' },
  ];

  const activeColorTheme = taskAccentColor || colors.primary;

  // Detect if current end time is chronologically earlier than or equal to start time
  const isTimeEarlierOrEqual = useMemo(() => {
    if (!startTime || !endTime) return false;
    const sM = parseTimeToMinutes(startTime);
    const eM = parseTimeToMinutes(endTime);
    return sM !== null && eM !== null && eM <= sM;
  }, [startTime, endTime]);

  // Auto-clear sticky isOvernight state if times are normalized
  useEffect(() => {
    if (startTime && endTime) {
      const sM = parseTimeToMinutes(startTime);
      const eM = parseTimeToMinutes(endTime);
      if (sM !== null && eM !== null && sM < eM && isOvernight) {
        setIsOvernight(false);
      }
    }
  }, [startTime, endTime, isOvernight]);

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} />

      {/* Header Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Math.max(insets.top, 16),
            backgroundColor: colors.surface,
            borderBottomColor: taskAccentColor ? `${taskAccentColor}50` : colors.borderSubtle,
          },
        ]}
      >
        <TouchableOpacity
          onPress={navigateBack}
          style={[styles.navButton, { backgroundColor: colors.surfaceElevated }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.navButtonIcon, { color: colors.textSecondary }]}>✕</Text>
        </TouchableOpacity>

        <View style={styles.navTitleContainer}>
          <Text style={[styles.navTitle, typography.title, { color: colors.text }]}>
            {isEditing ? 'Edit Task' : 'New Task'}
          </Text>
          <Text style={[styles.navSubtitle, { color: colors.textMuted }]}>
            {isEditing ? 'UPDATE DETAILS' : 'CREATE DETAILS'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          style={[
            styles.saveBtn,
            {
              backgroundColor: activeColorTheme,
              opacity: isSaving ? 0.7 : 1,
              shadowColor: activeColorTheme,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save Changes' : 'Create Task'}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 48 : 0}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Conflict Banner if schedule conflict detected */}
          {conflicts.length > 0 && !conflictDismissed && (
            <ConflictBanner
              conflicts={conflicts.map((c) => ({
                ...c,
                itemA: title.trim() || 'This Task',
              }))}
              onDismiss={() => setConflictDismissed(true)}
            />
          )}

          {/* CARD 1: TASK DETAILS (Title + Notes) */}
          <View
            style={[
              styles.cardContainer,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            {/* Title Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <View style={[styles.sectionIconBadge, { backgroundColor: `${activeColorTheme}20` }]}>
                  <Text style={styles.sectionIconEmoji}>📝</Text>
                </View>
                <Text style={[styles.cardHeaderLabel, { color: colors.textSecondary }]}>
                  TASK DETAILS
                </Text>
              </View>
              <View
                style={[
                  styles.charBadge,
                  {
                    backgroundColor:
                      title.length >= 240 ? colors.dangerBg : colors.surfaceHighlight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.charCountText,
                    { color: title.length >= 240 ? colors.danger : colors.textMuted },
                  ]}
                >
                  {title.length}/250
                </Text>
              </View>
            </View>

            {/* Title Input Box */}
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.surface,
                  borderColor: errors.title
                    ? colors.danger
                    : taskAccentColor
                    ? `${taskAccentColor}80`
                    : colors.borderSubtle,
                },
              ]}
            >
              <TextInput
                placeholder="What needs to be done? (e.g. Design review...)"
                placeholderTextColor={colors.textMuted}
                value={title}
                maxLength={250}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onChangeText={(txt) => {
                  setTitle(txt);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                }}
                style={[styles.titleInput, typography.title, { color: colors.text }]}
                autoFocus={!isEditing}
              />
              {title.length > 0 && (
                <TouchableOpacity
                  onPress={() => setTitle('')}
                  style={styles.clearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear title"
                >
                  <Text style={[styles.clearBtnIcon, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {errors.title ? (
              <Text style={[styles.fieldErrorText, { color: colors.danger }]}>{errors.title}</Text>
            ) : null}

            {/* Subtle Divider between Title and Notes */}
            <View style={[styles.cardDivider, { backgroundColor: colors.borderSubtle }]} />

            {/* Notes Section inside Task Card */}
            <View style={styles.subFieldHeaderRow}>
              <Text style={[styles.subFieldLabel, { color: colors.textMuted }]}>
                NOTES & CONTEXT
              </Text>
            </View>
            <View
              style={[
                styles.notesWrapper,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <TextInput
                placeholder="Add notes, bullet points, context or instructions..."
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[styles.notesInput, typography.body, { color: colors.text }]}
              />
            </View>
          </View>

          {/* CARD 2: SCHEDULE & TIMING (Due Date + Time Setting) */}
          <View
            style={[
              styles.cardContainer,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            {/* Schedule Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <View style={[styles.sectionIconBadge, { backgroundColor: `${activeColorTheme}20` }]}>
                  <Text style={styles.sectionIconEmoji}>📅</Text>
                </View>
                <Text style={[styles.cardHeaderLabel, { color: colors.textSecondary }]}>
                  SCHEDULE & TIME
                </Text>
              </View>
            </View>

            {/* Due Date Hero Card */}
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setDatePickerVisible(true);
              }}
              style={[
                styles.dateHeroTile,
                {
                  backgroundColor: colors.surface,
                  borderColor: errors.date ? colors.danger : colors.borderSubtle,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select due date. Currently ${formattedDisplayDate}`}
            >
              <View style={styles.dateTileLeft}>
                <View
                  style={[
                    styles.dateIconSquircle,
                    { backgroundColor: `${activeColorTheme}18` },
                  ]}
                >
                  <Text style={styles.dateSquircleEmoji}>📅</Text>
                </View>
                <View style={styles.dateTileTextCol}>
                  <Text style={[styles.dateTileSublabel, { color: colors.textMuted }]}>
                    DUE DATE (DEADLINE)
                  </Text>
                  <Text
                    style={[
                      styles.dateTileValue,
                      typography.title,
                      { color: colors.text },
                    ]}
                  >
                    {formattedDisplayDate}
                  </Text>
                </View>
              </View>
              <View style={[styles.changeDatePill, { backgroundColor: `${activeColorTheme}18` }]}>
                <Text style={[styles.changeDatePillText, { color: activeColorTheme }]}>
                  Change ›
                </Text>
              </View>
            </TouchableOpacity>
            {errors.date ? (
              <Text style={[styles.fieldErrorText, { color: colors.danger }]}>{errors.date}</Text>
            ) : null}

            {/* Subtle Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.borderSubtle }]} />

            {/* Timing Mode Segmented Tabs */}
            <View
              style={[
                styles.timingSegmentContainer,
                { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  setIsAllDay(true);
                  setIsOvernight(false);
                  if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                }}
                style={[
                  styles.timingSegmentBtn,
                  isAllDay && [styles.timingSegmentBtnActive, { backgroundColor: activeColorTheme }],
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Switch to all-day task"
              >
                <Text
                  style={[
                    styles.timingSegmentText,
                    isAllDay ? styles.timingSegmentTextActive : { color: colors.textSecondary },
                  ]}
                >
                  ☀️ All-Day Task
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIsAllDay(false);
                  if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                  if (!startTime) {
                    const nextSlot = getNextUpcomingHourTime();
                    const endSlot = addMinutesToTime(nextSlot, 60);
                    setStartTime(nextSlot);
                    setEndTime(endSlot.time);
                    setIsOvernight(endSlot.isOvernight);
                  }
                }}
                style={[
                  styles.timingSegmentBtn,
                  !isAllDay && [styles.timingSegmentBtnActive, { backgroundColor: activeColorTheme }],
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Switch to scheduled time"
              >
                <Text
                  style={[
                    styles.timingSegmentText,
                    !isAllDay ? styles.timingSegmentTextActive : { color: colors.textSecondary },
                  ]}
                >
                  ⏰ Scheduled Time
                </Text>
              </TouchableOpacity>
            </View>

            {/* All-Day Mode Explanation Tile */}
            {isAllDay && (
              <View
                style={[
                  styles.allDayHeroBanner,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={styles.allDayHeroEmoji}>☀️</Text>
                <View style={styles.allDayHeroTextCol}>
                  <Text style={[styles.allDayHeroTitle, { color: colors.text }]}>
                    All-Day Task
                  </Text>
                  <Text style={[styles.allDayHeroSubtitle, { color: colors.textMuted }]}>
                    No specific time block. Due anytime on {formattedDisplayDate}.
                  </Text>
                </View>
              </View>
            )}

            {/* Scheduled Time Section (When not all-day) */}
            {!isAllDay && (
              <>
                <View style={styles.timeSlotsRow}>
                  {/* Start Time Card */}
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setTimePickerMode('start');
                    }}
                    style={[
                      styles.timeTile,
                      {
                        backgroundColor: colors.surface,
                        borderColor: errors.time ? colors.danger : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Pick start time"
                  >
                    <View style={styles.timeTileHeader}>
                      <Text style={[styles.timeTileLabel, { color: colors.textMuted }]}>
                        START TIME
                      </Text>
                    </View>
                    <Text style={[styles.timeTileValue, { color: colors.text }]}>
                      ⏰ {startTime ? formatTimeTo12H(startTime) : 'Select Start'}
                    </Text>
                  </TouchableOpacity>

                  {/* End Time Card */}
                  <View
                    style={[
                      styles.timeTile,
                      {
                        backgroundColor: colors.surface,
                        borderColor: errors.time ? colors.danger : colors.borderSubtle,
                      },
                    ]}
                  >
                    <View style={styles.timeTileHeader}>
                      <Text style={[styles.timeTileLabel, { color: colors.textMuted }]}>
                        END TIME (OPTIONAL)
                      </Text>
                      {endTime ? (
                        <TouchableOpacity
                          onPress={() => {
                            setEndTime(undefined);
                            setIsOvernight(false);
                            if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                          }}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear end time"
                          style={[styles.clearEndPill, { backgroundColor: colors.surfaceHighlight }]}
                        >
                          <Text style={[styles.clearEndPillText, { color: colors.textMuted }]}>
                            ✕ Clear
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setTimePickerMode('end');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        endTime
                          ? `Pick end time, currently ${formatTimeTo12H(endTime)}`
                          : 'Pick end time'
                      }
                      style={styles.timeTileTouchArea}
                    >
                      <Text
                        style={[
                          styles.timeTileValue,
                          { color: endTime ? colors.text : colors.textMuted },
                        ]}
                      >
                        🏁 {endTime ? `${formatTimeTo12H(endTime)}${isOvernight ? ' (+1d)' : ''}` : 'No end time'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Duration Summary Banner */}
                <View
                  style={[
                    styles.durationSummaryCard,
                    {
                      backgroundColor: activeDurationDisplay ? `${activeColorTheme}14` : colors.surface,
                      borderColor: activeDurationDisplay ? `${activeColorTheme}35` : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={styles.durationSummaryIcon}>
                    {isOvernight ? '🌙' : '⏱️'}
                  </Text>
                  <View style={styles.durationSummaryTextCol}>
                    <Text
                      style={[
                        styles.durationSummaryTitle,
                        { color: activeDurationDisplay ? activeColorTheme : colors.textSecondary },
                      ]}
                    >
                      {activeDurationDisplay
                        ? `Scheduled Duration: ${activeDurationDisplay}`
                        : startTime
                        ? `Starts at ${formatTimeTo12H(startTime)} · Open-ended`
                        : 'Select a start time to begin'}
                    </Text>
                    {isOvernight ? (
                      <Text style={[styles.durationSummarySub, { color: colors.textMuted }]}>
                        Overnight task: finishes the following morning (+1 day)
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Start Time Quick Shortcuts */}
                <View style={styles.presetsSection}>
                  <Text style={[styles.subFieldLabel, { color: colors.textMuted, marginBottom: 8 }]}>
                    START TIME SHORTCUTS
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
                    {[
                      { label: '9:00 AM', time: '09:00' },
                      { label: '11:00 AM', time: '11:00' },
                      { label: '1:00 PM', time: '13:00' },
                      { label: '3:00 PM', time: '15:00' },
                      { label: '5:00 PM', time: '17:00' },
                      { label: '7:00 PM', time: '19:00' },
                      { label: '9:00 PM', time: '21:00' },
                    ].map((p) => {
                      const isSel = startTime === p.time;
                      return (
                        <TouchableOpacity
                          key={p.label}
                          onPress={() => {
                            const oldStartM = startTime ? parseTimeToMinutes(startTime) : null;
                            const newStartM = parseTimeToMinutes(p.time);
                            setStartTime(p.time);
                            if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));

                            if (endTime && oldStartM !== null && newStartM !== null) {
                              const endM = parseTimeToMinutes(endTime);
                              if (endM !== null) {
                                const prevDur = isOvernight ? endM + 1440 - oldStartM : endM - oldStartM;
                                const target = addMinutesToTime(p.time, prevDur > 0 ? prevDur : 60);
                                setEndTime(target.time);
                                setIsOvernight(target.isOvernight);
                              }
                            } else if (!endTime) {
                              const target = addMinutesToTime(p.time, 60);
                              setEndTime(target.time);
                              setIsOvernight(target.isOvernight);
                            }
                          }}
                          style={[
                            styles.presetChip,
                            {
                              backgroundColor: isSel ? `${activeColorTheme}25` : colors.surface,
                              borderColor: isSel ? activeColorTheme : colors.borderSubtle,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Set start time to ${p.label}`}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              { color: isSel ? activeColorTheme : colors.textSecondary },
                            ]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Duration / End Time Shortcuts */}
                {startTime ? (
                  <View style={styles.presetsSection}>
                    <Text style={[styles.subFieldLabel, { color: colors.textMuted, marginBottom: 8 }]}>
                      DURATION / END TIME SHORTCUTS
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
                      {[
                        { label: '+15m', mins: 15 },
                        { label: '+30m', mins: 30 },
                        { label: '+45m', mins: 45 },
                        { label: '+1 hr', mins: 60 },
                        { label: '+1.5 hr', mins: 90 },
                        { label: '+2 hrs', mins: 120 },
                        { label: '+3 hrs', mins: 180 },
                      ].map((p) => {
                        const sM = parseTimeToMinutes(startTime);
                        const eM = endTime ? parseTimeToMinutes(endTime) : null;
                        const curDuration = sM !== null && eM !== null ? (isOvernight ? eM + 1440 - sM : eM - sM) : null;
                        const isSel = curDuration === p.mins;
                        return (
                          <TouchableOpacity
                            key={p.label}
                            onPress={() => {
                              const res = addMinutesToTime(startTime, p.mins);
                              setEndTime(res.time);
                              setIsOvernight(res.isOvernight);
                              if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                            }}
                            style={[
                              styles.presetChip,
                              {
                                backgroundColor: isSel ? activeColorTheme : colors.surface,
                                borderColor: isSel ? activeColorTheme : colors.borderSubtle,
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Set duration to ${p.label}`}
                          >
                            <Text
                              style={[
                                styles.presetChipText,
                                { color: isSel ? '#FFFFFF' : colors.textSecondary },
                              ]}
                            >
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {endTime ? (
                        <TouchableOpacity
                          onPress={() => {
                            setEndTime(undefined);
                            setIsOvernight(false);
                            if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                          }}
                          style={[
                            styles.presetChip,
                            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Clear end time"
                        >
                          <Text style={[styles.presetChipText, { color: colors.danger || '#EF4444' }]}>
                            ✕ No End
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Overnight Cross-Midnight Toggle Bar */}
                {isTimeEarlierOrEqual && (
                  <TouchableOpacity
                    onPress={() => {
                      const nextVal = !isOvernight;
                      setIsOvernight(nextVal);
                      if (nextVal && errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                    }}
                    style={[
                      styles.overnightCard,
                      {
                        backgroundColor: isOvernight ? `${activeColorTheme}18` : colors.warningBg,
                        borderColor: isOvernight ? activeColorTheme : colors.warning,
                      },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isOvernight }}
                    accessibilityLabel={`Overnight task toggle. Finishes next day. Currently ${isOvernight ? 'enabled' : 'disabled'}`}
                  >
                    <Text style={styles.overnightIcon}>{isOvernight ? '🌙' : '⚠️'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.overnightLabel,
                          { color: isOvernight ? activeColorTheme : colors.warning },
                        ]}
                      >
                        {isOvernight
                          ? 'Overnight Task (Finishes next day)'
                          : 'End time is next day. Tap to mark as Overnight (+1d)'}
                      </Text>
                      <Text style={[styles.overnightSubtext, { color: colors.textMuted }]}>
                        {isOvernight
                          ? `Starts ${startTime ? formatTimeTo12H(startTime) : ''}, finishes ${endTime ? formatTimeTo12H(endTime) : ''} the following morning`
                          : 'Tap to schedule past midnight without validation error'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.overnightBadge,
                        { backgroundColor: isOvernight ? activeColorTheme : colors.surfaceHighlight },
                      ]}
                    >
                      <Text style={{ color: isOvernight ? '#FFFFFF' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                        {isOvernight ? 'ACTIVE' : 'ENABLE'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </>
            )}

            {errors.time ? (
              <Text style={[styles.fieldErrorText, { color: colors.danger, marginTop: 8 }]}>
                {errors.time}
              </Text>
            ) : null}
          </View>

          {/* CARD 3: ORGANIZATION & CATEGORY */}
          <View
            style={[
              styles.cardContainer,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <View style={[styles.sectionIconBadge, { backgroundColor: `${activeColorTheme}20` }]}>
                  <Text style={styles.sectionIconEmoji}>🏷️</Text>
                </View>
                <Text style={[styles.cardHeaderLabel, { color: colors.textSecondary }]}>
                  CATEGORY
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContainer}
            >
              {/* Optional None Category Option */}
              <TouchableOpacity
                onPress={() => setCategoryId(undefined)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: !categoryId ? `${activeColorTheme}22` : colors.surface,
                    borderColor: !categoryId ? activeColorTheme : colors.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: !categoryId }}
                accessibilityLabel={`No Category${!categoryId ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: !categoryId ? activeColorTheme : colors.textSecondary },
                  ]}
                >
                  ∅ No Category
                </Text>
              </TouchableOpacity>

              {categories.map((c) => {
                const isSelected = categoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected ? `${c.color}28` : colors.surface,
                        borderColor: isSelected ? c.color : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Category ${c.name}${isSelected ? ', selected' : ''}`}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: isSelected ? c.color : colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {c.icon ? `${c.icon} ` : ''}{c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setNewCatModalVisible(true);
                }}
                style={[
                  styles.categoryChip,
                  styles.categoryChipDashed,
                  {
                    backgroundColor: colors.surface,
                    borderColor: activeColorTheme,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add New Category"
              >
                <Text style={[styles.categoryChipText, { color: activeColorTheme }]}>
                  + Add Category
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* CARD 4: STATUS SELECTOR (If Editing) */}
          {isEditing && (
            <View
              style={[
                styles.cardContainer,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleGroup}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: `${activeColorTheme}20` }]}>
                    <Text style={styles.sectionIconEmoji}>⚡</Text>
                  </View>
                  <Text style={[styles.cardHeaderLabel, { color: colors.textSecondary }]}>
                    TASK STATUS
                  </Text>
                </View>
              </View>
              <View style={styles.statusChipsContainer}>
                {statusConfig.map((s) => {
                  const isSelected = status === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setStatus(s.value)}
                      style={[
                        styles.statusChipItem,
                        {
                          backgroundColor: isSelected ? `${s.color}22` : colors.surface,
                          borderColor: isSelected ? s.color : colors.borderSubtle,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Status ${s.label}${isSelected ? ', selected' : ''}`}
                    >
                      <Text
                        style={[
                          styles.statusChipItemText,
                          { color: isSelected ? s.color : colors.textSecondary },
                        ]}
                      >
                        {s.icon} {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Metadata Display in Edit Mode */}
          {isEditing && (createdAt || updatedAt) && (() => {
            const parsedCreated = createdAt ? parseISO(createdAt) : null;
            const parsedUpdated = updatedAt ? parseISO(updatedAt) : null;
            const validCreated =
              parsedCreated && isValid(parsedCreated)
                ? format(parsedCreated, 'MMM d, yyyy h:mm a')
                : null;
            const validUpdated =
              parsedUpdated && isValid(parsedUpdated)
                ? format(parsedUpdated, 'MMM d, yyyy h:mm a')
                : null;

            if (!validCreated && !validUpdated) return null;

            return (
              <View
                style={[
                  styles.metadataCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                {validCreated ? (
                  <Text style={[styles.metadataText, { color: colors.textMuted }]}>
                    Created: {validCreated}
                  </Text>
                ) : null}
                {validUpdated ? (
                  <Text style={[styles.metadataText, { color: colors.textMuted, marginTop: 4 }]}>
                    Last updated: {validUpdated}
                  </Text>
                ) : null}
              </View>
            );
          })()}

          {/* Delete Button (If editing) */}
          {isEditing && (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isSaving}
              style={[
                styles.deleteCardButton,
                {
                  borderColor: `${colors.danger}60`,
                  backgroundColor: colors.dangerBg,
                  opacity: isSaving ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete Task"
            >
              <Text style={[styles.deleteButtonLabel, { color: colors.danger }]}>
                🗑 Delete Task
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Due Date Picker Modal (Lazy Mounted) */}
      {datePickerVisible && (
        <DateTimePickerModal
          visible={datePickerVisible}
          onClose={() => setDatePickerVisible(false)}
          mode="date"
          selectedDate={taskDate}
          onConfirm={(pickedDate) => {
            setTaskDate(pickedDate);
            setDatePickerVisible(false);
            if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
            if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
          }}
          title="Select Due Date"
        />
      )}

      {/* Recurrence End Date Picker Modal (Lazy Mounted) */}
      {endDatePickerVisible && (
        <DateTimePickerModal
          visible={endDatePickerVisible}
          onClose={() => setEndDatePickerVisible(false)}
          mode="date"
          selectedDate={recurrenceEndDate || taskDate}
          onConfirm={(pickedDate) => {
            if (taskDate && pickedDate < taskDate) {
              Alert.alert(
                'Invalid Repeat End Date',
                'Repeat end date cannot be earlier than the task due date.'
              );
              return;
            }
            setRecurrenceEndDate(pickedDate);
            setEndDatePickerVisible(false);
            if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
          }}
          title="Repeat Until (End Date)"
        />
      )}

      {/* Time Picker Modal (Lazy Mounted) */}
      {timePickerMode !== null && (
        <DateTimePickerModal
          visible={timePickerMode !== null}
          onClose={() => setTimePickerMode(null)}
          mode="time"
          selectedDate={taskDate}
          selectedTime={timePickerMode === 'end' ? (endTime || (startTime ? addMinutesToTime(startTime, 60).time : undefined)) : startTime}
          onConfirm={(_d, pickedTime) => {
            if (pickedTime) {
              if (timePickerMode === 'start') {
                const oldStartM = startTime ? parseTimeToMinutes(startTime) : null;
                const newStartM = parseTimeToMinutes(pickedTime);
                setStartTime(pickedTime);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));

                // Auto-advance end time to maintain duration or adjust overnight
                if (endTime && oldStartM !== null && newStartM !== null) {
                  const endM = parseTimeToMinutes(endTime);
                  if (endM !== null) {
                    const prevDuration = isOvernight ? endM + 1440 - oldStartM : endM - oldStartM;
                    const res = addMinutesToTime(pickedTime, prevDuration > 0 ? prevDuration : 60);
                    setEndTime(res.time);
                    setIsOvernight(res.isOvernight);
                  }
                }
              } else if (timePickerMode === 'end') {
                setEndTime(pickedTime);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                if (startTime) {
                  const sM = parseTimeToMinutes(startTime);
                  const eM = parseTimeToMinutes(pickedTime);
                  if (sM !== null && eM !== null) {
                    setIsOvernight(eM <= sM);
                  }
                } else {
                  // If start time was unset, auto-populate start time 1 hour earlier
                  const endM = parseTimeToMinutes(pickedTime);
                  if (endM !== null) {
                    const defStartM = endM >= 60 ? endM - 60 : 540;
                    const hh = String(Math.floor(defStartM / 60)).padStart(2, '0');
                    const mm = String(defStartM % 60).padStart(2, '0');
                    setStartTime(`${hh}:${mm}`);
                  }
                }
              }
            } else {
              // User selected "None" / cleared time in picker modal
              if (timePickerMode === 'start') {
                setStartTime(undefined);
                setEndTime(undefined);
                setIsOvernight(false);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
              } else if (timePickerMode === 'end') {
                setEndTime(undefined);
                setIsOvernight(false);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
              }
            }
            setTimePickerMode(null);
          }}
          title={timePickerMode === 'start' ? 'Select Start Time' : 'Select End Time'}
        />
      )}

      {/* Create Custom Category Modal (Lazy Mounted) */}
      {newCatModalVisible && (
        <CreateCategoryModal
          visible={newCatModalVisible}
          onClose={() => setNewCatModalVisible(false)}
          onCategoryCreated={handleCategoryCreated}
          accentColor={activeColorTheme}
        />
      )}
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
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonIcon: {
    fontSize: 15,
    fontWeight: '700',
  },
  navTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  navSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  saveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.full,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardContainer: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: 4,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconEmoji: {
    fontSize: 14,
  },
  cardHeaderLabel: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  charBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  charCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  titleInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 6,
  },
  clearBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  clearBtnIcon: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldErrorText: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
  },
  cardDivider: {
    height: 1,
    marginVertical: spacing.md,
  },
  subFieldHeaderRow: {
    marginBottom: spacing.xs,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  notesWrapper: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 110,
  },
  notesInput: {
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  dateHeroTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dateTileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  dateIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSquircleEmoji: {
    fontSize: 20,
  },
  dateTileTextCol: {
    flex: 1,
  },
  dateTileSublabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  dateTileValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  changeDatePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  changeDatePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timingSegmentContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    marginBottom: spacing.xs,
  },
  timingSegmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingSegmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  timingSegmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timingSegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  allDayHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  allDayHeroEmoji: {
    fontSize: 24,
  },
  allDayHeroTextCol: {
    flex: 1,
  },
  allDayHeroTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  allDayHeroSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  timeSlotsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  timeTile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  timeTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timeTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  clearEndPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  clearEndPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeTileTouchArea: {
    marginTop: 2,
  },
  timeTileValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  durationSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  durationSummaryIcon: {
    fontSize: 18,
  },
  durationSummaryTextCol: {
    flex: 1,
  },
  durationSummaryTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  durationSummarySub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  presetsSection: {
    marginTop: spacing.md,
  },
  presetsScroll: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  overnightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  overnightIcon: {
    fontSize: 16,
  },
  overnightLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  overnightSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  overnightBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  categoryScrollContainer: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipDashed: {
    borderStyle: 'dashed',
  },
  categoryChipText: {
    fontWeight: '700',
    fontSize: 12,
  },
  statusChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusChipItem: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statusChipItemText: {
    fontSize: 13,
    fontWeight: '700',
  },
  metadataCard: {
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  metadataText: {
    fontSize: 11,
    fontWeight: '500',
  },
  deleteCardButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  deleteButtonLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
});
