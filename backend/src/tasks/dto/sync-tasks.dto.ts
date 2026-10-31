import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTaskDto } from './create-task.dto';

export class SyncTasksDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  upserts?: CreateTaskDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  deletedIds?: string[];

  @IsString()
  @IsOptional()
  since?: string; // ISO date timestamp
}
