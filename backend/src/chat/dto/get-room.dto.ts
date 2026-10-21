import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class GetRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  passcode!: string;

  @IsOptional()
  @IsNumber()
  beforeId?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  searchQuery?: string;
}
