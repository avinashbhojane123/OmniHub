import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  date?: string;

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
  recurrenceRule?: any;

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
}
