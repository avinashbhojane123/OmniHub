import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ExtractTeraBoxDto {
  @IsNotEmpty({ message: 'TeraBox URL is required' })
  @IsString({ message: 'TeraBox URL must be a string' })
  @Matches(
    /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*(terabox\.(com|app)|1024tera\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|terasharelink\.com|4funbox\.com)\/.*$/i,
    {
      message:
        'Invalid TeraBox URL. Supported domains: terabox.com, terabox.app, 1024tera.com, mirrobox.com, nephobox.com, freeterabox.com, terasharelink.com, 4funbox.com',
    },
  )
  url: string;
}

export interface TeraBoxStreamDto {
  quality: string;
  url: string;
  resolution?: string;
  format?: string;
}

export interface ExtractTeraBoxResponseDto {
  success: boolean;
  title: string;
  thumbnail: string;
  duration: number;
  size?: number;
  streams: TeraBoxStreamDto[];
  shareId?: string;
  fsId?: string;
  extractedAt: string;
}

