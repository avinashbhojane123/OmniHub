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
import { GoogleKeepNotesEditor } from '../components/GoogleKeepNotesEditor';
import { format, parseISO, addDays, isValid } from 'date-fns';
import {
  Task,
  TaskPriority,
  TaskStatus,
  Category,
  RecurrenceRule,
  RecurrenceType,
  EisenhowerQuadrant,
} from '../types';
import { taskRepository } from '../database/repositories/TaskRepository';
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
  initialPriority?: TaskPriority;
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

const DURATION_PRESETS = [
  { mins: 15, label: '15m' },
  { mins: 25, label: '🍅 25m', isPomodoro: true },
  { mins: 30, label: '30m' },
  { mins: 45, label: '45m' },
  { mins: 60, label: '1 hr' },
  { mins: 90, label: '1.5 hr' },
  { mins: 120, label: '2 hr' },
];

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

const REMINDER_OPTIONS = [
  { value: -1, label: 'No Reminder' },
  { value: 0, label: 'At time' },
  { value: 5, label: '5m before' },
  { value: 10, label: '10m before' },
  { value: 15, label: '15m before' },
  { value: 30, label: '30m before' },
  { value: 60, label: '1h before' },
  { value: 1440, label: '1d before' },
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
  const initParamPrio = route.params?.initialPriority || 'medium';
  const initParamHasTime = Boolean(initParamStart);

  // Form State
  const [title, setTitle] = useState(() => (taskId ? '' : initParamTitle));
  const [categoryId, setCategoryId] = useState<string | undefined>(() => (taskId ? undefined : initParamCat));
  const [priority, setPriority] = useState<TaskPriority>(() => (taskId ? 'medium' : initParamPrio));
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

  // Reminder State (single select, -1 for none)
  const [reminderMinutes, setReminderMinutes] = useState<number>(() => {
    if (taskId) return 0;
    return initParamHasTime ? 0 : -1;
  });
  const [isLoudAlarm, setIsLoudAlarm] = useState<boolean>(() => (!taskId && initParamPrio === 'high'));

  // Eisenhower Matrix State
  const [eisenhowerQuadrant, setEisenhowerQuadrant] = useState<EisenhowerQuadrant | undefined>(undefined);

  // Time Tracking & Productivity State
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
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
    priority: TaskPriority;
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
    reminderMinutes: number;
    isLoudAlarm: boolean;
    eisenhowerQuadrant?: EisenhowerQuadrant;
    estimatedMinutes: number | null;
    taskAccentColor?: string;
  }>(() => ({
    title: taskId ? '' : initParamTitle,
    notes: taskId ? '' : initParamNotes,
    categoryId: taskId ? undefined : initParamCat,
    priority: taskId ? 'medium' : initParamPrio,
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
    reminderMinutes: 0,
    isLoudAlarm: !taskId && initParamPrio === 'high',
    eisenhowerQuadrant: undefined,
    estimatedMinutes: null,
    taskAccentColor: undefined,
  }));

  // Composite route key to accurately track route param transitions between edits and new tasks
  const routeParamKey = useMemo(() => {
    if (taskId) return `edit_${taskId}`;
    return `new_${route.params?.initialTitle || ''}_${route.params?.initialNotes || ''}_${route.params?.initialDate || ''}_${route.params?.initialStartTime || ''}_${route.params?.initialEndTime || ''}_${route.params?.initialCategoryId || ''}_${route.params?.initialPriority || ''}`;
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
            setPriority(directTask.priority || 'medium');
            setStatus(directTask.status || 'pending');
            setNotes(directTask.notes || directTask.description || '');

            const rawDate = directTask.date || format(new Date(), 'yyyy-MM-dd');
            const candidateDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
            const resolvedDate = isValid(parseISO(candidateDate)) ? candidateDate : format(new Date(), 'yyyy-MM-dd');
            setTaskDate(resolvedDate);
            setIsAllDay(!hasTime);
            setStartTime(directTask.startTime);
            setEndTime(directTask.endTime);

            // Reminders
            const initialRem =
              directTask.reminderMinutes !== undefined && directTask.reminderMinutes !== null
                ? directTask.reminderMinutes
                : -1;
            setReminderMinutes(initialRem);

            // Recurrence Rule & metadata preservation
            const rule: RecurrenceRule | undefined = directTask.recurrenceRule;
            setExistingRecurrenceRule(rule);
            const initialLoudAlarm =
              rule?.isLoudAlarm !== undefined ? Boolean(rule.isLoudAlarm) : directTask.priority === 'high';
            setIsLoudAlarm(initialLoudAlarm);

            const resolvedRecType = rule?.type || 'none';
            setRecurrenceType(resolvedRecType);
            const resolvedInterval = rule?.interval || 1;
            setRecurrenceInterval(resolvedInterval);
            const resolvedDays = rule?.daysOfWeek || [];
            setRecurrenceDaysOfWeek(resolvedDays);
            const resolvedEndDate = rule?.endDate;
            setRecurrenceEndDate(resolvedEndDate);
            const resolvedOvernight = Boolean(rule?.isOvernight);
            setIsOvernight(resolvedOvernight);

            setEisenhowerQuadrant(rule?.eisenhowerQuadrant);
            setTaskAccentColor(rule?.accentColor);

            setSeriesId(directTask.seriesId);
            setCreatedAt(directTask.createdAt);
            setUpdatedAt(directTask.updatedAt);

            // Estimated duration
            let resolvedEstMinutes: number | null = rule?.estimatedMinutes ?? null;
            if (resolvedEstMinutes === null && directTask.startTime && directTask.endTime) {
              const sM = parseTimeToMinutes(directTask.startTime);
              const eM = parseTimeToMinutes(directTask.endTime);
              if (sM !== null && eM !== null) {
                const diff = resolvedOvernight ? eM + 1440 - sM : eM - sM;
                if (diff > 0) resolvedEstMinutes = diff;
              }
            }
            setEstimatedMinutes(resolvedEstMinutes);

            setInitialSnapshot({
              title: directTask.title || '',
              notes: directTask.notes || directTask.description || '',
              categoryId: directTask.categoryId,
              priority: directTask.priority || 'medium',
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
              reminderMinutes: initialRem,
              isLoudAlarm: initialLoudAlarm,
              eisenhowerQuadrant: rule?.eisenhowerQuadrant,
              estimatedMinutes: resolvedEstMinutes,
              taskAccentColor: rule?.accentColor,
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
        const initPrio = route.params?.initialPriority || 'medium';
        const initHasTime = Boolean(initStart);

        setTitle(initTitle);
        setNotes(initNotes);
        setTaskDate(initDate);
        setCategoryId(initCat);
        setPriority(initPrio);
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
        setReminderMinutes(0);
        setIsLoudAlarm(initPrio === 'high');
        setEisenhowerQuadrant(undefined);
        setEstimatedMinutes(null);
        setTaskAccentColor(undefined);
        setCreatedAt(undefined);
        setUpdatedAt(undefined);
        setErrors({});

        setInitialSnapshot({
          title: initTitle,
          notes: initNotes,
          categoryId: initCat,
          priority: initPrio,
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
          reminderMinutes: 0,
          isLoudAlarm: initPrio === 'high',
          eisenhowerQuadrant: undefined,
          estimatedMinutes: null,
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
    route.params?.initialPriority,
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
        const dayTasks = await taskRepository.findByDate(taskDate);
        let nextDayTasks: Task[] = [];
        if (isOvernight) {
          try {
            const nextDateStr = format(addDays(parseISO(taskDate), 1), 'yyyy-MM-dd');
            nextDayTasks = await taskRepository.findByDate(nextDateStr);
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

        // Check against other tasks on the same start date
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

        // If overnight, check against tasks scheduled on the morning of the next day
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

  // Apply Estimated Duration Preset
  const applyDurationPreset = (mins: number) => {
    setEstimatedMinutes(mins);
    if (isAllDay) {
      setIsAllDay(false);
    }
    const baseStart = startTime || '09:00';
    if (!startTime) setStartTime('09:00');

    const startM = parseTimeToMinutes(baseStart);
    if (startM !== null) {
      const totalEndM = startM + mins;
      if (totalEndM >= 24 * 60) {
        setIsOvernight(true);
        const nextDayM = totalEndM - 24 * 60;
        const hh = String(Math.floor(nextDayM / 60)).padStart(2, '0');
        const mm = String(nextDayM % 60).padStart(2, '0');
        setEndTime(`${hh}:${mm}`);
      } else {
        setIsOvernight(false);
        const hh = String(Math.floor(totalEndM / 60)).padStart(2, '0');
        const mm = String(totalEndM % 60).padStart(2, '0');
        setEndTime(`${hh}:${mm}`);
      }
      if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
    }
  };

  // Toggle Reminder single-select
  const handleSelectReminder = (val: number) => {
    setReminderMinutes(val);
  };

  // Priority and Eisenhower synchronization; decoupled loud alarm mode
  const handleSelectPriority = (p: TaskPriority) => {
    setPriority(p);
    if (p === 'high') {
      setIsLoudAlarm(true);
    } else if (p === 'low') {
      setIsLoudAlarm(false);
    }
    // Clean up contradictory Eisenhower quadrant if manually changed
    if (eisenhowerQuadrant) {
      if (p === 'high' && eisenhowerQuadrant !== 'q1') {
        setEisenhowerQuadrant(undefined);
      } else if (p === 'low' && eisenhowerQuadrant !== 'q4') {
        setEisenhowerQuadrant(undefined);
      } else if (p === 'medium' && (eisenhowerQuadrant === 'q1' || eisenhowerQuadrant === 'q4')) {
        setEisenhowerQuadrant(undefined);
      }
    }
  };

  const handleToggleLoudAlarm = (val: boolean) => {
    setIsLoudAlarm(val);
  };

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

  // Handle Eisenhower Selection with clean priority alignment
  const handleSelectQuadrant = (q: EisenhowerQuadrant) => {
    if (eisenhowerQuadrant === q) {
      setEisenhowerQuadrant(undefined);
    } else {
      setEisenhowerQuadrant(q);
      if (q === 'q1') {
        setPriority('high');
        setIsLoudAlarm(true);
      } else if (q === 'q2') {
        setPriority('medium');
        setIsLoudAlarm(false);
      } else if (q === 'q3') {
        setPriority('medium');
        setIsLoudAlarm(false);
      } else if (q === 'q4') {
        setPriority('low');
        setIsLoudAlarm(false);
      }
    }
  };

  // Dirty check
  const isSavedRef = useRef(false);
  const isDirty = useMemo(() => {
    return (
      title.trim() !== (initialSnapshot.title || '').trim() ||
      notes.trim() !== (initialSnapshot.notes || '').trim() ||
      taskDate !== initialSnapshot.taskDate ||
      priority !== initialSnapshot.priority ||
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
      reminderMinutes !== initialSnapshot.reminderMinutes ||
      isLoudAlarm !== initialSnapshot.isLoudAlarm ||
      eisenhowerQuadrant !== initialSnapshot.eisenhowerQuadrant ||
      estimatedMinutes !== initialSnapshot.estimatedMinutes ||
      taskAccentColor !== initialSnapshot.taskAccentColor
    );
  }, [
    title,
    notes,
    taskDate,
    priority,
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
    reminderMinutes,
    isLoudAlarm,
    eisenhowerQuadrant,
    estimatedMinutes,
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

    if (!taskDate || !isValid(parseISO(taskDate))) {
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
        eisenhowerQuadrant || taskAccentColor || estimatedMinutes !== null || isOvernight || isLoudAlarm
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
              isLoudAlarm: isLoudAlarm || undefined,
              eisenhowerQuadrant: eisenhowerQuadrant || undefined,
              accentColor: taskAccentColor || undefined,
              estimatedMinutes: estimatedMinutes ?? undefined,
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
                priority,
                categoryId: categoryId || null,
                status: st.id === taskId ? status : st.status,
                reminderMinutes,
                recurrenceRule: recurrenceRule || null,
                seriesId: resolvedSeriesId,
              })
            )
          );
          await refresh();
        } else {
          await updateTask(taskId, {
            title: title.trim(),
            description: cleanNotes || null,
            notes: cleanNotes || null,
            date: taskDate,
            startTime: normStart || null,
            endTime: normEnd || null,
            priority,
            categoryId: categoryId || null,
            status,
            reminderMinutes,
            recurrenceRule: recurrenceRule || null,
            seriesId: resolvedSeriesId,
          });
        }
      } else {
        await createTask({
          title: title.trim(),
          description: cleanNotes || undefined,
          notes: cleanNotes || undefined,
          date: taskDate,
          startTime: normStart,
          endTime: normEnd,
          priority,
          categoryId,
          reminderMinutes,
          recurrenceRule,
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

  // Priority options config
  const priorityConfig: { value: TaskPriority; label: string; color: string; icon: string }[] = [
    { value: 'low', label: 'Low', color: colors.priorityLow, icon: '🟢' },
    { value: 'medium', label: 'Medium', color: colors.priorityMedium, icon: '🟡' },
    { value: 'high', label: 'High', color: colors.priorityHigh, icon: '🔴' },
  ];

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

  // Check if chosen reminder trigger time for today or overdue task has already elapsed
  const isPastReminderForToday = useMemo(() => {
    if (reminderMinutes < 0) return false;
    if (!taskDate) return false;
    if (taskDate < todayStr) return true;
    if (taskDate > todayStr) return false;

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    if (isAllDay) {
      // All-day tasks alert at 9:00 AM (540 mins) minus reminderMinutes
      const triggerMin = 540 - Math.max(reminderMinutes, 0);
      return triggerMin < currentMin;
    }

    if (!startTime) return false;
    const startMin = parseTimeToMinutes(startTime);
    if (startMin === null) return false;
    const triggerMin = startMin - reminderMinutes;
    return triggerMin < currentMin;
  }, [isAllDay, startTime, reminderMinutes, taskDate, todayStr]);

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
        {/* Back / Cancel button hidden from frontend */}
        <View style={styles.navButton} />

        <Text style={[styles.navTitle, typography.title, { color: colors.text }]}>
          {isEditing ? 'Edit Task' : 'New Task'}
        </Text>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          style={[
            styles.saveBtn,
            { backgroundColor: activeColorTheme, opacity: isSaving ? 0.7 : 1 },
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

          {/* Task Title Input */}
          <View style={styles.formGroup}>
            <View style={styles.titleLabelRow}>
              <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
                TASK TITLE *
              </Text>
              <Text
                style={[
                  styles.charCount,
                  typography.micro,
                  { color: title.length >= 240 ? colors.danger : colors.textMuted },
                ]}
              >
                {title.length}/250 chars
              </Text>
            </View>
            <View
              style={[
                styles.titleInputContainer,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: errors.title
                    ? colors.danger
                    : taskAccentColor
                    ? `${taskAccentColor}80`
                    : colors.borderSubtle,
                },
              ]}
            >
              <TextInput
                placeholder="e.g. Design review, Team meeting, Workout..."
                placeholderTextColor={colors.textMuted}
                value={title}
                maxLength={250}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onChangeText={(txt) => {
                  setTitle(txt);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                }}
                style={[
                  styles.titleTextInput,
                  typography.title,
                  {
                    color: colors.text,
                  },
                ]}
                autoFocus={!isEditing}
              />
              {title.length > 0 && (
                <TouchableOpacity
                  onPress={() => setTitle('')}
                  style={styles.clearTitleBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear title"
                >
                  <Text style={[styles.clearTitleText, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {errors.title ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>{errors.title}</Text>
            ) : null}
          </View>

          {/* Schedule Section: Due Date & Quick Presets */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
              DUE DATE (DEADLINE)
            </Text>

            {/* Quick Date Presets */}
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                onPress={() => {
                  setTaskDate(todayStr);
                  if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
                  if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
                }}
                style={[
                  styles.quickDateBtn,
                  {
                    backgroundColor:
                      taskDate === todayStr ? `${activeColorTheme}25` : colors.surfaceElevated,
                    borderColor: taskDate === todayStr ? activeColorTheme : colors.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: taskDate === todayStr }}
                accessibilityLabel={`Due today${taskDate === todayStr ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    { color: taskDate === todayStr ? activeColorTheme : colors.textSecondary },
                  ]}
                >
                  ⚡ Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setTaskDate(tomorrowStr);
                  if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
                  if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
                }}
                style={[
                  styles.quickDateBtn,
                  {
                    backgroundColor:
                      taskDate === tomorrowStr ? `${activeColorTheme}25` : colors.surfaceElevated,
                    borderColor: taskDate === tomorrowStr ? activeColorTheme : colors.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: taskDate === tomorrowStr }}
                accessibilityLabel={`Due tomorrow${taskDate === tomorrowStr ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    { color: taskDate === tomorrowStr ? activeColorTheme : colors.textSecondary },
                  ]}
                >
                  🌅 Tomorrow
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setDatePickerVisible(true);
                }}
                style={[
                  styles.quickDateBtn,
                  {
                    backgroundColor:
                      taskDate !== todayStr && taskDate !== tomorrowStr
                        ? `${activeColorTheme}25`
                        : colors.surfaceElevated,
                    borderColor:
                      taskDate !== todayStr && taskDate !== tomorrowStr
                        ? activeColorTheme
                        : colors.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Change due date"
              >
                <Text
                  style={[
                    styles.quickDateText,
                    styles.changeDateQuickText,
                    {
                      color:
                        taskDate !== todayStr && taskDate !== tomorrowStr
                          ? activeColorTheme
                          : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  📅 Change Due Date
                </Text>
              </TouchableOpacity>
            </View>

            {/* Date Picker Trigger Card */}
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setDatePickerVisible(true);
              }}
              style={[
                styles.dateCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: errors.date ? colors.danger : colors.borderSubtle,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select due date. Currently ${formattedDisplayDate}`}
            >
              <View style={styles.dateCardLeft}>
                <Text style={styles.dateCardIcon}>📅</Text>
                <Text style={[styles.dateCardText, typography.title, { color: colors.text }]}>
                  {formattedDisplayDate}
                </Text>
              </View>
              <Text style={[styles.dateCardChange, { color: activeColorTheme }]}>Change Due Date ›</Text>
            </TouchableOpacity>
            {errors.date ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>{errors.date}</Text>
            ) : null}
          </View>

          {/* Time Picker Section */}
          <View style={styles.formGroup}>
            <View style={styles.timeHeaderRow}>
              <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
                TIME SETTING
              </Text>
              <View style={styles.allDayToggleRow}>
                <Text style={[styles.allDayLabel, { color: colors.textSecondary }]}>All-Day</Text>
                <Switch
                  value={isAllDay}
                  onValueChange={(val) => {
                    setIsAllDay(val);
                    if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                    if (val) {
                      setIsOvernight(false);
                      if (reminderMinutes === 0) {
                        setReminderMinutes(-1);
                      }
                    } else if (!startTime) {
                      setStartTime('09:00');
                      setEndTime('10:00');
                      setIsOvernight(false);
                      if (reminderMinutes === -1) {
                        setReminderMinutes(0);
                      }
                    }
                  }}
                  trackColor={{ false: colors.borderSubtle, true: activeColorTheme }}
                  thumbColor="#FFFFFF"
                  accessibilityRole="switch"
                  accessibilityLabel="All-day task toggle"
                  accessibilityState={{ checked: isAllDay }}
                />
              </View>
            </View>

            {!isAllDay && (
              <View style={styles.timeSlotsRow}>
                {/* Start Time Button */}
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setTimePickerMode('start');
                  }}
                  style={[
                    styles.timeSlotCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: errors.time ? colors.danger : colors.borderSubtle,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Pick start time"
                >
                  <Text style={[styles.timeSlotLabel, { color: colors.textMuted }]}>STARTS</Text>
                  <Text style={[styles.timeSlotValue, { color: colors.text }]}>
                    ⏰ {startTime ? formatTimeTo12H(startTime) : 'Select'}
                  </Text>
                </TouchableOpacity>

                {/* End Time Slot */}
                <View
                  style={[
                    styles.timeSlotCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: errors.time ? colors.danger : colors.borderSubtle,
                    },
                  ]}
                >
                  <View style={styles.endSlotHeader}>
                    <Text style={[styles.timeSlotLabel, { color: colors.textMuted }]}>ENDS (OPTIONAL)</Text>
                    {endTime ? (
                      <TouchableOpacity
                        onPress={() => {
                          setEndTime(undefined);
                          setEstimatedMinutes(null);
                          setIsOvernight(false);
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear end time"
                      >
                        <Text style={[styles.clearEndText, { color: colors.textMuted }]}>✕ Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setTimePickerMode('end');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={endTime ? `Pick end time, currently ${formatTimeTo12H(endTime)}` : 'Pick end time'}
                    style={styles.timeSlotTouchArea}
                  >
                    <Text style={[styles.timeSlotValue, { color: endTime ? colors.text : colors.textMuted }]}>
                      🏁 {endTime ? `${formatTimeTo12H(endTime)}${isOvernight ? ' (+1d)' : ''}` : 'No end time'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Overnight Cross-Midnight Toggle Bar */}
            {!isAllDay && isTimeEarlierOrEqual && (
              <TouchableOpacity
                onPress={() => {
                  const nextVal = !isOvernight;
                  setIsOvernight(nextVal);
                  if (nextVal && errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                }}
                style={[
                  styles.overnightToggleCard,
                  {
                    backgroundColor: isOvernight ? `${activeColorTheme}20` : colors.surfaceElevated,
                    borderColor: isOvernight ? activeColorTheme : colors.danger,
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOvernight }}
                accessibilityLabel={`Overnight task toggle. Finishes the next day. Currently ${isOvernight ? 'enabled' : 'disabled'}`}
              >
                <Text style={[styles.overnightIcon]}>{isOvernight ? '🌙' : '⚠️'}</Text>
                <Text style={[styles.overnightLabel, { color: isOvernight ? activeColorTheme : colors.text }]}>
                  {isOvernight
                    ? 'Overnight Task (Finishes the next day)'
                    : 'End time is earlier than start time. Tap to mark as Overnight (+1 day)'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Active Duration Display Badge */}
            {activeDurationDisplay && !isAllDay && (
              <View style={[styles.durationBadge, { backgroundColor: `${activeColorTheme}20`, borderColor: activeColorTheme }]}>
                <Text style={[styles.durationBadgeText, { color: activeColorTheme }]}>
                  ⏱️ Duration: {activeDurationDisplay}
                  {estimatedMinutes === 25 ? ' (🍅 Pomodoro block)' : ''}
                </Text>
              </View>
            )}

            {errors.time ? (
              <Text style={[styles.errorText, { color: colors.danger, marginTop: 6 }]}>
                {errors.time}
              </Text>
            ) : null}
          </View>

          {/* Section: ⏱️ Time Tracking & Estimated Effort */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
                ESTIMATED DURATION / POMODORO PRESETS
              </Text>
              {estimatedMinutes ? (
                <TouchableOpacity
                  onPress={() => setEstimatedMinutes(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Reset estimated duration"
                >
                  <Text style={[styles.resetText, { color: colors.textMuted }]}>Reset</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {DURATION_PRESETS.map((dp) => {
                const isSelected = estimatedMinutes === dp.mins;
                return (
                  <TouchableOpacity
                    key={dp.mins}
                    onPress={() => applyDurationPreset(dp.mins)}
                    style={[
                      styles.chipPill,
                      {
                        backgroundColor: isSelected ? `${activeColorTheme}30` : colors.surfaceElevated,
                        borderColor: isSelected ? activeColorTheme : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${dp.label} duration${isSelected ? ', selected' : ''}`}
                  >
                    <Text
                      style={[
                        styles.chipPillText,
                        { color: isSelected ? activeColorTheme : colors.textSecondary },
                      ]}
                    >
                      {dp.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Priority Selector */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
              PRIORITY
            </Text>
            <View style={styles.priorityRow}>
              {priorityConfig.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => handleSelectPriority(p.value)}
                    style={[
                      styles.priorityChip,
                      {
                        backgroundColor: isSelected ? `${p.color}25` : colors.surfaceElevated,
                        borderColor: isSelected ? p.color : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Priority ${p.label}`}
                  >
                    <Text style={styles.priorityEmoji}>{p.icon}</Text>
                    <Text
                      style={[
                        styles.priorityChipText,
                        { color: isSelected ? p.color : colors.textSecondary },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Status Selector (If Editing) */}
          {isEditing && (
            <View style={styles.formGroup}>
              <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
                TASK STATUS
              </Text>
              <View style={styles.statusRow}>
                {statusConfig.map((s) => {
                  const isSelected = status === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setStatus(s.value)}
                      style={[
                        styles.statusChip,
                        {
                          backgroundColor: isSelected ? `${s.color}25` : colors.surfaceElevated,
                          borderColor: isSelected ? s.color : colors.borderSubtle,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Status ${s.label}${isSelected ? ', selected' : ''}`}
                    >
                      <Text style={[styles.statusChipText, { color: isSelected ? s.color : colors.textSecondary }]}>
                        {s.icon} {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Section: 🔔 Reminders & Loud Alarm Mode */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
                REMINDER
              </Text>
              <View style={styles.allDayToggleRow}>
                <Text style={[styles.allDayLabel, { color: colors.textSecondary }]}>🚨 Loud Alarm</Text>
                <Switch
                  value={isLoudAlarm}
                  onValueChange={handleToggleLoudAlarm}
                  trackColor={{ false: colors.borderSubtle, true: colors.danger }}
                  thumbColor="#FFFFFF"
                  accessibilityRole="switch"
                  accessibilityLabel="Loud alarm mode toggle"
                  accessibilityState={{ checked: isLoudAlarm }}
                />
              </View>
            </View>

            {isAllDay && (
              <Text style={[styles.reminderHintText, { color: colors.textMuted }]}>
                ℹ️ All-day reminders alert at 9:00 AM on due date
              </Text>
            )}

            {isPastReminderForToday && (
              <Text style={[styles.reminderHintText, { color: colors.warning }]}>
                ⚠️ Scheduled reminder time has already passed {taskDate < todayStr ? 'for this overdue task' : 'for today'}.
              </Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {/* Dynamic Chip for Custom Reminder Value */}
              {reminderMinutes > 0 && !REMINDER_OPTIONS.some((rem) => rem.value === reminderMinutes) && (
                <TouchableOpacity
                  key="custom_rem"
                  onPress={() => handleSelectReminder(reminderMinutes)}
                  style={[
                    styles.chipPill,
                    {
                      backgroundColor: `${activeColorTheme}25`,
                      borderColor: activeColorTheme,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel={`Custom ${reminderMinutes} minutes reminder, selected`}
                >
                  <Text style={[styles.chipPillText, { color: activeColorTheme }]}>
                    ✓ ⏰ {reminderMinutes}m before (Custom)
                  </Text>
                </TouchableOpacity>
              )}

              {REMINDER_OPTIONS.map((rem) => {
                const isSelected = reminderMinutes === rem.value;
                return (
                  <TouchableOpacity
                    key={rem.value}
                    onPress={() => handleSelectReminder(rem.value)}
                    style={[
                      styles.chipPill,
                      {
                        backgroundColor: isSelected ? `${activeColorTheme}25` : colors.surfaceElevated,
                        borderColor: isSelected ? activeColorTheme : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${rem.label} reminder${isSelected ? ', selected' : ''}`}
                  >
                    <Text style={[styles.chipPillText, { color: isSelected ? activeColorTheme : colors.textSecondary }]}>
                      {isSelected ? '✓ ' : ''}{rem.value === -1 ? '🔕 None' : `⏰ ${rem.label}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Category Selector */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, typography.caption, { color: colors.textSecondary }]}>
              CATEGORY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {/* Optional None Category Option */}
              <TouchableOpacity
                onPress={() => setCategoryId(undefined)}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: !categoryId ? `${activeColorTheme}25` : colors.surfaceElevated,
                    borderColor: !categoryId ? activeColorTheme : colors.borderSubtle,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: !categoryId }}
                accessibilityLabel={`No Category${!categoryId ? ', selected' : ''}`}
              >
                <Text style={[styles.categoryPillText, { color: !categoryId ? activeColorTheme : colors.textSecondary }]}>
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
                      styles.categoryPill,
                      {
                        backgroundColor: isSelected ? `${c.color}35` : colors.surfaceElevated,
                        borderColor: isSelected ? c.color : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Category ${c.name}${isSelected ? ', selected' : ''}`}
                  >
                    <Text
                      style={[styles.categoryPillText, { color: isSelected ? c.color : colors.textSecondary }]}
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
                  styles.categoryPill,
                  styles.categoryPillDashed,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: activeColorTheme,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add New Category"
              >
                <Text style={[styles.categoryPillText, { color: activeColorTheme }]}>
                  + Add Category
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>



          {/* Google Keep Style Notes with Bullet Marks */}
          <GoogleKeepNotesEditor
            notes={notes}
            onChangeNotes={(newNotes) => setNotes(newNotes)}
            label="BULLET NOTES & CHECKLIST (GOOGLE KEEP STYLE)"
          />

          {/* Metadata Display in Edit Mode */}
          {isEditing && (createdAt || updatedAt) && (() => {
            const parsedCreated = createdAt ? parseISO(createdAt) : null;
            const parsedUpdated = updatedAt ? parseISO(updatedAt) : null;
            const validCreated =
              parsedCreated && isValid(parsedCreated) ? format(parsedCreated, 'MMM d, yyyy h:mm a') : null;
            const validUpdated =
              parsedUpdated && isValid(parsedUpdated) ? format(parsedUpdated, 'MMM d, yyyy h:mm a') : null;

            if (!validCreated && !validUpdated) return null;

            return (
              <View style={styles.metadataCard}>
                {validCreated ? (
                  <Text style={[styles.metadataText, { color: colors.textMuted }]}>
                    Created: {validCreated}
                  </Text>
                ) : null}
                {validUpdated ? (
                  <Text style={[styles.metadataText, { color: colors.textMuted, marginTop: 2 }]}>
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
                styles.deleteButton,
                {
                  borderColor: colors.danger,
                  backgroundColor: colors.surfaceElevated,
                  opacity: isSaving ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete Task"
            >
              <Text style={[styles.deleteText, { color: colors.danger }]}>🗑 Delete Task</Text>
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
          selectedTime={timePickerMode === 'end' ? (endTime || startTime) : startTime}
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
                    if (newStartM >= endM && !isOvernight) {
                      const targetEndM = newStartM + (prevDuration > 0 ? prevDuration : 60);
                      if (targetEndM >= 1440) {
                        const nextDayM = targetEndM - 1440;
                        const hh = String(Math.floor(nextDayM / 60)).padStart(2, '0');
                        const mm = String(nextDayM % 60).padStart(2, '0');
                        setEndTime(`${hh}:${mm}`);
                        setIsOvernight(true);
                      } else {
                        const hh = String(Math.floor(targetEndM / 60)).padStart(2, '0');
                        const mm = String(targetEndM % 60).padStart(2, '0');
                        setEndTime(`${hh}:${mm}`);
                        setIsOvernight(false);
                      }
                    } else if (newStartM < endM && isOvernight) {
                      setIsOvernight(false);
                    }
                  }
                }
              } else if (timePickerMode === 'end') {
                setEndTime(pickedTime);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
                if (startTime) {
                  const sM = parseTimeToMinutes(startTime);
                  const eM = parseTimeToMinutes(pickedTime);
                  if (sM !== null && eM !== null) {
                    if (eM <= sM) {
                      setIsOvernight(true);
                    } else {
                      setIsOvernight(false);
                    }
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
                setEstimatedMinutes(null);
                if (errors.time) setErrors((prev) => ({ ...prev, time: '' }));
              } else if (timePickerMode === 'end') {
                setEndTime(undefined);
                setIsOvernight(false);
                setEstimatedMinutes(null);
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
  reminderHintText: {
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '500',
  },
  titleLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  charCount: {
    fontSize: 10,
    fontWeight: '600',
  },
  titleInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  titleTextInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingVertical: 6,
  },
  clearTitleBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  clearTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickDateBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  changeDateQuickText: {
    fontSize: 11,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dateCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateCardIcon: {
    fontSize: 18,
  },
  dateCardText: {
    fontWeight: '600',
  },
  dateCardChange: {
    fontWeight: '700',
    fontSize: 13,
  },
  timeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  allDayToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  allDayLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeSlotsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  timeSlotCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  endSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeSlotLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  clearEndText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timeSlotValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  timeSlotTouchArea: {
    marginTop: 2,
  },
  overnightToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xs,
  },
  overnightIcon: {
    fontSize: 14,
  },
  overnightLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  durationBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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
  colorPaletteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  accentCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accentCircleActive: {
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  defaultAccentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  priorityEmoji: {
    fontSize: 13,
  },
  priorityChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  categoryPillDashed: {
    borderStyle: 'dashed',
  },
  categoryPillText: {
    fontWeight: '700',
    fontSize: 12,
  },
  metadataCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  metadataText: {
    fontSize: 11,
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
  keyboardAvoid: {
    flex: 1,
  },
});
