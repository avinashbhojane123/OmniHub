import React, { useState, useMemo, useCallback } from 'react';
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
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTasks } from '../hooks/useTasks';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';
import { Task, TaskPriority } from '../types';
import { format, parseISO, addDays, isToday, isTomorrow } from 'date-fns';
import { formatTimeTo12H } from '../utils/time';
import { parseBulletNotes } from '../utils/bulletNotes';
import { FocusTimerModal } from '../components/FocusTimerModal';

interface TasksScreenProps {
  navigation: any;
}

type FilterTab = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'high' | 'q1' | 'q2' | 'q3' | 'q4';

export const TasksScreen: React.FC<TasksScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    tasks,
    categories,
    loading,
    refresh,
    completeTask,
    uncompleteTask,
    deleteTask,
    toggleSubtask,
  } = useTasks();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [focusTimerVisible, setFocusTimerVisible] = useState<boolean>(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>(undefined);
  const [todayIso, setTodayIso] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Refresh on focus and synchronize today's date for rollover
  useFocusEffect(
    useCallback(() => {
      const currentToday = format(new Date(), 'yyyy-MM-dd');
      setTodayIso(currentToday);
      refresh();
    }, [refresh])
  );

  // Filter tasks based on Search, Tab, and Category
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Category filter
    if (selectedCategoryId) {
      result = result.filter((t) => t.categoryId === selectedCategoryId);
    }

    // Search query
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

    // Tab filter
    switch (filterTab) {
      case 'today':
        return result.filter((t) => t.date === todayIso && t.status !== 'cancelled');
      case 'upcoming':
        return result.filter(
          (t) => t.date && t.date > todayIso && t.status !== 'completed' && t.status !== 'cancelled'
        );
      case 'overdue':
        return result.filter(
          (t) => t.date && t.date < todayIso && t.status !== 'completed' && t.status !== 'cancelled'
        );
      case 'completed':
        return result.filter((t) => t.status === 'completed');
      case 'high':
        return result.filter((t) => t.priority === 'high' && t.status !== 'cancelled');
      case 'q1':
        return result.filter((t) => t.recurrenceRule?.eisenhowerQuadrant === 'q1' && t.status !== 'cancelled');
      case 'q2':
        return result.filter((t) => t.recurrenceRule?.eisenhowerQuadrant === 'q2' && t.status !== 'cancelled');
      case 'q3':
        return result.filter((t) => t.recurrenceRule?.eisenhowerQuadrant === 'q3' && t.status !== 'cancelled');
      case 'q4':
        return result.filter((t) => t.recurrenceRule?.eisenhowerQuadrant === 'q4' && t.status !== 'cancelled');
      case 'all':
      default:
        return result.filter((t) => t.status !== 'cancelled');
    }
  }, [tasks, selectedCategoryId, searchQuery, filterTab, todayIso]);

  // Group filtered tasks for structured display
  const groupedTasks = useMemo(() => {
    if (filterTab === 'today' || filterTab === 'completed' || filterTab === 'overdue') {
      return [{ title: '', icon: '', data: filteredTasks }];
    }

    const overdue: Task[] = [];
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const upcoming: Task[] = [];
    const unscheduled: Task[] = [];
    const completed: Task[] = [];

    const tomorrowIso = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    filteredTasks.forEach((t) => {
      if (t.status === 'completed') {
        completed.push(t);
      } else if (!t.date) {
        unscheduled.push(t);
      } else if (t.date < todayIso) {
        overdue.push(t);
      } else if (t.date === todayIso) {
        today.push(t);
      } else if (t.date === tomorrowIso) {
        tomorrow.push(t);
      } else {
        upcoming.push(t);
      }
    });

    const groups: { title: string; icon: string; data: Task[] }[] = [];
    if (overdue.length > 0) groups.push({ title: 'Overdue', icon: '⚠️', data: overdue });
    if (today.length > 0) groups.push({ title: 'Today', icon: '📅', data: today });
    if (tomorrow.length > 0) groups.push({ title: 'Tomorrow', icon: '☀️', data: tomorrow });
    if (upcoming.length > 0) groups.push({ title: 'Upcoming', icon: '🗓️', data: upcoming });
    if (unscheduled.length > 0) groups.push({ title: 'No Date / Backlog', icon: '📥', data: unscheduled });
    if (completed.length > 0) groups.push({ title: 'Completed', icon: '✓', data: completed });

    return groups.length > 0 ? groups : [{ title: '', icon: '', data: [] }];
  }, [filteredTasks, filterTab, todayIso]);

  // Progress metrics
  const totalCount = filteredTasks.length;
  const completedCount = filteredTasks.filter((t) => t.status === 'completed').length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggleTask = useCallback(async (task: Task) => {
    try {
      if (task.status === 'completed') {
        await uncompleteTask(task.id);
      } else {
        await completeTask(task.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update task.');
    }
  }, [completeTask, uncompleteTask]);

  const handleDeleteTask = useCallback((task: Task) => {
    Alert.alert(
      'Delete Task',
      `Delete "${task.title}"?`,
      [
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
      ]
    );
  }, [deleteTask]);

  const handleClearCompleted = () => {
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
              for (const t of completedList) {
                await deleteTask(t.id);
              }
              await refresh();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to clear completed tasks.');
            }
          },
        },
      ]
    );
  };

  const handleOpenFocus = useCallback((taskId?: string) => {
    setFocusTaskId(taskId);
    setFocusTimerVisible(true);
  }, []);

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'high':
        return { label: 'HIGH', color: '#EF4444', bg: '#EF444415' };
      case 'low':
        return { label: 'LOW', color: '#10B981', bg: '#10B98115' };
      case 'medium':
      default:
        return { label: 'MED', color: '#F59E0B', bg: '#F59E0B15' };
    }
  };

  const renderTaskItem = useCallback(
    ({ item: task }: { item: Task }) => {
      const isDone = task.status === 'completed';
      const prio = getPriorityBadge(task.priority);
      const isOverdue = Boolean(task.date && task.date < todayIso && !isDone);

      return (
        <View
          key={task.id}
          style={[
            styles.taskCard,
            {
              backgroundColor: colors.surface,
              borderColor: isOverdue ? '#EF444460' : colors.borderSubtle,
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

          {/* Task Info Column - Tap to Edit */}
          <TouchableOpacity
            style={styles.taskInfo}
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
              <View style={[styles.prioBadge, { backgroundColor: prio.bg }]}>
                <Text style={[styles.prioText, { color: prio.color }]}>{prio.label}</Text>
              </View>
            </View>

            {/* Sub-row: Category, Date, Time */}
            <View style={styles.taskMetaRow}>
              {task.date && (
                <Text
                  style={[
                    styles.metaDate,
                    { color: isOverdue ? '#EF4444' : colors.textSecondary },
                  ]}
                >
                  📅 {isToday(parseISO(task.date)) ? 'Today' : isTomorrow(parseISO(task.date)) ? 'Tomorrow' : task.date}
                </Text>
              )}
              {task.startTime && (
                <Text style={[styles.metaTime, { color: colors.textSecondary }]}>
                  ⏰ {formatTimeTo12H(task.startTime)}
                </Text>
              )}
              {task.categoryName && (
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

            {/* Interactive Subtasks / Checklist Items */}
            {(() => {
              const bullets = parseBulletNotes(task.notes || task.description);
              if (bullets.length === 0) return null;
              return (
                <View style={styles.subtasksWrapper}>
                  {bullets.slice(0, 3).map((b, bIdx) => (
                    <TouchableOpacity
                      key={b.id || `bullet_${bIdx}`}
                      style={styles.subtaskRow}
                      onPress={() => toggleSubtask(task.id, bIdx)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.subtaskCheck, { color: colors.primary }]}>
                        {b.completed !== undefined ? (b.completed ? '☑' : '☐') : '•'}
                      </Text>
                      <Text
                        style={[
                          styles.subtaskText,
                          (b.completed || isDone) && styles.subtaskTextDone,
                          { color: b.completed || isDone ? colors.textMuted : colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {b.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {bullets.length > 3 && (
                    <Text style={[styles.subtaskMore, { color: colors.textMuted }]}>
                      +{bullets.length - 3} more subtasks...
                    </Text>
                  )}
                </View>
              );
            })()}
          </TouchableOpacity>

          {/* Actions: Quick Focus + Delete */}
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

  const handleGoBack = useCallback(() => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('WorkspaceSelect');
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [handleGoBack])
  );

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

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>All Tasks & Plan</Text>
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
          placeholder="Search all tasks, notes, categories..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.searchClear, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        {(
          [
            { key: 'all', label: 'All Tasks' },
            { key: 'today', label: 'Today' },
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'overdue', label: 'Overdue' },
            { key: 'high', label: 'High Priority' },
            { key: 'completed', label: 'Completed' },
            { key: 'q1', label: '⚡ Q1: Urgent & Imp' },
            { key: 'q2', label: '📅 Q2: Not Urgent & Imp' },
            { key: 'q3', label: '👥 Q3: Urgent & Not Imp' },
            { key: 'q4', label: '🗑️ Q4: Neither' },
          ] as { key: FilterTab; label: string }[]
        ).map((tab) => {
          const isActive = filterTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setFilterTab(tab.key)}
              style={[
                styles.tabPill,
                {
                  backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
                  borderColor: isActive ? colors.primary : colors.borderSubtle,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabPillText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Categories Horizontal Filter Chips */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategoryId(null)}
            style={[
              styles.catChip,
              {
                backgroundColor: !selectedCategoryId ? colors.primary + '20' : colors.surfaceElevated,
                borderColor: !selectedCategoryId ? colors.primary : colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.catChipText, { color: !selectedCategoryId ? colors.primary : colors.textSecondary }]}>
              All Categories
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategoryId(isSelected ? null : cat.id)}
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
      )}

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

      {/* Grouped Tasks Virtualized SectionList */}
      <SectionList
        sections={filteredTasks.length === 0 ? [] : groupedTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTaskItem}
        renderSectionHeader={renderSectionHeader}
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
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 10,
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
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
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
  filterScroll: {
    maxHeight: 36,
    marginBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryScroll: {
    maxHeight: 32,
    marginBottom: 8,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    marginBottom: 8,
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
  groupContainer: {
    marginBottom: 14,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 3,
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
});
