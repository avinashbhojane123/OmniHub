import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useTheme';
import { goalService } from '../services/goals/GoalService';
import { goalRepository } from '../database/repositories/GoalRepository';
import { useTasks } from '../hooks/useTasks';
import { ProgressBar } from '../components/ProgressBar';
import { DateTimePickerModal } from '../components/DateTimePickerModal';
import { Goal, Task } from '../types';
import { radius, spacing, typography } from '../theme';
import { format } from 'date-fns';

const PRESET_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6'];

export const GoalsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { tasks } = useTasks();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [deadlinePickerVisible, setDeadlinePickerVisible] = useState(false);
  const [goalColor, setGoalColor] = useState(PRESET_COLORS[0]);
  const [goalCategory, setGoalCategory] = useState('Personal');

  // Linked Tasks Modal
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [goalTasks, setGoalTasks] = useState<Task[]>([]);
  const [taskModalVisible, setTaskModalVisible] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true);
      const all = await goalService.getAllGoals();
      setGoals(all);
    } catch (e) {
      console.warn('Failed to load goals:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const handleCreateGoal = async () => {
    if (!goalTitle.trim()) {
      Alert.alert('Validation Error', 'Please enter a goal title.');
      return;
    }
    try {
      await goalService.createGoal({
        title: goalTitle.trim(),
        description: goalDescription.trim() || undefined,
        deadline: goalDeadline.trim() || undefined,
        color: goalColor,
        category: goalCategory,
      });
      setModalVisible(false);
      setGoalTitle('');
      setGoalDescription('');
      setGoalDeadline('');
      setGoalCategory('Personal');
      await loadGoals();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not save goal.');
    }
  };

  const handleDeleteGoal = (goal: Goal) => {
    Alert.alert('Delete Goal', `Are you sure you want to delete "${goal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await goalService.deleteGoal(goal.id);
          await loadGoals();
        },
      },
    ]);
  };

  const handleUpdateProgress = async (goalId: string, newProgress: number) => {
    const goal = goals.find((g) => g.id === goalId);
    if (goal && (goal.tasksCount || 0) > 0) {
      Alert.alert(
        'Auto-Calculated Goal',
        'This goal has linked tasks. Its progress is automatically tracked as you complete linked tasks.'
      );
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
    await goalRepository.update(goalId, { progress: clamped });
    await loadGoals();
  };

  const handleOpenTasksModal = async (goal: Goal) => {
    setSelectedGoal(goal);
    const linked = await goalService.getGoalTasks(goal.id);
    setGoalTasks(linked);
    setTaskModalVisible(true);
  };

  const handleToggleLinkTask = async (taskId: string) => {
    if (!selectedGoal) return;
    const isLinked = goalTasks.some((t) => t.id === taskId);
    if (isLinked) {
      await goalService.unlinkTaskFromGoal(selectedGoal.id, taskId);
    } else {
      await goalService.linkTaskToGoal(selectedGoal.id, taskId);
    }
    const updated = await goalService.getGoalTasks(selectedGoal.id);
    setGoalTasks(updated);
    await loadGoals();
  };

  const averageProgress =
    goals.length > 0
      ? Math.round(goals.reduce((acc, g) => acc + (g.progress || 0), 0) / goals.length)
      : 0;

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
              Life Goals
            </Text>
            <Text style={[styles.headerSubtitle, typography.caption, { color: colors.textSecondary }]}>
              Milestones, Aspirations & Long-term Targets
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Add New Goal"
          >
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {/* Overview Card */}
        {goals.length > 0 && (
          <View
            style={[
              styles.overviewCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.overviewHeader}>
              <Text style={[styles.overviewTitle, typography.title, { color: colors.text }]}>
                🎯 Overall Progress
              </Text>
              <Text style={[styles.overviewPercent, { color: colors.primary }]}>
                {averageProgress}%
              </Text>
            </View>
            <ProgressBar percentage={averageProgress} label="Overall Completion" />
            <View style={styles.statsRow}>
              <Text style={[styles.statsItem, typography.caption, { color: colors.textSecondary }]}>
                Total Goals: {goals.length}
              </Text>
              <Text style={[styles.statsItem, typography.caption, { color: colors.textSecondary }]}>
                Completed: {goals.filter((g) => g.progress >= 100).length}
              </Text>
            </View>
          </View>
        )}

        {/* Goals List */}
        <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
          {goals.length === 0 && !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={[styles.emptyTitle, typography.headerMedium, { color: colors.text }]}>
                No Goals Set Yet
              </Text>
              <Text style={[styles.emptySubtitle, typography.body, { color: colors.textSecondary }]}>
                Define your first life milestone, track progress, and link daily tasks to stay focused.
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.emptyBtnText}>+ Create Your First Goal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            goals.map((goal) => {
              const p = goal.progress || 0;
              const isCompleted = p >= 100;
              return (
                <View
                  key={goal.id}
                  style={[
                    styles.goalCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isCompleted ? colors.primary : colors.cardBorder,
                      borderLeftColor: goal.color || colors.primary,
                    },
                  ]}
                >
                  <View style={styles.goalCardHeader}>
                    <View style={styles.goalTitleCol}>
                      <Text style={[styles.goalTitle, typography.title, { color: colors.text }]}>
                        {goal.title}
                      </Text>
                      {goal.description ? (
                        <Text
                          style={[
                            styles.goalDesc,
                            typography.body,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {goal.description}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteGoal(goal)}
                      style={styles.deleteIconBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Delete Goal"
                    >
                      <Text style={[styles.deleteIcon, { color: colors.danger }]}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Badges */}
                  <View style={styles.badgeRow}>
                    {goal.category ? (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: `${goal.color || colors.primary}20` },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: goal.color || colors.primary }]}>
                          {goal.category}
                        </Text>
                      </View>
                    ) : null}
                    {goal.deadline ? (
                      <View
                        style={[styles.badge, { backgroundColor: colors.surfaceElevated }]}
                      >
                        <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                          📅 Due {goal.deadline}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Progress Bar & Percent */}
                  <View style={styles.progressRow}>
                    <ProgressBar percentage={p} label="Goal Milestone" />
                  </View>

                  {/* Action Controls */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => handleOpenTasksModal(goal)}
                      style={[styles.linkedBtn, { backgroundColor: colors.surfaceElevated }]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.linkedBtnText, { color: colors.primary }]}>
                        🔗 Linked Tasks
                      </Text>
                    </TouchableOpacity>

                    {(goal.tasksCount || 0) > 0 ? (
                      <View style={[styles.autoBadge, { backgroundColor: `${colors.primary}18` }]}>
                        <Text style={[styles.stepBtnText, { color: colors.primary }]}>
                          Auto ({goal.completedTasksCount || 0}/{goal.tasksCount} done)
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.quickProgressRow}>
                        <TouchableOpacity
                          onPress={() => handleUpdateProgress(goal.id, p - 25)}
                          style={[styles.stepBtn, { backgroundColor: colors.surfaceElevated }]}
                        >
                          <Text style={[styles.stepBtnText, { color: colors.text }]}>-25%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateProgress(goal.id, p + 25)}
                          style={[styles.stepBtn, { backgroundColor: colors.surfaceElevated }]}
                        >
                          <Text style={[styles.stepBtnText, { color: colors.text }]}>+25%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateProgress(goal.id, 100)}
                          style={[styles.stepBtn, { backgroundColor: `${colors.primary}20` }]}
                        >
                          <Text style={[styles.stepBtnText, { color: colors.primary }]}>✓ 100%</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* New Goal Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, typography.title, { color: colors.text }]}>
              Create New Life Goal
            </Text>

            <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
              GOAL TITLE *
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="e.g. Run a Half Marathon, Learn TypeScript..."
              placeholderTextColor={colors.textMuted}
              value={goalTitle}
              onChangeText={setGoalTitle}
            />

            <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
              DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                styles.textArea,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="Key milestones or motivation..."
              placeholderTextColor={colors.textMuted}
              value={goalDescription}
              onChangeText={setGoalDescription}
              multiline
            />

            <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
              TARGET DEADLINE (YYYY-MM-DD)
            </Text>
            <TouchableOpacity
              onPress={() => setDeadlinePickerVisible(true)}
              style={[
                styles.textInput,
                styles.dateCardRow,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <Text style={[typography.body, { color: goalDeadline ? colors.text : colors.textMuted }]}>
                {goalDeadline ? `📅 ${goalDeadline}` : `📅 Set Target Date (${format(new Date(), 'yyyy-MM-dd')})`}
              </Text>
              <Text style={[typography.caption, { color: colors.primary }]}>Pick ▾</Text>
            </TouchableOpacity>

            {/* Category Selector */}
            <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
              CATEGORY
            </Text>
            <View style={styles.categoryRow}>
              {['Personal', 'Career', 'Health', 'Finance', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setGoalCategory(cat)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: goalCategory === cat ? colors.primary : colors.surfaceElevated,
                      borderColor: goalCategory === cat ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: colors.textSecondary },
                      goalCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Color Palette */}
            <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
              THEME COLOR
            </Text>
            <View style={styles.colorPalette}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setGoalColor(c)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    goalColor === c ? styles.colorCircleActive : null,
                  ]}
                />
              ))}
            </View>

            {/* Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.borderSubtle }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateGoal}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalSaveText}>Create Goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Linked Tasks Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, typography.title, { color: colors.text }]}>
              Linked Tasks: {selectedGoal?.title}
            </Text>
            <Text style={[styles.modalSubtitle, typography.caption, { color: colors.textSecondary }]}>
              Select daily tasks that contribute to this goal.
            </Text>

            <ScrollView style={styles.tasksListScroll} showsVerticalScrollIndicator={false}>
              {tasks.length === 0 ? (
                <Text style={[styles.emptyTasksText, { color: colors.textMuted }]}>
                  No tasks available. Create tasks in the Tasks tab first.
                </Text>
              ) : (
                tasks.map((t) => {
                  const isLinked = goalTasks.some((gt) => gt.id === t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => handleToggleLinkTask(t.id)}
                      style={[
                        styles.taskCheckRow,
                        {
                          backgroundColor: isLinked ? `${colors.primary}15` : colors.surfaceElevated,
                          borderColor: isLinked ? colors.primary : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text style={[styles.checkIcon, { color: isLinked ? colors.primary : colors.textMuted }]}>
                        {isLinked ? '☑' : '☐'}
                      </Text>
                      <View style={styles.taskCheckTextCol}>
                        <Text style={[styles.taskCheckTitle, { color: colors.text }]}>{t.title}</Text>
                        <Text style={[styles.taskCheckDate, { color: colors.textSecondary }]}>
                          {t.date} {t.startTime || ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setTaskModalVisible(false)}
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary, marginTop: spacing.md }]}
            >
              <Text style={styles.modalSaveText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DateTimePickerModal
        visible={deadlinePickerVisible}
        onClose={() => setDeadlinePickerVisible(false)}
        mode="date"
        selectedDate={goalDeadline || undefined}
        title="Set Goal Deadline"
        onConfirm={(date) => {
          setGoalDeadline(date);
        }}
      />
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
    marginBottom: spacing.md,
  },
  headerTitle: {
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: 2,
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  overviewCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  overviewTitle: {
    fontWeight: '700',
  },
  overviewPercent: {
    fontWeight: '800',
    fontSize: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  statsItem: {
    fontWeight: '500',
  },
  scrollList: {
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  goalCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: spacing.md,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  goalTitleCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  goalTitle: {
    fontWeight: '700',
  },
  goalDesc: {
    marginTop: 2,
    lineHeight: 18,
  },
  deleteIconBtn: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 4,
  },
  progressText: {
    fontWeight: '700',
    width: 38,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  linkedBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.xs,
  },
  linkedBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickProgressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  autoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.xs,
  },
  stepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.xs,
  },
  stepBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: {
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  modalSubtitle: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  colorPalette: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
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
  tasksListScroll: {
    maxHeight: 280,
    marginVertical: spacing.sm,
  },
  emptyTasksText: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontSize: 13,
  },
  taskCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  checkIcon: {
    fontSize: 18,
  },
  taskCheckTextCol: {
    flex: 1,
  },
  taskCheckTitle: {
    fontWeight: '600',
    fontSize: 13,
  },
  taskCheckDate: {
    fontSize: 11,
    marginTop: 2,
  },
  dateCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
