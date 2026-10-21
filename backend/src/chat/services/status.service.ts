import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

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
    if (!session || session.passcode !== data.passcode.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
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
        server.to(room.passcode).emit('userMuteToggled', {
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
      .to(dataPasscode)
      .emit('statusCreated', statusPayload);

    return { success: true, status: savedStatus };
  }

  async getStatuses(
    client: Socket,
    session: UserSession | undefined,
    data: GetStatusesDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();

    const room = await this.roomRepo.findOne({
      where: { passcode: targetPasscode },
    });
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

    const trimmedPasscode = (data.passcode || session.passcode).trim();
    server.to(trimmedPasscode).emit('statusViewed', {
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

    if (status.nickname !== session.nickname) {
      return; // Unauthorized delete attempt
    }

    await this.statusRepo.remove(status);

    const trimmedPasscode = (data.passcode || session.passcode).trim();
    server.to(trimmedPasscode).emit('statusDeleted', {
      statusId: data.statusId,
    });
  }

  async cleanupExpiredStatuses(now: Date = new Date()) {
    try {
      await this.statusRepo
        .createQueryBuilder()
        .delete()
        .from(Status)
        .where('expiresAt IS NOT NULL AND expiresAt <= :now', { now })
        .execute();
    } catch {
      // Non-critical if table not yet initialized
    }
  }
}
