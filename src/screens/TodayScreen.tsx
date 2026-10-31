import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Alert,
  Platform,
  AppState,
  BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToday } from '../hooks/useToday';
import { useAppTheme } from '../hooks/useTheme';
import { NewHabitModal } from '../components/NewHabitModal';
import { ProfileModal, computeAgeStats } from '../components/ProfileModal';
import { CalendarEventModal } from '../components/CalendarEventModal';
import { ConflictBanner } from '../components/ConflictBanner';
import { FocusTimerModal } from '../components/FocusTimerModal';
import { NextUpCard } from '../components/today/NextUpCard';
import { LifeAgeBanner } from '../components/today/LifeAgeBanner';
import { TodayOverdueBanner } from '../components/today/TodayOverdueBanner';
import { TodayHabitsSection } from '../components/today/TodayHabitsSection';
import { TodayCalendarSection, CalendarFilterType } from '../components/today/TodayCalendarSection';
import { TodayTasksSection, TaskFilterType } from '../components/today/TodayTasksSection';
import { ProductivityInsights } from '../components/today/ProductivityInsights';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { statisticsService } from '../services/statistics/StatisticsService';
import { alarmService } from '../services/alarm/AlarmService';
import { HabitWithStreak, Task, CalendarEvent, ProductivityStats } from '../types';
import { radius, spacing } from '../theme';
import { formatTimeTo12H } from '../utils/time';
import { getHabitIconDetails } from '../utils/habitIcons';
import { SETTINGS_KEYS } from '../constants/settingsKeys';
import { googleSheetsSyncService } from '../services/backup/GoogleSheetsSyncService';
import { syncEventBus } from '../services/backup/SyncEventBus';
import { format, parseISO, isValid } from 'date-fns';

