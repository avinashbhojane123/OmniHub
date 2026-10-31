import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import { join } from 'path';

import { Status } from '../../status/status.entity';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import {
  CreateStatusDto,
  GetStatusesDto,
  ViewStatusDto,
  DeleteStatusDto,
} from '../dto/status.dto';
import { UserSession } from '../chat.types';

@Injectable()
export class StatusService {
  constructor(
    @InjectRepository(Status)
    private readonly statusRepo: Repository<Status>,

    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createStatus(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: CreateStatusDto,
  ) {
    const cleanPass = data.passcode.trim();
    if (!session || session.passcode.trim().toLowerCase() !== cleanPass.toLowerCase()) {
      return { success: false, message: 'Unauthorized session' };
    }

    let room = await this.roomRepo.findOne({
      where: { passcode: cleanPass },
    });
    if (!room) {
      room = await this.roomRepo.findOne({
        where: { passcode: cleanPass.toLowerCase() },
      });
    }
    if (!room) return { success: false, message: 'Room not found' };

    const user = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (user?.isBanned) {
      client.emit('error', {
        message: 'You are permanently banned from this room.',
      });
      return {
        success: false,
        message: 'You are permanently banned from this room.',
      };
    }

    if (session.isMuted || user?.isMuted) {
      if (user?.mutedUntil && new Date(user.mutedUntil) <= new Date()) {
        user.isMuted = false;
        user.mutedUntil = null;
        await this.userRepo.save(user);
        session.isMuted = false;
        server
          .to(room.passcode)
          .to(room.passcode.toLowerCase())
          .emit('userMuteToggled', {
            targetNickname: user.nickname,
            isMuted: false,
            mutedBy: 'System (Timed Mute Expired)',
          });
      } else {
        client.emit('error', {
          message: 'You are muted and cannot post status stories.',
        });
        return {
          success: false,
          message: 'You are muted and cannot post status stories.',
        };
      }
    }

    const now = new Date();
    const activeCount = await this.statusRepo
      .createQueryBuilder('status')
      .where(
        'status.roomId = :roomId AND LOWER(status.nickname) = LOWER(:nickname)',
        {
          roomId: room.id,
          nickname: session.nickname.trim(),
        },
      )
      .andWhere('(status.expiresAt IS NULL OR status.expiresAt > :now)', {
        now,
      })
      .getCount();

    if (activeCount >= 5) {
      client.emit('error', {
        message:
          'Maximum 5 active statuses allowed at a time. Please wait for an existing status to expire or delete one.',
      });
      return { success: false, message: 'Status quota reached (max 5 active)' };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours

    const status = this.statusRepo.create({
      nickname: session.nickname,
      roomId: room.id,
      type: data.type || 'text',
      content: data.content || null,
      mediaUrl: data.mediaUrl || null,
      bgColor: data.bgColor || null,
      fontStyle: data.fontStyle || null,
      stickers: data.stickers || null,
      viewers: [],
      expiresAt,
    });

    const savedStatus = await this.statusRepo.save(status);
    const roomPasscode = room.passcode.trim();
    const dataPasscode = data.passcode.trim();

    const statusPayload = {
      id: savedStatus.id,
      nickname: savedStatus.nickname,
      roomId: savedStatus.roomId,
      type: savedStatus.type,
      content: savedStatus.content,
      mediaUrl: savedStatus.mediaUrl,
      bgColor: savedStatus.bgColor,
      fontStyle: savedStatus.fontStyle,
      stickers: savedStatus.stickers || null,
      viewers: savedStatus.viewers || [],
      createdAt: savedStatus.createdAt,
      expiresAt: savedStatus.expiresAt,
    };

    server
      .to(roomPasscode)
      .to(roomPasscode.toLowerCase())
      .to(dataPasscode)
      .to(dataPasscode.toLowerCase())
      .emit('statusCreated', statusPayload);

    return { success: true, status: savedStatus };
  }

  async getStatuses(
    client: Socket,
    session: UserSession | undefined,
    data: GetStatusesDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();

    let room = await this.roomRepo.findOne({
      where: { passcode: targetPasscode },
    });
    if (!room) {
      room = await this.roomRepo.findOne({
        where: { passcode: targetPasscode.toLowerCase() },
      });
    }
    if (!room) return [];

    const now = new Date();
    const statuses = await this.statusRepo
      .createQueryBuilder('status')
      .where('status.roomId = :roomId', { roomId: room.id })
      .andWhere('(status.expiresAt IS NULL OR status.expiresAt > :now)', {
        now,
      })
      .orderBy('status.createdAt', 'ASC')
      .getMany();

    client.emit('statusesList', statuses);
    return statuses;
  }

  async viewStatus(
    server: Server,
    session: UserSession | undefined,
    data: ViewStatusDto,
  ) {
    if (!session) return;

    const status = await this.statusRepo.findOne({
      where: { id: data.statusId },
    });
    if (!status) return;

    let viewers = status.viewers || [];
    if (!viewers.includes(session.nickname)) {
      viewers = [...viewers, session.nickname];
      status.viewers = viewers;
      await this.statusRepo.save(status);
    }

    const trimmedPasscode = (data.passcode || session.passcode || '').trim();
    server
      .to(trimmedPasscode)
      .to(trimmedPasscode.toLowerCase())
      .emit('statusViewed', {
        statusId: status.id,
        viewers: status.viewers,
      });
  }

  async deleteStatus(
    server: Server,
    session: UserSession | undefined,
    data: DeleteStatusDto,
  ) {
    if (!session) return;

    const status = await this.statusRepo.findOne({
      where: { id: data.statusId },
    });
    if (!status) return;

    if (status.nickname !== session.nickname && session.role !== 'host') {
      return; // Unauthorized delete attempt
    }

    if (
      status.mediaUrl &&
      (status.mediaUrl.includes('/uploads/') || status.mediaUrl.includes('/api/uploads/'))
    ) {
      try {
        const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
        const filename = status.mediaUrl.split('/').pop()?.split('?')[0];
        if (filename) {
          const filePath = join(process.cwd(), uploadDirName, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (err) {
        console.warn('[DeleteStatus] Could not unlink media file:', err);
      }
    }

    await this.statusRepo.remove(status);

    const trimmedPasscode = (data.passcode || session.passcode || '').trim();
    server
      .to(trimmedPasscode)
      .to(trimmedPasscode.toLowerCase())
      .emit('statusDeleted', {
        statusId: data.statusId,
      });
  }

  async cleanupExpiredStatuses(now: Date = new Date()) {
    try {
      const expired = await this.statusRepo
        .createQueryBuilder('status')
        .where('status.expiresAt IS NOT NULL AND status.expiresAt <= :now', { now })
        .getMany();

      if (expired.length > 0) {
        const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
        for (const st of expired) {
          if (
            st.mediaUrl &&
            (st.mediaUrl.includes('/uploads/') || st.mediaUrl.includes('/api/uploads/'))
          ) {
            try {
              const filename = st.mediaUrl.split('/').pop()?.split('?')[0];
              if (filename) {
                const filePath = join(process.cwd(), uploadDirName, filename);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              }
            } catch (err) {
              console.warn('[StatusCleanup] Could not unlink media file:', err);
            }
          }
        }

        const ids = expired.map((s) => s.id);
        await this.statusRepo
          .createQueryBuilder()
          .delete()
          .from(Status)
          .where('id IN (:...ids)', { ids })
          .execute();
      }
    } catch {
      // Non-critical if table not yet initialized
    }
  }
}
