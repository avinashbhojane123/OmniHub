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
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncTasksDto } from './dto/sync-tasks.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

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
  ) {
    const tasks = await this.tasksService.findAll({
      status,
      date,
      quadrant,
      categoryId,
      userId,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return {
      success: true,
      count: tasks.length,
      data: tasks,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const task = await this.tasksService.findById(id);
    return {
      success: true,
      data: task,
    };
  }

  @Post()
  async create(@Body() dto: CreateTaskDto) {
    const created = await this.tasksService.create(dto);
    return {
      success: true,
      data: created,
    };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    const updated = await this.tasksService.update(id, dto);
    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    const deleted = await this.tasksService.delete(id);
    return {
      success: deleted,
      message: deleted ? 'Task deleted.' : 'Task not found.',
    };
  }

  @Post('clear-completed')
  @HttpCode(HttpStatus.OK)
  async clearCompleted() {
    const res = await this.tasksService.clearCompleted();
    return {
      success: true,
      deletedCount: res.deletedCount,
    };
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@Body() dto: SyncTasksDto) {
    const res = await this.tasksService.sync(dto);
    return {
      success: true,
      ...res,
    };
  }

  @Post('process-recurrences')
  @HttpCode(HttpStatus.OK)
  async processRecurrences(@Query('daysAhead') daysAhead?: number) {
    const res = await this.tasksService.processServerRecurrences(daysAhead ? Number(daysAhead) : 7);
    return {
      success: true,
      ...res,
    };
  }
}
