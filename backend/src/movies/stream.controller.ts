import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request, Response } from 'express';
import { extname, join, isAbsolute } from 'path';
import { StreamService } from './stream.service';

export function getMaxVideoFileSize(): number {
  if (process.env.MAX_VIDEO_FILE_SIZE_BYTES) {
    const bytes = Number(process.env.MAX_VIDEO_FILE_SIZE_BYTES);
    if (!isNaN(bytes) && bytes > 0) return bytes;
  }
  const mb = Number(process.env.MAX_VIDEO_FILE_SIZE_MB || '2048');
  return (!isNaN(mb) && mb > 0 ? mb : 2048) * 1024 * 1024;
}

export function getAllowedVideoExtensions(): string[] {
  if (process.env.ALLOWED_VIDEO_EXTENSIONS) {
    return process.env.ALLOWED_VIDEO_EXTENSIONS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
      .map((e) => (e.startsWith('.') ? e : `.${e}`));
  }
  return ['.mp4', '.mkv', '.webm', '.mov', '.avi'];
}

@Controller('movies/stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get('catalog')
  async getCatalog() {
    return this.streamService.getCatalog();
  }

  @Get('video/:id')
  async streamVideo(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.streamService.streamMedia(id, req, res);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const customDir = process.env.VIDEOS_DIR || 'videos';
          const vDir = isAbsolute(customDir)
            ? customDir
            : join(process.cwd(), customDir);
          cb(null, vDir);
        },
        filename: (_req, file, cb) => {
          const originalName = file.originalname.replace(
            /[^a-zA-Z0-9.-]/g,
            '_',
          );
          cb(null, `${Date.now()}_${originalName}`);
        },
      }),
      limits: {
        fileSize: getMaxVideoFileSize(),
      },
      fileFilter: (_req, file, cb) => {
        const allowedExts = getAllowedVideoExtensions();
        const ext = extname(file.originalname).toLowerCase();
        if (!allowedExts.includes(ext)) {
          return cb(
            new BadRequestException(
              `Only video files (${allowedExts.join(', ')}) are supported.`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No video file provided');
    }

    return {
      success: true,
      filename: file.filename,
      sizeBytes: file.size,
      streamId: `local-${encodeURIComponent(file.filename)}`,
      streamUrl: `/api/movies/stream/video/local-${encodeURIComponent(file.filename)}`,
    };
  }
}
