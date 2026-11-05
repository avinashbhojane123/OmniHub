import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';

import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { UpdateRoomWallpaperDto } from '../dto/room-wallpaper.dto';
import { RoomWallpaperState, UserSession } from '../chat.types';

@Injectable()
export class WallpaperService {
  private getMaxCacheSize(): number {
    const raw = process.env.WALLPAPER_CACHE_MAX;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : 500;
  }

  private roomWallpapers = new Map<string, RoomWallpaperState>();

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Determine if a customWallpaper URL is a local server upload vs an external link.
   * Local uploads are relative paths (/uploads/..., /api/uploads/...) or local host URLs.
   */
  private isLocalUpload(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;

    // Relative upload paths
    if (
      trimmed.startsWith('/uploads/') ||
      trimmed.startsWith('uploads/') ||
      trimmed.startsWith('/api/uploads/') ||
      trimmed.startsWith('api/uploads/')
    ) {
      return true;
    }

    // Absolute URLs: check if origin points to our own server
    try {
      const parsed = new URL(trimmed);
      const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (!isHttp) return false;

      const host = parsed.hostname.toLowerCase();
      const isLocalHost =
        host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';

      let isBackendHost = false;
      const configuredBackendUrl =
        process.env.BACKEND_URL ||
        process.env.SERVER_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.BASE_URL;
      if (configuredBackendUrl) {
        try {
          const backendParsed = new URL(configuredBackendUrl);
          if (backendParsed.hostname.toLowerCase() === host) {
            isBackendHost = true;
          }
        } catch {
          // ignore invalid env URL
        }
      }

      if (isLocalHost || isBackendHost) {
        const pathname = parsed.pathname;
        return (
          pathname.includes('/uploads/') || pathname.includes('/api/uploads/')
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Safely extract the local filesystem path for a local upload URL.
   * Protects against directory traversal, encoded characters, and null bytes.
   */
  private getSafeUploadPath(url: string | null | undefined): string | null {
    if (!this.isLocalUpload(url)) return null;

    try {
      let rawPath = (url as string).trim();
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        const parsed = new URL(rawPath);
        rawPath = parsed.pathname;
      }

      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        // Fallback to raw path if decoding fails
      }

      const cleanPath = decoded.split('?')[0].split('#')[0];
      const rawFilename = cleanPath.split('/').pop()?.split('\\').pop();
      if (!rawFilename) return null;

      const safeFilename = path.basename(rawFilename);
      if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
        return null;
      }

      const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
      const uploadDir = path.resolve(process.cwd(), uploadDirName);
      const resolvedPath = path.resolve(uploadDir, safeFilename);

      // Verify that resolvedPath is strictly inside uploadDir to prevent path traversal
      if (!resolvedPath.startsWith(uploadDir + path.sep)) {
        return null;
      }

      return resolvedPath;
    } catch (err) {
      console.warn('[WallpaperService] Failed to resolve safe upload path:', err);
      return null;
    }
  }

  /**
   * Safely unlinks an old uploaded wallpaper if no other room is referencing it.
   */
  private async safelyUnlinkOldWallpaper(
    oldWallpaperUrl: string | null | undefined,
    currentRoomId: number,
  ): Promise<void> {
    if (!oldWallpaperUrl || !this.isLocalUpload(oldWallpaperUrl)) return;

    const safeFilePath = this.getSafeUploadPath(oldWallpaperUrl);
    if (!safeFilePath || !fs.existsSync(safeFilePath)) return;

    try {
      const filename = path.basename(safeFilePath);
      const otherRoomUsing = await this.roomRepo
        .createQueryBuilder('room')
        .where('room.id != :roomId AND room.customWallpaper LIKE :pattern', {
          roomId: currentRoomId,
          pattern: `%${filename}%`,
        })
        .getCount();

      if (otherRoomUsing > 0) {
        return; // In use by another room
      }

      fs.unlinkSync(safeFilePath);
    } catch (err) {
      console.warn(
        '[WallpaperService] Could not unlink old wallpaper file:',
        err,
      );
    }
  }

  /**
   * Maintain LRU ordering and bounded size for the in-memory wallpaper cache.
   */
  private setCache(key: string, state: RoomWallpaperState): void {
    const maxCache = this.getMaxCacheSize();
    if (
      this.roomWallpapers.size >= maxCache &&
      !this.roomWallpapers.has(key)
    ) {
      const oldestKey = this.roomWallpapers.keys().next().value;
      if (oldestKey) {
        this.roomWallpapers.delete(oldestKey);
      }
    }
    this.roomWallpapers.delete(key);
    this.roomWallpapers.set(key, state);
  }

  /**
   * Clear cached wallpaper state for a given room passcode.
   */
  clearCacheForRoom(roomPasscode: string): void {
    if (roomPasscode) {
      this.roomWallpapers.delete(roomPasscode.trim().toLowerCase());
    }
  }

  /**
   * Sanitize custom wallpaper input, preventing XSS and invalid protocols.
   */
  private sanitizeCustomWallpaper(url: any): string | null {
    if (url === null || url === undefined) return null;
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    if (trimmed.length > 2048) {
      return null;
    }

    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('data:text/') ||
      lower.startsWith('data:application/')
    ) {
      return null;
    }

    if (
      trimmed.startsWith('/uploads/') ||
      trimmed.startsWith('uploads/') ||
      trimmed.startsWith('/api/uploads/') ||
      trimmed.startsWith('api/uploads/')
    ) {
      return trimmed;
    }

    if (
      lower.startsWith('data:image/png;') ||
      lower.startsWith('data:image/jpeg;') ||
      lower.startsWith('data:image/jpg;') ||
      lower.startsWith('data:image/webp;') ||
      lower.startsWith('data:image/gif;') ||
      lower.startsWith('data:image/svg+xml;')
    ) {
      return trimmed;
    }

    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return trimmed;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Sanitize theme string input.
   */
  private sanitizeTheme(theme: any): string {
    if (typeof theme !== 'string') return 'wa-doodle';
    const trimmed = theme.trim();
    if (!trimmed) return 'wa-doodle';
    if (trimmed.length > 50) return trimmed.substring(0, 50);
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return trimmed;
    }
    return 'wa-doodle';
  }

