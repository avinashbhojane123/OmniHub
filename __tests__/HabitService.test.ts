import { habitService } from '../src/services/habits/HabitService';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { alarmService } from '../src/services/alarm/AlarmService';
import { getDatabase } from '../src/database/connection';
import { format, subDays } from 'date-fns';

describe('HabitService Test Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    // Clean up habits
    const habits = await habitRepository.findAll();
    for (const h of habits) {
      await habitRepository.delete(h.id);
    }
    jest.clearAllMocks();
  });

  it('validates habit name cannot be empty', async () => {
    await expect(
      habitService.createHabit({
        name: '   ',
        icon: 'star',
        color: '#3B82F6',
        recurrenceRule: { type: 'daily' },
      })
    ).rejects.toThrow('Habit name cannot be empty.');
  });

  it('creates habit and schedules alarm with proper days for weekdays', async () => {
    const scheduleSpy = jest.spyOn(alarmService, 'scheduleHabitAlarm').mockResolvedValue(undefined as any);

    const habit = await habitService.createHabit({
      name: 'Morning Workout',
      description: '30 mins cardio',
      icon: 'dumbbell',
      color: '#EF4444',
      recurrenceRule: { type: 'weekdays' },
      target: 1,
      reminderTime: '07:00',
    });

    expect(habit.id).toBeDefined();
    expect(habit.name).toBe('Morning Workout');
    expect(habit.target).toBe(1);
    expect(habit.reminderTime).toBe('07:00');

    // Weekdays should resolve to [1, 2, 3, 4, 5]
    expect(scheduleSpy).toHaveBeenCalledWith(
      habit.id,
      'Morning Workout',
      '07:00',
      [1, 2, 3, 4, 5]
    );
  });

  it('updates habit details and updates alarm schedule', async () => {
    const scheduleSpy = jest.spyOn(alarmService, 'scheduleHabitAlarm').mockResolvedValue(undefined as any);
    const cancelSpy = jest.spyOn(alarmService, 'cancelHabitAlarm').mockResolvedValue(undefined as any);

    const habit = await habitService.createHabit({
      name: 'Read Books',
      icon: 'book',
      color: '#10B981',
      recurrenceRule: { type: 'daily' },
      reminderTime: '21:00',
    });

    // Update reminder time to 22:00
    const updated = await habitService.updateHabit(habit.id, {
      reminderTime: '22:00',
    });

    expect(updated?.reminderTime).toBe('22:00');
    expect(scheduleSpy).toHaveBeenLastCalledWith(
      habit.id,
      'Read Books',
      '22:00',
      [0, 1, 2, 3, 4, 5, 6]
    );

    // Now remove reminder
    const updatedNoReminder = await habitService.updateHabit(habit.id, {
      reminderTime: '',
    });
    expect(updatedNoReminder?.reminderTime).toBeUndefined();
    expect(cancelSpy).toHaveBeenCalledWith(habit.id);
  });

  it('archives and unarchives habits, managing alarms appropriately', async () => {
    const scheduleSpy = jest.spyOn(alarmService, 'scheduleHabitAlarm').mockResolvedValue(undefined as any);
    const cancelSpy = jest.spyOn(alarmService, 'cancelHabitAlarm').mockResolvedValue(undefined as any);

    const habit = await habitService.createHabit({
      name: 'Meditation',
      icon: 'heart',
      color: '#8B5CF6',
      recurrenceRule: { type: 'daily' },
      reminderTime: '08:00',
    });

    // Archive habit
    const archived = await habitService.archiveHabit(habit.id);
    expect(archived?.archivedAt).toBeDefined();
    expect(cancelSpy).toHaveBeenCalledWith(habit.id);

    // Active habits should no longer list it
    const active = await habitService.getActiveHabits();
    expect(active.some((h) => h.id === habit.id)).toBe(false);

    // Unarchive habit
    const unarchived = await habitService.unarchiveHabit(habit.id);
    expect(unarchived?.archivedAt).toBeUndefined();
    expect(scheduleSpy).toHaveBeenCalledWith(
      habit.id,
      'Meditation',
      '08:00',
      [0, 1, 2, 3, 4, 5, 6]
    );
  });

  it('logs habit completions and toggles today and past dates', async () => {
    const habit = await habitService.createHabit({
      name: 'Hydration',
      icon: 'water',
      color: '#06B6D4',
      recurrenceRule: { type: 'daily' },
    });

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    // Toggle today
    const log1 = await habitService.toggleHabitToday(habit.id, false, 'Drank 2L');
    expect(log1.completed).toBe(true);
    expect(log1.notes).toBe('Drank 2L');

    // Toggle yesterday
    const log2 = await habitService.toggleHabitForDate(habit.id, yesterdayStr, false);
    expect(log2.completed).toBe(true);

    const logs = await habitService.getHabitLogs(habit.id);
    expect(logs.length).toBe(2);
  });

  it('preserves surrounding markdown descriptions when managing subtasks', async () => {
    const habit = await habitService.createHabit({
      name: 'Morning Routine',
      description: '### Essential Routine\nMust do before 9am.\n[ ] Drink water\n[ ] 10 pushups',
      icon: 'sun',
      color: '#F59E0B',
      recurrenceRule: { type: 'daily' },
    });

    // Toggle first subtask
    const toggled = await habitService.toggleHabitSubtask(habit.id, 0);
    expect(toggled?.description).toContain('### Essential Routine');
    expect(toggled?.description).toContain('Must do before 9am.');
    expect(toggled?.description).toContain('[x] Drink water');

    // Add subtask
    const added = await habitService.addHabitSubtask(habit.id, 'Make bed');
    expect(added?.description).toContain('[ ] Make bed');
    expect(added?.description).toContain('### Essential Routine');

    // Delete subtask 0 ('Drink water')
    const deleted = await habitService.deleteHabitSubtask(habit.id, 0);
    expect(deleted?.description).toContain('### Essential Routine');
    expect(deleted?.description).toContain('Must do before 9am.');
    expect(deleted?.description).not.toContain('Drink water');
    expect(deleted?.description).toContain('[ ] 10 pushups');
    expect(deleted?.description).toContain('[ ] Make bed');
  });

  it('computes streak correctly with getHabitsWithStreaks', async () => {
    const habit = await habitService.createHabit({
      name: 'Daily Yoga',
      icon: 'heart',
      color: '#EC4899',
      recurrenceRule: { type: 'daily' },
    });

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    // Complete yesterday and today
    await habitService.logHabit(habit.id, yesterdayStr, true);
    await habitService.logHabit(habit.id, todayStr, true);

    const habitsWithStreaks = await habitService.getHabitsWithStreaks(todayStr);
    const yoga = habitsWithStreaks.find((h) => h.id === habit.id);
    expect(yoga).toBeDefined();
    expect(yoga?.completedToday).toBe(true);
    expect(yoga?.currentStreak).toBe(2);
    expect(yoga?.bestStreak).toBe(2);
  });
});

