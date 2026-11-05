import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoomsModule } from './rooms.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { Room } from './room.entity';
import { User } from '../users/user.entity';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('RoomsModule', () => {
  let moduleRef: TestingModule;

  const mockRepo = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RoomsModule],
    })
      .overrideProvider(getRepositoryToken(Room))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockRepo)
      .compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should compile the module successfully', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should resolve RoomsController from module context', () => {
    const controller = moduleRef.get<RoomsController>(RoomsController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(RoomsController);
  });

  it('should resolve RoomsService from module context', () => {
    const service = moduleRef.get<RoomsService>(RoomsService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(RoomsService);
  });

  it('should resolve RateLimitGuard from module context', () => {
    const guard = moduleRef.get<RateLimitGuard>(RateLimitGuard);
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(RateLimitGuard);
  });

  it('should resolve Room and User repositories from module context', () => {
    const roomRepo = moduleRef.get(getRepositoryToken(Room));
    const userRepo = moduleRef.get(getRepositoryToken(User));
    expect(roomRepo).toBeDefined();
    expect(userRepo).toBeDefined();
  });
});
