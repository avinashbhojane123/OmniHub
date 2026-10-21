import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'path';
import * as fs from 'fs';

import { Repository } from 'typeorm';
import { Room } from './room.entity';
import { User } from '../users/user.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private roomRepo: Repository<Room>,

    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async checkBanned(roomId: number, nickname: string): Promise<boolean> {
    const user = await this.userRepo.findOne({
      where: { roomId, nickname },
    });
    return Boolean(user?.isBanned);
  }

  async validateRoomWallpaper(room: Room): Promise<void> {
    if (!room || !room.customWallpaper) return;
    const wp = room.customWallpaper.trim();
    if (wp.includes('/uploads/') || wp.includes('/api/uploads/')) {
      const match = wp.match(/uploads\/([^/?#]+)/i);
      if (match && match[1]) {
        const filename = match[1];
        const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
        const filePath = join(process.cwd(), uploadDirName, filename);
        if (!fs.existsSync(filePath)) {
          console.warn(
            `[RoomsService] Room ${room.passcode} wallpaper file ${filename} not found on disk. Resetting dead wallpaper.`,
          );
          room.customWallpaper = null;
          if (room.theme === 'custom') {
            room.theme = 'wa-doodle';
          }
          try {
            await this.roomRepo.save(room);
          } catch (e) {
            console.error(
              '[RoomsService] Failed to save cleaned room wallpaper:',
              e,
            );
          }
        }
      }
    }
  }

  async findOrCreate(passcode: string): Promise<Room> {
    let room = await this.roomRepo.findOne({
      where: { passcode },
    });

    if (!room) {
      try {
        room = this.roomRepo.create({
          passcode,
        });

        await this.roomRepo.save(room);
      } catch (err: any) {
        if (err.code === '23505') {
          room = await this.roomRepo.findOne({
            where: { passcode },
          });
        } else {
          throw err;
        }
      }
    }

    if (!room) {
      throw new Error(
        `Failed to create or find room with passcode ${passcode}`,
      );
    }

    await this.validateRoomWallpaper(room);

    return room;
  }
}
