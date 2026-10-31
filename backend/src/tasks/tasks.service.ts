import {
  Injectable,
  NotFoundException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, LessThan } from 'typeorm';
import { TaskEntity } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncTasksDto } from './dto/sync-tasks.dto';

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private recurrenceIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
  ) {}

  onModuleInit() {
    // Proactively generate upcoming recurring tasks on server startup
    this.processServerRecurrences(3).catch((err) => {
      this.logger.warn(`Startup recurrence processing failed: ${err.message}`);
    });

    // Schedule automated recurrence processing every 6 hours
    this.recurrenceIntervalTimer = setInterval(() => {
      this.processServerRecurrences(3).catch((err) => {
        this.logger.warn(`Scheduled recurrence processing failed: ${err.message}`);
      });
    }, 6 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.recurrenceIntervalTimer) {
      clearInterval(this.recurrenceIntervalTimer);
      this.recurrenceIntervalTimer = null;
    }
  }

  async findAll(filters?: {
    status?: string;
    date?: string;
    quadrant?: string;
    categoryId?: string;
    userId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<TaskEntity[]> {
    const qb = this.taskRepo.createQueryBuilder('task');

    if (filters?.userId) {
      qb.andWhere('task.userId = :userId', { userId: filters.userId });
    }

    if (filters?.status) {
      qb.andWhere('task.status = :status', { status: filters.status });
    }
    if (filters?.date) {
      qb.andWhere('task.date = :date', { date: filters.date });
    }
    if (filters?.quadrant) {
      qb.andWhere('task.eisenhowerQuadrant = :quadrant', {
        quadrant: filters.quadrant,
      });
    }
    if (filters?.categoryId) {
      qb.andWhere('task.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });
    }
    if (filters?.search?.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(task.title) LIKE :q OR LOWER(task.description) LIKE :q OR LOWER(task.notes) LIKE :q)',
        { q },
      );
    }

    qb.orderBy('task.date', 'ASC')
      .addOrderBy(
        'CASE WHEN task.startTime IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('task.startTime', 'ASC')
      .addOrderBy('task.createdAt', 'DESC');

    if (filters?.limit && filters.limit > 0) {
      qb.take(filters.limit);
    }
    if (filters?.offset && filters.offset >= 0) {
      qb.skip(filters.offset);
    }

    return await qb.getMany();
  }

  async findById(id: string): Promise<TaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found.`);
    }
    return task;
  }

  async create(dto: CreateTaskDto): Promise<TaskEntity> {
    const recurrenceStr =
      typeof dto.recurrenceRule === 'object'
        ? JSON.stringify(dto.recurrenceRule)
        : dto.recurrenceRule || null;

    const task = this.taskRepo.create({
      id: dto.id,
      seriesId: dto.seriesId ?? null,
      userId: dto.userId ?? null,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      date: dto.date ?? null,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      priority: dto.priority ?? 'medium',
      categoryId: dto.categoryId ?? null,
      status: dto.status ?? 'pending',
      recurrenceRule: recurrenceStr,
      reminderMinutes: dto.reminderMinutes ?? 0,
      snoozeUntil: dto.snoozeUntil ?? null,
      notes: dto.notes ?? null,
      isLoudAlarm: Boolean(dto.isLoudAlarm),
      isOvernight: Boolean(dto.isOvernight),
      eisenhowerQuadrant: dto.eisenhowerQuadrant ?? null,
      accentColor: dto.accentColor ?? null,
      estimatedMinutes: dto.estimatedMinutes ?? null,
      completedAt: dto.completedAt ?? null,
    });

    return await this.taskRepo.save(task);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskEntity> {
    const existing = await this.findById(id);

    const recurrenceStr =
      dto.recurrenceRule !== undefined
        ? typeof dto.recurrenceRule === 'object'
          ? JSON.stringify(dto.recurrenceRule)
          : dto.recurrenceRule
        : existing.recurrenceRule;

    const updated = this.taskRepo.merge(existing, {
      seriesId: dto.seriesId !== undefined ? dto.seriesId : existing.seriesId,
      userId: dto.userId !== undefined ? dto.userId : existing.userId,
      title: dto.title !== undefined ? dto.title.trim() : existing.title,
      description:
        dto.description !== undefined ? dto.description : existing.description,
      date: dto.date !== undefined ? dto.date : existing.date,
      startTime:
        dto.startTime !== undefined ? dto.startTime : existing.startTime,
      endTime: dto.endTime !== undefined ? dto.endTime : existing.endTime,
      priority: dto.priority !== undefined ? dto.priority : existing.priority,
      categoryId:
        dto.categoryId !== undefined ? dto.categoryId : existing.categoryId,
      status: dto.status !== undefined ? dto.status : existing.status,
      recurrenceRule: recurrenceStr,
      reminderMinutes:
        dto.reminderMinutes !== undefined
          ? dto.reminderMinutes
          : existing.reminderMinutes,
      snoozeUntil:
        dto.snoozeUntil !== undefined ? dto.snoozeUntil : existing.snoozeUntil,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      isLoudAlarm:
        dto.isLoudAlarm !== undefined
          ? Boolean(dto.isLoudAlarm)
          : existing.isLoudAlarm,
      isOvernight:
        dto.isOvernight !== undefined
          ? Boolean(dto.isOvernight)
          : existing.isOvernight,
      eisenhowerQuadrant:
        dto.eisenhowerQuadrant !== undefined
          ? dto.eisenhowerQuadrant
          : existing.eisenhowerQuadrant,
      accentColor:
        dto.accentColor !== undefined ? dto.accentColor : existing.accentColor,
      estimatedMinutes:
        dto.estimatedMinutes !== undefined
          ? dto.estimatedMinutes
          : existing.estimatedMinutes,
      completedAt:
        dto.completedAt !== undefined ? dto.completedAt : existing.completedAt,
    });

    return await this.taskRepo.save(updated);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.taskRepo.delete(id);
    return (res.affected ?? 0) > 0;
  }

  async clearCompleted(): Promise<{ deletedCount: number }> {
    const res = await this.taskRepo.delete({ status: 'completed' });
    const count = res.affected ?? 0;
    this.logger.log(`Cleared ${count} completed tasks from backend database.`);
    return { deletedCount: count };
  }

  /**
   * Two-Way Delta Sync for Mobile Client
   */
  async sync(dto: SyncTasksDto): Promise<{
    serverTasks: TaskEntity[];
    serverDeletions: string[];
    timestamp: string;
  }> {
    // 1. Process client deletions
    if (dto.deletedIds && dto.deletedIds.length > 0) {
      await this.taskRepo.delete({ id: In(dto.deletedIds) });
    }

    // 2. Process client upserts
    if (dto.upserts && dto.upserts.length > 0) {
      for (const item of dto.upserts) {
        const recurrenceStr =
          typeof item.recurrenceRule === 'object'
            ? JSON.stringify(item.recurrenceRule)
            : item.recurrenceRule || null;

        await this.taskRepo.save({
          id: item.id,
          seriesId: item.seriesId ?? null,
          userId: item.userId ?? null,
          title: item.title.trim(),
          description: item.description?.trim() ?? null,
          date: item.date ?? null,
          startTime: item.startTime ?? null,
          endTime: item.endTime ?? null,
          priority: item.priority ?? 'medium',
          categoryId: item.categoryId ?? null,
          status: item.status ?? 'pending',
          recurrenceRule: recurrenceStr,
          reminderMinutes: item.reminderMinutes ?? 0,
          snoozeUntil: item.snoozeUntil ?? null,
          notes: item.notes ?? null,
          isLoudAlarm: Boolean(item.isLoudAlarm),
          isOvernight: Boolean(item.isOvernight),
          eisenhowerQuadrant: item.eisenhowerQuadrant ?? null,
          accentColor: item.accentColor ?? null,
          estimatedMinutes: item.estimatedMinutes ?? null,
          completedAt: item.completedAt ?? null,
        });
      }
    }

    // 3. Query all current server tasks to return to client
    const serverTasks = await this.taskRepo.find();

    return {
      serverTasks,
      serverDeletions: [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Server-Side Recurrence Generator
   * Background task generating recurring task instances 7 days in advance.
   */
  async processServerRecurrences(daysAhead = 7): Promise<{ spawnedCount: number }> {
    const recurringTasks = await this.taskRepo
      .createQueryBuilder('task')
      .where("task.recurrenceRule IS NOT NULL AND task.recurrenceRule != 'null'")
      .andWhere("task.status != 'cancelled'")
      .getMany();

    let spawnedCount = 0;
    const now = new Date();
    const targetDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const targetDateStr = targetDate.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    for (const task of recurringTasks) {
      try {
        const rule = JSON.parse(task.recurrenceRule || '{}');
        if (!rule || rule.type === 'none' || !task.date) continue;

        let curDate = new Date(task.date);
        let safety = 0;

        while (safety < 30) {
          safety++;
          // Step date forward
          if (rule.type === 'daily') {
            curDate.setDate(curDate.getDate() + (rule.interval || 1));
          } else if (rule.type === 'weekly') {
            curDate.setDate(curDate.getDate() + (rule.interval || 1) * 7);
          } else if (rule.type === 'monthly') {
            curDate.setMonth(curDate.getMonth() + (rule.interval || 1));
          } else {
            curDate.setDate(curDate.getDate() + 1);
          }

          const nextDateStr = curDate.toISOString().slice(0, 10);
          if (nextDateStr > targetDateStr) break;
          if (nextDateStr < todayStr) continue;

          // Check if instance already exists
          const existing = await this.taskRepo.findOne({
            where: {
              seriesId: task.seriesId || task.id,
              date: nextDateStr,
            },
          });

          if (!existing) {
            const newId = `srv_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await this.taskRepo.save({
              id: newId,
              seriesId: task.seriesId || task.id,
              title: task.title,
              description: task.description,
              date: nextDateStr,
              startTime: task.startTime,
              endTime: task.endTime,
              priority: task.priority,
              categoryId: task.categoryId,
              status: 'pending',
              recurrenceRule: task.recurrenceRule,
              reminderMinutes: task.reminderMinutes,
              isLoudAlarm: task.isLoudAlarm,
              isOvernight: task.isOvernight,
              eisenhowerQuadrant: task.eisenhowerQuadrant,
              accentColor: task.accentColor,
              estimatedMinutes: task.estimatedMinutes,
            });
            spawnedCount++;
          }
        }
      } catch (e) {
        this.logger.warn(`Failed recurrence processing for task ${task.id}:`, e);
      }
    }

    this.logger.log(`Server recurrence expansion created ${spawnedCount} occurrences.`);
    return { spawnedCount };
  }
}