interface TodayScreenProps {
  navigation: any;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    todayTasks,
    overdueTasks,
    upcomingTask,
    unifiedNextUp,
    habits,
    calendarEvents,
    conflicts,
    completionPercentage,
    loading,
    refreshToday,
    toggleHabit,
    toggleHabitDate,
    deleteHabit,
    toggleTask,
    snoozeTask,
    deleteTask,
    deleteCalendarEvent,
    toggleEventStatus,
    completeAllPendingToday,
    toggleSubtask,
    toggleHabitSubtask,
    addHabitSubtask,
    deleteHabitSubtask,
  } = useToday();

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [exactAlarmPermitted, setExactAlarmPermitted] = useState<boolean>(true);
  const [exactAlarmDismissed, setExactAlarmDismissed] = useState<boolean>(false);
  const [overdueDismissedDate, setOverdueDismissedDate] = useState<string>('');
  const [dismissedOverdueCount, setDismissedOverdueCount] = useState<number>(0);
  const [showOverdueList, setShowOverdueList] = useState<boolean>(false);
  const [conflictBannerDismissed, setConflictBannerDismissed] = useState<boolean>(false);
  const [newHabitModalVisible, setNewHabitModalVisible] = useState(false);
  const [habitToEdit, setHabitToEdit] = useState<HabitWithStreak | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [eventFilter, setEventFilter] = useState<CalendarFilterType>('today');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('🐯');
  const [birthDate, setBirthDate] = useState<string>('');
  const [birthTime, setBirthTime] = useState<string>('');
  const [focusTimerVisible, setFocusTimerVisible] = useState<boolean>(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>(undefined);
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>('all');
  const [productivityStats, setProductivityStats] = useState<ProductivityStats | null>(null);

  // Stable date and hour state
  const [todayIso, setTodayIso] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [currentHour, setCurrentHour] = useState<number>(() => new Date().getHours());
  const [snoozeFeedback, setSnoozeFeedback] = useState<string | null>(null);

  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alarmPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (snoozeTimerRef.current) {
        clearTimeout(snoozeTimerRef.current);
      }
      if (alarmPreviewTimerRef.current) {
        clearTimeout(alarmPreviewTimerRef.current);
        alarmService.stopRinging();
      }
    };
  }, []);

  // Compute a serialized conflict signature to automatically reset dismissal when conflict details change
  const conflictsSignature = useMemo(() => {
    return conflicts.map((c) => `${c.itemA}-${c.itemB}-${c.time}`).sort().join('|');
  }, [conflicts]);

  useEffect(() => {
    setConflictBannerDismissed(false);
  }, [conflictsSignature]);

  const isOverdueBannerVisible =
    overdueTasks.length > 0 && (overdueDismissedDate !== todayIso || overdueTasks.length > dismissedOverdueCount);

  const formatTaskTime = useCallback((timeStr?: string) => {
    return formatTimeTo12H(timeStr);
  }, []);

  const loadUserAndSettings = useCallback(async () => {
    try {
      const [all, stats] = await Promise.all([
        settingsRepository.getAll(),
        statisticsService.getStats().catch(() => null),
      ]);
      if (!isMountedRef.current) return;

      const u = all[SETTINGS_KEYS.USER_NAME] || '';
      const av = all[SETTINGS_KEYS.USER_AVATAR] || '🐯';
      const bd = all.birthDate || '';
      const bt = all.birthTime || '';
      const dismissed = all[SETTINGS_KEYS.EXACT_ALARM_DISMISSED] || 'false';
      const dismissedOverdueDate = all[SETTINGS_KEYS.TODAY_DISMISSED_OVERDUE_DATE] || '';
      const dismissedOverdueCnt = parseInt(all[SETTINGS_KEYS.TODAY_DISMISSED_OVERDUE_COUNT] || '0', 10);

      setUserName(u);
      setUserAvatar(av);
      setBirthDate(bd);
      setBirthTime(bt);
      setExactAlarmDismissed(dismissed === 'true');
      setOverdueDismissedDate(dismissedOverdueDate);
      setDismissedOverdueCount(isNaN(dismissedOverdueCnt) ? 0 : dismissedOverdueCnt);
      if (stats) {
        setProductivityStats(stats);
      }
    } catch {
      // Graceful fallback
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    const currentToday = format(new Date(), 'yyyy-MM-dd');
    if (currentToday !== todayIso) {
      setTodayIso(currentToday);
    }
    await Promise.all([
      refreshToday(true),
      loadUserAndSettings(),
    ]);
  }, [todayIso, refreshToday, loadUserAndSettings]);

  const handleDeleteTask = useCallback((task: { id: string; title: string }) => {
    Alert.alert('Delete Task', `Are you sure you want to delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(task.id);
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to delete task');
          }
        },
      },
    ]);
  }, [deleteTask]);

  const handleDeleteHabit = useCallback((h: HabitWithStreak) => {
    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${h.name}" and all of its streak logs?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHabit(h.id);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  }, [deleteHabit]);

  const handleToggleTask = useCallback(async (task: Task) => {
    await toggleTask(task);
  }, [toggleTask]);

  const handleToggleSubtask = useCallback(
    async (task: Task, subtaskIndex: number) => {
      await toggleSubtask(task.id, subtaskIndex);
    },
    [toggleSubtask]
  );

  const handleCompleteAllPending = useCallback(async () => {
    await completeAllPendingToday();
  }, [completeAllPendingToday]);


  const handleToggleHabit = useCallback(async (habit: HabitWithStreak) => {
    await toggleHabit(habit);
  }, [toggleHabit]);

  const handleSnooze = useCallback(async (taskId: string, title?: string) => {
    await snoozeTask(taskId);
    setSnoozeFeedback(`Snoozed ${title ? `"${title}"` : 'task'} for 10 minutes`);
    if (snoozeTimerRef.current) {
      clearTimeout(snoozeTimerRef.current);
    }
    snoozeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSnoozeFeedback(null);
      }
    }, 3000);
  }, [snoozeTask]);

  const handleEditHabit = useCallback((habit: HabitWithStreak) => {
    setHabitToEdit(habit);
    setNewHabitModalVisible(true);
  }, []);

  const handleToggleHabitSubtask = useCallback(
    async (habit: HabitWithStreak, subtaskIndex: number) => {
      await toggleHabitSubtask(habit.id, subtaskIndex);
    },
    [toggleHabitSubtask]
  );

  const handleAddHabitSubtask = useCallback(
    async (habit: HabitWithStreak, subtaskText: string) => {
      await addHabitSubtask(habit.id, subtaskText);
    },
    [addHabitSubtask]
  );

  const handleDeleteHabitSubtask = useCallback(
    async (habit: HabitWithStreak, subtaskIndex: number) => {
      await deleteHabitSubtask(habit.id, subtaskIndex);
    },
    [deleteHabitSubtask]
  );

  const handlePressTask = useCallback((task: Task) => {
    navigation.navigate('CreateEditTask', { taskId: task.id });
  }, [navigation]);

  const handleSnoozeTask = useCallback((task: Task) => {
    handleSnooze(task.id, task.title);
  }, [handleSnooze]);

  const handleOpenNewEvent = useCallback(() => {
    setEventToEdit(null);
    setCalendarModalVisible(true);
  }, []);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setEventToEdit(event);
    setCalendarModalVisible(true);
  }, []);

  const handlePressNextUp = useCallback(() => {
    if (!unifiedNextUp) return;
    if (unifiedNextUp.type === 'task' && unifiedNextUp.rawTask) {
      navigation.navigate('CreateEditTask', { taskId: unifiedNextUp.rawTask.id });
    } else if (unifiedNextUp.type === 'calendar_event' && unifiedNextUp.rawEvent) {
      handleEditEvent(unifiedNextUp.rawEvent);
    } else if (unifiedNextUp.type === 'habit' && unifiedNextUp.rawHabit) {
      handleEditHabit(unifiedNextUp.rawHabit);
    }
  }, [navigation, unifiedNextUp, handleEditEvent, handleEditHabit]);

  const handleCompleteNextUp = useCallback(() => {
    if (!unifiedNextUp) return;
    if (unifiedNextUp.type === 'task' && unifiedNextUp.rawTask) {
      handleToggleTask(unifiedNextUp.rawTask);
    } else if (unifiedNextUp.type === 'calendar_event' && unifiedNextUp.rawEvent) {
      toggleEventStatus(unifiedNextUp.rawEvent);
    } else if (unifiedNextUp.type === 'habit' && unifiedNextUp.rawHabit) {
      handleToggleHabit(unifiedNextUp.rawHabit);
    }
  }, [unifiedNextUp, handleToggleTask, toggleEventStatus, handleToggleHabit]);

  const handleSnoozeNextUp = useCallback(() => {
    if (!unifiedNextUp) return;
    if (unifiedNextUp.type === 'task' && unifiedNextUp.rawTask) {
      handleSnooze(unifiedNextUp.rawTask.id, unifiedNextUp.rawTask.title);
    }
  }, [unifiedNextUp, handleSnooze]);

  const handleOpenProfile = useCallback(() => {
    setProfileModalVisible(true);
  }, []);

  const handleOpenNewHabit = useCallback(() => {
    setHabitToEdit(null);
    setNewHabitModalVisible(true);
  }, []);

  const pendingTodayTasks = useMemo(
    () => todayTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [todayTasks]
  );
  const completedTodayTasks = useMemo(
    () => todayTasks.filter((t) => t.status === 'completed'),
    [todayTasks]
  );
  const overdueTaskIds = useMemo(
    () => new Set(overdueTasks.map((t) => t.id)),
    [overdueTasks]
  );

  const displayedTodayTasks = useMemo(() => {
    if (taskFilter === 'pending') return pendingTodayTasks;
    if (taskFilter === 'completed') return completedTodayTasks;
    return todayTasks;
  }, [taskFilter, pendingTodayTasks, completedTodayTasks, todayTasks]);

  const calendarFilterCounts = useMemo(() => {
    return {
      all: calendarEvents.length,
      today: calendarEvents.filter((e) => e.date === todayIso).length,
      upcoming: calendarEvents.filter((e) => e.date > todayIso && e.status !== 'completed' && e.status !== 'dismissed').length,
    };
  }, [calendarEvents, todayIso]);

  const displayedEvents = useMemo(() => {
    let filtered = calendarEvents;
    if (eventFilter === 'today') {
      filtered = calendarEvents.filter((e) => e.date === todayIso);
    } else if (eventFilter === 'upcoming') {
      filtered = calendarEvents.filter((e) => e.date > todayIso && e.status !== 'completed' && e.status !== 'dismissed');
    }
    return [...filtered].sort((a, b) => {
      const cmp = (a.date || '').localeCompare(b.date || '');
      if (cmp !== 0) return cmp;
      return (a.time || '').localeCompare(b.time || '');
    });
  }, [calendarEvents, eventFilter, todayIso]);

  const handleDeleteEvent = useCallback((event: CalendarEvent) => {
    Alert.alert(
      'Delete Reminder',
      `Are you sure you want to delete "${event.title}"? Any scheduled alarm will be cancelled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCalendarEvent(event.id);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete event reminder');
            }
          },
        },
      ]
    );
  }, [deleteCalendarEvent]);

  const handleTestAlarm = useCallback((event: CalendarEvent) => {
    Alert.alert(
      'Test Alarm Siren',
      `Sound a 5-second test alarm preview for "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sound Alarm',
          style: 'destructive',
          onPress: async () => {
            if (alarmPreviewTimerRef.current) {
              clearTimeout(alarmPreviewTimerRef.current);
            }
            await alarmService.stopRinging();
            await alarmService.startRinging(
              `🔔 ${event.title}`,
              undefined,
              formatTimeTo12H(event.time) || event.time,
              'test_preview',
              event.description || 'Calendar Event Alarm Reminder'
            );
            alarmPreviewTimerRef.current = setTimeout(() => {
              alarmService.stopRinging();
              alarmPreviewTimerRef.current = null;
            }, 5000);
          },
        },
      ]
    );
  }, []);

  const handleGoBack = useCallback(() => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('WorkspaceSelect');
    }
  }, [navigation]);

  const handleOpenCreateTask = useCallback(() => {
    navigation.navigate('CreateEditTask');
  }, [navigation]);

  const handleToggleOverdueExpand = useCallback(() => {
    setShowOverdueList((prev) => !prev);
  }, []);

  const handleDismissExactAlarm = useCallback(async () => {
    setExactAlarmDismissed(true);
    await settingsRepository.set(SETTINGS_KEYS.EXACT_ALARM_DISMISSED, 'true').catch(() => { });
  }, []);

  const handleDismissOverdueBanner = useCallback(async () => {
    setOverdueDismissedDate(todayIso);
    setDismissedOverdueCount(overdueTasks.length);
    setShowOverdueList(false);
    await settingsRepository.set(SETTINGS_KEYS.TODAY_DISMISSED_OVERDUE_DATE, todayIso).catch(() => { });
    await settingsRepository.set(SETTINGS_KEYS.TODAY_DISMISSED_OVERDUE_COUNT, String(overdueTasks.length)).catch(() => { });
  }, [todayIso, overdueTasks.length]);

  useEffect(() => {
    const unsub = syncEventBus.subscribeToRestore(() => {
      refreshToday(true);
    });
    return () => unsub();
  }, [refreshToday]);

  useFocusEffect(
    useCallback(() => {
      const currentToday = format(new Date(), 'yyyy-MM-dd');
      if (currentToday !== todayIso) {
        setTodayIso(currentToday);
      }
      setCurrentHour(new Date().getHours());
      loadUserAndSettings();
      refreshToday(true);
      googleSheetsSyncService.triggerAutoSyncIfEnabled().catch(() => { });

      if (Platform.OS === 'android') {
        alarmService
          .checkExactAlarmPermission()
          .then((allowed) => {
            if (isMountedRef.current) {
              setExactAlarmPermitted(allowed);
            }
          })
          .catch(() => { });
      }

      const onBackPress = () => {
        handleGoBack();
        return true;
      };
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        backSub.remove();
      };
    }, [todayIso, loadUserAndSettings, refreshToday, handleGoBack])
  );

  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = Math.max(1000, tomorrow.getTime() - now.getTime());
    const timerId = setTimeout(() => {
      const newToday = format(new Date(), 'yyyy-MM-dd');
      setTodayIso(newToday);
      setCurrentHour(0);
      refreshToday(true);
    }, msUntilMidnight);

    return () => {
      clearTimeout(timerId);
    };
  }, [todayIso, refreshToday]);

  // Ensure midnight rollover is immediately applied when app resumes from background or device sleep
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const currentToday = format(new Date(), 'yyyy-MM-dd');
        if (currentToday !== todayIso) {
          setTodayIso(currentToday);
          refreshToday(true);
        }
        setCurrentHour(new Date().getHours());

        if (Platform.OS === 'android') {
          alarmService
            .checkExactAlarmPermission()
            .then((allowed) => {
              if (isMountedRef.current) {
                setExactAlarmPermitted(allowed);
              }
            })
            .catch(() => { });
        }
      }
    });
    return () => {
      subscription.remove();
    };
  }, [todayIso, refreshToday]);

  const currentDateObj = useMemo(() => {
    const parsed = parseISO(todayIso);
    return isValid(parsed) ? parsed : new Date();
  }, [todayIso]);

  const ageStats = useMemo(() => {
    if (!birthDate) return null;
    return computeAgeStats(birthDate);
  }, [birthDate]);

  const greeting = useMemo(() => {
    const greetingTime = currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';
    return userName.trim() ? `${greetingTime}, ${userName.trim()}` : greetingTime;
  }, [userName, currentHour]);

  const dateFormatted = useMemo(() => {
    return isValid(currentDateObj) ? format(currentDateObj, 'EEEE, d MMMM, yyyy') : format(new Date(), 'EEEE, d MMMM, yyyy');
  }, [currentDateObj]);

  const habitIconGetter = useCallback(
    (habit: HabitWithStreak) => getHabitIconDetails(habit, colors.surfaceHighlight),
    [colors.surfaceHighlight]
  );

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 24),
        },
      ]}
    >
      <StatusBar barStyle={colors.statusBar} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 60 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header: Greeting Bar & Profile Actions */}
        <View style={styles.headerTopBar}>
          <View style={styles.headerGreetingCol}>
            <Text
              style={[styles.greetingText, { color: colors.text }]}
              numberOfLines={2}
            >
              {greeting}
            </Text>
            <View style={styles.headerSubtitleRow}>
              <Text
                style={[styles.dateText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {dateFormatted}
              </Text>
              <View
                style={[
                  styles.offlinePill,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <View style={styles.offlineDot} />
                <Text style={[styles.offlinePillText, { color: colors.textMuted }]}>
                  Offline Ready
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={handleOpenProfile}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="User Profile and Age Stats"
              accessibilityHint="Opens user profile and life age milestone details"
            >
              <View
                style={[
                  styles.avatarBadge,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <Text style={styles.avatarEmoji}>{userAvatar}</Text>
              </View>
              <View
                style={[
                  styles.avatarEditPill,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <Text style={styles.avatarEditIcon}>✏️</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Life Age Milestones Banner */}
        <LifeAgeBanner
          ageStats={ageStats}
          userName={userName}
          birthTime={birthTime}
          onPress={handleOpenProfile}
        />

        {/* Snooze Notification Chip */}
        {snoozeFeedback && (
          <View style={[styles.snoozeChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.primary }]}>
            <Text style={[styles.snoozeChipText, { color: colors.primary }]}>
              💤 {snoozeFeedback}
            </Text>
            <TouchableOpacity
              onPress={() => setSnoozeFeedback(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss snooze feedback"
            >
              <Text style={[styles.snoozeCloseText, { color: colors.primary }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exact Alarm Permission Warning Banner for Android */}
        {Platform.OS === 'android' && !exactAlarmPermitted && !exactAlarmDismissed && (
          <View style={[styles.exactAlarmBanner, { backgroundColor: colors.warningBg, borderColor: colors.warning }]}>
            <TouchableOpacity
              style={styles.exactAlarmBannerContent}
              onPress={() => alarmService.openExactAlarmSettings()}
              activeOpacity={0.8}
            >
              <Text style={[styles.exactAlarmBannerText, { color: colors.warning }]}>
                ⚠️ Exact Alarms Restricted: Tap here to allow on-time habit alarms in Settings.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDismissExactAlarm}
              style={styles.exactAlarmBannerClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.exactAlarmBannerCloseText, { color: colors.warning }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overdue Tasks Alert Banner */}
        {isOverdueBannerVisible && (
          <TodayOverdueBanner
            tasks={overdueTasks}
            expanded={showOverdueList}
            onToggleExpand={handleToggleOverdueExpand}
            onDismiss={handleDismissOverdueBanner}
            onToggleTask={handleToggleTask}
            onPressTask={handlePressTask}
            onDeleteTask={handleDeleteTask}
            onSnoozeTask={handleSnoozeTask}
            formatTaskTime={formatTaskTime}
          />
        )}

        {/* Next Up / Spotlight Card - Supports Tasks, Calendar Events & Habits */}
        {unifiedNextUp && (
          <NextUpCard
            item={unifiedNextUp}
            onPress={handlePressNextUp}
            onComplete={handleCompleteNextUp}
            onSnooze={unifiedNextUp.type === 'task' ? handleSnoozeNextUp : undefined}
            formatTaskTime={formatTaskTime}
          />
        )}

        {/* Schedule Conflicts Banner if tasks overlap */}
        {conflicts && conflicts.length > 0 && !conflictBannerDismissed && (
          <View style={styles.conflictBannerWrapper}>
            <ConflictBanner
              conflicts={conflicts}
              onDismiss={() => setConflictBannerDismissed(true)}
            />
          </View>
        )}

        {/* Scheduled Tasks for Today */}
        <TodayTasksSection
          tasks={displayedTodayTasks}
          allTasks={todayTasks}
          totalCount={todayTasks.length}
          pendingCount={pendingTodayTasks.length}
          completedCount={completedTodayTasks.length}
          completionPercentage={completionPercentage}
          taskFilter={taskFilter}
          overdueTaskIds={overdueTaskIds}
          onSetTaskFilter={setTaskFilter}
          onOpenCreateTask={handleOpenCreateTask}
          onViewAllTasks={() => navigation.navigate('TasksScreen')}
          onCompleteAllPending={handleCompleteAllPending}
          onToggleTask={handleToggleTask}
          onPressTask={handlePressTask}
          onDeleteTask={handleDeleteTask}
          onSnoozeTask={handleSnoozeTask}
          onToggleSubtask={handleToggleSubtask}
          formatTaskTime={formatTaskTime}
        />

        {/* Habits Section */}
        <TodayHabitsSection
          habits={habits}
          onOpenNewHabit={handleOpenNewHabit}
          onToggleHabit={handleToggleHabit}
          onEditHabit={handleEditHabit}
          onDeleteHabit={handleDeleteHabit}
          onToggleHabitSubtask={handleToggleHabitSubtask}
          onAddHabitSubtask={handleAddHabitSubtask}
          onDeleteHabitSubtask={handleDeleteHabitSubtask}
          getIconDetails={habitIconGetter}
        />

        {/* Calendar Events & Reminders */}
        <TodayCalendarSection
          events={displayedEvents}
          allEventsCount={calendarEvents.length}
          filterCounts={calendarFilterCounts}
          eventFilter={eventFilter}
          todayIso={todayIso}
          onSetEventFilter={setEventFilter}
          onOpenNewEvent={handleOpenNewEvent}
          onEditEvent={handleEditEvent}
          onDeleteEvent={handleDeleteEvent}
          onTestAlarm={handleTestAlarm}
          onToggleStatus={toggleEventStatus}
        />

        {/* Productivity Insights Local On-Device Analytics */}
        <ProductivityInsights
          stats={productivityStats}
          todayTasksCount={todayTasks.length}
          todayCompletedTasksCount={completedTodayTasks.length}
          completionPercentage={completionPercentage}
        />
      </ScrollView>

      {/* Habit Creation / Edit Modal (Lazy Mounted) */}
      {newHabitModalVisible && (
        <NewHabitModal
          visible={newHabitModalVisible}
          onClose={() => {
            setNewHabitModalVisible(false);
            setHabitToEdit(null);
          }}
          onCreated={() => {
            setNewHabitModalVisible(false);
            setHabitToEdit(null);
            handleRefresh();
          }}
          habitToEdit={habitToEdit}
        />
      )}

      {/* Profile & Life Age Modal (Lazy Mounted) */}
      {profileModalVisible && (
        <ProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          onSaved={(data) => {
            setProfileModalVisible(false);
            setUserName(data.name);
            setUserAvatar(data.avatar);
            setBirthDate(data.birthDate);
            setBirthTime(data.birthTime || '');
            handleRefresh();
          }}
        />
      )}

      {/* Calendar Event Creation / Edit Modal (Lazy Mounted) */}
      {calendarModalVisible && (
        <CalendarEventModal
          visible={calendarModalVisible}
          initialDate={todayIso}
          onClose={() => {
            setCalendarModalVisible(false);
            setEventToEdit(null);
          }}
          onSaved={() => {
            setCalendarModalVisible(false);
            setEventToEdit(null);
            handleRefresh();
          }}
          eventToEdit={eventToEdit}
        />
      )}

      {/* Focus / Pomodoro Timer Modal (Lazy Mounted) */}

      {/* Focus / Pomodoro Timer Modal (Lazy Mounted) */}
      {focusTimerVisible && (
        <FocusTimerModal
          visible={focusTimerVisible}
          onClose={() => setFocusTimerVisible(false)}
          tasks={todayTasks}
          initialTaskId={focusTaskId}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backBtnText: {
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
    marginLeft: -2,
  },
  headerGreetingCol: {
    flex: 1,
    marginRight: 10,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 4,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  offlinePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  avatarButton: {
    position: 'relative',
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarEmoji: {
    fontSize: 24,
  },
  avatarEditPill: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  avatarEditIcon: {
    fontSize: 8,
  },
  snoozeChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snoozeChipText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  snoozeCloseText: {
    fontSize: 13,
    fontWeight: '700',
    paddingLeft: 8,
  },
  conflictBannerWrapper: {
    marginBottom: 8,
  },
  exactAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  exactAlarmBannerContent: {
    flex: 1,
  },
  exactAlarmBannerText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  exactAlarmBannerClose: {
    paddingLeft: spacing.sm,
  },
  exactAlarmBannerCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
