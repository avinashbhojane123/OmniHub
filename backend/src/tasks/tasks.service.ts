import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TaskEntity } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncTasksDto } from './dto/sync-tasks.dto';

export interface TaskFilterOptions {
  status?: string;
  date?: string;
  quadrant?: string;
  categoryId?: string;
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SyncTasksResponse {
  serverTasks: TaskEntity[];
  serverDeletions: string[];
  timestamp: string;
}

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private recurrenceIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
  ) {}

  onModuleInit() {
    const startupDays =
      Number(process.env.TASK_STARTUP_RECURRENCE_DAYS) || 3;
    const intervalMs =
      Number(process.env.TASK_RECURRENCE_CHECK_INTERVAL_MS) ||
      6 * 60 * 60 * 1000;

    // Proactively generate upcoming recurring tasks on server startup
    this.processServerRecurrences(startupDays).catch((err) => {
      this.logger.warn(`Startup recurrence processing failed: ${err.message}`);
    });

    // Schedule automated recurrence processing
    this.recurrenceIntervalTimer = setInterval(() => {
      this.processServerRecurrences(startupDays).catch((err) => {
        this.logger.warn(
          `Scheduled recurrence processing failed: ${err.message}`,
        );
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.recurrenceIntervalTimer) {
      clearInterval(this.recurrenceIntervalTimer);
      this.recurrenceIntervalTimer = null;
    }
  }

  /**
   * Helper: Resets checklist bullets in raw text from [x]/[X] back to [ ]
   */
  private resetBullets(text?: string | null): string | null {
    if (!text) return null;
    return text.replace(/\[[xX]\]/g, '[ ]');
  }

  /**
   * Helper: Formats a UTC Date to YYYY-MM-DD
   */
  private formatUtcDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Helper: Parses YYYY-MM-DD safely into a UTC Date at 12:00:00 UTC
   * Setting midday prevents timezone boundary shifts and DST anomalies
   */
  private parseDateString(dateStr: string): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.trim().split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Helper: Computes the next recurrence date based on the recurrence rule.
   * Supports daily, weekdays, weekends, weekly (with daysOfWeek), monthly (with monthDay clamp), and yearly.
   */
  private advanceRecurrenceDate(
    currentDate: Date,
    rule: any,
    baseDate: Date,
  ): Date {
    const d = new Date(currentDate.getTime());
    const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;

    switch (rule.type) {
      case 'daily': {
        d.setUTCDate(d.getUTCDate() + interval);
        return d;
      }
      case 'weekdays': {
        for (let i = 0; i < interval; i++) {
          d.setUTCDate(d.getUTCDate() + 1);
          while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
            d.setUTCDate(d.getUTCDate() + 1);
          }
        }
        return d;
      }
      case 'weekends': {
        for (let i = 0; i < interval; i++) {
          d.setUTCDate(d.getUTCDate() + 1);
          while (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
            d.setUTCDate(d.getUTCDate() + 1);
          }
        }
        return d;
      }
      case 'weekly':
      case 'custom': {
        if (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0) {
          // Map to ISO day index: 1 = Monday ... 7 = Sunday
          const toIsoDay = (day: number) => (day === 0 ? 7 : day);
          const sortedDays = [...rule.daysOfWeek]
            .map(toIsoDay)
            .sort((a: number, b: number) => a - b);
          const currentIsoDay = toIsoDay(d.getUTCDay());
          const nextDayThisWeek = sortedDays.find((day) => day > currentIsoDay);
          if (nextDayThisWeek !== undefined) {
            d.setUTCDate(d.getUTCDate() + (nextDayThisWeek - currentIsoDay));
            return d;
          }
          const firstDayNextWeek = sortedDays[0];
          const daysToNextWeekStart = 8 - currentIsoDay;
          const daysToAdd =
            daysToNextWeekStart + (interval - 1) * 7 + (firstDayNextWeek - 1);
          d.setUTCDate(d.getUTCDate() + daysToAdd);
          return d;
        }
        d.setUTCDate(d.getUTCDate() + interval * 7);
        return d;
      }
      case 'monthly': {
        const originalDay = rule.monthDay || baseDate.getUTCDate();
        const currentYear = d.getUTCFullYear();
        const currentMonth = d.getUTCMonth();
        const targetTotalMonth = currentMonth + interval;
        const targetYear = currentYear + Math.floor(targetTotalMonth / 12);
        const targetMonth = ((targetTotalMonth % 12) + 12) % 12;
        // Last day of target month (using day 0 of month + 1)
        const maxDaysInTargetMonth = new Date(
          Date.UTC(targetYear, targetMonth + 1, 0),
        ).getUTCDate();
        const safeDay = Math.min(originalDay, maxDaysInTargetMonth);
        return new Date(Date.UTC(targetYear, targetMonth, safeDay, 12, 0, 0));
      }
      case 'yearly': {
        const originalDay = rule.monthDay || baseDate.getUTCDate();
        const targetYear = d.getUTCFullYear() + interval;
        const targetMonth = d.getUTCMonth();
        const maxDaysInTargetMonth = new Date(
          Date.UTC(targetYear, targetMonth + 1, 0),
        ).getUTCDate();
        const safeDay = Math.min(originalDay, maxDaysInTargetMonth);
        return new Date(Date.UTC(targetYear, targetMonth, safeDay, 12, 0, 0));
      }
      default: {
        d.setUTCDate(d.getUTCDate() + 1);
        return d;
      }
    }
  }

  async findAll(filters?: TaskFilterOptions): Promise<TaskEntity[]> {
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
      // Escape SQL LIKE wildcard characters to prevent pattern probing
      const sanitized = filters.search
        .trim()
        .replace(/[%_\\]/g, '\\$&')
        .toLowerCase();
      const q = `%${sanitized}%`;
      qb.andWhere(
        '(LOWER(task.title) LIKE :q OR LOWER(task.description) LIKE :q OR LOWER(task.notes) LIKE :q)',
        { q },
      );
    }

    // Cross-database NULL-safe ordering (PostgreSQL, SQLite, MySQL)
    qb.orderBy('CASE WHEN task.date IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('task.date', 'ASC')
      .addOrderBy('CASE WHEN task.startTime IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('task.startTime', 'ASC')
      .addOrderBy('task.createdAt', 'DESC');

    const defaultQueryLimit =
      Number(process.env.TASK_QUERY_DEFAULT_LIMIT) || 1000;
    const maxQueryLimit = Number(process.env.TASK_QUERY_MAX_LIMIT) || 1000;
    const safeLimit =
      filters?.limit && filters.limit > 0
        ? Math.min(filters.limit, maxQueryLimit)
        : defaultQueryLimit;
    qb.take(safeLimit);
    if (filters?.offset && filters.offset >= 0) {
      qb.skip(filters.offset);
    }

    return await qb.getMany();
  }

  async findById(id: string): Promise<TaskEntity> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Task ID is required');
    }
    const cleanId = id.trim();
    const task = await this.taskRepo.findOne({ where: { id: cleanId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${cleanId} not found.`);
    }
    return task;
  }

  async create(dto: CreateTaskDto): Promise<TaskEntity> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Task payload is required');
    }

    const cleanTitle = (dto.title || '').trim();
    if (!cleanTitle) {
      throw new BadRequestException('Task title cannot be empty');
    }

    const id =
      dto.id && typeof dto.id === 'string' && dto.id.trim()
        ? dto.id.trim()
        : `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const recurrenceStr =
      typeof dto.recurrenceRule === 'object'
        ? JSON.stringify(dto.recurrenceRule)
        : dto.recurrenceRule || null;

    const task = this.taskRepo.create({
      id,
      seriesId: dto.seriesId ?? null,
      userId: dto.userId ?? null,
      title: cleanTitle,
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
      completedAt:
        dto.status === 'completed'
          ? (dto.completedAt ?? new Date().toISOString())
          : (dto.completedAt ?? null),
    });

    return await this.taskRepo.save(task);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskEntity> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Task ID is required');
    }
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Update payload is required');
    }

    const existing = await this.findById(id);

    if (dto.title !== undefined) {
      const cleanTitle = dto.title.trim();
      if (!cleanTitle) {
        throw new BadRequestException('Task title cannot be empty');
      }
    }

    const recurrenceStr =
      dto.recurrenceRule !== undefined
        ? typeof dto.recurrenceRule === 'object'
          ? JSON.stringify(dto.recurrenceRule)
          : dto.recurrenceRule
        : existing.recurrenceRule;

    let completedAt = existing.completedAt;
    if (dto.completedAt !== undefined) {
      completedAt = dto.completedAt;
    } else if (dto.status !== undefined) {
      if (dto.status === 'completed' && !existing.completedAt) {
        completedAt = new Date().toISOString();
      } else if (dto.status !== 'completed' && existing.completedAt) {
        completedAt = null;
      }
    }

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
      completedAt,
    });

    return await this.taskRepo.save(updated);
  }

  async delete(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return false;
    }
    const res = await this.taskRepo.delete(id.trim());
    return (res.affected ?? 0) > 0;
  }

  async clearCompleted(userId?: string): Promise<{ deletedCount: number }> {
    const where: any = { status: 'completed' };
    if (userId && typeof userId === 'string' && userId.trim()) {
      where.userId = userId.trim();
    }
    const res = await this.taskRepo.delete(where);
    const count = res.affected ?? 0;
    this.logger.log(
      `Cleared ${count} completed tasks from backend database${userId ? ` for user ${userId}` : ''}.`,
    );
    return { deletedCount: count };
  }

  /**
   * Two-Way Delta Sync for Mobile Client
   */
  async sync(dto: SyncTasksDto): Promise<SyncTasksResponse> {
    if (!dto) {
      throw new BadRequestException('Sync payload is required');
    }

    // 1. Process client deletions
    if (Array.isArray(dto.deletedIds) && dto.deletedIds.length > 0) {
      const validDeletions = dto.deletedIds.filter(
        (id) => typeof id === 'string' && id.trim().length > 0,
      );
      if (validDeletions.length > 0) {
        await this.taskRepo.delete({ id: In(validDeletions) });
      }
    }

    // 2. Process client upserts in a single batch save
    if (Array.isArray(dto.upserts) && dto.upserts.length > 0) {
      const entitiesToSave: TaskEntity[] = [];

      for (const item of dto.upserts) {
        if (!item || !item.id || !item.title) continue;

        const recurrenceStr =
          typeof item.recurrenceRule === 'object'
            ? JSON.stringify(item.recurrenceRule)
            : item.recurrenceRule || null;

        const entity = this.taskRepo.create({
          id: item.id.trim(),
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
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        });

        entitiesToSave.push(entity);
      }

      if (entitiesToSave.length > 0) {
        await this.taskRepo.save(entitiesToSave);
      }
    }

    // 3. Query server tasks with delta sync support via `since` and user scoping
    const qb = this.taskRepo.createQueryBuilder('task');

    if (
      dto.since &&
      typeof dto.since === 'string' &&
      !isNaN(Date.parse(dto.since))
    ) {
      qb.where('task.updatedAt >= :since', { since: new Date(dto.since) });
    }

    const syncUserId =
      dto.userId ||
      dto.upserts?.find(
        (u) => u && typeof u.userId === 'string' && u.userId.trim(),
      )?.userId;

    if (syncUserId && typeof syncUserId === 'string' && syncUserId.trim()) {
      qb.andWhere('task.userId = :userId', { userId: syncUserId.trim() });
    }

    const serverTasks = await qb.getMany();

    return {
      serverTasks,
      serverDeletions: [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Server-Side Recurrence Generator
   * Background task generating recurring task instances up to `daysAhead` days in advance.
   * Prevents exponential duplication by grouping by seriesId and advancing only from the latest occurrence.
   */
  async processServerRecurrences(
    daysAhead = Number(process.env.TASK_RECURRENCE_DAYS_AHEAD) || 7,
  ): Promise<{ spawnedCount: number }> {
    const recurringTasks = await this.taskRepo
      .createQueryBuilder('task')
      .where(
        "task.recurrenceRule IS NOT NULL AND task.recurrenceRule != 'null' AND task.recurrenceRule != ''",
      )
      .andWhere("task.status != 'cancelled'")
      .getMany();

    if (recurringTasks.length === 0) {
      return { spawnedCount: 0 };
    }

    let spawnedCount = 0;
    const now = new Date();
    const horizonDays = Math.max(daysAhead, 1);
    const targetDate = new Date(
      now.getTime() + horizonDays * 24 * 60 * 60 * 1000,
    );
    const targetDateStr = this.formatUtcDate(targetDate);
    const todayStr = this.formatUtcDate(now);

    // Group tasks by seriesId (or task.id if no seriesId) to prevent duplicate runs per series
    const seriesMap = new Map<string, TaskEntity[]>();
    for (const t of recurringTasks) {
      const key = t.seriesId || t.id;
      if (!seriesMap.has(key)) {
        seriesMap.set(key, []);
      }
      seriesMap.get(key)!.push(t);
    }

    for (const [seriesKey, instances] of seriesMap.entries()) {
      try {
        // Sort instances by date ascending
        instances.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const latest = instances[instances.length - 1];
        if (!latest || !latest.date) continue;

        let rule: any;
        try {
          rule =
            typeof latest.recurrenceRule === 'object'
              ? latest.recurrenceRule
              : JSON.parse(latest.recurrenceRule || '{}');
        } catch {
          if (
            typeof latest.recurrenceRule === 'string' &&
            [
              'daily',
              'weekly',
              'monthly',
              'yearly',
              'weekdays',
              'weekends',
            ].includes(latest.recurrenceRule.toLowerCase())
          ) {
            rule = { type: latest.recurrenceRule.toLowerCase() };
          } else {
            continue;
          }
        }

        if (!rule || rule.type === 'none') continue;

        const baseDate = this.parseDateString(latest.date);
        if (!baseDate) continue;

        // Ensure parent task has seriesId saved back to database if missing
        const seriesId = latest.seriesId || seriesKey;
        if (!latest.seriesId) {
          latest.seriesId = seriesId;
          await this.taskRepo.update(latest.id, { seriesId }).catch(() => {});
        }

        let curDate = new Date(baseDate.getTime());
        let safety = 0;
        const maxIterations = Math.min(Math.max(horizonDays * 2, 30), 100);

        while (safety < maxIterations) {
          safety++;
          curDate = this.advanceRecurrenceDate(curDate, rule, baseDate);
          const nextDateStr = this.formatUtcDate(curDate);

          if (rule.endDate && nextDateStr > rule.endDate) break;
          if (nextDateStr > targetDateStr) break;
          if (nextDateStr < todayStr) continue;

          // Check if instance already exists on this date for this series or by title
          const existing = await this.taskRepo.findOne({
            where: latest.userId
              ? [
                  { seriesId, date: nextDateStr },
                  {
                    title: latest.title,
                    date: nextDateStr,
                    userId: latest.userId,
                  },
                ]
              : [
                  { seriesId, date: nextDateStr },
                  { title: latest.title, date: nextDateStr },
                ],
          });

          if (!existing) {
            const newId = `srv_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const cleanDescription = this.resetBullets(latest.description);
            const cleanNotes = this.resetBullets(latest.notes);

            await this.taskRepo.save({
              id: newId,
              seriesId,
              userId: latest.userId,
              title: latest.title,
              description: cleanDescription,
              date: nextDateStr,
              startTime: latest.startTime,
              endTime: latest.endTime,
              priority: latest.priority,
              categoryId: latest.categoryId,
              status: 'pending',
              recurrenceRule: latest.recurrenceRule,
              reminderMinutes: latest.reminderMinutes,
              isLoudAlarm: latest.isLoudAlarm,
              isOvernight: latest.isOvernight,
              eisenhowerQuadrant: latest.eisenhowerQuadrant,
              accentColor: latest.accentColor,
              estimatedMinutes: latest.estimatedMinutes,
              notes: cleanNotes,
              completedAt: null,
            });
            spawnedCount++;
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed recurrence processing for series ${seriesKey}: ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `Server recurrence expansion created ${spawnedCount} occurrences.`,
    );
    return { spawnedCount };
  }
}
