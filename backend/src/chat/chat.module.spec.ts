import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatModule } from './chat.module';
import { ChatGateway } from './chat.gateway';
import { CallingService } from './services/calling.service';
import { WatchPartyService } from './services/watch-party.service';
import { StatusService } from './services/status.service';
import { MessageService } from './services/message.service';
import { RoomModerationService } from './services/room-moderation.service';
import { WallpaperService } from './services/wallpaper.service';
import { Room } from '../rooms/room.entity';
import { Message } from '../messages/message.entity';
import { User } from '../users/user.entity';
import { Status } from '../status/status.entity';

describe('ChatModule', () => {
  let module: TestingModule;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
    }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ChatModule],
    })
      .overrideProvider(getRepositoryToken(Room))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(Message))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(Status))
      .useValue(mockRepo)
      .compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    const chatModule = module.get<ChatModule>(ChatModule);
    expect(chatModule).toBeDefined();
  });

  it('should successfully resolve ChatGateway', () => {
    const chatGateway = module.get<ChatGateway>(ChatGateway);
    expect(chatGateway).toBeDefined();
  });

  it('should successfully resolve CallingService', () => {
    const service = module.get<CallingService>(CallingService);
    expect(service).toBeDefined();
  });

  it('should successfully resolve WatchPartyService', () => {
    const service = module.get<WatchPartyService>(WatchPartyService);
    expect(service).toBeDefined();
  });

  it('should successfully resolve StatusService', () => {
    const service = module.get<StatusService>(StatusService);
    expect(service).toBeDefined();
  });

  it('should successfully resolve MessageService', () => {
    const service = module.get<MessageService>(MessageService);
    expect(service).toBeDefined();
  });

  it('should successfully resolve RoomModerationService', () => {
    const service = module.get<RoomModerationService>(RoomModerationService);
    expect(service).toBeDefined();
  });

  it('should successfully resolve WallpaperService', () => {
    const service = module.get<WallpaperService>(WallpaperService);
    expect(service).toBeDefined();
  });

  it('should verify that consumers importing ChatModule can access ChatGateway and services', async () => {
    // Consumer module simulating another feature importing ChatModule
    const consumerModule = await Test.createTestingModule({
      imports: [ChatModule],
    })
      .overrideProvider(getRepositoryToken(Room))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(Message))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockRepo)
      .overrideProvider(getRepositoryToken(Status))
      .useValue(mockRepo)
      .compile();

    expect(consumerModule.get<ChatGateway>(ChatGateway)).toBeDefined();
    expect(consumerModule.get<CallingService>(CallingService)).toBeDefined();
    expect(consumerModule.get<WallpaperService>(WallpaperService)).toBeDefined();

    await consumerModule.close();
  });
});

