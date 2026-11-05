import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { parseTimeToMinutes, computeUnifiedNextUp, useToday } from '../src/hooks/useToday';
import DefaultUseToday from '../src/hooks/useToday';
import { Task, HabitWithStreak, CalendarEvent } from '../src/types';
import { format } from 'date-fns';

describe('useToday & Time Utilities Suite', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    ReactTestRenderer.act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  describe('1. parseTimeToMinutes', () => {
    it('should parse 24-hour time strings correctly', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('09:15')).toBe(555);
      expect(parseTimeToMinutes('14:30')).toBe(870);
      expect(parseTimeToMinutes('23:59')).toBe(1439);
      expect(parseTimeToMinutes('14:30:00')).toBe(870);
    });

    it('should parse 12-hour AM/PM time strings correctly', () => {
      expect(parseTimeToMinutes('12:00 AM')).toBe(0);
      expect(parseTimeToMinutes('12:30 AM')).toBe(30);
      expect(parseTimeToMinutes('09:15 AM')).toBe(555);
      expect(parseTimeToMinutes('12:00 PM')).toBe(720);
      expect(parseTimeToMinutes('12:45 PM')).toBe(765);
      expect(parseTimeToMinutes('02:30 PM')).toBe(870);
      expect(parseTimeToMinutes('11:59 pm')).toBe(1439);
    });

    it('should handle Unicode spaces and loose whitespace', () => {
      expect(parseTimeToMinutes('09:15\u00A0AM')).toBe(555);
      expect(parseTimeToMinutes('02:30\u202FPM')).toBe(870);
      expect(parseTimeToMinutes('  14:30  ')).toBe(870);
    });

    it('should return null for invalid, empty, or out-of-range times', () => {
      expect(parseTimeToMinutes(null)).toBeNull();
      expect(parseTimeToMinutes(undefined)).toBeNull();
      expect(parseTimeToMinutes('')).toBeNull();
      expect(parseTimeToMinutes('not-a-time')).toBeNull();
      expect(parseTimeToMinutes('25:00')).toBeNull();
      expect(parseTimeToMinutes('14:65')).toBeNull();
    });
  });

  describe('2. computeUnifiedNextUp', () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    it('should return null when no candidates are available', () => {
      const result = computeUnifiedNextUp(null, [], []);
      expect(result).toBeNull();
    });

    it('should identify active task candidate and format UnifiedNextUpItem', () => {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentM = String(now.getMinutes()).padStart(2, '0');

      const activeTask: Task = {
        id: 'task-1',
        title: 'High Priority Task',
        description: 'Deep work session',
        date: todayStr,
        startTime: `${currentH}:${currentM}`,
        priority: 'high',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = computeUnifiedNextUp(activeTask, [], []);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('task-1');
      expect(result?.type).toBe('task');
      expect(result?.title).toBe('High Priority Task');
    });

    it('should prioritize calendar events scheduled for upcoming hours', () => {
      const now = new Date();
      const nextH = (now.getHours() + 1) % 24;
      const timeStr = `${String(nextH).padStart(2, '0')}:00`;

      const calEvent: CalendarEvent = {
        id: 'cal-1',
        title: 'Team Sync Meeting',
        date: todayStr,
        time: timeStr,
        ringAlarm: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = computeUnifiedNextUp(null, [calEvent], []);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cal-1');
      expect(result?.type).toBe('calendar_event');
      expect(result?.title).toBe('Team Sync Meeting');
    });

    it('should filter out completed habits and recurrence mismatch', () => {
      const now = new Date();
      const currentDay = now.getDay();
      const otherDay = (currentDay + 2) % 7;

      const mismatchedHabit: HabitWithStreak = {
        id: 'hab-1',
        name: 'Gym Workout',
        target: 1,
        icon: '💪',
        color: '#10B981',
        reminderTime: '19:00',
        completedToday: false,
        currentStreak: 4,
        bestStreak: 10,
        weeklyLogs: {},
        recurrenceRule: { type: 'weekly', interval: 1, daysOfWeek: [otherDay] },
        createdAt: new Date().toISOString(),
      };

      const result = computeUnifiedNextUp(null, [], [mismatchedHabit]);
      expect(result).toBeNull();
    });

    it('should ignore tasks snoozed to a future date', () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const futureSnoozedTask: Task = {
        id: 'task-tomorrow',
        title: 'Deferred Task',
        date: todayStr,
        snoozeUntil: tomorrow.toISOString(),
        priority: 'high',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = computeUnifiedNextUp(futureSnoozedTask, [], []);
      expect(result).toBeNull();
    });

    it('should respect calendar event custom accentColor and endTime', () => {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const endH = String((now.getHours() + 2) % 24).padStart(2, '0');

      const customCalEvent: CalendarEvent = {
        id: 'cal-custom',
        title: 'Long Strategy Meeting',
        date: todayStr,
        time: `${currentH}:00`,
        endTime: `${endH}:00`,
        accentColor: '#8B5CF6',
        ringAlarm: false,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = computeUnifiedNextUp(null, [customCalEvent], []);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cal-custom');
      expect(result?.categoryColor).toBe('#8B5CF6');
      expect(result?.endTime).toBe(`${endH}:00`);
    });

    it('should filter out archived habits and habits with mismatched monthDay', () => {
      const now = new Date();
      const wrongMonthDay = (now.getDate() % 28) + 1; // Different day of month

      const archivedHabit: HabitWithStreak = {
        id: 'hab-archived',
        name: 'Old Habit',
        target: 1,
        icon: '📦',
        color: '#64748B',
        reminderTime: '12:00',
        completedToday: false,
        archivedAt: new Date().toISOString(),
        currentStreak: 0,
        bestStreak: 2,
        weeklyLogs: {},
        recurrenceRule: { type: 'daily' },
        createdAt: new Date().toISOString(),
      };

      const monthlyHabitWrongDay: HabitWithStreak = {
        id: 'hab-monthly',
        name: 'Pay Rent Habit',
        target: 1,
        icon: '💵',
        color: '#10B981',
        reminderTime: '12:00',
        completedToday: false,
        currentStreak: 0,
        bestStreak: 2,
        weeklyLogs: {},
        recurrenceRule: { type: 'monthly', interval: 1, monthDay: wrongMonthDay },
        createdAt: new Date().toISOString(),
      };

      expect(computeUnifiedNextUp(null, [], [archivedHabit])).toBeNull();
      expect(computeUnifiedNextUp(null, [], [monthlyHabitWrongDay])).toBeNull();
    });
  });

  describe('3. useToday Hook Export and Initialization', () => {
    it('should export both named and default useToday identically', () => {
      expect(useToday).toBeDefined();
      expect(DefaultUseToday).toBeDefined();
      expect(useToday).toBe(DefaultUseToday);
    });

    it('should initialize with expected state shapes and function handlers', async () => {
      let hookValue: any = null;
      function TestConsumer() {
        hookValue = useToday();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(<TestConsumer />);
        // Allow in-flight async refresh to resolve
        await Promise.resolve();
      });

      expect(hookValue).not.toBeNull();
      expect(Array.isArray(hookValue.todayTasks)).toBe(true);
      expect(Array.isArray(hookValue.overdueTasks)).toBe(true);
      expect(Array.isArray(hookValue.habits)).toBe(true);
      expect(Array.isArray(hookValue.calendarEvents)).toBe(true);
      expect(typeof hookValue.refreshToday).toBe('function');
      expect(typeof hookValue.toggleTask).toBe('function');
      expect(typeof hookValue.toggleHabit).toBe('function');
      expect(typeof hookValue.snoozeTask).toBe('function');
      expect(typeof hookValue.completionPercentage).toBe('number');
    });
  });
});
