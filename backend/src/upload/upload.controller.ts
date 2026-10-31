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

    // Inspect binary header bytes to prevent masked executables/scripts
    try {
      const fd = fs.openSync(file.path, 'r');
      const headerBuffer = Buffer.alloc(16);
      fs.readSync(fd, headerBuffer, 0, 16, 0);
      fs.closeSync(fd);

      // Check for Windows executable (MZ), Linux ELF, or Shell script (#! / 0x23 0x21)
      const isDosExe = headerBuffer[0] === 0x4d && headerBuffer[1] === 0x5a;
      const isElf =
        headerBuffer[0] === 0x7f &&
        headerBuffer[1] === 0x45 &&
        headerBuffer[2] === 0x4c &&
        headerBuffer[3] === 0x46;
      const isShebang = headerBuffer[0] === 0x23 && headerBuffer[1] === 0x21;

      if (isDosExe || isElf || isShebang) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new BadRequestException(
          'Security rejection: Executable binary or script signature detected.',
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
    }

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
