import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToday } from '../hooks/useToday';
import { useAppTheme } from '../hooks/useTheme';
import { NewHabitModal } from '../components/NewHabitModal';
import { ProfileModal, computeAgeStats } from '../components/ProfileModal';
import { ConflictBanner } from '../components/ConflictBanner';
import { HabitRow } from '../components/HabitRow';
import { BellIllustration } from '../components/BellIllustration';
import { ProgressBar } from '../components/ProgressBar';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { statisticsService } from '../services/statistics/StatisticsService';
import { calendarService } from '../services/calendar/CalendarService';
import { alarmService } from '../services/alarm/AlarmService';
import { HabitWithStreak, ProductivityStats } from '../types';
import { radius, spacing } from '../theme';
import { parseBulletNotes } from '../utils/bulletNotes';
import { format, subDays, isValid } from 'date-fns';

interface TodayScreenProps {
  navigation: any;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    todayTasks,
    habits,
    calendarEvents,
    conflicts,
    loading,
    refreshToday,
    toggleHabit,
    toggleHabitDate,
    deleteHabit,
    toggleTask,
  } = useToday();

  const [exactAlarmPermitted, setExactAlarmPermitted] = useState<boolean>(true);
  const [exactAlarmDismissed, setExactAlarmDismissed] = useState<boolean>(false);
  const [newHabitModalVisible, setNewHabitModalVisible] = useState(false);
  const [habitToEdit, setHabitToEdit] = useState<HabitWithStreak | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userName, setUserName] = useState('Avinash');
  const [birthDate, setBirthDate] = useState('2002-08-15');
  const [birthTime, setBirthTime] = useState('08:30 AM');
  const [stats, setStats] = useState<ProductivityStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');
  const [filterQuery, setFilterQuery] = useState('');

  const displayedHabits = habits.filter((h) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return h.name.toLowerCase().includes(q) || (h.description || '').toLowerCase().includes(q);
  });

  const displayedTasks = todayTasks.filter((t) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
  });

  // Calendar Event Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStartTime, setEventStartTime] = useState('10:00');
  const [eventEndTime, setEventEndTime] = useState('11:00');
  const [eventLocation, setEventLocation] = useState('');

  const handleCreateEvent = async () => {
    if (!eventTitle.trim()) {
      Alert.alert('Validation Error', 'Please enter an event title.');
      return;
    }
    const now = new Date();
    const startParts = (eventStartTime.trim() || '10:00').split(':').map(Number);
    const endParts = (eventEndTime.trim() || '11:00').split(':').map(Number);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startParts[0] || 10, startParts[1] || 0, 0, 0);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endParts[0] || 11, endParts[1] || 0, 0, 0);
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      await calendarService.createEvent({
        title: eventTitle.trim(),
        description: eventDesc.trim() || undefined,
        startTime: startIso,
        endTime: endIso,
        location: eventLocation.trim() || undefined,
        source: 'local',
        isAllDay: false,
      });
      setCalendarModalVisible(false);
      setEventTitle('');
      setEventDesc('');
      setEventStartTime('10:00');
      setEventEndTime('11:00');
      setEventLocation('');
      await refreshToday();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save event.');
    }
  };

  const handleDeleteEvent = (eventId: string, title: string) => {
    Alert.alert('Delete Event', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await calendarService.deleteEvent(eventId);
          await refreshToday();
        },
      },
    ]);
  };

  const loadStats = useCallback(async () => {
    try {
      const data = await statisticsService.getStats();
      setStats(data);
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
  }, []);

  const loadUser = useCallback(async () => {
    const u = await settingsRepository.get('userName', 'Avinash');
    const bd = await settingsRepository.get('birthDate', '2002-08-15');
    const bt = await settingsRepository.get('birthTime', '08:30 AM');
    setUserName(u);
    setBirthDate(bd);
    setBirthTime(bt);
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([refreshToday(), loadUser()]).catch(() => {});
      if (Platform.OS === 'android') {
        alarmService.checkExactAlarmPermission().then((allowed) => {
          setExactAlarmPermitted(allowed);
        }).catch(() => {});
      }
    }, [refreshToday, loadUser])
  );

  useEffect(() => {
    if (showStats) {
      loadStats();
    }
  }, [loadStats, showStats, habits, todayTasks]);

  const ageStats = computeAgeStats(birthDate);

  const now = new Date();
  const hour = now.getHours();
  const greetingTime =
    hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greeting = `${greetingTime}, ${userName}`;

  // Format today's date like "Wednesday, 7 October, 2026"
  const dateFormatted = format(now, 'EEEE, d MMMM, yyyy');

  // Last 7 days in chronological order (6 days ago -> today)
  const weekDays = [6, 5, 4, 3, 2, 1, 0].map((offset) => {
    const d = subDays(now, offset);
    return {
      iso: format(d, 'yyyy-MM-dd'),
      dayName: format(d, 'EEE'), // Mon, Tue...
      dayNumber: format(d, 'd'),
      isToday: offset === 0,
    };
  });



  const handleDeleteHabit = (h: HabitWithStreak) => {
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
  };

  const getHabitIconDetails = (habit: HabitWithStreak) => {
    if (habit.icon) {
      return { bg: '#F3E8FF', icon: habit.icon, defaultMin: '08:30 AM' };
    }
    const name = habit.name.toLowerCase();
    if (name.includes('water')) {
      return { bg: '#FFE9D6', icon: '🥛', defaultMin: '08:00 AM' };
    }
    if (name.includes('meditat') || name.includes('relax')) {
      return { bg: '#E4F4D8', icon: '🧘', defaultMin: '07:00 AM' };
    }
    if (name.includes('stretch') || name.includes('yoga')) {
      return { bg: '#FCE4EC', icon: '🤸', defaultMin: '07:30 AM' };
    }
    if (name.includes('walk') || name.includes('run') || name.includes('step')) {
      return { bg: '#FFE5CC', icon: '👟', defaultMin: '06:30 AM' };
    }
    if (name.includes('read') || name.includes('book')) {
      return { bg: '#E0F2FE', icon: '📚', defaultMin: '09:30 PM' };
    }
    return { bg: '#F3E8FF', icon: '🎯', defaultMin: '08:30 AM' };
  };

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
          { paddingBottom: Math.max(insets.bottom, 20) + 90 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refreshToday}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header: Greeting, Date, Age Chip & Tiger Avatar */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={[styles.greetingText, { color: colors.text }]}>
              {greeting}
            </Text>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {dateFormatted}
            </Text>

            {ageStats && (
              <TouchableOpacity
                style={styles.ageBadgeRow}
                onPress={() => setProfileModalVisible(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="View Life Age and Timing Metrics"
              >
                <View
                  style={[
                    styles.ageBadgePill,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[styles.ageBadgeText, { color: colors.primary }]}
                    numberOfLines={1}
                  >
                    🎂 {ageStats.years}y {ageStats.months}m {ageStats.days}d • {ageStats.totalWeeks} wks • {birthTime}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* OmniHub Workspace Switcher */}
          <TouchableOpacity
            style={[
              styles.hubHeaderButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => navigation.navigate('WorkspaceSelect')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Switch Workspace Suite"
          >
            <Text style={styles.hubHeaderIcon}>💎</Text>
            <Text style={[styles.hubHeaderText, { color: colors.text }]}>Hub ▾</Text>
          </TouchableOpacity>

          {/* Tiger Profile Avatar */}
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="User Profile and Age Stats"
          >
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarEmoji}>🐯</Text>
            </View>
            <View style={styles.avatarEditPill}>
              <Text style={styles.avatarEditIcon}>✏️</Text>
            </View>
          </TouchableOpacity>
        </View>

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
              onPress={() => setExactAlarmDismissed(true)}
              style={styles.exactAlarmBannerClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.exactAlarmBannerCloseText, { color: colors.warning }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Habit Streaks: Consistency creates destiny & Action Buttons */}
        <View style={styles.habitStreaksHeaderRow}>
          <View style={styles.habitStreaksTitleCol}>
            <Text style={[styles.habitStreaksTitle, { color: colors.text }]}>
              Habit Streaks
            </Text>
            <Text style={[styles.habitStreaksSubtitle, { color: colors.textSecondary }]}>
              Consistency creates destiny
            </Text>
          </View>

          <View style={styles.headerActionsRow}>
            {/* View Mode Toggle: Cards vs Compact */}
            {habits.length > 0 && (
              <TouchableOpacity
                onPress={() => setViewMode((m) => (m === 'cards' ? 'compact' : 'cards'))}
                style={[
                  styles.viewModeBtn,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Toggle habits compact or cards view"
              >
                <Text style={[styles.viewModeBtnText, { color: colors.text }]}>
                  {viewMode === 'cards' ? '📋 List' : '🗂️ Cards'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Stats Button */}
            <TouchableOpacity
              onPress={() => setShowStats((prev) => !prev)}
              style={[
                styles.statsBtn,
                {
                  backgroundColor: showStats ? colors.brandDark : colors.surface,
                  borderColor: showStats ? colors.brandDark : colors.borderSubtle,
                },
              ]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Toggle Productivity Insights"
            >
              <Text
                style={[
                  styles.statsBtnText,
                  showStats ? styles.statsBtnTextActive : { color: colors.text },
                ]}
              >
                📊 Stats {showStats ? '▴' : '▾'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Productivity Insights: 4 Badges (Shown only when Stats button is clicked) */}
        {showStats && (
          <View style={styles.insightsSection}>
            <View style={styles.insightsHeaderRow}>
              <Text style={[styles.insightsTitle, { color: colors.text }]}>
                Productivity Insights
              </Text>
              <Text style={[styles.insightsSubtitle, { color: colors.textSecondary }]}>
                100% On-Device Local Analytics
              </Text>
            </View>

            {/* 4 Badges Grid (2x2) */}
            <View style={styles.badgesGrid}>
              {/* 1. Tasks Completed */}
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                  TASKS COMPLETED
                </Text>
                <Text style={[styles.metricNumber, { color: colors.success }]}>
                  {stats?.tasksCompleted ?? 0}
                </Text>
                <Text style={[styles.metricSub, { color: colors.textMuted }]}>
                  {stats?.tasksPending ?? 0} currently pending
                </Text>
              </View>

              {/* 2. Overdue */}
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                  OVERDUE
                </Text>
                <Text
                  style={[
                    styles.metricNumber,
                    {
                      color:
                        (stats?.tasksOverdue ?? 0) > 0 ? colors.danger : colors.textMuted,
                    },
                  ]}
                >
                  {stats?.tasksOverdue ?? 0}
                </Text>
                <Text style={[styles.metricSub, { color: colors.textMuted }]}>
                  Tasks requiring attention
                </Text>
              </View>

              {/* 3. Task Completion */}
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                  TASK COMPLETION
                </Text>
                <Text style={[styles.metricNumber, { color: colors.primaryLight }]}>
                  {stats?.completionPercentage ?? 0}%
                </Text>
                <Text style={[styles.metricSub, { color: colors.textMuted }]}>
                  Overall efficiency rate
                </Text>
              </View>

              {/* 4. Habits Today */}
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                  HABITS TODAY
                </Text>
                <Text style={[styles.metricNumber, { color: colors.warning }]}>
                  {stats?.habitsCompletedToday ?? 0}/{stats?.totalHabits ?? 0}
                </Text>
                <Text style={[styles.metricSub, { color: colors.textMuted }]}>
                  {stats?.habitCompletionPercentage ?? 0}% daily habit rate
                </Text>
              </View>
            </View>

            {/* Completion Progress Bar */}
            <View style={styles.insightsProgressBar}>
              <ProgressBar
                percentage={stats?.completionPercentage ?? 0}
                label="Task Completion Rate"
              />
            </View>
          </View>
        )}

        {/* Schedule Conflicts Banner if tasks overlap */}
        {conflicts && conflicts.length > 0 && (
          <View style={styles.conflictBannerWrapper}>
            <ConflictBanner conflicts={conflicts} />
          </View>
        )}

        {/* Today Filter Bar */}
        {(habits.length > 0 || todayTasks.length > 0) && (
          <View
            style={[
              styles.todaySearchRow,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
            ]}
          >
            <Text style={styles.todaySearchIcon}>🔍</Text>
            <TextInput
              placeholder="Filter today's habits & tasks..."
              placeholderTextColor={colors.textMuted}
              value={filterQuery}
              onChangeText={setFilterQuery}
              style={[styles.todaySearchInput, { color: colors.text }]}
            />
            {filterQuery.length > 0 && (
              <TouchableOpacity onPress={() => setFilterQuery('')} style={styles.todaySearchClear}>
                <Text style={[styles.todaySearchClearText, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Daily Routine Items with Streaks and Dates Filled */}
        <View style={styles.routineListContainer}>
          {habits.length === 0 ? (
            <View style={[styles.emptyContainer, { borderColor: colors.borderSubtle }]}>
              <BellIllustration size={80} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No habits established yet
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                Consistency creates destiny! Tap + New to start your first daily routine and streak.
              </Text>
            </View>
          ) : viewMode === 'compact' ? (
            displayedHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                onToggle={() => toggleHabit(habit)}
              />
            ))
          ) : (
            displayedHabits.map((habit) => {
              const { bg, icon } = getHabitIconDetails(habit);
              const alarmTime = habit.reminderTime;
              const displaySubtitle = alarmTime
                ? `⏰ ${alarmTime}`
                : (habit.description?.replace(/^⏰\s*/, '') || 'Daily routine');
              const accentColor = habit.color || '#FF6B00';
              const targetDaysCount =
                habit.recurrenceRule?.daysOfWeek && habit.recurrenceRule.daysOfWeek.length > 0
                  ? habit.recurrenceRule.daysOfWeek.length
                  : 7;
              const completedInWeek = weekDays.filter((wd) => Boolean(habit.weeklyLogs[wd.iso])).length;
              const weekPercent = Math.min(100, Math.round((completedInWeek / targetDaysCount) * 100));

              return (
                <View
                  key={habit.id}
                  style={[
                    styles.habitStreakCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  {/* Card Header: Icon, Routine Name, Alarm Clock & Actions */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.habitMeta}>
                      <View style={[styles.habitIconBadge, { backgroundColor: bg }]}>
                        <Text style={styles.habitIconEmoji}>{icon}</Text>
                      </View>
                      <View style={styles.habitNameCol}>
                        <Text style={[styles.habitName, { color: colors.text }]} numberOfLines={1}>
                          {habit.name}
                        </Text>
                        <Text style={[styles.habitDesc, { color: colors.textSecondary }]}>
                          {displaySubtitle}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons: Edit, Delete */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        onPress={() => {
                          setHabitToEdit(habit);
                          setNewHabitModalVisible(true);
                        }}
                        style={styles.actionIconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${habit.name}`}
                      >
                        <Text style={styles.actionIconTxt}>✏️</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteHabit(habit)}
                        style={styles.actionIconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${habit.name}`}
                      >
                        <Text style={styles.actionIconTxt}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Streak Stats & Check-In Row */}
                  <View style={styles.streakStatusRow}>
                    <View style={styles.streakPillsCol}>
                      <View style={styles.streakPill}>
                        <Text style={styles.streakFire}>
                          🔥 {habit.currentStreak} day streak
                        </Text>
                      </View>
                      <Text style={[styles.bestStreakText, { color: colors.textMuted }]}>
                        Best: {habit.bestStreak}d • {completedInWeek}/{targetDaysCount} days completed ({weekPercent}%)
                      </Text>
                    </View>

                    {/* Today Check-In Button */}
                    <TouchableOpacity
                      onPress={() => toggleHabit(habit)}
                      style={[
                        styles.checkButton,
                        habit.completedToday
                          ? styles.checkButtonDone
                          : { borderColor: colors.borderSubtle },
                      ]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={habit.completedToday ? 'Completed today' : 'Check in today'}
                    >
                      <Text
                        style={[
                          styles.checkText,
                          habit.completedToday ? styles.checkTextDone : { color: colors.text },
                        ]}
                      >
                        {habit.completedToday ? '✓ Done' : '○ Check In'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Progress Fill Bar */}
                  <View style={[styles.progressTrack, { backgroundColor: colors.borderSubtle }]}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${Math.max(weekPercent, 4)}%`,
                          backgroundColor: accentColor,
                        },
                      ]}
                    />
                  </View>

                  {/* Interactive 7-Day Completion Dots with Dates Filled */}
                  <View style={styles.trackerContainer}>
                    <View style={styles.trackerHeader}>
                      <Text style={[styles.trackerTitle, { color: colors.textMuted }]}>
                        LAST 7 DAYS (TAP TO TOGGLE)
                      </Text>
                      <Text style={[styles.trackerCompletedText, { color: accentColor }]}>
                        {completedInWeek}/7 dates filled
                      </Text>
                    </View>

                    <View style={styles.weekGrid}>
                      {weekDays.map((wd) => {
                        const isDone = Boolean(habit.weeklyLogs[wd.iso]);
                        return (
                          <TouchableOpacity
                            key={wd.iso}
                            onPress={() => toggleHabitDate(habit.id, wd.iso, isDone)}
                            style={styles.dayCol}
                            activeOpacity={0.65}
                            accessibilityRole="button"
                            accessibilityLabel={`Toggle ${wd.dayName} ${wd.dayNumber}`}
                          >
                            <Text
                              style={[
                                styles.dayLabel,
                                wd.isToday ? styles.dayLabelToday : styles.dayLabelMuted,
                                {
                                  color: wd.isToday ? colors.text : colors.textMuted,
                                },
                              ]}
                            >
                              {wd.dayName.slice(0, 1)}
                            </Text>

                            <View
                              style={[
                                styles.dot,
                                isDone ? styles.dotDone : styles.dotPending,
                                wd.isToday && styles.dotToday,
                                {
                                  backgroundColor: isDone ? accentColor : colors.surface,
                                  borderColor: isDone ? accentColor : wd.isToday ? colors.primary : colors.borderSubtle,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dotNumber,
                                  isDone ? styles.dotNumberDone : { color: colors.textSecondary },
                                  (isDone || wd.isToday) && styles.textBold,
                                ]}
                              >
                                {isDone ? '✓' : wd.dayNumber}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Optional Today Tasks (if any additional scheduled tasks exist) */}
        {todayTasks.length > 0 && (
          <View style={styles.tasksSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Scheduled Tasks
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
                <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>
                  View all
                </Text>
              </TouchableOpacity>
            </View>

            {displayedTasks.map((task) => {
              const bullets = parseBulletNotes(task.notes || task.description);
              const isTaskDone = task.status === 'completed';
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskCard, { backgroundColor: colors.surface }]}
                  onPress={() => toggleTask(task)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.taskCheckbox,
                      isTaskDone && styles.taskCheckboxDone,
                    ]}
                  >
                    {isTaskDone && (
                      <Text style={styles.statusCheckmark}>✓</Text>
                    )}
                  </View>
                  <View style={styles.taskInfoCol}>
                    <View style={styles.taskHeaderRow}>
                      <Text
                        style={[
                          styles.taskTitle,
                          isTaskDone && styles.taskTitleDone,
                          { color: colors.text },
                        ]}
                      >
                        {task.title}
                      </Text>
                      {task.startTime && (
                        <Text style={[styles.taskTime, { color: colors.textMuted }]}>
                          ⏰ {task.startTime}
                        </Text>
                      )}
                      {task.recurrenceRule && task.recurrenceRule.type !== 'none' && (
                        <Text style={[styles.taskTime, { color: colors.primary }]}>
                          🔄 {task.recurrenceRule.type}
                        </Text>
                      )}
                    </View>

                    {bullets.length > 0 && (
                      <View style={styles.taskBulletsWrapper}>
                        {bullets.slice(0, 2).map((b, i) => (
                          <View key={i} style={styles.taskBulletRow}>
                            <Text style={[styles.taskBulletBullet, { color: colors.primary }]}>•</Text>
                            <Text
                              style={[
                                styles.taskBulletText,
                                (b.completed || isTaskDone) && styles.taskBulletTextDone,
                                {
                                  color: b.completed || isTaskDone ? colors.textMuted : colors.textSecondary,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {b.text}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Calendar Events Section */}
        <View style={styles.tasksSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Calendar & Events ({calendarEvents.length})
            </Text>
            <TouchableOpacity onPress={() => setCalendarModalVisible(true)}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>
                + Add Event
              </Text>
            </TouchableOpacity>
          </View>

          {calendarEvents.length === 0 ? (
            <View style={[styles.calEmptyBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <Text style={[styles.calEmptyTitle, { color: colors.textSecondary }]}>
                No calendar events for today
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(true)}
                style={[styles.calAddBtn, { borderColor: colors.primary }]}
              >
                <Text style={[styles.calAddBtnText, { color: colors.primary }]}>+ Schedule Event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            calendarEvents.map((ev) => (
              <View
                key={ev.id}
                style={[
                  styles.eventCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.eventIconBadge}>
                  <Text style={styles.eventIconEmoji}>📅</Text>
                </View>
                <View style={styles.eventInfoCol}>
                  <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text style={[styles.eventTime, { color: colors.textMuted }]}>
                    {ev.startTime
                      ? `${(() => {
                          const d = new Date(ev.startTime);
                          return isValid(d) ? format(d, 'h:mm a') : ev.startTime;
                        })()}${
                          ev.endTime
                            ? ` – ${(() => {
                                const d = new Date(ev.endTime);
                                return isValid(d) ? format(d, 'h:mm a') : ev.endTime;
                              })()}`
                            : ''
                        }`
                      : 'All Day'}
                    {ev.location ? ` • 📍 ${ev.location}` : ''}
                  </Text>
                  {ev.description ? (
                    <Text style={[styles.eventDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {ev.description}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteEvent(ev.id, ev.title)}
                  style={styles.eventDeleteBtn}
                  accessibilityLabel="Delete event"
                >
                  <Text style={[styles.eventDeleteIcon, { color: colors.danger }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button (+) */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.brandDark,
            bottom: Math.max(insets.bottom, 16) + 16,
          },
        ]}
        onPress={() => {
          Alert.alert('Create New', 'What would you like to add today?', [
            {
              text: '🌱 Daily Routine / Habit',
              onPress: () => {
                setHabitToEdit(null);
                setNewHabitModalVisible(true);
              },
            },
            {
              text: '📝 Scheduled Task',
              onPress: () => {
                navigation.navigate('CreateEditTask');
              },
            },
            {
              text: '📅 Calendar Event',
              onPress: () => {
                setCalendarModalVisible(true);
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add New Routine or Task"
      >
        <Text style={styles.fabPlusText}>+</Text>
      </TouchableOpacity>

      {/* Habit Creation / Edit Modal */}
      <NewHabitModal
        visible={newHabitModalVisible}
        onClose={() => {
          setNewHabitModalVisible(false);
          setHabitToEdit(null);
        }}
        onCreated={() => {
          setHabitToEdit(null);
          refreshToday();
        }}
        habitToEdit={habitToEdit}
      />

      {/* Tiger Icon Profile & Life Age Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onSaved={(data) => {
          setUserName(data.name);
          setBirthDate(data.birthDate);
          setBirthTime(data.birthTime);
          refreshToday();
        }}
      />

      {/* Calendar Event Modal */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Schedule Calendar Event
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              EVENT TITLE *
            </Text>
            <TextInput
              style={[
                styles.modalTextInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Strategy Sync, Doctor Visit..."
              placeholderTextColor={colors.textMuted}
              value={eventTitle}
              onChangeText={setEventTitle}
            />

            <View style={styles.timeInputsRow}>
              <View style={styles.timeInputCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  START TIME
                </Text>
                <TextInput
                  style={[
                    styles.modalTextInput,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                      color: colors.text,
                    },
                  ]}
                  placeholder="10:00"
                  placeholderTextColor={colors.textMuted}
                  value={eventStartTime}
                  onChangeText={setEventStartTime}
                />
              </View>
              <View style={styles.timeInputCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  END TIME
                </Text>
                <TextInput
                  style={[
                    styles.modalTextInput,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                      color: colors.text,
                    },
                  ]}
                  placeholder="11:00"
                  placeholderTextColor={colors.textMuted}
                  value={eventEndTime}
                  onChangeText={setEventEndTime}
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              LOCATION (OPTIONAL)
            </Text>
            <TextInput
              style={[
                styles.modalTextInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Conference Room A or Zoom link"
              placeholderTextColor={colors.textMuted}
              value={eventLocation}
              onChangeText={setEventLocation}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              style={[
                styles.modalTextInput,
                styles.modalTextArea,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="Agenda or notes..."
              placeholderTextColor={colors.textMuted}
              value={eventDesc}
              onChangeText={setEventDesc}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.borderSubtle }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateEvent}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalSaveText}>Save Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 6,
  },
  headerTextCol: {
    flex: 1,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  hubHeaderButton: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  hubHeaderIcon: {
    fontSize: 13,
    marginRight: 5,
  },
  hubHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  avatarButton: {
    marginLeft: 10,
    position: 'relative',
  },
  avatarBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFE5D4',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarEmoji: {
    fontSize: 26,
  },
  avatarEditPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFE5D4',
  },
  avatarEditIcon: {
    fontSize: 9,
  },
  ageBadgeRow: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  ageBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  ageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  insightsSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  insightsHeaderRow: {
    marginBottom: 12,
  },
  insightsTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  insightsSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  metricSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  habitStreaksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  habitStreaksTitleCol: {
    flex: 1,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  habitStreaksTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  habitStreaksSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  statsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statsBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsBtnTextActive: {
    color: '#FFFFFF',
  },
  insightsProgressBar: {
    marginTop: 12,
  },
  conflictBannerWrapper: {
    marginBottom: 16,
  },
  todaySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  todaySearchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  todaySearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 6,
  },
  todaySearchClear: {
    padding: 6,
  },
  routineListContainer: {
    marginBottom: 16,
  },
  habitStreakCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  habitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  habitIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  habitIconEmoji: {
    fontSize: 22,
  },
  habitNameCol: {
    flex: 1,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
  },
  habitDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  actionIconTxt: {
    fontSize: 13,
  },
  streakStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  streakPillsCol: {
    flex: 1,
  },
  streakPill: {
    backgroundColor: '#FFF2E8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  streakFire: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF6B00',
  },
  bestStreakText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  checkButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  checkButtonDone: {
    backgroundColor: '#10B981',
  },
  checkButtonPending: {
    backgroundColor: 'transparent',
  },
  checkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  checkTextDone: {
    color: '#FFFFFF',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  trackerContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000015',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackerTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  trackerCompletedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    fontSize: 11,
  },
  dayLabelToday: {
    fontWeight: '800',
  },
  dayLabelMuted: {
    fontWeight: '600',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotDone: {
    borderWidth: 0,
  },
  dotPending: {
    borderWidth: 1.5,
  },
  dotToday: {
    borderWidth: 2,
  },
  dotNumber: {
    fontSize: 11,
  },
  dotNumberDone: {
    color: '#FFFFFF',
  },
  textBold: {
    fontWeight: '800',
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
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
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
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
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
  tasksSection: {
    marginTop: 12,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C8C2BA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  taskCheckboxDone: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  statusCheckmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  taskInfoCol: {
    flex: 1,
  },
  taskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
  },
  taskTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  taskBulletsWrapper: {
    marginTop: 4,
    gap: 2,
  },
  taskBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskBulletBullet: {
    fontSize: 13,
    fontWeight: '800',
  },
  taskBulletText: {
    fontSize: 12,
  },
  taskBulletTextDone: {
    textDecorationLine: 'line-through',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPlusText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 34,
  },
  routineEditBtn: {
    marginLeft: 6,
    padding: 3,
  },
  routineEditTxt: {
    fontSize: 12,
  },
  calEmptyBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  calEmptyTitle: {
    fontSize: 13,
  },
  calAddBtn: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  calAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  eventIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  eventIconEmoji: {
    fontSize: 18,
  },
  eventInfoCol: {
    flex: 1,
  },
  eventTitle: {
    fontWeight: '700',
    fontSize: 14,
  },
  eventTime: {
    fontSize: 12,
    marginTop: 2,
  },
  eventDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  eventDeleteBtn: {
    padding: spacing.xs,
  },
  eventDeleteIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontWeight: '700',
    fontSize: 11,
    marginTop: spacing.sm,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  modalTextInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalTextArea: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeInputCol: {
    flex: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  modalCancelText: {
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  todaySearchClearText: {
    fontSize: 13,
    fontWeight: '700',
  },
  exactAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
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
