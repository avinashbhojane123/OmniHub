import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNumber()
  @IsNotEmpty()
  messageId!: number;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  newMessage?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;
}

export class DeleteMessageDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNumber()
  @IsNotEmpty()
  messageId!: number;
}

export class ClearHistoryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;
}

export class ReactToMessageDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNumber()
  @IsNotEmpty()
  messageId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji!: string;
}

export class PinMessageDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  messageId?: number | null;
}

export class MarkReadDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsArray()
  messageIds!: number[];

  @IsString()
  @IsOptional()
  nickname?: string;
}

export class VotePollDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNumber()
  @IsNotEmpty()
  messageId!: number;

  @IsNotEmpty()
  optionId!: string | number;

  @IsString()
  @IsOptional()
  nickname?: string;
}
