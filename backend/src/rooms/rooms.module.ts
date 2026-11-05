import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Room } from './room.entity';
import { User } from '../users/user.entity';

import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Room, User])],
  controllers: [RoomsController],
  providers: [RoomsService, RateLimitGuard],
  exports: [RoomsService, TypeOrmModule],
})
export class RoomsModule {}
