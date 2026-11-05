import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { Repository } from 'typeorm';
import { Room } from './room.entity';
import { User } from '../users/user.entity';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Check if any user with the given nickname in the specified room has been banned.
   */
  async checkBanned(roomId: number, nickname: string): Promise<boolean> {
    if (!roomId || typeof roomId !== 'number' || isNaN(roomId) || roomId <= 0) {
      return false;
    }

    const cleanNick = (nickname || '')
      .replace(/[\r\n\t]/g, '')
      .trim()
      .toLowerCase();

    if (!cleanNick) {
      return false;
    }

    const user = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(TRIM(user.nickname)) = :cleanNick AND user.isBanned = :isBanned',
        {
          roomId,
          cleanNick,
          isBanned: true,
        },
      )
      .getOne();

    return Boolean(user?.isBanned);
  }

  /**
   * Safely extract the local filesystem path for an upload URL.
   * Protects against directory traversal (e.g. '../'), URL encoding tricks, and null bytes.
   */
  private getSafeUploadPath(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
      let rawPath = url.trim();
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        const parsed = new URL(rawPath);
        rawPath = parsed.pathname;
      }

      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        // Fallback to raw if decoding fails
      }

      const cleanPath = decoded.split('?')[0].split('#')[0];
      const rawFilename = cleanPath.split('/').pop()?.split('\\').pop();
      if (!rawFilename) return null;

      const safeFilename = path.basename(rawFilename);
      if (
        !safeFilename ||
        safeFilename === '.' ||
        safeFilename === '..' ||
        safeFilename.includes('\0')
      ) {
        return null;
      }

      const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
      const uploadDir = path.resolve(process.cwd(), uploadDirName);
      const resolvedPath = path.resolve(uploadDir, safeFilename);

      if (!resolvedPath.startsWith(uploadDir + path.sep)) {
        return null;
      }

      return resolvedPath;
    } catch {
      return null;
    }
  }

  /**
   * Validate that the room's custom wallpaper exists on disk if it is a local upload.
   * Resets dead or path-traversal wallpapers to prevent broken UI or security leaks.
   */
  async validateRoomWallpaper(room: Room): Promise<void> {
    if (!room || !room.customWallpaper) return;
    const wp = (room.customWallpaper || '').trim();
    if (!wp) {
      room.customWallpaper = null;
      return;
    }

    if (wp.includes('/uploads/') || wp.includes('/api/uploads/')) {
      const safePath = this.getSafeUploadPath(wp);

      if (!safePath || !fs.existsSync(safePath)) {
        this.logger.warn(
          `Room ${room.passcode} wallpaper file ${wp} not found or invalid on disk. Resetting dead wallpaper.`,
        );
        room.customWallpaper = null;
        if (room.theme === 'custom') {
          room.theme = 'wa-doodle';
        }
        try {
          await this.roomRepo.save(room);
        } catch (e: any) {
          this.logger.error(
            `Failed to save cleaned room wallpaper for room ${room.passcode}: ${e?.message}`,
          );
        }
      }
    }
  }

  /**
   * Find a room by ID, verifying wallpaper integrity if found.
   */
  async findById(id: number): Promise<Room | null> {
    if (!id || typeof id !== 'number' || isNaN(id) || id <= 0) return null;
    const room = await this.roomRepo.findOne({ where: { id } });
    if (room) {
      await this.validateRoomWallpaper(room);
    }
    return room;
  }

  /**
   * Find a room by passcode, verifying wallpaper integrity if found.
   */
  async findByPasscode(passcode: string): Promise<Room | null> {
    if (!passcode || typeof passcode !== 'string') return null;
    const cleanPass = passcode.replace(/[\r\n\t]/g, '').trim();
    if (!cleanPass) return null;

    const room = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: cleanPass,
      })
      .getOne();

    if (room) {
      await this.validateRoomWallpaper(room);
    }
    return room;
  }

  /**
   * Find or create a room with the given passcode.
   * Handles multi-database unique constraint race conditions across Postgres, SQLite, and MySQL.
   */
  async findOrCreate(passcode: string): Promise<Room> {
    if (!passcode || typeof passcode !== 'string') {
      throw new BadRequestException('Passcode cannot be empty');
    }

    const cleanPass = passcode.replace(/[\r\n\t]/g, '').trim();
    if (!cleanPass) {
      throw new BadRequestException('Passcode cannot be empty');
    }

    if (cleanPass.length > 50) {
      throw new BadRequestException('Passcode cannot exceed 50 characters');
    }

    let room = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: cleanPass,
      })
      .getOne();

    if (!room) {
      try {
        room = this.roomRepo.create({
          passcode: cleanPass,
          roomName: `Room-${cleanPass}`,
          theme: 'wa-doodle',
          isActive: true,
        });

        await this.roomRepo.save(room);
      } catch (err: any) {
        // Multi-database unique constraint race condition handling:
        // Postgres: '23505'
        // SQLite: 'SQLITE_CONSTRAINT' or 'SQLITE_CONSTRAINT_UNIQUE'
        // MySQL: 'ER_DUP_ENTRY' or errno 1062
        const isUniqueViolation =
          err?.code === '23505' ||
          err?.code === 'SQLITE_CONSTRAINT' ||
          err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
          err?.code === 'ER_DUP_ENTRY' ||
          err?.errno === 1062 ||
          (typeof err?.message === 'string' &&
            (err.message.includes('UNIQUE constraint failed') ||
              err.message.includes('duplicate key') ||
              err.message.includes('Duplicate entry')));

        if (isUniqueViolation) {
          room = await this.roomRepo
            .createQueryBuilder('room')
            .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
              passcode: cleanPass,
            })
            .getOne();
        } else {
          this.logger.error(
            `Error saving room with passcode ${cleanPass}: ${err?.message}`,
          );
          throw err;
        }
      }
    }

    if (!room) {
      throw new Error(
        `Failed to create or find room with passcode ${cleanPass}`,
      );
    }

    if (!room.isActive) {
      room.isActive = true;
      try {
        await this.roomRepo.save(room);
      } catch (err: any) {
        this.logger.warn(
          `Could not reactivate room ${cleanPass}: ${err?.message}`,
        );
      }
    }

    await this.validateRoomWallpaper(room);

    return room;
  }
}
