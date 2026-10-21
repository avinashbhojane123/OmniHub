import { IsNotEmpty, IsNumber, IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class BookmarkMovieDto {
  @IsNotEmpty()
  @IsNumber()
  tmdbId!: number;

  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsString()
  posterPath?: string;

  @IsOptional()
  @IsString()
  backdropPath?: string;

  @IsOptional()
  @IsNumber()
  voteAverage?: number;

  @IsOptional()
  @IsString()
  releaseDate?: string;

  @IsOptional()
  @IsArray()
  genres?: string[];

  @IsOptional()
  @IsNumber()
  runtime?: number;

  @IsOptional()
  @IsBoolean()
  isWatched?: boolean;
}

export class UpdateWatchedDto {
  @IsNotEmpty()
  @IsBoolean()
  isWatched!: boolean;
}
