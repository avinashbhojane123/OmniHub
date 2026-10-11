import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTasks } from '../hooks/useTasks';
import { useAppTheme } from '../hooks/useTheme';
import { TaskCard } from '../components/TaskCard';
import { ProgressBar } from '../components/ProgressBar';
import { BellIllustration } from '../components/BellIllustration';
import { NotepadModal } from '../components/NotepadModal';
import { radius, spacing, typography } from '../theme';

interface TasksScreenProps {
  navigation: any;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const {
    tasks,
    refresh,
    deleteTask,
    completeTask,
    uncompleteTask,
    snoozeTask,
    searchTasks,
  } = useTasks();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'high'>('all');
  const [notepadVisible, setNotepadVisible] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status !== 'completed' && t.status !== 'cancelled';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'high') return t.priority === 'high';
    return true;
  });

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchTasks(text);
    }, 250);
  };

  const confirmDelete = (taskId: string, taskTitle: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && (task.seriesId || (task.recurrenceRule && task.recurrenceRule.type !== 'none'))) {
      Alert.alert(
        'Delete Recurring Task',
        `"${taskTitle}" is part of a recurring series. What would you like to delete?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This Task Only',
            style: 'destructive',
            onPress: () => deleteTask(taskId, false),
          },
          {
            text: 'All in Series',
            style: 'destructive',
            onPress: () => deleteTask(taskId, true),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${taskTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTask(taskId) },
      ]
    );
  };

  const handleClearCompleted = () => {
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    if (completedTasks.length === 0) return;

    Alert.alert(
      'Clear Completed Tasks',
      `Are you sure you want to delete ${completedTasks.length} completed ${
        completedTasks.length === 1 ? 'task' : 'tasks'
      }?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(completedTasks.map((t) => deleteTask(t.id)));
              refresh();
            } catch (err) {
              console.warn('Failed to clear completed tasks:', err);
            }
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 24),
        },
      ]}
    >
      <StatusBar barStyle={colors.statusBar} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, typography.headerLarge, { color: colors.text }]}>
              All Tasks
            </Text>
            <Text style={[styles.counter, typography.caption, { color: colors.textSecondary }]}>
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {tasks.some((t) => t.status === 'completed') && (
              <TouchableOpacity
                onPress={handleClearCompleted}
                style={[
                  styles.clearCompletedBtn,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Clear All Completed Tasks"
              >
                <Text style={[styles.clearCompletedBtnText, { color: colors.danger }]}>🧹 Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setNotepadVisible(true)}
              style={[styles.notesBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              accessibilityRole="button"
              accessibilityLabel="Open Standalone Notes"
            >
              <Text style={[styles.notesBtnText, { color: colors.primary }]}>📝 Notes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder="Search tasks, notes, categories..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            style={[styles.searchInput, typography.body, { color: colors.text }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearBtn}>
              <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Completion Progress Bar */}
        {tasks.length > 0 && (
          <View style={styles.progressSection}>
            <ProgressBar
              percentage={
                tasks.length > 0
                  ? Math.round(
                      (tasks.filter((t) => t.status === 'completed').length /
                        tasks.length) *
                        100
                    )
                  : 0
              }
              label={`Task Progress (${tasks.filter((t) => t.status === 'completed').length}/${tasks.length})`}
            />
          </View>
        )}

        {/* Filter Pills */}
        <View style={styles.filtersRow}>
          {(['all', 'pending', 'completed', 'high'] as const).map((f) => {
            const isSelected = filter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
                    borderColor: isSelected ? colors.primary : colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    typography.caption,
                    isSelected ? styles.filterTextActive : { color: colors.textSecondary },
                  ]}
                >
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tasks List */}
        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredTasks.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.borderSubtle }]}>
              <BellIllustration size={80} />
              <Text style={[styles.emptyTitle, typography.title, { color: colors.text }]}>
                {searchQuery ? 'No matching tasks found' : 'No tasks scheduled'}
              </Text>
              <Text style={[styles.emptySubtitle, typography.caption, { color: colors.textSecondary }]}>
                {searchQuery ? 'Try clearing your search query or filters.' : 'Tap + at the bottom to add your first task!'}
              </Text>
            </View>
          ) : (
            filteredTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onPress={() => navigation.navigate('CreateEditTask', { taskId: t.id })}
                onToggleComplete={() =>
                  t.status === 'completed' ? uncompleteTask(t.id) : completeTask(t.id)
                }
                onSnooze={() => snoozeTask(t.id)}
                onDelete={() => confirmDelete(t.id, t.title)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.brandDark,
            bottom: Math.max(insets.bottom, 16) + 16,
          },
        ]}
        onPress={() => navigation.navigate('CreateEditTask')}
        accessibilityRole="button"
        accessibilityLabel="Create New Task"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <NotepadModal visible={notepadVisible} onClose={() => setNotepadVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  clearCompletedBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  clearCompletedBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  notesBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  notesBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  headerTitle: {},
  counter: {
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
  },
  clearBtn: {
    padding: spacing.xs,
  },
  clearBtnText: {
    fontSize: 14,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  progressSection: {
    marginVertical: 4,
  },
  filterText: {
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#FFF',
  },
  listContent: {
    paddingBottom: 90,
  },
  emptyBox: {
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    marginTop: spacing.xl,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    marginBottom: 4,
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    color: '#FFF',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '600',
  },
});
