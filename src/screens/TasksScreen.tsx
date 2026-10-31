import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  RefreshControl,
  SectionList,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTasks } from '../hooks/useTasks';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';
import { Task, CalendarEvent } from '../types';
import { format, parseISO, addDays, isToday, isTomorrow, isValid } from 'date-fns';
import { formatTimeTo12H } from '../utils/time';
import { parseBulletNotes } from '../utils/bulletNotes';
import { FocusTimerModal } from '../components/FocusTimerModal';
import { CalendarEventModal } from '../components/CalendarEventModal';
import { useFocusTimer } from '../context/FocusTimerContext';
import { taskBackendSyncService } from '../services/tasks/TaskBackendSyncService';

interface TasksScreenProps {
  navigation: any;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    tasks,
    categories,
    calendarEvents,
    loading,
    refresh,
    completeTask,
    uncompleteTask,
    deleteTask,
    clearCompletedTasks,
    toggleSubtask,
    deleteCalendarEvent,
    searchTasks,
  } = useTasks();

  const focusTimer = useFocusTimer();

  const [searchQuery, setSearchQuery] = useState<string>('');
  // Atomic Category Filter: 'all' | 'uncategorized' | <categoryId>
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [focusTimerVisible, setFocusTimerVisible] = useState<boolean>(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>(undefined);
  const [todayIso, setTodayIso] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [calendarModalVisible, setCalendarModalVisible] = useState<boolean>(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [calendarSectionCollapsed, setCalendarSectionCollapsed] = useState<boolean>(false);
  const [isBackendSynced, setIsBackendSynced] = useState<boolean>(() =>
    taskBackendSyncService.getIsConnected()
  );

  // Subscribe to live NestJS backend synchronization status
  useEffect(() => {
    const unsub = taskBackendSyncService.subscribeStatus((connected) => {
      setIsBackendSynced(connected);
    });
    // Trigger initial sync on mount
    taskBackendSyncService.syncWithBackend().catch(() => {});
    return unsub;
  }, []);

  // Automatic midnight rollover timer: updates today's date automatically if app stays open
  useEffect(() => {
    const timer = setInterval(() => {
      const current = format(new Date(), 'yyyy-MM-dd');
      if (current !== todayIso) {
        setTodayIso(current);
        refresh();
      }
    }, 30000); // Check every 30 seconds
    return () => clearInterval(timer);
  }, [todayIso, refresh]);

  // Synchronize focus timer modal visibility from global context (e.g. expanded from floating widget)
  useEffect(() => {
    if (focusTimer.isModalVisible && !focusTimerVisible) {
      setFocusTimerVisible(true);
    }
  }, [focusTimer.isModalVisible, focusTimerVisible]);

  // Refresh on focus and synchronize today's date
  useFocusEffect(
    useCallback(() => {
      const currentToday = format(new Date(), 'yyyy-MM-dd');
      setTodayIso(currentToday);
      refresh();
    }, [refresh])
  );

  // Instantaneous in-memory search across title, description, notes, category
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  // Filter tasks based on Search and Category (Unified view: NO separate filter tabs)
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Atomic Category Filter
    if (categoryFilter === 'uncategorized') {
      result = result.filter((t) => !t.categoryId);
    } else if (categoryFilter !== 'all') {
      const exists = categories.some((c) => c.id === categoryFilter);
      if (exists) {
        result = result.filter((t) => t.categoryId === categoryFilter);
      }
    }

    // Instant search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.notes && t.notes.toLowerCase().includes(q)) ||
          (t.categoryName && t.categoryName.toLowerCase().includes(q))
      );
    }

    return result.filter((t) => t.status !== 'cancelled');
  }, [tasks, categoryFilter, categories, searchQuery]);

  // Unified single continuous grouped stream: Overdue, Today, Upcoming, Backlog, Completed
  const groupedTasks = useMemo(() => {
    const overdue: Task[] = [];
    const today: Task[] = [];
    const upcoming: Task[] = [];
    const unscheduled: Task[] = [];
    const completed: Task[] = [];

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    filteredTasks.forEach((t) => {
      if (t.status === 'completed') {
        completed.push(t);
      } else if (!t.date || t.date === '' || t.date === 'backlog') {
        unscheduled.push(t);
      } else if (t.date < todayIso || (t.date === todayIso && t.startTime && t.startTime < currentTimeStr)) {
        overdue.push(t);
      } else if (t.date === todayIso) {
        today.push(t);
      } else {
        upcoming.push(t);
      }
    });

    const groups: { title: string; icon: string; data: Task[] }[] = [];
    if (overdue.length > 0) groups.push({ title: 'Overdue', icon: '⚠️', data: overdue });
    if (today.length > 0) groups.push({ title: 'Today', icon: '📅', data: today });
    if (upcoming.length > 0) groups.push({ title: 'Upcoming', icon: '🗓️', data: upcoming });
    if (unscheduled.length > 0) groups.push({ title: 'Backlog (No Date)', icon: '📥', data: unscheduled });
    if (completed.length > 0) groups.push({ title: 'Completed', icon: '✓', data: completed });

    return groups.length > 0 ? groups : [{ title: '', icon: '', data: [] }];
  }, [filteredTasks, todayIso]);

  // Progress metrics
  const totalCount = filteredTasks.length;
  const completedCount = filteredTasks.filter((t) => t.status === 'completed').length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Optimistic Toggle Task
  const handleToggleTask = useCallback(
    async (task: Task) => {
      try {
        if (task.status === 'completed') {
          await uncompleteTask(task.id);
        } else {
          await completeTask(task.id);
        }
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Could not update task.');
      }
    },
    [completeTask, uncompleteTask]
  );

  const handleDeleteTask = useCallback(
    (task: Task) => {
      Alert.alert('Delete Task', `Delete "${task.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTask(task.id);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not delete task.');
            }
          },
        },
      ]);
    },
    [deleteTask]
  );

  // Fast Batch Clear Completed Tasks
  const handleClearCompleted = useCallback(() => {
    const completedList = tasks.filter((t) => t.status === 'completed');
    if (completedList.length === 0) return;

    Alert.alert(
      'Clear Completed Tasks',
      `Are you sure you want to permanently delete all ${completedList.length} completed tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCompletedTasks();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to clear completed tasks.');
            }
          },
        },
      ]
    );
  }, [clearCompletedTasks, tasks]);

  const handleOpenFocus = useCallback(
    (taskId?: string) => {
      const task = tasks.find((t) => t.id === taskId);
      focusTimer.openModal(taskId, task?.title);
      setFocusTaskId(taskId);
      setFocusTimerVisible(true);
    },
    [focusTimer, tasks]
  );

  // Safe Android Hardware Back Handler (dismisses modals first)
  const handleGoBack = useCallback(() => {
    if (calendarModalVisible) {
      setCalendarModalVisible(false);
      return;
    }
    if (focusTimerVisible) {
      setFocusTimerVisible(false);
      return;
    }
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [calendarModalVisible, focusTimerVisible, navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (calendarModalVisible) {
          setCalendarModalVisible(false);
          return true;
        }
        if (focusTimerVisible) {
          setFocusTimerVisible(false);
          return true;
        }
        handleGoBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [calendarModalVisible, focusTimerVisible, handleGoBack])
  );

  // Render individual task item
  const renderTaskItem = useCallback(
    ({ item: task }: { item: Task }) => {
      const isDone = task.status === 'completed';
      const now = new Date();
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const isOverdue = Boolean(
        !isDone &&
        ((task.date && task.date < todayIso) ||
          (task.date === todayIso && task.startTime && task.startTime < currentTimeStr))
      );

      // Parse subtasks / checklist notes with fixed indexing
      const subtasks = parseBulletNotes(task.notes || task.description);
      const previewSubtasks = subtasks.slice(0, 3);

      const parsedDate = task.date && isValid(parseISO(task.date)) ? parseISO(task.date) : null;
      const dateDisplay = parsedDate
        ? isToday(parsedDate)
          ? 'Today'
          : isTomorrow(parsedDate)
          ? 'Tomorrow'
          : task.date
        : task.date || 'Backlog';

      return (
        <View
          key={task.id}
          style={[
            styles.taskCard,
            {
              backgroundColor: colors.surface,
              borderColor: isOverdue ? '#EF444460' : colors.borderSubtle,
              borderLeftWidth: 4,
              borderLeftColor: task.accentColor || (isOverdue ? '#EF4444' : colors.primary),
            },
          ]}
        >
          {/* Completion Checkbox */}
          <TouchableOpacity
            onPress={() => handleToggleTask(task)}
            style={[
              styles.checkbox,
              { borderColor: colors.borderSubtle },
              isDone && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
            ]}
            activeOpacity={0.7}
          >
            {isDone && <Text style={styles.checkIcon}>✓</Text>}
          </TouchableOpacity>

          {/* Task Info Column: View wrapper so subtask checkboxes are NOT nested in navigation touchable */}
          <View style={styles.taskInfo}>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateEditTask', { taskId: task.id })}
              activeOpacity={0.75}
            >
              <View style={styles.taskTitleRow}>
                <Text
                  style={[
                    styles.taskTitle,
                    { color: colors.text },
                    isDone && styles.taskTitleDone,
                  ]}
                  numberOfLines={2}
                >
                  {task.title}
                </Text>

                {/* Priority & Quadrant Badges */}
                <View style={styles.badgeCluster}>
                  {task.priority && (
                    <View
                      style={[
                        styles.prioBadge,
                        {
                          backgroundColor:
                            task.priority === 'high'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : task.priority === 'low'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.prioText,
                          {
                            color:
                              task.priority === 'high'
                                ? '#EF4444'
                                : task.priority === 'low'
                                ? '#3B82F6'
                                : '#F59E0B',
                          },
                        ]}
                      >
                        {task.priority.toUpperCase()}
                      </Text>
                    </View>
                  )}

                  {(task.eisenhowerQuadrant || task.recurrenceRule?.eisenhowerQuadrant) && (
                    <View
                      style={[
                        styles.prioBadge,
                        { backgroundColor: 'rgba(99, 102, 241, 0.15)' },
                      ]}
                    >
                      <Text style={[styles.prioText, { color: '#6366F1' }]}>
                        {(task.eisenhowerQuadrant || task.recurrenceRule?.eisenhowerQuadrant)?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Sub-row: Category, Date, Time, Recurrence */}
              <View style={styles.taskMetaRow}>
                {Boolean(task.date) && (
                  <Text
                    style={[
                      styles.metaDate,
                      { color: isOverdue ? '#EF4444' : colors.textSecondary },
                    ]}
                  >
                    📅 {dateDisplay}
                  </Text>
                )}
                {Boolean(task.startTime) && (
                  <Text style={[styles.metaTime, { color: colors.textSecondary }]}>
                    ⏰ {formatTimeTo12H(task.startTime)}
                    {task.endTime ? ` - ${formatTimeTo12H(task.endTime)}` : ''}
                  </Text>
                )}
                {Boolean(task.categoryName) && (
                  <View
                    style={[
                      styles.catBadge,
                      { backgroundColor: (task.categoryColor || colors.primary) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catBadgeText,
                        { color: task.categoryColor || colors.primary },
                      ]}
                    >
                      {task.categoryIcon || '🏷️'} {task.categoryName}
                    </Text>
                  </View>
                )}
                {Boolean(task.recurrenceRule && task.recurrenceRule.type !== 'none') && (
                  <Text style={[styles.recurrenceBadge, { color: colors.primary }]}>
                    🔄 {task.recurrenceRule?.type}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Subtasks / Checklist Items Preview: Standalone touchables with hitSlop */}
            {previewSubtasks.length > 0 && (
              <View style={styles.subtasksWrapper}>
                {previewSubtasks.map((st, idx) => (
                  <TouchableOpacity
                    key={st.id || idx}
                    style={styles.subtaskRow}
                    onPress={() => toggleSubtask(task.id, idx)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={[
                        styles.subtaskCheck,
                        { color: st.completed ? colors.primary : colors.textMuted },
                      ]}
                    >
                      {st.completed ? '☑' : '☐'}
                    </Text>
                    <Text
                      style={[
                        styles.subtaskText,
                        { color: st.completed ? colors.textMuted : colors.text },
                        st.completed && styles.subtaskTextDone,
                      ]}
                      numberOfLines={1}
                    >
                      {st.text}
                    </Text>
                  </TouchableOpacity>
                ))}
                {subtasks.length > 3 && (
                  <Text style={[styles.subtaskMore, { color: colors.textSecondary }]}>
                    +{subtasks.length - 3} more subtasks
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Quick Actions: Focus Timer & Delete */}
          <View style={styles.cardActionsCol}>
            <TouchableOpacity
              onPress={() => handleOpenFocus(task.id)}
              style={styles.cardActionBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Focus on this task"
            >
              <Text style={styles.cardActionIcon}>⏱️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteTask(task)}
              style={styles.cardActionBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Delete task"
            >
              <Text style={[styles.cardActionIcon, { opacity: 0.6 }]}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [colors, handleDeleteTask, handleOpenFocus, handleToggleTask, navigation, todayIso, toggleSubtask]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title?: string; icon?: string; data: Task[] } }) => {
      if (!section.title) return null;
      return (
        <View style={styles.groupHeaderRow}>
          <Text style={styles.groupHeaderIcon}>{section.icon}</Text>
          <Text style={[styles.groupHeaderTitle, { color: colors.text }]}>
            {section.title}
          </Text>
          <Text style={[styles.groupHeaderCount, { color: colors.textMuted }]}>
            ({section.data.length})
          </Text>
        </View>
      );
    },
    [colors]
  );

  const renderEmptyComponent = useCallback(() => {
    if (filteredTasks.length > 0) return null;
    return (
      <View style={[styles.emptyBox, { borderColor: colors.borderSubtle }]}>
        <Text style={styles.emptyIcon}>📝</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {searchQuery ? 'No matching tasks found' : 'No tasks in this view'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {searchQuery
            ? 'Try adjusting your search query or category filters.'
            : 'Tap + at the bottom to schedule your next task.'}
        </Text>
        <TouchableOpacity
          style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('CreateEditTask')}
        >
          <Text style={styles.emptyAddBtnText}>+ Create Task</Text>
        </TouchableOpacity>
      </View>
    );
  }, [colors, filteredTasks.length, navigation, searchQuery]);

  // ListHeaderComponent: Unified header without separate filter tabs
  const renderListHeader = useCallback(() => {
    return (
      <View style={styles.listHeaderContainer}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <View style={styles.titleWithStatusRow}>
              {navigation?.canGoBack && navigation.canGoBack() && (
                <TouchableOpacity
                  onPress={handleGoBack}
                  style={[styles.headerBackBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Text style={[styles.headerBackBtnText, { color: colors.text }]}>‹ Back</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.headerTitle, { color: colors.text }]}>Tasks</Text>
              <View
                style={[
                  styles.syncBadge,
                  {
                    backgroundColor: isBackendSynced
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                    borderColor: isBackendSynced ? '#10B981' : '#EF4444',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.syncBadgeText,
                    { color: isBackendSynced ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {isBackendSynced ? '🟢 Synced' : '⚪ Offline'}
                </Text>
              </View>
            </View>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {totalCount} {totalCount === 1 ? 'task' : 'tasks'} • {totalCount - completedCount} pending
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              onPress={() => handleOpenFocus()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Open Focus Timer"
            >
              <Text style={styles.headerBtnIcon}>⏱️</Text>
              <Text style={[styles.headerBtnText, { color: colors.primary }]}>Focus</Text>
            </TouchableOpacity>

            {completedCount > 0 && (
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                onPress={handleClearCompleted}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Clear Completed Tasks"
              >
                <Text style={[styles.headerBtnText, { color: '#EF4444' }]}>🧹 Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search tasks, notes, categories..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.searchClear, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Categories Horizontal Filter Chips (Unified: All, Uncategorized, Categories) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            onPress={() => setCategoryFilter('all')}
            style={[
              styles.catChip,
              {
                backgroundColor: categoryFilter === 'all' ? colors.primary + '20' : colors.surfaceElevated,
                borderColor: categoryFilter === 'all' ? colors.primary : colors.borderSubtle,
              },
            ]}
          >
            <Text
              style={[
                styles.catChipText,
                { color: categoryFilter === 'all' ? colors.primary : colors.textSecondary },
              ]}
            >
              All Categories
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCategoryFilter((prev) => (prev === 'uncategorized' ? 'all' : 'uncategorized'))}
            style={[
              styles.catChip,
              {
                backgroundColor: categoryFilter === 'uncategorized' ? colors.primary + '25' : colors.surfaceElevated,
                borderColor: categoryFilter === 'uncategorized' ? colors.primary : colors.borderSubtle,
              },
            ]}
          >
            <Text style={styles.catChipIcon}>🏷️</Text>
            <Text
              style={[
                styles.catChipText,
                { color: categoryFilter === 'uncategorized' ? colors.primary : colors.text },
              ]}
            >
              Uncategorized
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isSelected = categoryFilter === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setCategoryFilter(isSelected ? 'all' : cat.id)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: isSelected ? (cat.color || colors.primary) + '25' : colors.surfaceElevated,
                    borderColor: isSelected ? cat.color || colors.primary : colors.borderSubtle,
                  },
                ]}
              >
                {cat.icon && <Text style={styles.catChipIcon}>{cat.icon}</Text>}
                <Text
                  style={[
                    styles.catChipText,
                    { color: isSelected ? cat.color || colors.primary : colors.text },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Progress Bar Card */}
        {totalCount > 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressTitle, { color: colors.textSecondary }]}>
                Completion Status
              </Text>
              <Text style={[styles.progressScore, { color: colors.primary }]}>
                {progressPercent}% ({completedCount}/{totalCount})
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
              <View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: colors.primary,
                    width: `${progressPercent}%`,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Integrated Calendar Events Section */}
        {calendarEvents.length > 0 && (
          <View
            style={[
              styles.calendarSectionContainer,
              { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={styles.calendarTitleRow}
                onPress={() => setCalendarSectionCollapsed((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarSectionIcon}>🗓️</Text>
                <Text style={[styles.calendarSectionTitle, { color: colors.text }]}>
                  Calendar Events ({calendarEvents.length})
                </Text>
                <Text style={[styles.calendarCollapseIcon, { color: colors.textMuted }]}>
                  {calendarSectionCollapsed ? '▼' : '▲'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addEventBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                onPress={() => {
                  setEventToEdit(null);
                  setCalendarModalVisible(true);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.addEventBtnText, { color: colors.primary }]}>+ Event</Text>
              </TouchableOpacity>
            </View>

            {!calendarSectionCollapsed && (
              <View style={styles.calendarEventsList}>
                {calendarEvents.map((ev) => (
                  <View
                    key={ev.id}
                    style={[
                      styles.eventCard,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.eventCardContent}
                      onPress={() => {
                        setEventToEdit(ev);
                        setCalendarModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.eventTimePill}>
                        <Text style={[styles.eventTimeText, { color: colors.primary }]}>
                          ⏰ {formatTimeTo12H(ev.time)}
                        </Text>
                        {ev.date !== todayIso && (
                          <Text style={[styles.eventDateText, { color: colors.textMuted }]}>
                            {ev.date}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      {ev.description ? (
                        <Text style={[styles.eventDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          {ev.description}
                        </Text>
                      ) : null}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Delete Event', `Delete "${ev.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              await deleteCalendarEvent(ev.id);
                            },
                          },
                        ]);
                      }}
                      style={styles.eventDeleteBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityLabel="Delete event"
                    >
                      <Text style={[styles.eventDeleteIcon, { color: colors.textMuted }]}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }, [
    calendarEvents,
    calendarModalVisible,
    calendarSectionCollapsed,
    categories,
    categoryFilter,
    colors,
    completedCount,
    deleteCalendarEvent,
    handleClearCompleted,
    handleOpenFocus,
    handleSearchChange,
    isBackendSynced,
    progressPercent,
    searchQuery,
    todayIso,
    totalCount,
  ]);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 20),
        },
      ]}
    >
      <StatusBar barStyle={colors.statusBar} />

      {/* Unified Virtualized SectionList with Header in ListHeaderComponent (NO separate tabs) */}
      <SectionList
        sections={filteredTasks.length === 0 ? [] : groupedTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTaskItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 90 },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
      />

      {/* FAB: Add New Task */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('CreateEditTask')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Add Task"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Focus Timer Modal */}
      {focusTimerVisible && (
        <FocusTimerModal
          visible={focusTimerVisible}
          onClose={() => setFocusTimerVisible(false)}
          tasks={tasks}
          initialTaskId={focusTaskId}
        />
      )}

      {/* Calendar Event Modal */}
      {calendarModalVisible && (
        <CalendarEventModal
          visible={calendarModalVisible}
          onClose={() => setCalendarModalVisible(false)}
          onSaved={refresh}
          eventToEdit={eventToEdit}
          initialDate={todayIso}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listHeaderContainer: {
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerTextCol: {
    flex: 1,
  },
  titleWithStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerBackBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: 6,
  },
  headerBackBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  syncBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 4,
  },
  headerBtnIcon: {
    fontSize: 13,
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  categoryScroll: {
    maxHeight: 34,
    marginBottom: 10,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 4,
  },
  catChipIcon: {
    fontSize: 11,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressCard: {
    marginHorizontal: spacing.lg,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressScore: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
    gap: 6,
  },
  groupHeaderIcon: {
    fontSize: 14,
  },
  groupHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  groupHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  taskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  badgeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prioBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  prioText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  recurrenceBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  subtasksWrapper: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    gap: 4,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtaskCheck: {
    fontSize: 13,
    fontWeight: '700',
  },
  subtaskText: {
    fontSize: 11.5,
    flex: 1,
  },
  subtaskTextDone: {
    textDecorationLine: 'line-through',
  },
  subtaskMore: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
  },
  cardActionsCol: {
    flexDirection: 'column',
    alignItems: 'center',
    marginLeft: 6,
    gap: 8,
  },
  cardActionBtn: {
    padding: 2,
  },
  cardActionIcon: {
    fontSize: 14,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 24,
    gap: 6,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
  calendarSectionContainer: {
    marginHorizontal: 0,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calendarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  calendarSectionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  calendarSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
  },
  calendarCollapseIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  addEventBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  addEventBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  calendarEventsList: {
    marginTop: 10,
    gap: 8,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  eventCardContent: {
    flex: 1,
  },
  eventTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  eventTimeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  eventDateText: {
    fontSize: 10,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  eventDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  eventDeleteBtn: {
    padding: 6,
  },
  eventDeleteIcon: {
    fontSize: 13,
  },
});
