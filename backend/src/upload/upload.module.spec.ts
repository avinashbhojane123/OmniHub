import { Test, TestingModule } from '@nestjs/testing';
import { UploadModule } from './upload.module';
import { UploadController } from './upload.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('UploadModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UploadModule],
    }).compile();
  });

  it('should compile and provide UploadController', () => {
    const controller = module.get<UploadController>(UploadController);
    expect(controller).toBeDefined();
  });

  it('should provide RateLimitGuard', () => {
    const guard = module.get<RateLimitGuard>(RateLimitGuard);
    expect(guard).toBeDefined();
  });
});

