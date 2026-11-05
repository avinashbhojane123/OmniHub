import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskEntity } from './task.entity';

describe('TasksController', () => {
  let controller: TasksController;

  const mockTasksService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    clearCompleted: jest.fn(),
    sync: jest.fn(),
    processServerRecurrences: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const health = controller.getHealth();
      expect(health.status).toBe('ok');
      expect(health.service).toBe('tasks');
      expect(typeof health.timestamp).toBe('string');
    });
  });

  describe('findAll', () => {
    it('should return tasks with count and success flag', async () => {
      const tasks = [{ id: '1', title: 'Task 1' } as TaskEntity];
      mockTasksService.findAll.mockResolvedValueOnce(tasks);

      const res = await controller.findAll(
        'pending',
        '2026-11-04',
        'q1',
        'work',
        'u1',
        'search',
        '10',
        '0',
      );
      expect(res).toEqual({
        success: true,
        count: 1,
        data: tasks,
      });
      expect(mockTasksService.findAll).toHaveBeenCalledWith({
        status: 'pending',
        date: '2026-11-04',
        quadrant: 'q1',
        categoryId: 'work',
        userId: 'u1',
        search: 'search',
        limit: 10,
        offset: 0,
      });
    });

    it('should throw BadRequestException if limit or offset is invalid', async () => {
      await expect(
        controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, 'abc'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, '-5'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, '0'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, '10', 'invalid'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, '10', '-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('should return task details', async () => {
      const task = { id: 'task_id', title: 'Task' } as TaskEntity;
      mockTasksService.findById.mockResolvedValueOnce(task);

      const res = await controller.findById('task_id');
      expect(res).toEqual({ success: true, data: task });
      expect(mockTasksService.findById).toHaveBeenCalledWith('task_id');
    });

    it('should throw BadRequestException if id is empty', async () => {
      await expect(controller.findById('')).rejects.toThrow(BadRequestException);
      await expect(controller.findById('   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('should create task', async () => {
      const dto = { title: 'New Task' } as any;
      const created = { id: 't_new', title: 'New Task' } as TaskEntity;
      mockTasksService.create.mockResolvedValueOnce(created);

      const res = await controller.create(dto);
      expect(res).toEqual({ success: true, data: created });
      expect(mockTasksService.create).toHaveBeenCalledWith(dto);
    });

    it('should throw BadRequestException if dto is missing', async () => {
      await expect(controller.create(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update task', async () => {
      const dto = { title: 'Updated' } as any;
      const updated = { id: 't_up', title: 'Updated' } as TaskEntity;
      mockTasksService.update.mockResolvedValueOnce(updated);

      const res = await controller.update('t_up', dto);
      expect(res).toEqual({ success: true, data: updated });
      expect(mockTasksService.update).toHaveBeenCalledWith('t_up', dto);
    });

    it('should throw BadRequestException if id or dto is invalid', async () => {
      await expect(controller.update('', { title: 'T' } as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.update('t_1', null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('should delete task and return success message', async () => {
      mockTasksService.delete.mockResolvedValueOnce(true);
      const res = await controller.delete('t_del');
      expect(res).toEqual({ success: true, message: 'Task deleted.' });

      mockTasksService.delete.mockResolvedValueOnce(false);
      const resNotFound = await controller.delete('t_del2');
      expect(resNotFound).toEqual({
        success: false,
        message: 'Task not found.',
      });
    });

    it('should throw BadRequestException if id is invalid', async () => {
      await expect(controller.delete('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('clearCompleted', () => {
    it('should clear completed tasks with optional userId', async () => {
      mockTasksService.clearCompleted.mockResolvedValueOnce({ deletedCount: 5 });
      const res = await controller.clearCompleted('user_1');
      expect(res).toEqual({ success: true, deletedCount: 5 });
      expect(mockTasksService.clearCompleted).toHaveBeenCalledWith('user_1');
    });
  });

  describe('sync', () => {
    it('should sync tasks', async () => {
      const syncRes = {
        serverTasks: [],
        serverDeletions: [],
        timestamp: '2026-11-03',
      };
      mockTasksService.sync.mockResolvedValueOnce(syncRes);

      const res = await controller.sync({} as any);
      expect(res).toEqual({ success: true, ...syncRes });
    });

    it('should throw BadRequestException if sync payload is missing', async () => {
      await expect(controller.sync(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('processRecurrences', () => {
    it('should trigger recurrence processing with default daysAhead', async () => {
      mockTasksService.processServerRecurrences.mockResolvedValueOnce({
        spawnedCount: 2,
      });
      const res = await controller.processRecurrences();
      expect(res).toEqual({ success: true, spawnedCount: 2 });
      expect(mockTasksService.processServerRecurrences).toHaveBeenCalledWith(7);
    });

    it('should trigger recurrence processing with custom daysAhead', async () => {
      mockTasksService.processServerRecurrences.mockResolvedValueOnce({
        spawnedCount: 4,
      });
      const res = await controller.processRecurrences('14');
      expect(res).toEqual({ success: true, spawnedCount: 4 });
      expect(mockTasksService.processServerRecurrences).toHaveBeenCalledWith(14);
    });

    it('should throw BadRequestException if daysAhead is negative, zero, or NaN', async () => {
      await expect(controller.processRecurrences('0')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.processRecurrences('-3')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.processRecurrences('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
