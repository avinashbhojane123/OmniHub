import { Task, UpdateTaskDTO, TaskStatus, TaskPriority } from '../../types';
import { getDatabase } from '../connection';
import { normalizeTimeTo24H } from '../../utils/time';
import { tombstoneRepository } from './TombstoneRepository';

export class TaskRepository {
  async create(task: Task): Promise<Task> {
    const db = await getDatabase();
    const recurrenceJson = task.recurrenceRule ? JSON.stringify(task.recurrenceRule) : null;

    const isLoudAlarmVal = task.recurrenceRule?.isLoudAlarm ? 1 : 0;
    const eisenhowerQuadrantVal = task.recurrenceRule?.eisenhowerQuadrant || null;
    const accentColorVal = task.recurrenceRule?.accentColor || null;
    const estimatedMinutesVal = task.recurrenceRule?.estimatedMinutes ?? null;

    await db.execute(
      `INSERT INTO tasks (
        id, seriesId, title, description, date, startTime, endTime,
        priority, categoryId, status, recurrenceRule,
        reminderMinutes, snoozeUntil, notes, isLoudAlarm, eisenhowerQuadrant, accentColor, estimatedMinutes,
        createdAt, updatedAt, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.seriesId ?? null,
        task.title,
        task.description ?? null,
        task.date,
        normalizeTimeTo24H(task.startTime) ?? null,
        normalizeTimeTo24H(task.endTime) ?? null,
        task.priority,
        task.categoryId ?? null,
        task.status,
        recurrenceJson,
        task.reminderMinutes ?? 0,
        task.snoozeUntil ?? null,
        task.notes ?? null,
        isLoudAlarmVal,
        eisenhowerQuadrantVal,
        accentColorVal,
        estimatedMinutesVal,
        task.createdAt,
        task.updatedAt,
        task.completedAt ?? null,
      ]
    );

    return task;
  }

  async findById(id: string): Promise<Task | null> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE t.id = ?`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTask(result.rows[0]);
  }

  async findAll(): Promise<Task[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       ORDER BY t.date ASC, t.startTime ASC, t.createdAt DESC`
    );

    return result.rows.map((r) => this.mapRowToTask(r));
  }

  async findByDate(date: string): Promise<Task[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE t.date = ?
       ORDER BY CASE WHEN t.startTime IS NULL THEN 1 ELSE 0 END, t.startTime ASC, t.createdAt ASC`,
      [date]
    );

    return result.rows.map((r) => this.mapRowToTask(r));
  }

