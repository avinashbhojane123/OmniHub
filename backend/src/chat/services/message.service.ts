import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

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
  private processedTempIds = new Map<
    string,
    { messageId: number; timestamp: number }
  >();

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Helper: Find room by case-insensitive trimmed passcode
   */
  async findRoom(passcode: string): Promise<Room | null> {
    if (!passcode || !passcode.trim()) return null;
    return await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: passcode.trim(),
      })
      .getOne();
  }

  /**
   * Helper: Find user in room by case-insensitive trimmed nickname
   */
  async findUser(roomId: number, nickname: string): Promise<User | null> {
    if (!nickname || !nickname.trim()) return null;
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

  /**
   * Helper: Safely parse file size to prevent NaN database exceptions
   */
  private parseFileSize(size: any): number | null {
    if (size === undefined || size === null || size === '') return null;
    const num = typeof size === 'string' ? parseInt(size, 10) : Number(size);
    return typeof num === 'number' && !isNaN(num) && num >= 0 ? num : null;
  }

  private getDedupWindowMs(): number {
    return Number(process.env.MESSAGE_DEDUP_WINDOW_MS) || 120000;
  }

  private getDedupMaxEntries(): number {
    return Number(process.env.MESSAGE_DEDUP_MAX_ENTRIES) || 2000;
  }

  private getEditWindowMs(): number {
    return Number(process.env.MESSAGE_EDIT_WINDOW_MS) || 15 * 60 * 1000;
  }

  private getOrphanFileCleanupAgeMs(): number {
    return (
      Number(process.env.ORPHAN_FILE_CLEANUP_AGE_MS) || 24 * 60 * 60 * 1000
    );
  }

  /**
   * Helper: Prune expired or excessive tempId records
   */
  private pruneTempIds() {
    const cutoff = Date.now() - this.getDedupWindowMs();
    for (const [k, v] of this.processedTempIds.entries()) {
      if (v.timestamp < cutoff) {
        this.processedTempIds.delete(k);
      }
    }
    const maxEntries = this.getDedupMaxEntries();
    if (this.processedTempIds.size > maxEntries) {
      const keysToDelete = Array.from(this.processedTempIds.keys()).slice(
        0,
        this.processedTempIds.size - maxEntries,
      );
      for (const k of keysToDelete) {
        this.processedTempIds.delete(k);
      }
    }
  }

  /**
   * Helper: Safely unlink uploaded file from disk with path traversal protection
   */
  private async safelyUnlinkUploadedFile(fileUrl: string | null | undefined, excludeMessageId?: number) {
    if (!fileUrl) return;
    if (
      !fileUrl.includes('/uploads/') &&
      !fileUrl.includes('/api/uploads/')
    ) {
      return;
    }

    try {
      const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
      const uploadDir = path.resolve(process.cwd(), uploadDirName);
      const rawFilename = fileUrl.split('/').pop()?.split('?')[0];
      if (!rawFilename) return;

      const filename = path.basename(rawFilename);
      const filePath = path.resolve(uploadDir, filename);

      // Verify path is within uploadDir to prevent path traversal attacks
      if (!filePath.startsWith(uploadDir)) return;

      if (!fs.existsSync(filePath)) return;

      // Ensure no other active messages or room wallpapers still reference this file
      let query = this.messageRepo
        .createQueryBuilder('m')
        .where('m.fileUrl = :fileUrl', { fileUrl });
      if (excludeMessageId) {
        query = query.andWhere('m.id != :excludeId', { excludeId: excludeMessageId });
      }
      const otherReferences = await query.getCount();
      if (otherReferences > 0) return;

      const wallpaperReferences = await this.roomRepo
        .createQueryBuilder('r')
        .where('r.customWallpaper LIKE :pattern', { pattern: `%${filename}%` })
        .getCount();
      if (wallpaperReferences > 0) return;

      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('[MessageService] Failed unlinking file:', err);
    }
  }

  /**
   * Send a public broadcast message to a chat room
   */
  async sendMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: SendMessageDto,
    findRoomByPasscode: (passcode: string) => Promise<Room | null>,
  ) {
    const reqPass = (data?.passcode || '').trim().toLowerCase();
    const sessionPass = (session?.passcode || '').trim().toLowerCase();

    // Security Fix: Strict passcode match prevents cross-room message injection
    if (!session || !reqPass || sessionPass !== reqPass) {
      client.emit('error', {
        message: 'Unauthorized: Please join the room first',
      });
      return {
        success: false,
        message: 'Unauthorized: Please join the room first',
      };
    }

    const room = await findRoomByPasscode(session.passcode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return {
        success: false,
        message: 'Room not found',
      };
    }

    // Content check: At least one payload item must be present
    const hasText = Boolean(data.message && data.message.trim());
    const hasFile = Boolean(data.fileUrl && data.fileUrl.trim());
    const hasPoll = Boolean(data.pollData);
    const hasLocation = Boolean(data.locationData);

    if (!hasText && !hasFile && !hasPoll && !hasLocation) {
      client.emit('error', { message: 'Message content cannot be empty' });
      return {
        success: false,
        message: 'Message content cannot be empty',
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

    const isMutedInDb = Boolean(senderUser?.isMuted);
    if (isMutedInDb) {
      if (
        senderUser?.mutedUntil &&
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
        const remainingMinutes = senderUser?.mutedUntil
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
    } else {
      session.isMuted = false;
    }

    if (senderUser) {
      senderUser.lastSeen = new Date();
      await this.userRepo.save(senderUser);
    }

    // Deduplication check scoped to room + nickname + tempId
    const tempKey = data.tempId
      ? `${room.id}:${session.nickname.trim().toLowerCase()}:${data.tempId}`
      : null;
    if (tempKey) {
      const existingProcessed = this.processedTempIds.get(tempKey);
      if (
        existingProcessed &&
        Date.now() - existingProcessed.timestamp < this.getDedupWindowMs()
      ) {
        return {
          success: true,
          messageId: existingProcessed.messageId,
          isDuplicateSuppressed: true,
        };
      }
    }

    let expiresAt: Date | null = null;
    if (data.expiresIn && data.expiresIn > 0) {
      expiresAt = new Date(Date.now() + data.expiresIn * 1000);
    }

    let sanitizedReplyTo: { id?: number | string; nickname: string; message: string } | null = null;
    if (data.replyTo && typeof data.replyTo === 'object') {
      sanitizedReplyTo = {
        id: data.replyTo.id ?? undefined,
        nickname: typeof data.replyTo.nickname === 'string' ? data.replyTo.nickname.trim().slice(0, 50) : '',
        message: typeof data.replyTo.message === 'string' ? data.replyTo.message.trim().slice(0, 500) : '',
      };
    }

    const savedMessage = this.messageRepo.create({
      roomId: room.id,
      nickname: session.nickname,
      message: data.message ? data.message.trim() : '',
      replyTo: sanitizedReplyTo,
      fileUrl: data.fileUrl ?? null,
      fileName: data.fileName ?? null,
      fileType: data.fileType ?? null,
      fileSize: this.parseFileSize(data.fileSize),
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
    await client.join(roomPasscode);
    await client.join(roomPasscode.toLowerCase());

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
      .emit('newMessage', messagePayload);

    server
      .to(roomPasscode)
      .to(roomPasscode.toLowerCase())
      .emit('message', messagePayload);

    if (tempKey) {
      this.processedTempIds.set(tempKey, {
        messageId: savedMessage.id,
        timestamp: Date.now(),
      });
      this.pruneTempIds();
    }

    return {
      success: true,
      messageId: savedMessage.id,
    };
  }

  /**
   * Send a private direct message (whisper) between two room participants
   */
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
    const reqPass = (data?.passcode || '').trim().toLowerCase();
    const sessionPass = (session?.passcode || '').trim().toLowerCase();

    if (!session || !reqPass || sessionPass !== reqPass) {
      client.emit('directMessageError', { message: 'Unauthorized session' });
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(data.passcode);
    if (!room) {
      client.emit('directMessageError', { message: 'Room not found' });
      return { success: false, message: 'Room not found' };
    }

    const sender = await this.findUser(room.id, session.nickname);
    if (sender?.isBanned) {
      client.emit('directMessageError', {
        message: 'You are permanently banned from this room.',
      });
      return {
        success: false,
        message: 'You are permanently banned from this room.',
      };
    }

    const isMutedInDb = Boolean(sender?.isMuted);
    if (isMutedInDb) {
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
        const msg = remainingMinutes
          ? `You are muted for ${remainingMinutes} more minute(s).`
          : 'You have been muted by the room host.';
        client.emit('directMessageError', { message: msg });
        client.emit('error', { message: msg });
        return {
          success: false,
          message: 'You have been muted by the room host.',
        };
      }
    } else {
      session.isMuted = false;
    }

    if (sender) {
      sender.lastSeen = new Date();
      await this.userRepo.save(sender);
    }

    if (!data.message?.trim() && !data.fileUrl?.trim()) {
      client.emit('directMessageError', { message: 'Message content is empty' });
      return { success: false, message: 'Message content is empty' };
    }

    if (
      !data.targetNickname ||
      data.targetNickname.trim().toLowerCase() ===
        session.nickname.trim().toLowerCase()
    ) {
      client.emit('directMessageError', { message: 'Cannot whisper yourself' });
      return { success: false, message: 'Cannot whisper yourself' };
    }

    const targetNickname = data.targetNickname.trim();
    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(TRIM(user.nickname)) = LOWER(TRIM(:target))',
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
      ? `${room.id}:${session.nickname.trim().toLowerCase()}:${targetUser.nickname.trim().toLowerCase()}:${data.tempId}`
      : null;
    if (tempKey) {
      const existingProcessed = this.processedTempIds.get(tempKey);
      if (
        existingProcessed &&
        Date.now() - existingProcessed.timestamp < this.getDedupWindowMs()
      ) {
        return {
          success: true,
          messageId: existingProcessed.messageId,
          isDuplicateSuppressed: true,
        };
      }
    }

    let expiresAt: Date | null = null;
    if (data.expiresIn && data.expiresIn > 0) {
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
        fileSize: this.parseFileSize(data.fileSize),
        isVoiceNote: Boolean(data.isVoiceNote),
        isVideoNote: Boolean(data.isVideoNote),
        isWithoutSound: Boolean(data.isWithoutSound),
        expiresAt,
        isDirect: true,
        readBy: [session.nickname],
      }),
    );

    const directPayload = {
      ...savedDirectMsg,
      tempId: data.tempId ?? null,
    };

    const targets = findSocketsInRoom
      ? findSocketsInRoom(data.passcode.trim(), targetUser.nickname)
      : [];
    for (const t of targets) {
      server.to(t.socketId).emit('directMessage', directPayload);
    }

    const senderSockets = findSocketsInRoom
      ? findSocketsInRoom(data.passcode.trim(), session.nickname)
      : [];
    for (const s of senderSockets) {
      server.to(s.socketId).emit('directMessage', directPayload);
    }

    if (tempKey) {
      this.processedTempIds.set(tempKey, {
        messageId: savedDirectMsg.id,
        timestamp: Date.now(),
      });
      this.pruneTempIds();
    }

    return {
      success: true,
      message: savedDirectMsg,
      messageId: savedDirectMsg.id,
      isOfflineDelivery: targets.length === 0,
    };
  }

  /**
   * Mark messages as read and emit receipts strictly to appropriate room or whisper participants
   */
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

    const targetPasscode = (payload.passcode || session?.passcode || '').trim().toLowerCase();
    if (!session || !targetPasscode || session.passcode.trim().toLowerCase() !== targetPasscode) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) return { success: false, message: 'Room not found' };

    const reader = (payload.nickname || session.nickname).trim();
    if (!reader) return { success: false };
    const readerLower = reader.toLowerCase();

    const validIds = payload.messageIds
      .map((id) => Number(id))
      .filter((id) => !isNaN(id) && id > 0);
    if (validIds.length === 0) return { success: false };

    // Security Fix: Constrain message lookup strictly to the authenticated room
    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.roomId = :roomId AND m.id IN (:...ids)', {
        roomId: room.id,
        ids: validIds,
      })
      .getMany();

    const updatedMessages: Message[] = [];
    const publicUpdatedIds: number[] = [];
    const directUpdatedMessages: Message[] = [];

    for (const msg of messages) {
      // Security Fix: For direct messages, ensure reader is one of the participants
      if (msg.isDirect) {
        const isParticipant =
          msg.nickname.trim().toLowerCase() === readerLower ||
          (msg.targetNickname && msg.targetNickname.trim().toLowerCase() === readerLower);
        if (!isParticipant) {
          continue;
        }
      }

      const currentReadBy = Array.isArray(msg.readBy)
        ? msg.readBy
        : [msg.nickname];
      const hasRead = currentReadBy.some(
        (u) => (u || '').trim().toLowerCase() === readerLower,
      );

      if (!hasRead) {
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

    const roomPasscode = room.passcode.trim();

    // Broadcast public message read receipts
    if (publicUpdatedIds.length > 0) {
      server
        .to(roomPasscode)
        .to(roomPasscode.toLowerCase())
        .emit('messagesRead', {
          messageIds: publicUpdatedIds,
          readByNick: reader,
        });
    }

    // Direct messages: strictly isolate receipts to whisper participants (never public room)
    if (directUpdatedMessages.length > 0 && findSocketsInRoom) {
      for (const dm of directUpdatedMessages) {
        const participantNicks = new Set<string>(
          [dm.nickname, dm.targetNickname].filter((n): n is string =>
            Boolean(n),
          ),
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

  /**
   * Cast or toggle a vote on a room poll
   */
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
    ).trim().toLowerCase();

    if (!session || !targetPasscode || session.passcode.trim().toLowerCase() !== targetPasscode) {
      client.emit('error', { message: 'Unauthorized' });
      return { success: false, message: 'Unauthorized' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return { success: false, message: 'Room not found' };
    }

    const voterUser = await this.findUser(room.id, session.nickname);
    if (!voterUser || voterUser.isBanned) {
      client.emit('error', {
        message: 'You are banned or not authorized to vote on polls.',
      });
      return { success: false, message: 'You are banned from voting' };
    }

    const isMutedInDb = Boolean(voterUser.isMuted);
    if (isMutedInDb) {
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
    } else {
      session.isMuted = false;
    }

    // Security Fix: Scoped strictly to roomId to prevent cross-room poll manipulation
    const message = await this.messageRepo.findOne({
      where: { id: payload.messageId, roomId: room.id },
    });

    if (!message || !message.pollData) {
      client.emit('error', { message: 'Poll message not found' });
      return { success: false, message: 'Poll message not found' };
    }

    if (message.isDeleted) {
      client.emit('error', { message: 'Cannot vote on a deleted poll.' });
      return { success: false, message: 'Cannot vote on a deleted poll.' };
    }

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

    if (!Array.isArray(poll.options)) {
      client.emit('error', { message: 'Corrupted poll options' });
      return { success: false, message: 'Corrupted poll options' };
    }

    // Validation: Option must exist on the poll
    const targetOptionExists = poll.options.some(
      (opt: any) => String(opt.id) === String(payload.optionId),
    );
    if (!targetOptionExists) {
      client.emit('error', { message: 'Invalid poll option selected.' });
      return { success: false, message: 'Invalid poll option selected.' };
    }

    const voterNickname = session.nickname.trim();
    const voterLower = voterNickname.toLowerCase();
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
            (nick: string) =>
              (nick || '').trim().toLowerCase() !== voterLower,
          );
        } else {
          // Cast vote on this option
          opt.votes = [
            ...opt.votes.filter(
              (nick: string) =>
                (nick || '').trim().toLowerCase() !== voterLower,
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

    message.pollData = poll;
    await this.messageRepo.save(message);

    const roomPass = room.passcode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .emit('messageUpdated', {
        id: message.id,
        pollData: message.pollData,
      });

    return { success: true };
  }

  /**
   * Retrieve message history for a room with strict authorization & whisper protection
   */
  async getMessages(
    client: Socket,
    session: UserSession | undefined,
    data: GetRoomDto,
    findRoomByPasscode: (passcode: string) => Promise<Room | null>,
    findMatchingRoomIds: (passcode: string) => Promise<number[]>,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim().toLowerCase();
    if (!targetPasscode) {
      return [];
    }

    // Security Fix: Prevent unauthorized sockets from downloading foreign chat history
    if (!session || session.passcode.trim().toLowerCase() !== targetPasscode) {
      client.emit('error', {
        message: 'Unauthorized: You are not a member of this room',
      });
      return [];
    }

    const room = await findRoomByPasscode(targetPasscode);
    if (!room) {
      return [];
    }

    const user = await this.findUser(room.id, session.nickname);
    if (user?.isBanned) {
      client.emit('error', { message: 'You are banned from this room.' });
      return [];
    }

    const matchingRoomIds = await findMatchingRoomIds(targetPasscode);
    if (!matchingRoomIds.includes(room.id)) {
      matchingRoomIds.push(room.id);
    }

    const clientNick = session.nickname.trim();
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
      const parsedBeforeId = Number(data.beforeId);
      if (!isNaN(parsedBeforeId) && parsedBeforeId > 0) {
        query.andWhere('m.id < :beforeId', { beforeId: parsedBeforeId });
      }
    }

    if (data?.searchQuery && data.searchQuery.trim()) {
      const q = `%${data.searchQuery.trim().toLowerCase()}%`;
      query.andWhere(
        '(LOWER(m.message) LIKE :q OR LOWER(m.nickname) LIKE :q OR LOWER(m.fileName) LIKE :q)',
        { q },
      );
    }

    const defaultLimit =
      Number(process.env.CHAT_MESSAGES_DEFAULT_LIMIT) || 50;
    const maxLimit = Number(process.env.CHAT_MESSAGES_MAX_LIMIT) || 100;
    const limit = Math.min(Math.max(data?.limit || defaultLimit, 1), maxLimit);
    const olderMessages = await query
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(limit)
      .getMany();

    return olderMessages.reverse();
  }

  /**
   * Edit an existing message with 15-minute window & whisper privacy enforcement
   */
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
    const reqPass = (data?.passcode || session?.passcode || '').trim().toLowerCase();
    if (!session || !reqPass || session.passcode.trim().toLowerCase() !== reqPass) {
      client.emit('error', { message: 'Unauthorized session' });
      return;
    }

    const room = await this.findRoom(session.passcode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    const user = await this.findUser(room.id, session.nickname);
    if (user?.isBanned) {
      client.emit('error', { message: 'You are permanently banned from this room.' });
      return;
    }

    const isMutedInDb = Boolean(user?.isMuted);
    if (isMutedInDb) {
      if (user?.mutedUntil && new Date(user.mutedUntil) <= new Date()) {
        user.isMuted = false;
        user.mutedUntil = null;
        await this.userRepo.save(user);
        session.isMuted = false;
      } else {
        client.emit('error', { message: 'You are muted and cannot edit messages.' });
        return;
      }
    } else {
      session.isMuted = false;
    }

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) {
      client.emit('error', { message: 'Message not found.' });
      return;
    }

    if (msg.isDeleted) {
      client.emit('error', { message: 'Cannot edit a deleted message.' });
      return;
    }

    if (
      msg.nickname.trim().toLowerCase() !==
      session.nickname.trim().toLowerCase()
    ) {
      client.emit('error', { message: 'You can only edit your own messages.' });
      return;
    }

    // Configurable edit window check (default 15 minutes)
    const editWindowMs = this.getEditWindowMs();
    const msgCreatedAt = new Date(msg.createdAt).getTime();
    if (Date.now() - msgCreatedAt > editWindowMs) {
      const minutes = Math.round(editWindowMs / 60000);
      client.emit('error', {
        message: `Messages can only be edited within ${minutes} minutes of sending.`,
      });
      return;
    }

    const nextText = data.newMessage !== undefined ? data.newMessage.trim() : (msg.message || '').trim();
    const nextFile = data.fileUrl !== undefined ? data.fileUrl : msg.fileUrl;
    if (!nextText && !nextFile && !msg.pollData && !msg.locationData) {
      client.emit('error', { message: 'Edited message cannot be empty.' });
      return;
    }

    if (data.newMessage !== undefined) {
      msg.message = data.newMessage.trim();
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

    // Security Fix: Whispers must NEVER leak to public room when edited
    if (msg.isDirect) {
      if (findSocketsInRoom) {
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
        client.emit('messageEdited', updatedPayload);
        client.emit('messageUpdated', updatedPayload);
      }
    } else {
      const roomPass = room.passcode.trim();
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('messageEdited', updatedPayload);
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('messageUpdated', updatedPayload);
    }
  }

  /**
   * Delete a message with path-traversal protected file unlinking & whisper isolation
   */
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
    const reqPass = (data?.passcode || session?.passcode || '').trim().toLowerCase();
    if (!session || !reqPass || session.passcode.trim().toLowerCase() !== reqPass) {
      client.emit('error', { message: 'Unauthorized session' });
      return;
    }

    const room = await this.findRoom(session.passcode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) {
      client.emit('error', { message: 'Message not found' });
      return;
    }

    if (msg.isDeleted) {
      client.emit('error', { message: 'Message is already deleted.' });
      return;
    }

    const isOwner =
      msg.nickname.trim().toLowerCase() ===
      session.nickname.trim().toLowerCase();
    const isHostOrAdmin = session.role === 'host' || session.role === 'admin';
    if (!isOwner && !isHostOrAdmin) {
      client.emit('error', {
        message:
          'Unauthorized: Only the author or room host can delete messages.',
      });
      return;
    }

    // Safe file unlinking with path traversal check and duplicate reference protection
    if (msg.fileUrl) {
      await this.safelyUnlinkUploadedFile(msg.fileUrl, msg.id);
    }

    msg.isDeleted = true;
    msg.message = 'This message was deleted';
    msg.fileUrl = null;
    msg.fileName = null;
    msg.fileType = null;
    msg.fileSize = null;
    msg.pollData = null;
    msg.locationData = null;
    msg.reactions = null;
    await this.messageRepo.save(msg);

    const roomPass = room.passcode.trim();

    // If this was the pinned message, reset room pinnedMessageId
    if (room.pinnedMessageId === msg.id) {
      room.pinnedMessageId = null;
      await this.roomRepo.save(room);
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('pinnedMessageUpdated', null);
    }

    // Security Fix: Whispers must NEVER leak to public room when deleted
    if (msg.isDirect) {
      if (findSocketsInRoom) {
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
        client.emit('messageDeleted', { messageId: msg.id });
      }
    } else {
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('messageDeleted', {
          messageId: msg.id,
        });
    }
  }

  /**
   * Clear all message history in a room (Host/Admin only), safely cleaning disk files
   */
  async clearHistory(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: ClearHistoryDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim().toLowerCase();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== targetPasscode
    ) {
      client.emit('error', { message: 'Unauthorized session' });
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return { success: false, message: 'Room not found' };
    }

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

    // Unlink all media attachments from disk before deleting database records
    try {
      const messagesWithFiles = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.roomId = :roomId AND m.fileUrl IS NOT NULL', { roomId: room.id })
        .select(['m.id', 'm.fileUrl'])
        .getMany();

      for (const m of messagesWithFiles) {
        await this.safelyUnlinkUploadedFile(m.fileUrl, m.id);
      }
    } catch (e) {
      console.warn('[ClearHistory] File cleanup error:', e);
    }

    await this.messageRepo.delete({ roomId: room.id });

    // Clear pinned message in room
    room.pinnedMessageId = null;
    await this.roomRepo.save(room);

    console.log(
      `[ClearHistory] Room ${targetPasscode} history cleared by ${user.role} ${session.nickname}`,
    );

    const roomPass = room.passcode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .emit('historyCleared');
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .emit('pinnedMessageUpdated', null);

    return { success: true };
  }

  /**
   * Pin or unpin a message in the room (Host/Admin only)
   */
  async pinMessage(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: PinMessageDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim().toLowerCase();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== targetPasscode
    ) {
      client.emit('error', { message: 'Unauthorized session' });
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.findRoom(targetPasscode);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return { success: false, message: 'Room not found' };
    }

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
        client.emit('error', { message: 'Message not found' });
        return { success: false, message: 'Message not found' };
      }
      if (pinnedMsg.isDirect) {
        client.emit('error', {
          message:
            'Private direct messages cannot be pinned to the public room.',
        });
        return {
          success: false,
          message: 'Private direct messages cannot be pinned.',
        };
      }
      if (pinnedMsg.isDeleted) {
        client.emit('error', {
          message: 'Cannot pin a deleted message.',
        });
        return {
          success: false,
          message: 'Cannot pin a deleted message.',
        };
      }
      if (pinnedMsg.expiresAt && new Date(pinnedMsg.expiresAt) <= new Date()) {
        client.emit('error', {
          message: 'Cannot pin an expired self-destructing message.',
        });
        return {
          success: false,
          message: 'Cannot pin an expired message.',
        };
      }
      room.pinnedMessageId = pinnedMsg.id;
    } else {
      room.pinnedMessageId = null;
    }

    await this.roomRepo.save(room);

    const roomPass = room.passcode.trim();
    server
      .to(roomPass)
      .to(roomPass.toLowerCase())
      .emit('pinnedMessageUpdated', pinnedMsg);

    return { success: true, pinnedMessage: pinnedMsg };
  }

  /**
   * React or remove reaction from a message with emoji length bounds & whisper isolation
   */
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
    if (!session) return;
    const reqPass = (data?.passcode || session.passcode || '').trim().toLowerCase();
    if (session.passcode.trim().toLowerCase() !== reqPass) {
      client.emit('error', { message: 'Unauthorized session' });
      return;
    }

    const room = await this.findRoom(session.passcode);
    if (!room) return;

    const user = await this.findUser(room.id, session.nickname);
    if (!user || user.isBanned) {
      client.emit('error', { message: 'You are banned from this room.' });
      return;
    }

    const isMutedInDb = Boolean(user.isMuted);
    if (isMutedInDb) {
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
        client.emit('error', { message: 'You are muted and cannot react to messages.' });
        return;
      }
    } else {
      session.isMuted = false;
    }

    const emoji = (data.emoji || '').trim();
    if (!emoji || emoji.length > 32) {
      client.emit('error', { message: 'Invalid reaction emoji.' });
      return;
    }

    const msg = await this.messageRepo.findOne({
      where: { id: data.messageId, roomId: room.id },
    });
    if (!msg) {
      client.emit('error', { message: 'Message not found' });
      return;
    }

    if (msg.isDeleted) {
      client.emit('error', { message: 'Cannot react to a deleted message.' });
      return;
    }

    const reactions = msg.reactions || {};
    const activeNickname = session.nickname.trim();
    const activeLower = activeNickname.toLowerCase();
    let reactionUsers = reactions[emoji] || [];

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
      delete reactions[emoji];
    } else {
      reactions[emoji] = reactionUsers;
    }

    msg.reactions = Object.keys(reactions).length > 0 ? reactions : null;
    await this.messageRepo.save(msg);

    // Security Fix: Whispers must NEVER leak reaction events to the public room
    if (msg.isDirect) {
      if (findSocketsInRoom) {
        const targetSockets = [
          ...findSocketsInRoom(room.passcode, msg.nickname),
          ...(msg.targetNickname
            ? findSocketsInRoom(room.passcode, msg.targetNickname)
            : []),
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
        client.emit('messageReactionsUpdated', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
      }
    } else {
      const roomPass = room.passcode.trim();
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('messageReactionsUpdated', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
      server
        .to(roomPass)
        .to(roomPass.toLowerCase())
        .emit('messageReaction', {
          messageId: msg.id,
          reactions: msg.reactions,
        });
    }
  }

  /**
   * Periodic garbage collection for self-destructing expired messages
   */
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

        for (const msg of expiredMessages) {
          if (msg.fileUrl) {
            await this.safelyUnlinkUploadedFile(msg.fileUrl, msg.id);
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

            // If an expired message was pinned, clear it
            if (msg.room.pinnedMessageId === msg.id) {
              msg.room.pinnedMessageId = null;
              this.roomRepo.save(msg.room).catch(() => {});
              server
                .to(msg.room.passcode)
                .to(msg.room.passcode.toLowerCase())
                .emit('pinnedMessageUpdated', null);
            }
          }
        }

        for (const [passcode, msgIds] of roomGroups.entries()) {
          server
            .to(passcode)
            .to(passcode.toLowerCase())
            .emit('messagesExpired', { ids: msgIds });
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

  /**
   * Storage garbage collection for orphaned uploads with SQL wildcard escaping
   */
  async cleanupOrphanUploadFiles() {
    try {
      const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
      const uploadDir = path.resolve(process.cwd(), uploadDirName);
      if (!fs.existsSync(uploadDir)) return;

      const files = fs.readdirSync(uploadDir);
      if (files.length === 0) return;

      const maxAgeMs = this.getOrphanFileCleanupAgeMs();
      const cutoffTime = Date.now() - maxAgeMs;

      for (const file of files) {
        if (file.startsWith('.') || file.includes('..')) continue;
        const filePath = path.resolve(uploadDir, file);
        if (!filePath.startsWith(uploadDir)) continue;

        try {
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs < cutoffTime) {
            // Escape SQL LIKE wildcards % and _ so filenames don't trigger false positive matches
            const escapedFile = file.replace(/([%_\\])/g, '\\$1');

            const isReferencedInMsg = await this.messageRepo
              .createQueryBuilder('m')
              .where('m.fileUrl LIKE :pattern', { pattern: `%${escapedFile}%` })
              .getCount();

            if (isReferencedInMsg === 0) {
              const isReferencedInRoom = await this.roomRepo
                .createQueryBuilder('r')
                .where('r.customWallpaper LIKE :pattern', {
                  pattern: `%${escapedFile}%`,
                })
                .getCount();

              if (isReferencedInRoom === 0) {
                fs.unlinkSync(filePath);
                console.log(
                  `[StorageGC] Safely unlinked orphan upload file: ${file}`,
                );
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