  /**
   * Send error event to socket client if provided or to session socket.
   */
  private emitError(
    client: Socket | undefined,
    server: Server | undefined,
    session: UserSession | undefined,
    message: string,
  ): void {
    if (client) {
      client.emit('error', { message });
    } else if (session?.socketId && server) {
      server.to(session.socketId).emit('error', { message });
    }
  }

  async validateRoomWallpaper(room: Room): Promise<void> {
    if (!room || !room.customWallpaper) return;

    if (this.isLocalUpload(room.customWallpaper)) {
      const safePath = this.getSafeUploadPath(room.customWallpaper);
      if (!safePath || !fs.existsSync(safePath)) {
        console.warn(
          `[WallpaperService] Room ${room.passcode} wallpaper file ${room.customWallpaper} not found on disk. Resetting dead wallpaper.`,
        );
        room.customWallpaper = null;
        if (room.theme === 'custom') {
          room.theme = 'wa-doodle';
        }
        try {
          await this.roomRepo.save(room);
          if (room.passcode) {
            this.setCache(room.passcode.trim().toLowerCase(), {
              theme: room.theme || 'wa-doodle',
              customWallpaper: null,
            });
          }
        } catch (e) {
          console.error(
            '[WallpaperService] Failed to save cleaned room wallpaper:',
            e,
          );
        }
      }
    }
  }