  async findByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE t.date >= ? AND t.date <= ?
       ORDER BY t.date ASC, t.startTime ASC`,
      [startDate, endDate]
    );

    return result.rows.map((r) => this.mapRowToTask(r));
  }

  async findOverdue(today: string, currentTime: string): Promise<Task[]> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    // A task is overdue if:
    // 1. Status NOT IN ('completed', 'cancelled')
    // 2. Not currently snoozed in the future (snoozeUntil is null or past)
    // 3. Date is before today, OR Date is today AND startTime is before currentTime
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE (t.status NOT IN ('completed', 'cancelled'))
         AND (t.snoozeUntil IS NULL OR t.snoozeUntil <= ?)
         AND t.date IS NOT NULL AND t.date != ''
         AND (t.date < ? OR (t.date = ? AND t.startTime IS NOT NULL AND t.startTime != '' AND t.startTime < ?))
       ORDER BY t.date ASC, t.startTime ASC`,
      [nowIso, today, today, currentTime]
    );

    return result.rows.map((r) => this.mapRowToTask(r));
  }

  async update(id: string, updates: UpdateTaskDTO): Promise<Task | null> {
    const db = await getDatabase();
    const existing = await this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.seriesId !== undefined) {
      fields.push('seriesId = ?');
      values.push(updates.seriesId ?? null);
    }
    if (updates.date !== undefined) {
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.startTime !== undefined) {
      fields.push('startTime = ?');
      values.push(updates.startTime ? (normalizeTimeTo24H(updates.startTime) ?? null) : null);
    }
    if (updates.endTime !== undefined) {
      fields.push('endTime = ?');
      values.push(updates.endTime ? (normalizeTimeTo24H(updates.endTime) ?? null) : null);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.categoryId !== undefined) {
      fields.push('categoryId = ?');
      values.push(updates.categoryId);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.recurrenceRule !== undefined) {
      fields.push('recurrenceRule = ?');
      values.push(updates.recurrenceRule ? JSON.stringify(updates.recurrenceRule) : null);
      if (updates.recurrenceRule?.isLoudAlarm !== undefined) {
        fields.push('isLoudAlarm = ?');
        values.push(updates.recurrenceRule.isLoudAlarm ? 1 : 0);
      }
      if (updates.recurrenceRule?.eisenhowerQuadrant !== undefined) {
        fields.push('eisenhowerQuadrant = ?');
        values.push(updates.recurrenceRule.eisenhowerQuadrant || null);
      }
      if (updates.recurrenceRule?.accentColor !== undefined) {
        fields.push('accentColor = ?');
        values.push(updates.recurrenceRule.accentColor || null);
      }
      if (updates.recurrenceRule?.estimatedMinutes !== undefined) {
        fields.push('estimatedMinutes = ?');
        values.push(updates.recurrenceRule.estimatedMinutes ?? null);
      }
    }
    if (updates.reminderMinutes !== undefined) {
      fields.push('reminderMinutes = ?');
      values.push(updates.reminderMinutes);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if ('completedAt' in updates) {
      fields.push('completedAt = ?');
      values.push(updates.completedAt ?? null);
    }
    if (updates.snoozeUntil !== undefined) {
      fields.push('snoozeUntil = ?');
      values.push(updates.snoozeUntil);
    }

    const updatedAt = new Date().toISOString();
    fields.push('updatedAt = ?');
    values.push(updatedAt);

    values.push(id);

    await db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    await tombstoneRepository.recordDeleted(id, 'task');
    const result = await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
    return result.rowsAffected > 0;
  }

  async findBySeriesId(seriesId: string): Promise<Task[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE t.seriesId = ?
       ORDER BY t.date ASC, t.startTime ASC`,
      [seriesId]
    );
    return result.rows.map((r) => this.mapRowToTask(r));
  }

  async deleteBySeriesId(seriesId: string): Promise<boolean> {
    const db = await getDatabase();
    try {
      const seriesTasks = await this.findBySeriesId(seriesId);
      for (const t of seriesTasks) {
        await tombstoneRepository.recordDeleted(t.id, 'task');
      }
    } catch {}
    const result = await db.execute('DELETE FROM tasks WHERE seriesId = ?', [seriesId]);
    return result.rowsAffected > 0;
  }

  async search(query: string): Promise<Task[]> {
    const db = await getDatabase();
    const searchTerm = `%${query.trim().toLowerCase()}%`;
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE LOWER(t.title) LIKE ? OR LOWER(COALESCE(t.description, '')) LIKE ? OR LOWER(COALESCE(t.notes, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?
       ORDER BY t.date DESC, t.startTime ASC`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );

    return result.rows.map((r) => this.mapRowToTask(r));
  }

  public mapRowToTask(row: any): Task {
    let recurrenceRule;
    if (row.recurrenceRule) {
      try {
        recurrenceRule = JSON.parse(row.recurrenceRule);
      } catch {
        // ignore parse error
      }
    }

    if (
      row.isLoudAlarm !== undefined ||
      row.eisenhowerQuadrant ||
      row.accentColor ||
      row.estimatedMinutes !== undefined
    ) {
      const isLoud =
        row.isLoudAlarm !== undefined && row.isLoudAlarm !== null
          ? Boolean(row.isLoudAlarm)
          : recurrenceRule?.isLoudAlarm;
      const quad = row.eisenhowerQuadrant || recurrenceRule?.eisenhowerQuadrant;
      const accent = row.accentColor || recurrenceRule?.accentColor;
      const estMin =
        row.estimatedMinutes !== undefined && row.estimatedMinutes !== null
          ? Number(row.estimatedMinutes)
          : recurrenceRule?.estimatedMinutes;

      recurrenceRule = {
        ...(recurrenceRule || { type: 'none' }),
        ...(isLoud !== undefined ? { isLoudAlarm: isLoud } : {}),
        ...(quad ? { eisenhowerQuadrant: quad } : {}),
        ...(accent ? { accentColor: accent } : {}),
        ...(estMin !== undefined ? { estimatedMinutes: estMin } : {}),
      };
    }

    return {
      id: row.id,
      seriesId: row.seriesId ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      date: row.date,
      startTime: row.startTime ?? undefined,
      endTime: row.endTime ?? undefined,
      priority: (row.priority as TaskPriority) || 'medium',
      categoryId: row.categoryId ?? undefined,
      categoryName: row.categoryName ?? undefined,
      categoryColor: row.categoryColor ?? undefined,
      categoryIcon: row.categoryIcon ?? undefined,
      status: (row.status as TaskStatus) || 'pending',
      recurrenceRule,
      reminderMinutes: row.reminderMinutes !== null ? Number(row.reminderMinutes) : 0,
      snoozeUntil: row.snoozeUntil ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? undefined,
    };
  }
}

export const taskRepository = new TaskRepository();
