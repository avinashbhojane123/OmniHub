import {
  isTask,
  isHabit,
  isRecurrenceRule,
  isCalendarEvent,
  isCategory,
  isBackupData,
  getPriorityWeight,
  isTaskCompleted,
  isTaskOverdue,
  Task,
  Habit,
  CalendarEvent,
  Category,
  BackupData,
  RecurrenceRule,
  RestoreMode,
  SyncEntityType,
  BatterySessionRecord,
  BatteryStatus,
  BatteryAlarmSettings,
} from '../src/types/index';

describe('Index Types & Core Entity Guards Suite', () => {
  describe('isTask Type Guard', () => {
    it('should return true for a fully valid task object', () => {
      const task: Task = {
        id: 'task_123',
        title: 'Review Project PRs',
        status: 'pending',
        priority: 'high',
        date: '2026-10-30',
        createdAt: '2026-10-30T08:00:00Z',
        updatedAt: '2026-10-30T08:00:00Z',
        startTime: '14:00',
        endTime: '15:00',
      };
      expect(isTask(task)).toBe(true);
    });

    it('should return false for null, undefined, or missing required fields', () => {
      expect(isTask(null)).toBe(false);
      expect(isTask(undefined)).toBe(false);
      expect(isTask({ id: '1', title: 'Missing status' })).toBe(false);
      expect(isTask({ id: '1', title: 'Task', status: 'pending', priority: 'low' })).toBe(false);
    });
  });

  describe('isRecurrenceRule Type Guard', () => {
    it('should return true for all valid recurrence types', () => {
      const types = [
        'none',
        'daily',
        'weekdays',
        'weekends',
        'weekly',
        'monthly',
        'yearly',
        'custom',
      ] as const;

      types.forEach((type) => {
        const rule: RecurrenceRule = { type, interval: 1 };
        expect(isRecurrenceRule(rule)).toBe(true);
      });
    });

    it('should return false for invalid recurrence types or non-objects', () => {
      expect(isRecurrenceRule({ type: 'biweekly' })).toBe(false);
      expect(isRecurrenceRule({ type: 'century' })).toBe(false);
      expect(isRecurrenceRule(null)).toBe(false);
      expect(isRecurrenceRule(undefined)).toBe(false);
    });
  });

  describe('isHabit Type Guard', () => {
    it('should return true for a valid habit object with valid recurrence', () => {
      const habit: Habit = {
        id: 'habit_1',
        name: 'Daily Meditation',
        icon: '🧘',
        color: '#8B5CF6',
        category: 'Mindfulness',
        target: 1,
        recurrenceRule: { type: 'daily', interval: 1 },
        createdAt: '2026-10-30T08:00:00Z',
      };
      expect(isHabit(habit)).toBe(true);
    });

    it('should return false if target is not a number or recurrence is invalid', () => {
      expect(
        isHabit({
          id: 'habit_1',
          name: 'Meditation',
          icon: '🧘',
          color: '#8B5CF6',
          target: 'one' as any,
          recurrenceRule: { type: 'daily' },
          createdAt: '2026-10-30',
        })
      ).toBe(false);

      expect(
        isHabit({
          id: 'habit_1',
          name: 'Meditation',
          icon: '🧘',
          color: '#8B5CF6',
          target: 1,
          recurrenceRule: { type: 'invalid_type' as any },
          createdAt: '2026-10-30',
        })
      ).toBe(false);
    });
  });

  describe('isCalendarEvent Type Guard', () => {
    it('should return true for valid calendar event objects', () => {
      const event: CalendarEvent = {
        id: 'calev_1',
        title: 'Team Standup',
        date: '2026-10-30',
        time: '09:30',
        ringAlarm: true,
        status: 'active',
        createdAt: '2026-10-30T08:00:00Z',
        updatedAt: '2026-10-30T08:00:00Z',
      };
      expect(isCalendarEvent(event)).toBe(true);
    });

    it('should return false if ringAlarm is not a boolean or time is missing', () => {
      expect(
        isCalendarEvent({
          id: 'calev_1',
          title: 'Event',
          date: '2026-10-30',
          ringAlarm: 'yes' as any,
          status: 'active',
          createdAt: '2026-10-30',
          updatedAt: '2026-10-30',
        })
      ).toBe(false);
    });
  });

  describe('isCategory Type Guard', () => {
    it('should return true for valid categories', () => {
      const cat: Category = {
        id: 'cat_work',
        name: 'Work & Projects',
        color: '#3B82F6',
        icon: '💼',
        createdAt: '2026-10-30T08:00:00Z',
      };
      expect(isCategory(cat)).toBe(true);
    });

    it('should return false for missing icon, color, or name', () => {
      expect(isCategory({ id: 'cat_1', name: 'Work' })).toBe(false);
      expect(isCategory(null)).toBe(false);
    });
  });

  describe('isBackupData Type Guard', () => {
    it('should return true for a valid full backup payload', () => {
      const backup: BackupData = {
        version: 1,
        createdAt: '2026-10-30T10:00:00Z',
        tasks: [],
        categories: [],
        habits: [],
        habitLogs: [],
        notes: [],
        settings: { notificationsEnabled: 'true' },
        movieBookmarks: [],
        batterySessions: [],
      };
      expect(isBackupData(backup)).toBe(true);
    });

    it('should return false if version or required arrays are missing', () => {
      expect(
        isBackupData({
          createdAt: '2026-10-30',
          tasks: [],
        })
      ).toBe(false);

      expect(
        isBackupData({
          version: 1,
          createdAt: '2026-10-30',
          tasks: 'not an array' as any,
          categories: [],
          habits: [],
          habitLogs: [],
          notes: [],
          settings: {},
        })
      ).toBe(false);
    });
  });

  describe('getPriorityWeight Helper', () => {
    it('should assign correct descending weights to priorities for sorting', () => {
      expect(getPriorityWeight('high')).toBe(3);
      expect(getPriorityWeight('medium')).toBe(2);
      expect(getPriorityWeight('low')).toBe(1);
      expect(getPriorityWeight(undefined)).toBe(0);
    });
  });

  describe('isTaskCompleted Helper', () => {
    it('should return true strictly when status is completed', () => {
      expect(isTaskCompleted('completed')).toBe(true);
      expect(isTaskCompleted('pending')).toBe(false);
      expect(isTaskCompleted('in_progress')).toBe(false);
      expect(isTaskCompleted('overdue')).toBe(false);
      expect(isTaskCompleted('cancelled')).toBe(false);
      expect(isTaskCompleted(undefined)).toBe(false);
    });
  });

  describe('isTaskOverdue Helper', () => {
    const today = '2026-10-30';
    const currentTime = '14:00';

    it('should return true if task date is before today', () => {
      expect(isTaskOverdue({ date: '2026-10-29', status: 'pending' }, today, currentTime)).toBe(
        true
      );
    });

    it('should return true if task date is today and startTime is before current time', () => {
      expect(
        isTaskOverdue(
          { date: today, startTime: '13:30', status: 'pending' },
          today,
          currentTime
        )
      ).toBe(true);
    });

    it('should return false if task date is today and startTime is in the future', () => {
      expect(
        isTaskOverdue(
          { date: today, startTime: '15:00', status: 'pending' },
          today,
          currentTime
        )
      ).toBe(false);
    });

    it('should return false if task is already completed or cancelled regardless of date', () => {
      expect(
        isTaskOverdue(
          { date: '2026-10-20', startTime: '10:00', status: 'completed' },
          today,
          currentTime
        )
      ).toBe(false);
      expect(
        isTaskOverdue(
          { date: '2026-10-20', startTime: '10:00', status: 'cancelled' },
          today,
          currentTime
        )
      ).toBe(false);
    });

    it('should return false if task has no date (backlog)', () => {
      expect(isTaskOverdue({ date: '', status: 'pending' }, today, currentTime)).toBe(false);
    });
  });

  describe('Exported Type Coverage', () => {
    it('should support RestoreMode and SyncEntityType types without type errors', () => {
      const modeReplace: RestoreMode = 'replace';
      const modeMerge: RestoreMode = 'merge';
      expect(modeReplace).toBe('replace');
      expect(modeMerge).toBe('merge');

      const entityTask: SyncEntityType = 'task';
      const entityBattery: SyncEntityType = 'batterySession';
      expect(entityTask).toBe('task');
      expect(entityBattery).toBe('batterySession');
    });

    it('should instantiate BatterySessionRecord and BatteryAlarmSettings objects correctly', () => {
      const session: BatterySessionRecord = {
        id: 'session_1',
        startTime: '2026-10-30T10:00:00Z',
        startLevel: 50,
        gained: 30,
        durationMinutes: 45,
        chargingType: 'AC',
        peakTemperature: 38.5,
        peakWattage: 25.0,
        avgSpeedPerHour: 40.0,
        completed: 1,
      };
      expect(session.gained).toBe(30);

      const settings: BatteryAlarmSettings = {
        batteryGuardActive: true,
        fullChargeAlarmEnabled: true,
        fullChargeTarget: 80,
        overchargeFailsafeEnabled: true,
        lowBatteryAlarmEnabled: true,
        lowBatteryTarget: 20,
        criticalLowAlarmEnabled: true,
        tempAlarmEnabled: true,
        tempTarget: 42,
        pluggedAlertEnabled: false,
        unpluggedAlertEnabled: false,
        continuousRingtone: true,
        vibrationEnabled: true,
        soundEnabled: true,
        autoRepeatAlarm: true,
      };
      expect(settings.fullChargeTarget).toBe(80);
    });
  });
});

