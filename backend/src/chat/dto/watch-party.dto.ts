import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { WatchPartyActionType, WatchPartyVideoSource } from '../chat.types';

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
    'suggest_video',
    'play_queue_item',
    'remove_queue_item',
  ])
  action!: WatchPartyActionType;

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
  videoSource?: WatchPartyVideoSource;

  @IsBoolean()
  @IsOptional()
  buffering?: boolean;

  @IsString()
  @IsOptional()
  reaction?: string;

  @IsString()
  @IsOptional()
  emoji?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsNumber()
  @IsOptional()
  version?: number;

  @IsString()
  @IsOptional()
  queueId?: string;

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  suggestedBy?: string;

  @IsOptional()
  queueItem?: any;

  @IsBoolean()
  @IsOptional()
  isHostOnly?: boolean;
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

  @IsString()
  @IsOptional()
  emoji?: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsNumber()
  @IsOptional()
  timestamp?: number;
}

export class WatchPartyCommentDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsOptional()
  @IsNumber()
  top?: number;

  @IsOptional()
  id?: string | number;

  @IsString()
  @IsOptional()
  from?: string;

  @IsNumber()
  @IsOptional()
  timestamp?: number;
}
