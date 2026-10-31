import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import { join } from 'path';

import { Message } from '../../messages/message.entity';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { SendMessageDto, SendDirectMessageDto } from '../dto/send-message.dto';
import {
  EditMessageDto,
  DeleteMessageDto,
  ClearHistoryDto,
  ReactToMessageDto,
  PinMessageDto,
  MarkReadDto,
  VotePollDto,
} from '../dto/message-actions.dto';
import { GetRoomDto } from '../dto/get-room.dto';
import { UserSession } from '../chat.types';

@Injectable()
export class MessageService {
  private isCleaning = false;
  private processedTempIds = new Map<string, { messageId: number; timestamp: number }>();

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) { }

  async findRoom(passcode: string): Promise<Room | null> {
    if (!passcode) return null;
    return await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: passcode.trim(),
      })
      .getOne();
  }

  async findUser(roomId: number, nickname: string): Promise<User | null> {
    if (!nickname) return null;
    return await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(TRIM(user.nickname)) = LOWER(TRIM(:nickname))',
        {
          roomId,
          nickname: nickname.trim(),
        },
      )
      .getOne();
  }

  async sendMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: SendMessageDto,
    findRoomByPasscode: (passcode: string) => Promise<Room | null>,
  ) {
    const reqPass = (data?.passcode || '').trim().toLowerCase();
    const sessionPass = (session?.passcode || '').trim().toLowerCase();
    if (
      !session ||
      (sessionPass !== reqPass &&
        !sessionPass.includes(reqPass) &&
        !reqPass.includes(sessionPass))
    ) {
      client.emit('error', {
        message: 'Unauthorized: Please join the room first',
      });
      return {
        success: false,
        message: 'Unauthorized: Please join the room first',
      };
    }

    const room = await findRoomByPasscode(data.passcode || session.passcode);

    if (!room) {
      return {
        success: false,
        message: 'Room not found',
      };
    }

    const senderUser = await this.findUser(room.id, session.nickname);

    if (senderUser?.isBanned) {
      client.emit('error', {
        message: 'You are permanently banned from this room.',
      });
      return {
        success: false,
        message: 'You are permanently banned from this room.',
      };
    }

    if (senderUser?.isMuted) {
      if (
        senderUser.mutedUntil &&
        new Date(senderUser.mutedUntil) <= new Date()
      ) {
        senderUser.isMuted = false;
        senderUser.mutedUntil = null;
        await this.userRepo.save(senderUser);
        session.isMuted = false;
        server.to(room.passcode).emit('userMuteToggled', {
          targetNickname: senderUser.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        const remainingMinutes = senderUser.mutedUntil
          ? Math.ceil(
            (new Date(senderUser.mutedUntil).getTime() - Date.now()) / 60000,
          )
          : null;
        client.emit('error', {
          message: remainingMinutes
            ? `You are muted for ${remainingMinutes} more minute(s).`
            : 'You have been muted by the room host.',
        });
        return {
          success: false,
          message: 'You have been muted by the room host.',
        };
      }
    }

    if (senderUser) {
      senderUser.lastSeen = new Date();
      await this.userRepo.save(senderUser);
    }

    const tempKey = data.tempId ? `${session.nickname}:${data.tempId}` : null;
    if (tempKey) {
      const existingProcessed = this.processedTempIds.get(tempKey);
      if (existingProcessed && Date.now() - existingProcessed.timestamp < 120000) {
        return {
          success: true,
          messageId: existingProcessed.messageId,
        };
      }
    }

    let expiresAt: Date | null = null;
    if (data.expiresIn) {
      expiresAt = new Date(Date.now() + data.expiresIn * 1000);
    }

    const savedMessage = this.messageRepo.create({
      roomId: room.id,
      nickname: session.nickname,
      message: data.message,
      replyTo: data.replyTo,
      fileUrl: data.fileUrl ?? null,
      fileName: data.fileName ?? null,
      fileType: data.fileType ?? null,
      fileSize:
        typeof data.fileSize === 'string'
          ? parseInt(data.fileSize, 10)
          : (data.fileSize ?? null),
      isVoiceNote: Boolean(data.isVoiceNote),
      isVideoNote: Boolean(data.isVideoNote),
      isWithoutSound: Boolean(data.isWithoutSound),
      expiresAt,
      pollData: data.pollData ?? null,
      locationData: data.locationData ?? null,
      readBy: [session.nickname],
    });

    await this.messageRepo.save(savedMessage);

    const roomPasscode = room.passcode.trim();
    const dataPasscode = data.passcode.trim();
    await client.join(roomPasscode);
    await client.join(dataPasscode);

    const messagePayload = {
      id: savedMessage.id,
      tempId: data.tempId ?? null,
      roomId: room.id,
      nickname: savedMessage.nickname,
      message: savedMessage.message,
      createdAt: savedMessage.createdAt,
      replyTo: savedMessage.replyTo,
      fileUrl: savedMessage.fileUrl,
      fileName: savedMessage.fileName,
      fileType: savedMessage.fileType,
      fileSize: savedMessage.fileSize,
      isVoiceNote: savedMessage.isVoiceNote,
      isVideoNote: savedMessage.isVideoNote,
      isWithoutSound: savedMessage.isWithoutSound,
      isEdited: savedMessage.isEdited,
      isDeleted: savedMessage.isDeleted,
      reactions: savedMessage.reactions,
      expiresAt: savedMessage.expiresAt,
      pollData: savedMessage.pollData,
      locationData: savedMessage.locationData,
      readBy: savedMessage.readBy || [savedMessage.nickname],
    };

    server
      .to(roomPasscode)
      .to(roomPasscode.toLowerCase())
      .to(dataPasscode)
      .to(dataPasscode.toLowerCase())
      .emit('newMessage', messagePayload);

    server
      .to(roomPasscode)
      .to(roomPasscode.toLowerCase())
      .to(dataPasscode)
      .to(dataPasscode.toLowerCase())
      .emit('message', messagePayload);

    if (tempKey) {
      this.processedTempIds.set(tempKey, {
        messageId: savedMessage.id,
        timestamp: Date.now(),
      });
      if (this.processedTempIds.size > 2000) {
        const cutoff = Date.now() - 120000;
        for (const [k, v] of this.processedTempIds.entries()) {
          if (v.timestamp < cutoff) this.processedTempIds.delete(k);
        }
      }
    }

    return {
      success: true,
      messageId: savedMessage.id,
    };
  }

  async sendDirectMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: SendDirectMessageDto,
    findSocketsInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (
      !session ||
      session.passcode.trim().toLowerCase() !==
        data.passcode?.trim().toLowerCase()
    ) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(data.passcode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const sender = await this.findUser(room.id, session.nickname);
    if (sender) {
      sender.lastSeen = new Date();
      await this.userRepo.save(sender);
    }

    if (session.isMuted) {
      if (sender?.mutedUntil && new Date(sender.mutedUntil) <= new Date()) {
        sender.isMuted = false;
        sender.mutedUntil = null;
        await this.userRepo.save(sender);
        session.isMuted = false;
        server.to(room.passcode).emit('userMuteToggled', {
          targetNickname: sender.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        const remainingMinutes = sender?.mutedUntil
          ? Math.ceil(
            (new Date(sender.mutedUntil).getTime() - Date.now()) / 60000,
          )
          : null;
        client.emit('error', {
          message: remainingMinutes
            ? `You are muted for ${remainingMinutes} more minute(s).`
            : 'You have been muted by the room host.',
        });
        return {
          success: false,
          message: 'You have been muted by the room host.',
        };
      }
    }

    if (!data.message?.trim() && !data.fileUrl) {
      return { success: false, message: 'Message content is empty' };
    }

    if (
      data.targetNickname.trim().toLowerCase() ===
      session.nickname.trim().toLowerCase()
    ) {
      return { success: false, message: 'Cannot whisper yourself' };
    }

    const targetNickname = data.targetNickname.trim();
    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: targetNickname,
        },
      )
      .getOne();

    if (!targetUser) {
      client.emit('directMessageError', {
        targetNickname,
        message: `@${targetNickname} is not a member of this room.`,
      });
      return {
        success: false,
        message: `Participant "${targetNickname}" not found in this room`,
      };
    }

    if (targetUser.isBanned) {
      client.emit('directMessageError', {
        targetNickname,
        message: `@${targetNickname} is banned from this room and cannot receive whispers.`,
      });
      return {
        success: false,
        message: `Participant "${targetNickname}" is banned from this room`,
      };
    }

    const tempKey = data.tempId
      ? `${session.nickname}:${targetUser.nickname}:${data.tempId}`
      : null;
    if (tempKey) {
      const existingProcessed = this.processedTempIds.get(tempKey);
      if (existingProcessed && Date.now() - existingProcessed.timestamp < 120000) {
        return {
          success: true,
          message: { id: existingProcessed.messageId },
          isDuplicateSuppressed: true,
        };
      }
    }

    let expiresAt: Date | null = null;
    if (data.expiresIn) {
      expiresAt = new Date(Date.now() + data.expiresIn * 1000);
    }

    const savedDirectMsg = await this.messageRepo.save(
      this.messageRepo.create({
        roomId: room.id,
        nickname: session.nickname,
        targetNickname: targetUser.nickname,
        message: data.message ? data.message.trim() : '',
        fileUrl: data.fileUrl ?? null,
        fileName: data.fileName ?? null,
        fileType: data.fileType ?? null,
        fileSize:
          typeof data.fileSize === 'string'
            ? parseInt(data.fileSize, 10)
            : (data.fileSize ?? null),
        isVoiceNote: Boolean(data.isVoiceNote),
        isVideoNote: Boolean(data.isVideoNote),
        isWithoutSound: Boolean(data.isWithoutSound),
        expiresAt,
        isDirect: true,
      }),
    );

    const directPayload = {
      ...savedDirectMsg,
      tempId: data.tempId ?? null,
    };

    const targets = findSocketsInRoom(
      data.passcode.trim(),
      targetUser.nickname,
    );
    for (const t of targets) {
      server.to(t.socketId).emit('directMessage', directPayload);
    }
    const senderSockets = findSocketsInRoom(
      data.passcode.trim(),
      session.nickname,
    );
    for (const s of senderSockets) {
      server.to(s.socketId).emit('directMessage', directPayload);
    }

    if (tempKey) {
      this.processedTempIds.set(tempKey, {
        messageId: savedDirectMsg.id,
        timestamp: Date.now(),
      });
      if (this.processedTempIds.size > 2000) {
        const cutoff = Date.now() - 120000;
        for (const [k, v] of this.processedTempIds.entries()) {
          if (v.timestamp < cutoff) this.processedTempIds.delete(k);
        }
      }
    }

    return {
      success: true,
      message: savedDirectMsg,
      isOfflineDelivery: targets.length === 0,
    };
  }

  async markRead(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    payload: MarkReadDto,
    findSocketsInRoom?: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (!payload || !payload.messageIds || !payload.messageIds.length) {
      return { success: false };
    }
    const reader = payload.nickname || session?.nickname;
    if (!reader) return { success: false };

    const messages = await this.messageRepo.find({
      where: payload.messageIds.map((id) => ({ id })),
    });

    const updatedMessages: Message[] = [];
    const publicUpdatedIds: number[] = [];
    const directUpdatedMessages: Message[] = [];

    for (const msg of messages) {
      const currentReadBy = Array.isArray(msg.readBy)
        ? msg.readBy
        : [msg.nickname];
      if (!currentReadBy.includes(reader)) {
        msg.readBy = [...currentReadBy, reader];
        updatedMessages.push(msg);
        if (msg.isDirect) {
          directUpdatedMessages.push(msg);
        } else {
          publicUpdatedIds.push(msg.id);
        }
      }
    }
    if (updatedMessages.length > 0) {
      await this.messageRepo.save(updatedMessages);
    }

    const roomPasscode = (payload.passcode || session?.passcode || '').trim();

    // Broadcast public message read receipts across case variants
    if (publicUpdatedIds.length > 0 && roomPasscode) {
      server
        .to(roomPasscode)
        .to(roomPasscode.toLowerCase())
        .emit('messagesRead', {
          messageIds: publicUpdatedIds,
          readByNick: reader,
        });
    }

    // Direct messages: strictly isolate receipts to the whisper participants
    if (directUpdatedMessages.length > 0 && roomPasscode && findSocketsInRoom) {
      for (const dm of directUpdatedMessages) {
        const participantNicks = new Set<string>(
          [dm.nickname, dm.targetNickname].filter((n): n is string => Boolean(n)),
        );
        for (const nick of participantNicks) {
          const sockets = findSocketsInRoom(roomPasscode, nick);
          for (const s of sockets) {
            server.to(s.socketId).emit('messagesRead', {
              messageIds: [dm.id],
              readByNick: reader,
            });
          }
        }
      }
    }

    return { success: true, updatedCount: updatedMessages.length };
  }

  async votePoll(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    payload: VotePollDto,
  ) {
    const targetPasscode = (
      payload?.passcode ||
      session?.passcode ||
      ''
    ).trim();
    if (!session || !targetPasscode || session.passcode !== targetPasscode) {
      return { success: false, message: 'Unauthorized' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: targetPasscode },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const voterUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:nickname)',
        {
          roomId: room.id,
          nickname: session.nickname.trim(),
        },
      )
      .getOne();
    if (!voterUser || voterUser.isBanned) {
      client.emit('error', {
        message: 'You are banned or not authorized to vote on polls.',
      });
      return { success: false, message: 'You are banned from voting' };
    }
    if (voterUser.isMuted) {
      if (
        voterUser.mutedUntil &&
        new Date(voterUser.mutedUntil) <= new Date()
      ) {
        voterUser.isMuted = false;
        voterUser.mutedUntil = null;
        await this.userRepo.save(voterUser);
        session.isMuted = false;
        server.to(room.passcode).emit('userMuteToggled', {
          targetNickname: voterUser.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        client.emit('error', {
          message: 'You are muted and cannot vote on polls.',
        });
        return {
          success: false,
          message: 'You are muted and cannot vote on polls.',
        };
      }
    }

    const message = await this.messageRepo.findOne({
      where: { id: payload.messageId },
    });

    if (!message || !message.pollData) return { success: false };

    const poll = message.pollData;
    if (poll.expiresAt && new Date(poll.expiresAt) <= new Date()) {
      client.emit('error', {
        message: 'This poll has expired and voting is closed.',
      });
      return {
        success: false,
        message: 'This poll has expired and voting is closed.',
      };
    }

    const voterNickname = session.nickname.trim();
    const voterLower = voterNickname.toLowerCase();
    if (poll.options && Array.isArray(poll.options)) {
      const isMulti = Boolean(poll.allowMultiple);
      poll.options.forEach((opt: any) => {
        opt.votes = opt.votes || [];
        const alreadyVotedThisOption = opt.votes.some(
          (nick: string) => (nick || '').trim().toLowerCase() === voterLower,
        );

        if (String(opt.id) === String(payload.optionId)) {
          if (alreadyVotedThisOption) {
            // Toggle off (unvote)
            opt.votes = opt.votes.filter(
              (nick: string) => (nick || '').trim().toLowerCase() !== voterLower,
            );
          } else {
            // Cast vote on this option
            opt.votes = [
              ...opt.votes.filter(
                (nick: string) => (nick || '').trim().toLowerCase() !== voterLower,
              ),
              voterNickname,
            ];
          }
        } else if (!isMulti) {
          // In single-choice mode, remove vote from all other options
          opt.votes = opt.votes.filter(
            (nick: string) => (nick || '').trim().toLowerCase() !== voterLower,
          );
        }
      });
    }

    message.pollData = poll;
    await this.messageRepo.save(message);

    const roomPass = room.passcode.trim();
    const targetPass = targetPasscode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .to(targetPass)
      .to(targetPass.toLowerCase())
      .emit('messageUpdated', {
        id: message.id,
        pollData: message.pollData,
      });

    return { success: true };
  }

  async getMessages(
    client: Socket,
    session: UserSession | undefined,
    data: GetRoomDto,
    findRoomByPasscode: (passcode: string) => Promise<Room | null>,
    findMatchingRoomIds: (passcode: string) => Promise<number[]>,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();
    if (!targetPasscode) {
      return [];
    }

    const room = await findRoomByPasscode(targetPasscode);
    if (!room) {
      return [];
    }

    const matchingRoomIds = await findMatchingRoomIds(targetPasscode);
    if (!matchingRoomIds.includes(room.id)) {
      matchingRoomIds.push(room.id);
    }

    const clientNick = (session?.nickname || '').trim();
    const query = this.messageRepo
      .createQueryBuilder('m')
      .where('m.roomId IN (:...roomIds)', { roomIds: matchingRoomIds })
      .andWhere(
        '(m.isDirect = false OR m.isDirect IS NULL OR LOWER(TRIM(m.nickname)) = LOWER(TRIM(:clientNick)) OR LOWER(TRIM(m.targetNickname)) = LOWER(TRIM(:clientNick)))',
        { clientNick },
      )
      .andWhere('(m.expiresAt IS NULL OR m.expiresAt > :now)', {
        now: new Date(),
      });

    if (data?.beforeId) {
      query.andWhere('m.id < :beforeId', { beforeId: data.beforeId });
    }

    if (data?.searchQuery && data.searchQuery.trim()) {
      const q = `%${data.searchQuery.trim().toLowerCase()}%`;
      query.andWhere(
        '(LOWER(m.message) LIKE :q OR LOWER(m.nickname) LIKE :q OR LOWER(m.fileName) LIKE :q)',
        { q },
      );
    }

    const limit = Math.min(data?.limit || 50, 100);
    const olderMessages = await query
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(limit)
      .getMany();

    return olderMessages.reverse();
  }

  async editMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: EditMessageDto,
    findSocketsInRoom?: (
      passcode: string,
      nickname?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (
      !session ||
      session.passcode.trim().toLowerCase() !==
        (data.passcode || '').trim().toLowerCase()
    )
      return;

    const room = await this.findRoom(session.passcode);
    if (!room) return;

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) return;

    if (msg.isDeleted) {
      client.emit('error', { message: 'Cannot edit a deleted message.' });
      return;
    }

    if (
      msg.nickname.trim().toLowerCase() !==
      session.nickname.trim().toLowerCase()
    ) {
      client.emit('error', { message: 'You can only edit your own messages.' });
      return; // Unauthorized edit attempt!
    }

    // 15-minute edit window check
    const fifteenMinutesMs = 15 * 60 * 1000;
    const msgCreatedAt = new Date(msg.createdAt).getTime();
    if (Date.now() - msgCreatedAt > fifteenMinutesMs) {
      client.emit('error', {
        message: 'Messages can only be edited within 15 minutes of sending.',
      });
      return;
    }

    if (data.newMessage !== undefined) {
      msg.message = data.newMessage;
    }
    if (data.fileUrl !== undefined) {
      msg.fileUrl = data.fileUrl;
    }
    msg.isEdited = true;
    await this.messageRepo.save(msg);

    const updatedPayload = {
      id: msg.id,
      messageId: msg.id,
      newMessage: msg.message,
      message: msg.message,
      fileUrl: msg.fileUrl,
      isEdited: true,
    };

    if (msg.isDirect && findSocketsInRoom) {
      const targetSockets = [
        ...findSocketsInRoom(room.passcode, msg.nickname),
        ...(msg.targetNickname
          ? findSocketsInRoom(room.passcode, msg.targetNickname)
          : []),
      ];
      for (const s of targetSockets) {
        server.to(s.socketId).emit('messageEdited', updatedPayload);
        server.to(s.socketId).emit('messageUpdated', updatedPayload);
      }
    } else {
      const roomPass = room.passcode.trim();
      const dataPass = (data.passcode || '').trim();
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('messageEdited', updatedPayload);
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('messageUpdated', updatedPayload);
    }
  }

  async deleteMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: DeleteMessageDto,
    findSocketsInRoom?: (
      passcode: string,
      nickname?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (
      !session ||
      session.passcode.trim().toLowerCase() !==
        (data.passcode || '').trim().toLowerCase()
    )
      return;

    const room = await this.findRoom(session.passcode);
    if (!room) return;

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) return;

    const isOwner =
      msg.nickname.trim().toLowerCase() ===
      session.nickname.trim().toLowerCase();
    const isHostOrAdmin = session.role === 'host' || session.role === 'admin';
    if (!isOwner && !isHostOrAdmin) {
      client.emit('error', {
        message: 'Unauthorized: Only the author or room host can delete messages.',
      });
      return; // Unauthorized delete attempt!
    }

    if (
      msg.fileUrl &&
      (msg.fileUrl.includes('/uploads/') || msg.fileUrl.includes('/api/uploads/'))
    ) {
      try {
        const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
        const filename = msg.fileUrl.split('/').pop()?.split('?')[0];
        if (filename) {
          const filePath = join(process.cwd(), uploadDirName, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (err) {
        console.warn('[DeleteMessage] Could not unlink file:', err);
      }
    }

    msg.isDeleted = true;
    msg.message = 'This message was deleted';
    msg.fileUrl = null;
    msg.fileName = null;
    msg.fileType = null;
    msg.fileSize = null;
    const roomPass = room.passcode.trim();
    const dataPass = (data.passcode || '').trim();

    // If this was the pinned message, reset room pinnedMessageId
    if (room.pinnedMessageId === msg.id) {
      room.pinnedMessageId = null;
      await this.roomRepo.save(room);
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('pinnedMessageUpdated', null);
    }

    if (msg.isDirect && findSocketsInRoom) {
      const targetSockets = [
        ...findSocketsInRoom(room.passcode, msg.nickname),
        ...(msg.targetNickname
          ? findSocketsInRoom(room.passcode, msg.targetNickname)
          : []),
      ];
      for (const s of targetSockets) {
        server.to(s.socketId).emit('messageDeleted', {
          messageId: msg.id,
        });
      }
    } else {
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('messageDeleted', {
          messageId: msg.id,
        });
    }
  }

  async clearHistory(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: ClearHistoryDto,
  ) {
    const targetPasscode = (data?.passcode || '').trim();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== targetPasscode.toLowerCase()
    ) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) return { success: false, message: 'Room not found' };

    const user = await this.findUser(room.id, session.nickname);
    if (!user || (user.role !== 'host' && user.role !== 'admin')) {
      client.emit('error', {
        message: 'Only room host or admin can clear history.',
      });
      return {
        success: false,
        message: 'Only room host or admin can clear history.',
      };
    }

    await this.messageRepo.delete({ roomId: room.id });

    // Clear pinned message in room
    room.pinnedMessageId = null;
    await this.roomRepo.save(room);

    console.log(
      `[ClearHistory] Room ${targetPasscode} history cleared by ${user.role} ${session.nickname}`,
    );

    const roomPass = room.passcode.trim();
    const targetPass = targetPasscode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .to(targetPass)
      .to(targetPass.toLowerCase())
      .emit('historyCleared');
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .to(targetPass)
      .to(targetPass.toLowerCase())
      .emit('pinnedMessageUpdated', null);
    return { success: true };
  }

  async pinMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: PinMessageDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== targetPasscode.toLowerCase()
    ) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) return { success: false, message: 'Room not found' };

    const user = await this.findUser(room.id, session.nickname);
    if (!user || (user.role !== 'host' && user.role !== 'admin')) {
      client.emit('error', {
        message: 'Only room host or admin can pin messages.',
      });
      return {
        success: false,
        message: 'Only room host or admin can pin messages.',
      };
    }

    let pinnedMsg: Message | null = null;
    if (data.messageId) {
      pinnedMsg = await this.messageRepo.findOne({
        where: { id: data.messageId, roomId: room.id },
      });
      if (!pinnedMsg) {
        return { success: false, message: 'Message not found' };
      }
      if (pinnedMsg.isDirect) {
        client.emit('error', {
          message: 'Private direct messages cannot be pinned to the public room.',
        });
        return {
          success: false,
          message: 'Private direct messages cannot be pinned.',
        };
      }
      room.pinnedMessageId = pinnedMsg.id;
    } else {
      room.pinnedMessageId = null;
    }

    await this.roomRepo.save(room);

    const roomPass = room.passcode.trim();
    const targetPass = targetPasscode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .to(targetPass)
      .to(targetPass.toLowerCase())
      .emit('pinnedMessageUpdated', pinnedMsg);
    return { success: true, pinnedMessage: pinnedMsg };
  }

  async reactToMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: ReactToMessageDto,
    findSocketsInRoom?: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (!session || session.isMuted) return;
    if (
      session.passcode.trim().toLowerCase() !==
      (data.passcode || '').trim().toLowerCase()
    )
      return;

    const room = await this.findRoom(session.passcode);
    if (!room) return;

    const user = await this.findUser(room.id, session.nickname);
    if (!user || user.isBanned) return;

    if (session.isMuted || user.isMuted) {
      if (user.mutedUntil && new Date(user.mutedUntil) <= new Date()) {
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
        return;
      }
    }

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) return;

    const reactions = msg.reactions || {};
    const activeNickname = session.nickname.trim();
    const activeLower = activeNickname.toLowerCase();
    let reactionUsers = reactions[data.emoji] || [];

    const alreadyReacted = reactionUsers.some(
      (u) => (u || '').trim().toLowerCase() === activeLower,
    );

    if (alreadyReacted) {
      reactionUsers = reactionUsers.filter(
        (u) => (u || '').trim().toLowerCase() !== activeLower,
      );
    } else {
      reactionUsers = [
        ...reactionUsers.filter(
          (u) => (u || '').trim().toLowerCase() !== activeLower,
        ),
        activeNickname,
      ];
    }

    if (reactionUsers.length === 0) {
      delete reactions[data.emoji];
    } else {
      reactions[data.emoji] = reactionUsers;
    }

    msg.reactions = Object.keys(reactions).length > 0 ? reactions : null;
    await this.messageRepo.save(msg);

    if (msg.isDirect && findSocketsInRoom) {
      const targetSockets = [
        ...findSocketsInRoom(room.passcode, msg.nickname),
        ...(msg.targetNickname ? findSocketsInRoom(room.passcode, msg.targetNickname) : []),
      ];
      for (const s of targetSockets) {
        server.to(s.socketId).emit('messageReactionsUpdated', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
        server.to(s.socketId).emit('messageReaction', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
      }
    } else {
      const roomPass = room.passcode.trim();
      const dataPass = (data.passcode || '').trim();
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('messageReactionsUpdated', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .to(dataPass)
        .to(dataPass.toLowerCase())
        .emit('messageReaction', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
    }
  }

  async cleanupExpiredMessages(server: Server) {
    if (this.isCleaning) return;
    this.isCleaning = true;
    try {
      const now = new Date();
      const expiredMessages = await this.messageRepo
        .createQueryBuilder('message')
        .innerJoinAndSelect('message.room', 'room')
        .where('message.expiresAt IS NOT NULL AND message.expiresAt <= :now', {
          now,
        })
        .getMany();

      if (expiredMessages.length > 0) {
        const ids = expiredMessages.map((m) => m.id);

        const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
        const uploadDir = join(process.cwd(), uploadDirName);
        for (const msg of expiredMessages) {
          if (
            msg.fileUrl &&
            (msg.fileUrl.includes('/uploads/') ||
              msg.fileUrl.includes('/api/uploads/'))
          ) {
            try {
              const filename = msg.fileUrl.split('/').pop()?.split('?')[0];
              if (filename) {
                const filePath = join(uploadDir, filename);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              }
            } catch (err) {
              console.warn('[Self-Destruct] Failed unlinking expired file:', err);
            }
          }
        }

        await this.messageRepo
          .createQueryBuilder()
          .delete()
          .from(Message)
          .where('id IN (:...ids)', { ids })
          .execute();

        console.log(
          `[Self-Destruct] Cleaned up ${ids.length} expired messages.`,
        );

        const roomGroups = new Map<string, number[]>();
        for (const msg of expiredMessages) {
          if (msg.room?.passcode) {
            const list = roomGroups.get(msg.room.passcode) || [];
            list.push(msg.id);
            roomGroups.set(msg.room.passcode, list);
          }
        }

        for (const [passcode, msgIds] of roomGroups.entries()) {
          server.to(passcode).emit('messagesExpired', { ids: msgIds });
        }
      }
    } catch (e: any) {
      if (e?.code === '42P01') {
        console.warn('[Self-Destruct] Table "messages" does not exist yet.');
      } else {
        console.error('Error during self-destruct messages cleanup', e);
      }
    } finally {
      this.isCleaning = false;
    }
  }

  async cleanupOrphanUploadFiles() {
    try {
      const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
      const uploadDir = join(process.cwd(), uploadDirName);
      if (!fs.existsSync(uploadDir)) return;

      const files = fs.readdirSync(uploadDir);
      if (files.length === 0) return;

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith('.') || file.includes('..')) continue;
        const filePath = join(uploadDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs < oneDayAgo) {
            const isReferencedInMsg = await this.messageRepo
              .createQueryBuilder('m')
              .where('m.fileUrl LIKE :pattern', { pattern: `%${file}%` })
              .getCount();

            if (isReferencedInMsg === 0) {
              const isReferencedInRoom = await this.roomRepo
                .createQueryBuilder('r')
                .where('r.customWallpaper LIKE :pattern', { pattern: `%${file}%` })
                .getCount();

              if (isReferencedInRoom === 0) {
                fs.unlinkSync(filePath);
                console.log(`[StorageGC] Safely unlinked orphan upload file: ${file}`);
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[StorageGC] Failed scanning orphan files:', err);
    }
  }
}
