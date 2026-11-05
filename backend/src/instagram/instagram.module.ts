import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [ConfigModule],
  controllers: [InstagramController],
  providers: [InstagramService, RateLimitGuard],
  exports: [InstagramService],
})
export class InstagramModule {}
