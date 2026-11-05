import { Test, TestingModule } from '@nestjs/testing';
import { KeepAliveModule } from './keep-alive.module';
import { KeepAliveController } from './keep-alive.controller';
import { KeepAliveService } from './keep-alive.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('KeepAliveModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [KeepAliveModule],
    }).compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should compile the module successfully', () => {
    expect(moduleRef).toBeDefined();
  });

  it('should resolve KeepAliveController from module context', () => {
    const controller = moduleRef.get<KeepAliveController>(KeepAliveController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(KeepAliveController);
  });

  it('should resolve KeepAliveService from module context', () => {
    const service = moduleRef.get<KeepAliveService>(KeepAliveService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(KeepAliveService);
  });

  it('should resolve RateLimitGuard provider from module context', () => {
    const guard = moduleRef.get<RateLimitGuard>(RateLimitGuard);
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(RateLimitGuard);
  });

  it('should export KeepAliveService to consumer modules', async () => {
    const consumerModule = await Test.createTestingModule({
      imports: [KeepAliveModule],
    }).compile();

    const exportedService = consumerModule.get<KeepAliveService>(KeepAliveService);
    expect(exportedService).toBeDefined();
    expect(exportedService).toBeInstanceOf(KeepAliveService);

    await consumerModule.close();
  });
});

