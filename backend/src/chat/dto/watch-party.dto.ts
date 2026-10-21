import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class WatchPartyActionDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'open',
    'invite',
    'accept',
    'decline',
    'play',
    'pause',
    'seek',
    'rate',
    'change_video',
    'buffering',
    'ready',
    'close',
    'toggle_host_lock',
    'sync_tick',
    'heartbeat',
  ])
  action!: string;

  @IsNumber()
  @IsOptional()
  currentTime?: number;

  @IsBoolean()
  @IsOptional()
  isPlaying?: boolean;

  @IsNumber()
  @IsOptional()
  playbackRate?: number;

  @IsNumber()
  @IsOptional()
  scheduledStartServerTime?: number;

  @IsNumber()
  @IsOptional()
  clientSendTime?: number;

  @IsOptional()
  videoSource?: {
    url: string;
    title: string;
    type?: 'direct' | 'youtube' | 'embed';
    duration?: number;
    provider?: string;
    originalUrl?: string;
  };

  @IsBoolean()
  @IsOptional()
  buffering?: boolean;

  @IsString()
  @IsOptional()
  reaction?: string;

  @IsString()
  @IsOptional()
  nickname?: string;
}

export class WatchPartyClockPingDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNumber()
  @IsNotEmpty()
  clientSendTime!: number;
}

export class GetWatchPartyDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;
}

export class WatchPartyReactionDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsNotEmpty()
  reaction!: string;
}

export class WatchPartyCommentDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsNumber()
  top?: number;
}
