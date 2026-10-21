import { Habit, HabitLog, HabitWithStreak } from '../../types';
import { getDatabase } from '../connection';
import { format, subDays, addDays, isBefore, parseISO } from 'date-fns';
import { tombstoneRepository } from './TombstoneRepository';

export class HabitRepository {
  async findAll(): Promise<Habit[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM habits ORDER BY createdAt DESC');
    return result.rows.map((r) => this.mapRow(r));
  }

  async findActive(): Promise<Habit[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM habits WHERE archivedAt IS NULL ORDER BY createdAt DESC');
    return result.rows.map((r) => this.mapRow(r));
  }

  async findById(id: string): Promise<Habit | null> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM habits WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async create(habit: Habit): Promise<Habit> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO habits (
        id, name, description, icon, color, recurrenceRule, target, reminderTime, createdAt, archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        habit.id,
        habit.name,
        habit.description ?? null,
        habit.icon,
        habit.color,
        JSON.stringify(habit.recurrenceRule),
        habit.target,
        habit.reminderTime ?? null,
        habit.createdAt,
        habit.archivedAt ?? null,
      ]
    );
    return habit;
  }

  async update(id: string, updates: Partial<Habit>): Promise<Habit | null> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.recurrenceRule !== undefined) {
      fields.push('recurrenceRule = ?');
      values.push(JSON.stringify(updates.recurrenceRule));
    }
    if (updates.target !== undefined) {
      fields.push('target = ?');
      values.push(updates.target);
    }
    if (updates.reminderTime !== undefined) {
      fields.push('reminderTime = ?');
      values.push(updates.reminderTime);
    }
    if (updates.archivedAt !== undefined) {
      fields.push('archivedAt = ?');
      values.push(updates.archivedAt);
    }

    values.push(id);
    await db.execute(`UPDATE habits SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    await tombstoneRepository.recordDeleted(id, 'habit');
    return await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM habit_logs WHERE habitId = ?', [id]);
      const result = await tx.execute('DELETE FROM habits WHERE id = ?', [id]);
      return result.rowsAffected > 0;
    });
  }

  async logHabit(habitId: string, date: string, completed: boolean, notes?: string): Promise<HabitLog> {
    const db = await getDatabase();
    const id = `log_${habitId}_${date}`;
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO habit_logs (id, habitId, date, completed, value, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(habitId, date) DO UPDATE SET
         completed = excluded.completed,
         notes = excluded.notes`,
      [id, habitId, date, completed ? 1 : 0, completed ? 1 : 0, notes ?? null, now]
    );

    return {
      id,
      habitId,
      date,
      completed,
      value: completed ? 1 : 0,
      notes,
      createdAt: now,
    };
  }

  async getLogsForHabit(habitId: string, startDate?: string, endDate?: string): Promise<HabitLog[]> {
    const db = await getDatabase();
    let query = 'SELECT * FROM habit_logs WHERE habitId = ?';
    const params: any[] = [habitId];

    if (startDate && endDate) {
      query += ' AND date >= ? AND date <= ?';
      params.push(startDate, endDate);
    }
    query += ' ORDER BY date DESC';

    const result = await db.execute(query, params);
    return result.rows.map((r) => ({
      id: r.id,
      habitId: r.habitId,
      date: r.date,
      completed: Boolean(r.completed),
      value: Number(r.value),
      notes: r.notes ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  async getLogsForDate(date: string): Promise<HabitLog[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM habit_logs WHERE date = ?', [date]);
    return result.rows.map((r) => ({
      id: r.id,
      habitId: r.habitId,
      date: r.date,
      completed: Boolean(r.completed),
      value: Number(r.value),
      notes: r.notes ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  async getHabitsWithStreaks(todayStr: string): Promise<HabitWithStreak[]> {
    const habits = await this.findActive();
    if (habits.length === 0) return [];

    const db = await getDatabase();
    const allLogsResult = await db.execute(
      'SELECT habitId, date FROM habit_logs WHERE completed = 1 ORDER BY date DESC'
    );
    const logsByHabit = new Map<string, string[]>();
    for (const r of allLogsResult.rows) {
      if (!logsByHabit.has(r.habitId)) {
        logsByHabit.set(r.habitId, []);
      }
      logsByHabit.get(r.habitId)!.push(r.date);
    }

    const result: HabitWithStreak[] = [];

    for (const habit of habits) {
      const completedDates = new Set(logsByHabit.get(habit.id) || []);

      let allowedDays = [0, 1, 2, 3, 4, 5, 6];
      if (habit.recurrenceRule?.daysOfWeek && habit.recurrenceRule.daysOfWeek.length > 0) {
        allowedDays = habit.recurrenceRule.daysOfWeek;
      } else if (habit.recurrenceRule?.type === 'weekdays') {
        allowedDays = [1, 2, 3, 4, 5];
      } else if (habit.recurrenceRule?.type === 'weekends') {
        allowedDays = [0, 6];
      }

      // Calculate current streak
      let currentStreak = 0;
      const today = parseISO(todayStr);
      const isTodayScheduled = allowedDays.includes(today.getDay());
      const completedToday = completedDates.has(todayStr);

      let checkDate = subDays(today, 1);

      if (isTodayScheduled && completedToday) {
        currentStreak++;
      }

      // Walk backward day by day checking consecutive scheduled days (supporting multi-year streaks)
      let daysChecked = 0;
      while (daysChecked < 3650) {
        daysChecked++;
        const dayOfWeek = checkDate.getDay();

        if (allowedDays.includes(dayOfWeek)) {
          const checkDateStr = format(checkDate, 'yyyy-MM-dd');
          if (completedDates.has(checkDateStr)) {
            currentStreak++;
            checkDate = subDays(checkDate, 1);
          } else {
            // First missed scheduled day breaks the active streak!
            break;
          }
        } else {
          // Non-scheduled day (e.g. rest day) is skipped without breaking streak
          checkDate = subDays(checkDate, 1);
        }
      }

      // Best streak calculation taking allowedDays into account
      const sortedDates = Array.from(completedDates).sort();
      let bestStreak = 0;
      let tempStreak = 0;
      let prevDate: Date | null = null;

      for (const dStr of sortedDates) {
        const curDate = parseISO(dStr);
        if (prevDate) {
          // Check if any scheduled day between prevDate and curDate was missed
          let missedScheduledDay = false;
          let checkD = addDays(prevDate, 1);
          while (isBefore(checkD, curDate)) {
            if (allowedDays.includes(checkD.getDay())) {
              missedScheduledDay = true;
              break;
            }
            checkD = addDays(checkD, 1);
          }

          if (!missedScheduledDay) {
            tempStreak++;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        if (tempStreak > bestStreak) {
          bestStreak = tempStreak;
        }
        prevDate = curDate;
      }
      bestStreak = Math.max(bestStreak, currentStreak);

      // Last 7 days map
      const weeklyLogs: { [date: string]: boolean } = {};
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(today, i), 'yyyy-MM-dd');
        weeklyLogs[d] = completedDates.has(d);
      }

      result.push({
        ...habit,
        currentStreak,
        bestStreak,
        completedToday,
        weeklyLogs,
      });
    }

    const parseTimeToMinutes = (timeStr?: string): number => {
      if (!timeStr) return 9999;
      const clean = timeStr.replace(/[⏰🕒]/g, '').trim();
      const ampmMatch = clean.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10);
        const m = parseInt(ampmMatch[2], 10);
        const p = ampmMatch[3].toUpperCase();
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
      if (h24Match) {
        return parseInt(h24Match[1], 10) * 60 + parseInt(h24Match[2], 10);
      }
      return 9999;
    };

    result.sort((a, b) => {
      const timeA = parseTimeToMinutes(a.reminderTime || a.description);
      const timeB = parseTimeToMinutes(b.reminderTime || b.description);
      if (timeA !== timeB) return timeA - timeB;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    return result;
  }

  private mapRow(row: any): Habit {
    let recurrenceRule = { type: 'daily' as const };
    if (row.recurrenceRule) {
      try {
        recurrenceRule = JSON.parse(row.recurrenceRule);
      } catch {
        // ignore
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon,
      color: row.color,
      recurrenceRule,
      target: Number(row.target || 1),
      reminderTime: row.reminderTime ?? undefined,
      createdAt: row.createdAt,
      archivedAt: row.archivedAt ?? undefined,
    };
  }
}

export const habitRepository = new HabitRepository();
