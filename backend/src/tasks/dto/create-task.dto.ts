import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  date?: string; // Optional for Backlog support

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'completed', 'overdue', 'cancelled'])
  status?: string;

  @IsOptional()
  recurrenceRule?: any; // object or string

  @IsNumber()
  @IsOptional()
  reminderMinutes?: number;

  @IsString()
  @IsOptional()
  snoozeUntil?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isLoudAlarm?: boolean;

  @IsBoolean()
  @IsOptional()
  isOvernight?: boolean;

  @IsString()
  @IsOptional()
  @IsIn(['q1', 'q2', 'q3', 'q4'])
  eisenhowerQuadrant?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsNumber()
  @IsOptional()
  estimatedMinutes?: number;

  @IsString()
  @IsOptional()
  completedAt?: string;

  @IsString()
  @IsOptional()
  categoryName?: string;

  @IsString()
  @IsOptional()
  categoryColor?: string;

  @IsString()
  @IsOptional()
  categoryIcon?: string;

  @IsOptional()
  createdAt?: any;

  @IsOptional()
  updatedAt?: any;
}