  async cleanupDeadWallpapers(): Promise<void> {
    try {
      const roomsWithWallpaper = await this.roomRepo
        .createQueryBuilder('r')
        .where('r.customWallpaper IS NOT NULL')
        .getMany();

      const roomsToUpdate: Room[] = [];

      for (const r of roomsWithWallpaper) {
        if (r.customWallpaper && this.isLocalUpload(r.customWallpaper)) {
          const safePath = this.getSafeUploadPath(r.customWallpaper);
          if (!safePath || !fs.existsSync(safePath)) {
            console.warn(
              `[WallpaperService:Bootstrap] Room ${r.passcode} wallpaper file ${r.customWallpaper} not found on disk. Resetting dead wallpaper.`,
            );
            r.customWallpaper = null;
            if (r.theme === 'custom') {
              r.theme = 'wa-doodle';
            }
            roomsToUpdate.push(r);
            if (r.passcode) {
              this.setCache(r.passcode.trim().toLowerCase(), {
                theme: r.theme || 'wa-doodle',
                customWallpaper: null,
              });
            }
          }
        }
      }

      if (roomsToUpdate.length > 0) {
        await this.roomRepo.save(roomsToUpdate);
      }
    } catch (err) {
      console.warn(
        '[WallpaperService:Bootstrap] Room wallpaper verification skipped:',
        err,
      );
    }
  }

  getRoomWallpaperState(roomPasscode: string, room: Room): RoomWallpaperState {
    const rawPasscode = roomPasscode || room?.passcode || '';
    const roomKey = rawPasscode.trim().toLowerCase();

    let activeWallpaper = this.roomWallpapers.get(roomKey);
    if (!activeWallpaper) {
      activeWallpaper = {
        theme: (room?.theme as any) || 'wa-doodle',
        customWallpaper: room?.customWallpaper || null,
      };
    }

    // Only verify local uploads against disk; external URLs must not be wiped
    if (
      activeWallpaper.customWallpaper &&
      this.isLocalUpload(activeWallpaper.customWallpaper)
    ) {
      const safePath = this.getSafeUploadPath(activeWallpaper.customWallpaper);
      if (!safePath || !fs.existsSync(safePath)) {
        console.warn(
          `[WallpaperService] Ephemeral upload wallpaper ${activeWallpaper.customWallpaper} missing from disk on join. Resetting.`,
        );
        activeWallpaper = {
          theme:
            activeWallpaper.theme === 'custom'
              ? 'wa-doodle'
              : activeWallpaper.theme,
          customWallpaper: null,
        };
        if (room) {
          room.customWallpaper = null;
          if (room.theme === 'custom') {
            room.theme = 'wa-doodle';
          }
          this.roomRepo.save(room).catch((err) => {
            console.warn(
              '[WallpaperService] Could not save room after dead wallpaper reset on join:',
              err,
            );
          });
        }
      }
    }

    if (roomKey) {
      this.setCache(roomKey, activeWallpaper);
    }

    return activeWallpaper;
  }

  async updateRoomWallpaper(
    server: Server,
    session: UserSession | undefined,
    data: UpdateRoomWallpaperDto,
    client?: Socket,
  ) {
    if (!data || typeof data !== 'object') {
      this.emitError(client, server, session, 'Invalid payload');
      return { success: false, message: 'Invalid payload' };
    }

    const targetPasscode = (data.passcode || session?.passcode || '').trim();
    if (
      !session ||
      !targetPasscode ||
      !session.passcode ||
      session.passcode.trim().toLowerCase() !== targetPasscode.toLowerCase()
    ) {
      this.emitError(client, server, session, 'Unauthorized session');
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(room.passcode) = LOWER(:passcode)', {
        passcode: targetPasscode,
      })
      .getOne();

    if (!room) {
      this.emitError(client, server, session, 'Room not found');
      return { success: false, message: 'Room not found' };
    }

