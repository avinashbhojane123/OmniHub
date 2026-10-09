import { Goal, Task } from '../../types';
import { goalRepository } from '../../database/repositories/GoalRepository';

export class GoalService {
  async getAllGoals(): Promise<Goal[]> {
    return await goalRepository.findAll();
  }

  async createGoal(data: {
    title: string;
    description?: string;
    deadline?: string;
    color?: string;
    category?: string;
  }): Promise<Goal> {
    if (!data.title.trim()) {
      throw new Error('Goal title cannot be empty.');
    }

    const now = new Date().toISOString();
    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const goal: Goal = {
      id,
      title: data.title.trim(),
      description: data.description?.trim(),
      deadline: data.deadline,
      progress: 0,
      color: data.color || '#6366F1',
      category: data.category,
      createdAt: now,
      updatedAt: now,
    };

    return await goalRepository.create(goal);
  }

  async linkTaskToGoal(goalId: string, taskId: string): Promise<void> {
    await goalRepository.linkTask(goalId, taskId);
  }

  async unlinkTaskFromGoal(goalId: string, taskId: string): Promise<void> {
    await goalRepository.unlinkTask(goalId, taskId);
  }

  async getGoalTasks(goalId: string): Promise<Task[]> {
    return await goalRepository.getTasksForGoal(goalId);
  }

  async deleteGoal(goalId: string): Promise<boolean> {
    return await goalRepository.delete(goalId);
  }
}

export const goalService = new GoalService();
