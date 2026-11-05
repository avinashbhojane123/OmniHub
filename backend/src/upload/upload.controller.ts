import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve, sep } from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';

export const DEFAULT_BLOCKED_FILE_EXTENSIONS: readonly string[] = [
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

export function getMaxFileSizeMB(): number {
  if (process.env.MAX_FILE_SIZE_BYTES) {
    const bytes = Number(process.env.MAX_FILE_SIZE_BYTES);
    if (!isNaN(bytes) && bytes > 0) {
      return Math.floor(bytes / (1024 * 1024));
    }
  }
  const envVal = process.env.MAX_FILE_SIZE_MB;
  if (!envVal) return 100;
  const parsed = Number(envVal);
  return !isNaN(parsed) && parsed > 0 ? parsed : 100;
}

export function getBlockedExtensions(): string[] {
  if (process.env.BLOCKED_FILE_EXTENSIONS) {
    return process.env.BLOCKED_FILE_EXTENSIONS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
      .map((e) => (e.startsWith('.') ? e : `.${e}`));
  }
  return [...DEFAULT_BLOCKED_FILE_EXTENSIONS];
}

export function getBlockedDotfiles(): string[] {
  if (process.env.BLOCKED_DOTFILES) {
    return process.env.BLOCKED_DOTFILES.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
      .map((e) => (e.startsWith('.') ? e : `.${e}`));
  }
  return ['.env', '.htaccess', '.htpasswd', '.git', '.sh'];
}

export function getUploadDir(): string {
  const uploadFolder = process.env.UPLOAD_DIR || 'uploads';
  const resolved = resolve(process.cwd(), uploadFolder);
  if (!fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch {
      // Ignore directory creation race condition
    }
  }
  return resolved;
}

export function inspectFileSafety(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new BadRequestException('Uploaded file not found on disk.');
  }

  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, headerBuffer, 0, 16, 0);

    if (bytesRead === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    // Windows DOS/PE executable (MZ / 0x4D 0x5A)
    const isDosExe =
      bytesRead >= 2 && headerBuffer[0] === 0x4d && headerBuffer[1] === 0x5a;

    // Linux ELF (0x7F 'E' 'L' 'F' / 0x7F 0x45 0x4C 0x46)
    const isElf =
      bytesRead >= 4 &&
      headerBuffer[0] === 0x7f &&
      headerBuffer[1] === 0x45 &&
      headerBuffer[2] === 0x4c &&
      headerBuffer[3] === 0x46;

    // Shell script (#! / 0x23 0x21)
    const isShebang =
      bytesRead >= 2 && headerBuffer[0] === 0x23 && headerBuffer[1] === 0x21;

    // macOS Mach-O or Java bytecode / fat binary
    const isMachO =
      bytesRead >= 4 &&
      ((headerBuffer[0] === 0xfe &&
        headerBuffer[1] === 0xed &&
        headerBuffer[2] === 0xfa &&
        (headerBuffer[3] === 0xce || headerBuffer[3] === 0xcf)) ||
        (headerBuffer[0] === 0xce &&
          headerBuffer[1] === 0xfa &&
          headerBuffer[2] === 0xed &&
          headerBuffer[3] === 0xfe) ||
        (headerBuffer[0] === 0xcf &&
          headerBuffer[1] === 0xfa &&
          headerBuffer[2] === 0xed &&
          headerBuffer[3] === 0xfe) ||
        (headerBuffer[0] === 0xca &&
          headerBuffer[1] === 0xfe &&
          headerBuffer[2] === 0xba &&
          headerBuffer[3] === 0xbe));

    // Disguised HTML or script signatures
    const headerText = headerBuffer
      .subarray(0, bytesRead)
      .toString('utf8')
      .trim()
      .toLowerCase();
    const isHtmlOrScript =
      headerText.startsWith('<!doctype') ||
      headerText.startsWith('<html') ||
      headerText.startsWith('<script');

    if (isDosExe || isElf || isShebang || isMachO || isHtmlOrScript) {
      throw new BadRequestException(
        'Security rejection: Executable binary or script signature detected.',
      );
    }
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Suppress file descriptor close error
      }
    }
  }
}

export interface UploadHealthResponse {
  status: string;
  service: string;
  uploadDir: string;
  isWritable: boolean;
  maxFileSizeMB: number;
  timestamp: string;
}

export interface UploadFilesListResponse {
  success: boolean;
  count: number;
  total: number;
  files: string[];
}

export interface UploadedFileResponse {
  success: boolean;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
}

export interface DeleteFileResponse {
  success: boolean;
  message: string;
}

