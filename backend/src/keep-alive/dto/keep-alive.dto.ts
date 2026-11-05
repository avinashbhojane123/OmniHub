import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class TriggerPingDto {
  @IsOptional()
  @IsString({ message: 'adminSecret must be a string' })
  @MaxLength(256, { message: 'adminSecret exceeds maximum length of 256 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  adminSecret?: string;
}

export interface KeepAlivePingResponse {
  statusCode: number;
  status: string;
  message: string;
  timestamp: string;
  uptime: number;
}

