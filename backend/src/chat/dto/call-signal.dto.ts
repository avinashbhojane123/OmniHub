import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CallUserDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  @IsString()
  callerName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetNickname?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;

  @IsOptional()
  @IsBoolean()
  isVoiceOnly?: boolean;
}

export class AcceptCallDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;

  @IsOptional()
  @IsString()
  callId?: string;
}

export class DeclineCallDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class WebrtcOfferDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNotEmpty()
  offer!: any;

  @IsOptional()
  @IsString()
  callerName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;

  @IsOptional()
  @IsString()
  targetNickname?: string;
}

export class WebrtcAnswerDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsNotEmpty()
  answer!: any;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;
}

export class WebrtcCandidateDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  candidate?: any;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;
}

export class EndCallDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class TogglePipDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsBoolean()
  isPip!: boolean;
}

export class ScreenShareStatusDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsBoolean()
  isSharing!: boolean;

  @IsOptional()
  @IsString()
  targetSocketId?: string;
}

export class WebrtcMediaStateDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsOptional()
  @IsBoolean()
  micMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  cameraOff?: boolean;

  @IsOptional()
  @IsBoolean()
  isAudioMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  isVideoMuted?: boolean;

  @IsOptional()
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  targetSocketId?: string;
}
