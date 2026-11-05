import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatusModule } from './status.module';
import { Status } from './status.entity';
import { Room } from '../rooms/room.entity';

describe('StatusModule', () => {
  let moduleRef: TestingModule;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    }),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [StatusModule],
    })
      .overrideProvider(getRepositoryToken(Status))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(Room))
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

  it('should resolve Status repository token from module context', () => {
    const statusRepo = moduleRef.get(getRepositoryToken(Status));
    expect(statusRepo).toBeDefined();
  });

  it('should resolve Room repository token from module context', () => {
    const roomRepo = moduleRef.get(getRepositoryToken(Room));
    expect(roomRepo).toBeDefined();
  });
});