@UseGuards(RateLimitGuard)
@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  @Get('health')
  getHealth(): UploadHealthResponse {
    const dir = getUploadDir();
    let isWritable = false;
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      isWritable = true;
    } catch {
      isWritable = false;
    }

    return {
      status: isWritable ? 'ok' : 'degraded',
      service: 'upload',
      uploadDir: dir,
      isWritable,
      maxFileSizeMB: getMaxFileSizeMB(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('files')
  files(
    @Query('limit') limitQuery?: string,
    @Query('offset') offsetQuery?: string,
    @Query('search') searchQuery?: string,
  ): UploadFilesListResponse {
    const defaultLimit =
      Number(process.env.UPLOAD_FILES_DEFAULT_LIMIT) || 100;
    const maxLimit =
      Number(process.env.UPLOAD_FILES_MAX_LIMIT) || 500;
    let limit = defaultLimit;
    let offset = 0;

    if (limitQuery !== undefined && limitQuery !== '') {
      const parsedLimit = parseInt(limitQuery, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        throw new BadRequestException(
          'Invalid limit parameter. Must be a positive integer.',
        );
      }
      limit = Math.min(parsedLimit, maxLimit);
    }

    if (offsetQuery !== undefined && offsetQuery !== '') {
      const parsedOffset = parseInt(offsetQuery, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        throw new BadRequestException(
          'Invalid offset parameter. Must be a non-negative integer.',
        );
      }
      offset = parsedOffset;
    }

    try {
      const dir = getUploadDir();
      if (!fs.existsSync(dir)) {
        return { success: true, count: 0, total: 0, files: [] };
      }

      const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
      let allFiles = dirEntries
        .filter(
          (dirent) =>
            dirent.isFile() &&
            !dirent.name.startsWith('.') &&
            !dirent.name.includes('..'),
        )
        .map((dirent) => dirent.name);

      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        allFiles = allFiles.filter((name) =>
          name.toLowerCase().includes(query),
        );
      }

      const paginated = allFiles.slice(offset, offset + limit);

      return {
        success: true,
        count: paginated.length,
        total: allFiles.length,
        files: paginated,
      };
    } catch (err) {
      this.logger.error(`Error reading files in upload directory: ${err}`);
      return { success: false, count: 0, total: 0, files: [] };
    }
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          try {
            const dir = getUploadDir();
            cb(null, dir);
          } catch (err: any) {
            cb(err, '');
          }
        },

        filename: (_req, file, cb) => {
          try {
            const original = file?.originalname || 'file';
            const cleanName = original.trim().replace(/[\s.]+$/, '');
            const rawExt = extname(cleanName);
            const cleanExt = rawExt.toLowerCase().replace(/[^.a-z0-9_-]/g, '');
            const randomHex = randomBytes(16).toString('hex');
            const uniqueName = `${Date.now()}-${randomHex}${cleanExt}`;

            cb(null, uniqueName);
          } catch (err: any) {
            cb(err, '');
          }
        },
      }),

      fileFilter: (_req, file, cb) => {
        if (!file || !file.originalname || typeof file.originalname !== 'string') {
          return cb(
            new BadRequestException(
              'Invalid upload: file name is missing or invalid.',
            ),
            false,
          );
        }

        const rawName = file.originalname.trim();
        if (!rawName) {
          return cb(
            new BadRequestException('Invalid upload: file name is empty.'),
            false,
          );
        }

        if (rawName.includes('\0') || rawName.includes('%00')) {
          return cb(
            new BadRequestException(
              'Security rejection: Null byte detected in filename.',
            ),
            false,
          );
        }

        // Strip trailing spaces and dots to prevent Windows NTFS extension bypass
        const normalizedName = rawName.replace(/[\s.]+$/, '');
        const lowerName = normalizedName.toLowerCase();
        const blockedList = getBlockedExtensions();
        const parts = lowerName.split('.');

        // Check dangerous dotfiles
        if (parts.length <= 1 || (parts.length === 2 && parts[0] === '')) {
          const dotfile = `.${parts[parts.length - 1]}`;
          const blockedDotfiles = getBlockedDotfiles();
          if (
            blockedList.includes(dotfile) ||
            blockedDotfiles.includes(dotfile)
          ) {
            return cb(
              new BadRequestException(
                `Security rejection: Disallowed file or dotfile (${file.originalname}).`,
              ),
              false,
            );
          }
        }

        const hasBlockedExt = parts.some((p) =>
          blockedList.includes(`.${p}`),
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
        fileSize: getMaxFileSizeMB() * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @UploadedFile()
    file: Express.Multer.File,
  ): UploadedFileResponse {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.path || file.size === 0) {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // Suppress unlink error
        }
      }
      throw new BadRequestException('Uploaded file is empty or corrupted');
    }

    this.logger.log(`Uploaded file: ${file.filename} (${file.size} bytes)`);

    // Inspect binary header bytes to prevent masked executables/scripts
    try {
      inspectFileSafety(file.path);
    } catch (err) {
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {
          this.logger.warn(
            `Failed to remove rejected file ${file.path}: ${unlinkErr}`,
          );
        }
      }
      throw err;
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

  @Delete(':filename')
  deleteFile(@Param('filename') filename: string): DeleteFileResponse {
    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      throw new BadRequestException('Filename is required');
    }

    const cleanFilename = filename.trim();
    let decodedFilename = cleanFilename;
    try {
      decodedFilename = decodeURIComponent(cleanFilename);
    } catch {
      throw new BadRequestException('Invalid filename encoding');
    }

    if (
      decodedFilename.includes('..') ||
      decodedFilename.includes('/') ||
      decodedFilename.includes('\\') ||
      decodedFilename.includes('\0')
    ) {
      throw new BadRequestException(
        'Invalid filename path traversal detected',
      );
    }

    const dir = getUploadDir();
    const filePath = resolve(dir, decodedFilename);

    // Verify filePath is strictly within upload directory
    if (!filePath.startsWith(dir + sep) && filePath !== dir) {
      throw new BadRequestException(
        'Invalid filename path traversal detected',
      );
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    try {
      fs.unlinkSync(filePath);
      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (err) {
      this.logger.error(`Failed to delete file ${filePath}: ${err}`);
      throw new BadRequestException('Failed to delete file');
    }
  }
}
