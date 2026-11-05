import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncTasksDto } from './dto/sync-tasks.dto';
import { TaskEntity } from './task.entity';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

export interface TasksHealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface TasksListResponse {
  success: boolean;
  count: number;
  data: TaskEntity[];
}

export interface TaskResponse {
  success: boolean;
  data: TaskEntity;
}

export interface DeleteTaskResponse {
  success: boolean;
  message: string;
}

export interface ClearCompletedResponse {
  success: boolean;
  deletedCount: number;
}

@UseGuards(RateLimitGuard)
@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  /**
   * Health and connectivity check for tasks service.
   * Declared before :id to prevent 'health' from being captured as a task ID.
   */
  @Get('health')
  getHealth(): TasksHealthResponse {
    return {
      status: 'ok',
      service: 'tasks',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('quadrant') quadrant?: string,
    @Query('categoryId') categoryId?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<TasksListResponse> {
    let parsedLimit: number | undefined;
    if (limit !== undefined && limit !== '') {
      parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        throw new BadRequestException(
          'Invalid limit parameter. Must be a positive integer.',
        );
      }
    }

    let parsedOffset: number | undefined;
    if (offset !== undefined && offset !== '') {
      parsedOffset = parseInt(offset, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        throw new BadRequestException(
          'Invalid offset parameter. Must be a non-negative integer.',
        );
      }
    }

    const tasks = await this.tasksService.findAll({
      status: status?.trim() || undefined,
      date: date?.trim() || undefined,
      quadrant: quadrant?.trim() || undefined,
      categoryId: categoryId?.trim() || undefined,
      userId: userId?.trim() || undefined,
      search: search?.trim() || undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return {
      success: true,
      count: tasks.length,
      data: tasks,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<TaskResponse> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Task ID is required');
    }
    const task = await this.tasksService.findById(id.trim());
    return {
      success: true,
      data: task,
    };
  }

  @Post()
  async create(@Body() dto: CreateTaskDto): Promise<TaskResponse> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Task creation payload is required');
    }
    const created = await this.tasksService.create(dto);
    return {
      success: true,
      data: created,
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Task ID is required');
    }
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Task update payload is required');
    }
    const updated = await this.tasksService.update(id.trim(), dto);
    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<DeleteTaskResponse> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Task ID is required');
    }
    const deleted = await this.tasksService.delete(id.trim());
    return {
      success: deleted,
      message: deleted ? 'Task deleted.' : 'Task not found.',
    };
  }

  @Post('clear-completed')
  @HttpCode(HttpStatus.OK)
  async clearCompleted(
    @Query('userId') queryUserId?: string,
    @Body('userId') bodyUserId?: string,
  ): Promise<ClearCompletedResponse> {
    const userId = queryUserId?.trim() || bodyUserId?.trim() || undefined;
    const res = await this.tasksService.clearCompleted(userId);
    return {
      success: true,
      deletedCount: res.deletedCount,
    };
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@Body() dto: SyncTasksDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Sync payload is required');
    }
    const res = await this.tasksService.sync(dto);
    return {
      success: true,
      ...res,
    };
  }

  @Post('process-recurrences')
  @HttpCode(HttpStatus.OK)
  async processRecurrences(
    @Query('daysAhead') daysAheadParam?: string | number,
  ) {
    let daysAhead = Number(process.env.TASK_RECURRENCE_DAYS_AHEAD) || 7;
    if (daysAheadParam !== undefined && daysAheadParam !== '') {
      const parsed =
        typeof daysAheadParam === 'number'
          ? daysAheadParam
          : parseInt(daysAheadParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new BadRequestException(
          'Invalid daysAhead parameter. Must be a positive integer.',
        );
      }
      daysAhead = parsed;
    }

    const res = await this.tasksService.processServerRecurrences(daysAhead);
    return {
      success: true,
      ...res,
    };
  }
}
