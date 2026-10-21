import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class TypingDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nickname?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  passcode!: string;
}
