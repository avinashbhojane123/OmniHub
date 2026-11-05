import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity } from './task.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity])],
  controllers: [TasksController],
  providers: [TasksService, RateLimitGuard],
  exports: [TasksService, TypeOrmModule],
})
export class TasksModule {}
