import { Goal, Task } from '../../types';
import { getDatabase } from '../connection';
import { taskRepository } from './TaskRepository';

export class GoalRepository {
  async findAll(): Promise<Goal[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM goals ORDER BY createdAt DESC');
    const goals: Goal[] = [];

    for (const r of result.rows) {
      const g = this.mapRow(r);
      const counts = await this.getTaskCounts(g.id);
      g.tasksCount = counts.total;
      g.completedTasksCount = counts.completed;
      if (counts.total > 0) {
        g.progress = Math.round((counts.completed / counts.total) * 100);
      }
      goals.push(g);
    }

    return goals;
  }

  async findById(id: string): Promise<Goal | null> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM goals WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    const g = this.mapRow(result.rows[0]);
    const counts = await this.getTaskCounts(g.id);
    g.tasksCount = counts.total;
    g.completedTasksCount = counts.completed;
    if (counts.total > 0) {
      g.progress = Math.round((counts.completed / counts.total) * 100);
    }
    return g;
  }

  async create(goal: Goal): Promise<Goal> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO goals (id, title, description, deadline, progress, color, category, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        goal.id,
        goal.title,
        goal.description ?? null,
        goal.deadline ?? null,
        goal.progress || 0,
        goal.color ?? null,
        goal.category ?? null,
        goal.createdAt,
        goal.updatedAt,
      ]
    );
    return goal;
  }

  async update(id: string, updates: Partial<Goal>): Promise<Goal | null> {
    const db = await getDatabase();
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
    if (updates.deadline !== undefined) {
      fields.push('deadline = ?');
      values.push(updates.deadline);
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }

    const updatedAt = new Date().toISOString();
    fields.push('updatedAt = ?');
    values.push(updatedAt);

    values.push(id);
    await db.execute(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    return await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM goal_tasks WHERE goalId = ?', [id]);
      const result = await tx.execute('DELETE FROM goals WHERE id = ?', [id]);
      return result.rowsAffected > 0;
    });
  }

  async linkTask(goalId: string, taskId: string): Promise<void> {
    const db = await getDatabase();
    const id = `gt_${goalId}_${taskId}`;
    await db.execute(
      'INSERT OR IGNORE INTO goal_tasks (id, goalId, taskId) VALUES (?, ?, ?)',
      [id, goalId, taskId]
    );
  }

  async unlinkTask(goalId: string, taskId: string): Promise<void> {
    const db = await getDatabase();
    await db.execute('DELETE FROM goal_tasks WHERE goalId = ? AND taskId = ?', [goalId, taskId]);
  }

  async getAllLinks(): Promise<{ id: string; goalId: string; taskId: string }[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM goal_tasks');
    return result.rows.map((r) => ({
      id: r.id,
      goalId: r.goalId,
      taskId: r.taskId,
    }));
  }

  async getTasksForGoal(goalId: string): Promise<Task[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM goal_tasks gt
       JOIN tasks t ON gt.taskId = t.id
       LEFT JOIN categories c ON t.categoryId = c.id
       WHERE gt.goalId = ?`,
      [goalId]
    );
    return result.rows.map((r) => (taskRepository as any).mapRowToTask(r));
  }

  private async getTaskCounts(goalId: string): Promise<{ total: number; completed: number }> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT t.status
       FROM goal_tasks gt
       JOIN tasks t ON gt.taskId = t.id
       WHERE gt.goalId = ?`,
      [goalId]
    );
    const total = result.rows.length;
    const completed = result.rows.filter((r) => r.status === 'completed').length;
    return { total, completed };
  }

  private mapRow(row: any): Goal {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      deadline: row.deadline ?? undefined,
      progress: Number(row.progress || 0),
      color: row.color ?? undefined,
      category: row.category ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const goalRepository = new GoalRepository();
