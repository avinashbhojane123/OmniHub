import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeepAliveController } from './keep-alive.controller';
import { KeepAliveService } from './keep-alive.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [ConfigModule],
  controllers: [KeepAliveController],
  providers: [KeepAliveService, RateLimitGuard],
  exports: [KeepAliveService],
})
export class KeepAliveModule {}
