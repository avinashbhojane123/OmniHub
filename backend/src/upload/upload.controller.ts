import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import { extname, join } from 'path';

import * as fs from 'fs';
import { readdirSync } from 'fs';

const uploadFolder = process.env.UPLOAD_DIR || 'uploads';
const uploadDir = join(process.cwd(), uploadFolder);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const maxFileSizeMB = Number(process.env.MAX_FILE_SIZE_MB || 100);
const blockedExtList = process.env.BLOCKED_FILE_EXTENSIONS
  ? process.env.BLOCKED_FILE_EXTENSIONS.split(',').map((e) =>
      e.trim().toLowerCase(),
    )
  : [
      '.exe',
      '.bat',
      '.cmd',
      '.vbs',
      '.com',
      '.scr',
      '.pif',
      '.msi',
      '.ps1',
      '.hta',
      '.jar',
      '.html',
      '.htm',
      '.xhtml',
      '.php',
      '.phtml',
      '.js',
      '.mjs',
      '.sh',
      '.py',
      '.pl',
      '.cgi',
      '.asp',
      '.aspx',
      '.jsp',
      '.svg',
    ];

@Controller('upload')
export class UploadController {
  @Get('files')
  files() {
    try {
      const allFiles = readdirSync(uploadDir).filter(
        (f) => !f.startsWith('.') && !f.includes('..'),
      );
      return { files: allFiles };
    } catch {
      return { files: [] };
    }
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,

        filename: (req, file, cb) => {
          const uniqueName =
            Date.now() +
            '-' +
            Math.round(Math.random() * 1e9) +
            extname(file.originalname);

          cb(null, uniqueName);
        },
      }),

      fileFilter: (req, file, cb) => {
        const parts = file.originalname.toLowerCase().split('.');
        const hasBlockedExt = parts.some((p) =>
          blockedExtList.includes(`.${p}`),
        );
        if (hasBlockedExt) {
          return cb(
            new BadRequestException(
              `Executable or blocked file extension detected in filename (${file.originalname})`,
            ),
            false,
          );
        }
        cb(null, true);
      },

      limits: {
        fileSize: maxFileSizeMB * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    console.log('Uploaded file:', file.filename);

    console.log('Saved path:', file.path);

    const uploadPrefix = process.env.UPLOAD_PREFIX || '/uploads/';
    const cleanPrefix = uploadPrefix.endsWith('/')
      ? uploadPrefix
      : `${uploadPrefix}/`;
    const fileUrl = `${cleanPrefix}${file.filename}`;

    return {
      success: true,

      fileName: file.originalname,

      fileType: file.mimetype,

      fileSize: file.size,

      fileUrl,
    };
  }
}
