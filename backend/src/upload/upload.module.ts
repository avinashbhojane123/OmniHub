import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  controllers: [UploadController],
  providers: [RateLimitGuard],
  exports: [RateLimitGuard],
})
export class UploadModule {}