    // Validate user banned status and role in database
    const user = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:nickname)',
        {
          roomId: room.id,
          nickname: session.nickname.trim(),
        },
      )
      .getOne();

    if (user?.isBanned) {
      this.emitError(
        client,
        server,
        session,
        'You are permanently banned from this room.',
      );
      return {
        success: false,
        message: 'You are permanently banned from this room.',
      };
    }

    const isHostOrAdmin =
      session.role === 'host' ||
      session.role === 'admin' ||
      user?.role === 'host' ||
      user?.role === 'admin';

    if (!isHostOrAdmin) {
      this.emitError(
        client,
        server,
        session,
        'Only room host or admin can update room wallpaper.',
      );
      return {
        success: false,
        message: 'Only room host or admin can update room wallpaper.',
      };
    }

    const roomKey = targetPasscode.toLowerCase();
    const currentCached = this.roomWallpapers.get(roomKey) || {
      theme: room.theme || 'wa-doodle',
      customWallpaper: room.customWallpaper || null,
    };

    let newWallpaper: string | null;
    if (data.customWallpaper !== undefined) {
      newWallpaper = this.sanitizeCustomWallpaper(data.customWallpaper);
    } else {
      newWallpaper = currentCached.customWallpaper;
    }

    // If new wallpaper is a local upload, verify it exists on disk
    if (newWallpaper && this.isLocalUpload(newWallpaper)) {
      const safePath = this.getSafeUploadPath(newWallpaper);
      if (!safePath || !fs.existsSync(safePath)) {
        console.warn(
          `[WallpaperService] Rejecting non-existent wallpaper upload file ${newWallpaper}`,
        );
        this.emitError(
          client,
          server,
          session,
          'Wallpaper upload file does not exist on server.',
        );
        return {
          success: false,
          message: 'Wallpaper upload file does not exist on server.',
        };
      }
    }

    let newTheme: string;
    if (data.theme !== undefined && data.theme !== null) {
      newTheme = this.sanitizeTheme(data.theme);
    } else if (newWallpaper) {
      newTheme = 'custom';
    } else {
      newTheme = this.sanitizeTheme(currentCached.theme);
    }

    // Fallback if wallpaper is cleared while in 'custom' theme
    if (!newWallpaper && newTheme === 'custom') {
      newTheme = 'wa-doodle';
    }

    // Safely unlink replaced old wallpaper if it was an uploaded file
    const oldWallpaper = room.customWallpaper;
    if (
      oldWallpaper &&
      oldWallpaper !== newWallpaper &&
      this.isLocalUpload(oldWallpaper)
    ) {
      await this.safelyUnlinkOldWallpaper(oldWallpaper, room.id);
    }

    const previousTheme = room.theme;
    const previousWallpaper = room.customWallpaper;

    try {
      room.theme = newTheme;
      room.customWallpaper = newWallpaper;
      await this.roomRepo.save(room);
    } catch (err) {
      console.error(
        '[WallpaperService] Could not persist wallpaper to database:',
        err,
      );
      room.theme = previousTheme;
      room.customWallpaper = previousWallpaper;
      this.emitError(
        client,
        server,
        session,
        'Failed to update room wallpaper in database.',
      );
      return {
        success: false,
        message: 'Failed to update room wallpaper in database.',
      };
    }

    const updatedState: RoomWallpaperState = {
      theme: newTheme,
      customWallpaper: newWallpaper,
    };
    this.setCache(roomKey, updatedState);

    const isRoomDefault =
      !newWallpaper && (newTheme === 'wa-doodle' || !newTheme);

    const responsePayload = {
      success: true,
      theme: newTheme,
      customWallpaper: newWallpaper,
      isDefault: isRoomDefault,
      updatedBy: session.nickname,
    };

    server
      .to(room.passcode)
      .to(room.passcode.toLowerCase())
      .emit('roomWallpaperUpdated', {
        theme: newTheme,
        customWallpaper: newWallpaper,
        isDefault: isRoomDefault,
        updatedBy: session.nickname,
      });

    return responsePayload;
  }
}
