import { Test, TestingModule } from '@nestjs/testing';
import { InstagramModule } from './instagram.module';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('InstagramModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InstagramModule],
    }).compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should compile the module successfully with all dependencies resolved', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should resolve InstagramController from the module context', () => {
    const controller = moduleRef.get<InstagramController>(InstagramController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(InstagramController);
  });

  it('should resolve InstagramService from the module context', () => {
    const service = moduleRef.get<InstagramService>(InstagramService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(InstagramService);
  });

  it('should resolve RateLimitGuard provider from the module context', () => {
    const guard = moduleRef.get<RateLimitGuard>(RateLimitGuard);
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(RateLimitGuard);
  });

  it('should provide InstagramService to other importing modules', async () => {
    const consumerModule = await Test.createTestingModule({
      imports: [InstagramModule],
    }).compile();

    const exportedService = consumerModule.get<InstagramService>(InstagramService);
    expect(exportedService).toBeDefined();
    expect(exportedService).toBeInstanceOf(InstagramService);

    await consumerModule.close();
  });
});

