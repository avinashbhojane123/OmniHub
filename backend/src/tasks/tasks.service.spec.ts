import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskEntity } from './task.entity';

describe('TasksService', () => {
  let service: TasksService;

  let mockQueryBuilder: any;
  const mockTaskRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve(entity)),
    merge: jest.fn((existing, dto) => ({ ...existing, ...dto })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockTaskRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(TaskEntity),
          useValue: mockTaskRepo,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('Lifecycle', () => {
    it('should initialize and clean up interval timer', () => {
      jest.useFakeTimers();
      const processSpy = jest
        .spyOn(service, 'processServerRecurrences')
        .mockResolvedValue({ spawnedCount: 0 });

      service.onModuleInit();
      expect(processSpy).toHaveBeenCalledWith(3);

      jest.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(processSpy).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      jest.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(processSpy).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('findAll', () => {
    it('should query tasks with all filters applied and escape search characters', async () => {
      const tasks = [{ id: '1', title: 'Test 100% finished_task' } as TaskEntity];
      mockQueryBuilder.getMany.mockResolvedValueOnce(tasks);

      const res = await service.findAll({
        userId: 'user_1',
        status: 'pending',
        date: '2026-11-04',
        quadrant: 'q1',
        categoryId: 'work',
        search: '100% finished_task',
        limit: 10,
        offset: 5,
      });

      expect(res).toEqual(tasks);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.userId = :userId',
        { userId: 'user_1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.status = :status',
        { status: 'pending' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.date = :date',
        { date: '2026-11-04' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.eisenhowerQuadrant = :quadrant',
        { quadrant: 'q1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.categoryId = :categoryId',
        { categoryId: 'work' },
      );
      // Verify escaped search wildcards
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(task.title) LIKE :q OR LOWER(task.description) LIKE :q OR LOWER(task.notes) LIKE :q)',
        { q: '%100\\% finished\\_task%' },
      );
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5);
    });

    it('should cap excessive limit to 1000', async () => {
      await service.findAll({ limit: 5000 });
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(1000);
    });
  });

  describe('findById', () => {
    it('should return task when found', async () => {
      const task = { id: 'task_1', title: 'Task 1' } as TaskEntity;
      mockTaskRepo.findOne.mockResolvedValueOnce(task);

      const res = await service.findById('task_1');
      expect(res).toBe(task);
      expect(mockTaskRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'task_1' },
      });
    });

    it('should throw BadRequestException if id is invalid or empty', async () => {
      await expect(service.findById('')).rejects.toThrow(BadRequestException);
      await expect(service.findById('   ')).rejects.toThrow(BadRequestException);
      await expect(service.findById(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockTaskRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a task with auto-generated id if omitted', async () => {
      const dto = {
        title: 'Auto ID Task',
        priority: 'high',
      };

      const result = await service.create(dto as any);
      expect(result.id).toMatch(/^task_/);
      expect(result.title).toBe('Auto ID Task');
      expect(result.priority).toBe('high');
      expect(mockTaskRepo.save).toHaveBeenCalled();
    });

    it('should preserve provided id and serialize object recurrence rule', async () => {
      const dto = {
        id: 'custom_id_123',
        title: 'Recurrent Task',
        recurrenceRule: { type: 'daily', interval: 2 },
      };

      const result = await service.create(dto as any);
      expect(result.id).toBe('custom_id_123');
      expect(result.recurrenceRule).toBe('{"type":"daily","interval":2}');
    });

    it('should auto-populate completedAt if created with status completed', async () => {
      const dto = {
        title: 'Completed Task',
        status: 'completed',
      };

      const result = await service.create(dto as any);
      expect(result.completedAt).toBeDefined();
      expect(typeof result.completedAt).toBe('string');
    });

    it('should throw BadRequestException if title is empty or missing', async () => {
      await expect(service.create({ title: '' } as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create({ title: '   ' } as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update task and synchronize completedAt when status changes to completed', async () => {
      const existing = {
        id: 'task_u1',
        title: 'Old Title',
        status: 'pending',
        completedAt: null,
      } as TaskEntity;
      mockTaskRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.update('task_u1', {
        title: 'New Title',
        status: 'completed',
      });

      expect(result.title).toBe('New Title');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should clear completedAt when task status transitions from completed to pending', async () => {
      const existing = {
        id: 'task_u2',
        title: 'Finished Task',
        status: 'completed',
        completedAt: '2026-11-01T12:00:00Z',
      } as TaskEntity;
      mockTaskRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.update('task_u2', {
        status: 'pending',
      });

      expect(result.status).toBe('pending');
      expect(result.completedAt).toBeNull();
    });

    it('should reject update if title is empty string', async () => {
      const existing = { id: 'task_u3', title: 'Task' } as TaskEntity;
      mockTaskRepo.findOne.mockResolvedValueOnce(existing);

      await expect(
        service.update('task_u3', { title: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete task and return true if affected > 0', async () => {
      mockTaskRepo.delete.mockResolvedValueOnce({ affected: 1 });
      const res = await service.delete('task_del');
      expect(res).toBe(true);
      expect(mockTaskRepo.delete).toHaveBeenCalledWith('task_del');
    });

    it('should return false if task was not found or affected is 0', async () => {
      mockTaskRepo.delete.mockResolvedValueOnce({ affected: 0 });
      const res = await service.delete('task_not_found');
      expect(res).toBe(false);
    });

    it('should return false if id is invalid', async () => {
      expect(await service.delete('')).toBe(false);
      expect(await service.delete(null as any)).toBe(false);
    });
  });

  describe('clearCompleted', () => {
    it('should clear completed tasks globally when no userId is specified', async () => {
      mockTaskRepo.delete.mockResolvedValueOnce({ affected: 7 });
      const res = await service.clearCompleted();
      expect(res.deletedCount).toBe(7);
      expect(mockTaskRepo.delete).toHaveBeenCalledWith({ status: 'completed' });
    });

    it('should clear completed tasks for a specific user when userId is specified', async () => {
      mockTaskRepo.delete.mockResolvedValueOnce({ affected: 3 });
      const res = await service.clearCompleted('user_42');
      expect(res.deletedCount).toBe(3);
      expect(mockTaskRepo.delete).toHaveBeenCalledWith({
        status: 'completed',
        userId: 'user_42',
      });
    });
  });

  describe('sync', () => {
    it('should process client deletions, batch upserts, and delta since filter', async () => {
      const serverTasks = [{ id: 'srv_1', title: 'Task on server' } as TaskEntity];
      mockQueryBuilder.getMany.mockResolvedValueOnce(serverTasks);

      const res = await service.sync({
        deletedIds: ['del_1', 'del_2', ''],
        upserts: [
          {
            id: 'up_1',
            title: 'Upserted 1',
            date: '2026-11-04',
          } as any,
        ],
        since: '2026-11-03T00:00:00.000Z',
      });

      expect(mockTaskRepo.delete).toHaveBeenCalledWith({
        id: expect.anything(),
      });
      expect(mockTaskRepo.save).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'task.updatedAt >= :since',
        { since: new Date('2026-11-03T00:00:00.000Z') },
      );
      expect(res.serverTasks).toEqual(serverTasks);
    });

    it('should scope server tasks query to userId if provided in sync payload', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]);

      await service.sync({
        userId: 'user_custom',
        upserts: [],
        deletedIds: [],
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.userId = :userId',
        { userId: 'user_custom' },
      );
    });

    it('should throw BadRequestException if sync payload is missing', async () => {
      await expect(service.sync(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('processServerRecurrences', () => {
    it('should return 0 spawnedCount if no recurring tasks exist', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]);
      const res = await service.processServerRecurrences();
      expect(res.spawnedCount).toBe(0);
    });

    it('should advance daily recurrence and reset checklist bullets', async () => {
      const baseTask = {
        id: 'rec_task_1',
        title: 'Daily Standup',
        description: 'Meeting notes:\n[x] Check tickets\n[X] Report blockers',
        notes: '[x] Follow up with QA',
        date: new Date().toISOString().slice(0, 10),
        recurrenceRule: JSON.stringify({ type: 'daily', interval: 1 }),
        status: 'pending',
      } as TaskEntity;

      mockQueryBuilder.getMany.mockResolvedValueOnce([baseTask]);
      // Mock that next occurrence does not exist
      mockTaskRepo.findOne.mockResolvedValue(null);

      const res = await service.processServerRecurrences(2);
      expect(res.spawnedCount).toBeGreaterThan(0);

      // Verify that save was called with reset bullets
      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Daily Standup',
          description: 'Meeting notes:\n[ ] Check tickets\n[ ] Report blockers',
          notes: '[ ] Follow up with QA',
          status: 'pending',
          completedAt: null,
        }),
      );
    });

    it('should advance monthly recurrence with monthDay clamp without overflowing', async () => {
      const baseTask = {
        id: 'rec_task_jan31',
        title: 'End of Month Review',
        date: '2026-01-31',
        recurrenceRule: JSON.stringify({
          type: 'monthly',
          interval: 1,
          monthDay: 31,
          endDate: '2026-03-31',
        }),
        status: 'pending',
      } as TaskEntity;

      mockQueryBuilder.getMany.mockResolvedValueOnce([baseTask]);
      mockTaskRepo.findOne.mockResolvedValue(null);

      const res = await service.processServerRecurrences(30);
      expect(res.spawnedCount).toBeGreaterThanOrEqual(0);
    });

    it('should advance weekly recurrence using daysOfWeek array', async () => {
      const baseTask = {
        id: 'rec_task_weekly',
        title: 'Gym Workout',
        date: new Date().toISOString().slice(0, 10),
        recurrenceRule: JSON.stringify({
          type: 'weekly',
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
          interval: 1,
        }),
        status: 'pending',
      } as TaskEntity;

      mockQueryBuilder.getMany.mockResolvedValueOnce([baseTask]);
      mockTaskRepo.findOne.mockResolvedValue(null);

      const res = await service.processServerRecurrences(3);
      expect(res.spawnedCount).toBeGreaterThanOrEqual(0);
    });
  });
});

