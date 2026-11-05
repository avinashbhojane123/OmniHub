import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksModule } from './tasks.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskEntity } from './task.entity';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('TasksModule', () => {
  let moduleRef: TestingModule;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TasksModule],
    })
      .overrideProvider(getRepositoryToken(TaskEntity))
      .useValue(mockRepo)
      .compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      const service = moduleRef.get<TasksService>(TasksService);
      service.onModuleDestroy();
      await moduleRef.close();
    }
  });

  it('should compile the module successfully', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should resolve TasksController from module context', () => {
    const controller = moduleRef.get<TasksController>(TasksController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(TasksController);
  });

  it('should resolve TasksService from module context', () => {
    const service = moduleRef.get<TasksService>(TasksService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(TasksService);
  });

  it('should resolve RateLimitGuard from module context', () => {
    const guard = moduleRef.get<RateLimitGuard>(RateLimitGuard);
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(RateLimitGuard);
  });
});
