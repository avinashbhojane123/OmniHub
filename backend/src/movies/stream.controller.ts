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
import { extname, join } from 'path';
import { StreamService } from './stream.service';

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
        destination: (req, file, cb) => {
          const vDir = join(process.cwd(), 'videos');
          cb(null, vDir);
        },
        filename: (req, file, cb) => {
          const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          cb(null, `${Date.now()}_${originalName}`);
        },
      }),
      limits: {
        fileSize: 1024 * 1024 * 1024 * 2, // 2 GB max
      },
      fileFilter: (req, file, cb) => {
        const allowedExts = ['.mp4', '.mkv', '.webm', '.mov', '.avi'];
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
