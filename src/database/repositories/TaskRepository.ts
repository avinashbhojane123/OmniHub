import { Task, UpdateTaskDTO, TaskStatus, TaskPriority } from '../../types';
import { getDatabase } from '../connection';
import { normalizeTimeTo24H } from '../../utils/time';

export class TaskRepository {
  async create(task: Task): Promise<Task> {
    const db = await getDatabase();
    const recurrenceJson = task.recurrenceRule ? JSON.stringify(task.recurrenceRule) : null;

    await db.execute(
      `INSERT INTO tasks (
        id, seriesId, title, description, date, startTime, endTime,
        priority, categoryId, status, recurrenceRule,
        reminderMinutes, snoozeUntil, notes, createdAt, updatedAt, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    // A task is overdue if:
    // 1. Date is before today AND status NOT IN ('completed', 'cancelled')
    // OR
    // 2. Date is today AND startTime is before currentTime AND status NOT IN ('completed', 'cancelled')
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM tasks t
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE (t.status NOT IN ('completed', 'cancelled'))
         AND t.date IS NOT NULL AND t.date != ''
         AND (t.date < ? OR (t.date = ? AND t.startTime IS NOT NULL AND t.startTime != '' AND t.startTime < ?))
       ORDER BY t.date ASC, t.startTime ASC`,
      [today, today, currentTime]
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
