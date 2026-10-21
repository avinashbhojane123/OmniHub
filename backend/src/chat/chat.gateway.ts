import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UsePipes,
  ValidationPipe,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { Room } from '../rooms/room.entity';
import { Message } from '../messages/message.entity';
import { User } from '../users/user.entity';
import { Status } from '../status/status.entity';

import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TypingDto } from './dto/typing.dto';
import { GetRoomDto } from './dto/get-room.dto';
import {
  EditMessageDto,
  DeleteMessageDto,
  ClearHistoryDto,
  ReactToMessageDto,
  PinMessageDto,
  MarkReadDto,
  VotePollDto,
} from './dto/message-actions.dto';
import {
  CallUserDto,
  AcceptCallDto,
  DeclineCallDto,
  WebrtcOfferDto,
  WebrtcAnswerDto,
  WebrtcCandidateDto,
  EndCallDto,
  TogglePipDto,
  ScreenShareStatusDto,
  WebrtcMediaStateDto,
} from './dto/call-signal.dto';
import {
  CreateStatusDto,
  GetStatusesDto,
  ViewStatusDto,
  DeleteStatusDto,
} from './dto/status.dto';
import {
  WatchPartyActionDto,
  WatchPartyClockPingDto,
  GetWatchPartyDto,
  WatchPartyReactionDto,
  WatchPartyCommentDto,
} from './dto/watch-party.dto';
import { UpdateRoomWallpaperDto } from './dto/room-wallpaper.dto';

import { UserSession } from './chat.types';
import { sanitizeAvatarUrl } from './chat.utils';

import { CallingService } from './services/calling.service';
import { WatchPartyService } from './services/watch-party.service';
import { StatusService } from './services/status.service';
import { MessageService } from './services/message.service';
import { RoomModerationService } from './services/room-moderation.service';
import { WallpaperService } from './services/wallpaper.service';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : '*',
  },
  pingInterval: Number(process.env.SOCKET_PING_INTERVAL || 10000),
  pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT || 20000),
  maxHttpBufferSize: 1e7,
})
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationBootstrap,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private cleanupTimer?: NodeJS.Timeout;
  private userCleanupTimer?: NodeJS.Timeout;
  private socketMessageTimes = new Map<string, number[]>();
  private userDisconnectDebounceTimers = new Map<string, NodeJS.Timeout>();
  private users = new Map<string, UserSession>();

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Status)
    private readonly statusRepo: Repository<Status>,

    private readonly callingService: CallingService,
    private readonly watchPartyService: WatchPartyService,
    private readonly statusService: StatusService,
    private readonly messageService: MessageService,
    private readonly roomModerationService: RoomModerationService,
    private readonly wallpaperService: WallpaperService,
  ) {}

  async onApplicationBootstrap() {
    await this.roomModerationService.resetUsersOnlineStatusOnBootstrap();

    const cleanupInterval = Number(
      process.env.MESSAGE_CLEANUP_INTERVAL || 30000,
    );
    this.cleanupTimer = setInterval(() => {
      void this.messageService.cleanupExpiredMessages(this.server);
      void this.statusService.cleanupExpiredStatuses();
    }, cleanupInterval);

    const userCleanupInterval = 60 * 60 * 1000;
    this.userCleanupTimer = setInterval(() => {
      void this.roomModerationService.cleanupStaleUsers();
    }, userCleanupInterval);

    await this.wallpaperService.cleanupDeadWallpapers();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.userCleanupTimer) clearInterval(this.userCleanupTimer);
    for (const timer of this.userDisconnectDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.userDisconnectDebounceTimers.clear();
    this.users.clear();
  }

  private clearUserDisconnectDebounceTimer(key: string) {
    const timer = this.userDisconnectDebounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.userDisconnectDebounceTimers.delete(key);
    }
  }

  private checkRateLimit(
    client: Socket,
    maxLimit = 15,
    windowMs = 3000,
  ): boolean {
    const now = Date.now();
    const timestamps = (this.socketMessageTimes.get(client.id) || []).filter(
      (t) => now - t < windowMs,
    );
    if (timestamps.length >= maxLimit) {
      client.emit('error', {
        message: 'Rate limit exceeded. Please slow down.',
      });
      return false;
    }
    timestamps.push(now);
    this.socketMessageTimes.set(client.id, timestamps);
    return true;
  }

  private async findRoomByPasscode(passcode: string): Promise<Room | null> {
    if (!passcode) return null;
    const cleanPass = passcode.trim();
    return await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: cleanPass,
      })
      .getOne();
  }

  private async findMatchingRoomIds(passcode: string): Promise<number[]> {
    if (!passcode) return [];
    const cleanPass = passcode.trim();
    const rooms = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))', {
        passcode: cleanPass,
      })
      .getMany();
    return rooms.map((r) => r.id);
  }

  private findSocketInRoom(
    passcode: string,
    nickname?: string,
    excludeSocketId?: string,
  ): { socketId: string; nickname: string } | undefined {
    const cleanPass = passcode.trim();
    for (const [id, user] of this.users.entries()) {
      if (user.passcode.trim() === cleanPass && id !== excludeSocketId) {
        if (
          !nickname ||
          user.nickname.trim().toLowerCase() === nickname.trim().toLowerCase()
        ) {
          return { socketId: id, nickname: user.nickname };
        }
      }
    }
    return undefined;
  }

  private findSocketsInRoom(
    passcode: string,
    nickname?: string,
    excludeSocketId?: string,
  ): Array<{ socketId: string; nickname: string }> {
    const cleanPass = passcode.trim().toLowerCase();
    const result: Array<{ socketId: string; nickname: string }> = [];
    for (const [id, user] of this.users.entries()) {
      if (
        (user.passcode || '').trim().toLowerCase() === cleanPass &&
        id !== excludeSocketId
      ) {
        if (
          !nickname ||
          user.nickname.trim().toLowerCase() === nickname.trim().toLowerCase()
        ) {
          result.push({ socketId: id, nickname: user.nickname });
        }
      }
    }
    return result;
  }

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  async handleDisconnect(client: Socket) {
    this.socketMessageTimes.delete(client.id);
    const userInfo = this.users.get(client.id);
    if (!userInfo) return;

    this.callingService.handleDisconnect(this.server, client.id, userInfo);

    this.users.delete(client.id);
    await Promise.resolve();

    const cleanNick = userInfo.nickname.trim().toLowerCase();
    const cleanPass = userInfo.passcode.trim().toLowerCase();

    const isStillConnected = Array.from(this.users.values()).some(
      (info) =>
        info.nickname.trim().toLowerCase() === cleanNick &&
        info.passcode.trim().toLowerCase() === cleanPass,
    );

    if (isStillConnected) return;

    this.server.to(userInfo.passcode).emit('userStoppedTyping', {
      nickname: userInfo.nickname,
    });
    this.server.to(userInfo.passcode).emit('userStopTyping', {
      nickname: userInfo.nickname,
    });

    const userKey = `${cleanPass}:${cleanNick}`;
    this.clearUserDisconnectDebounceTimer(userKey);

    const debounceTimer = setTimeout(() => {
      void (async () => {
        this.userDisconnectDebounceTimers.delete(userKey);

        const isReconnected = Array.from(this.users.values()).some(
          (info) =>
            info.nickname.trim().toLowerCase() === cleanNick &&
            info.passcode.trim().toLowerCase() === cleanPass,
        );
        if (isReconnected) return;

        const room = await this.roomRepo.findOne({
          where: { passcode: userInfo.passcode },
        });

        if (room) {
          const user = await this.userRepo
            .createQueryBuilder('user')
            .where(
              'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:nickname)',
              {
                roomId: room.id,
                nickname: userInfo.nickname.trim(),
              },
            )
            .getOne();

          if (user) {
            user.isOnline = false;
            user.lastSeen = new Date();
            await this.userRepo.save(user);

            if (user.role === 'host') {
              const cleanRoomPass = room.passcode.trim().toLowerCase();
              const activeNicknames = new Set(
                Array.from(this.users.values())
                  .filter(
                    (s) =>
                      (s.passcode || '').trim().toLowerCase() === cleanRoomPass,
                  )
                  .map((s) => s.nickname.toLowerCase()),
              );
              if (
                activeNicknames.size > 0 &&
                !activeNicknames.has(user.nickname.toLowerCase())
              ) {
                const onlineRoomUsers = await this.userRepo.find({
                  where: { roomId: room.id },
                  order: { createdAt: 'ASC' },
                });
                const candidate =
                  onlineRoomUsers.find(
                    (u) =>
                      activeNicknames.has(u.nickname.toLowerCase()) &&
                      u.role === 'admin' &&
                      !u.isMuted &&
                      !u.isBanned,
                  ) ||
                  onlineRoomUsers.find(
                    (u) =>
                      activeNicknames.has(u.nickname.toLowerCase()) &&
                      u.nickname.toLowerCase() !==
                        user.nickname.toLowerCase() &&
                      !u.isMuted &&
                      !u.isBanned,
                  );

                if (candidate) {
                  user.role = 'admin';
                  candidate.role = 'host';
                  await this.userRepo.save([user, candidate]);
                  for (const [, sess] of this.users.entries()) {
                    if (
                      (sess.passcode || '').trim().toLowerCase() ===
                      cleanRoomPass
                    ) {
                      if (
                        sess.nickname.toLowerCase() ===
                        user.nickname.toLowerCase()
                      )
                        sess.role = 'admin';
                      if (
                        sess.nickname.toLowerCase() ===
                        candidate.nickname.toLowerCase()
                      )
                        sess.role = 'host';
                    }
                  }
                  this.server.to(room.passcode.trim()).emit('hostChanged', {
                    newHostNickname: candidate.nickname,
                    newHost: candidate.nickname,
                    previousHostNickname: user.nickname,
                    previousHost: user.nickname,
                    reason: 'Automatic succession after host disconnect',
                  });
                  if (
                    room.passcode.trim().toLowerCase() !== room.passcode.trim()
                  ) {
                    this.server
                      .to(room.passcode.trim().toLowerCase())
                      .emit('hostChanged', {
                        newHostNickname: candidate.nickname,
                        newHost: candidate.nickname,
                        previousHostNickname: user.nickname,
                        previousHost: user.nickname,
                        reason: 'Automatic succession after host disconnect',
                      });
                  }
                }
              }
            }
          }

          await this.roomModerationService.broadcastUsersList(
            this.server,
            room.passcode,
            room.id,
            this.users,
          );
        }

        this.server.to(userInfo.passcode).emit('userOffline', {
          nickname: userInfo.nickname,
          lastSeen: new Date(),
        });
        this.server.to(userInfo.passcode).emit('userLeft', {
          nickname: userInfo.nickname,
        });
      })();
    }, 12000);

    this.userDisconnectDebounceTimers.set(userKey, debounceTimer);

    const anyUserInRoom = Array.from(this.users.values()).some(
      (info) => info.passcode === userInfo.passcode,
    );

    this.watchPartyService.handleUserDisconnect(
      this.server,
      userInfo.passcode,
      userInfo.nickname,
      anyUserInRoom,
    );
  }

  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { passcode?: string },
  ) {
    const session = this.users.get(client.id);
    if (!session) return { success: false };

    const roomPasscode = (data?.passcode || session.passcode).trim();
    const userKey = `${roomPasscode.toLowerCase()}:${session.nickname.trim().toLowerCase()}`;
    this.clearUserDisconnectDebounceTimer(userKey);

    this.callingService.handleLeaveRoom(this.server, client.id);

    const room = await this.roomRepo.findOne({
      where: { passcode: roomPasscode },
    });

    if (room) {
      this.users.delete(client.id);
      void client.leave(roomPasscode);

      const remainingSockets = this.findSocketsInRoom(
        roomPasscode,
        session.nickname,
      );
      const isCompletelyOffline = remainingSockets.length === 0;

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

      if (user && isCompletelyOffline) {
        user.isOnline = false;
        user.lastSeen = new Date();
        await this.userRepo.save(user);

        if (user.role === 'host') {
          const activeNicknames = new Set(
            Array.from(this.users.values())
              .filter(
                (s) =>
                  s.passcode === room.passcode &&
                  s.nickname.toLowerCase() !== user.nickname.toLowerCase(),
              )
              .map((s) => s.nickname.toLowerCase()),
          );
          if (activeNicknames.size > 0) {
            const onlineRoomUsers = await this.userRepo.find({
              where: { roomId: room.id },
              order: { createdAt: 'ASC' },
            });
            const candidate =
              onlineRoomUsers.find(
                (u) =>
                  activeNicknames.has(u.nickname.toLowerCase()) &&
                  u.role === 'admin' &&
                  !u.isMuted &&
                  !u.isBanned,
              ) ||
              onlineRoomUsers.find(
                (u) =>
                  activeNicknames.has(u.nickname.toLowerCase()) &&
                  u.nickname.toLowerCase() !== user.nickname.toLowerCase() &&
                  !u.isMuted &&
                  !u.isBanned,
              );

            if (candidate) {
              user.role = 'admin';
              candidate.role = 'host';
              await this.userRepo.save([user, candidate]);
              for (const [, sess] of this.users.entries()) {
                if (sess.passcode === room.passcode) {
                  if (
                    sess.nickname.toLowerCase() === user.nickname.toLowerCase()
                  )
                    sess.role = 'admin';
                  if (
                    sess.nickname.toLowerCase() ===
                    candidate.nickname.toLowerCase()
                  )
                    sess.role = 'host';
                }
              }
              this.server.to(room.passcode).emit('hostChanged', {
                newHostNickname: candidate.nickname,
                newHost: candidate.nickname,
                previousHostNickname: user.nickname,
                previousHost: user.nickname,
                reason: 'Host left the room',
              });
            }
          }
        }
      }

      this.server.to(roomPasscode).emit('userStoppedTyping', {
        nickname: session.nickname,
      });
      this.server.to(roomPasscode).emit('userStopTyping', {
        nickname: session.nickname,
      });

      if (isCompletelyOffline) {
        this.server.to(roomPasscode).emit('userOffline', {
          nickname: session.nickname,
          lastSeen: new Date(),
        });
        this.server.to(roomPasscode).emit('userLeft', {
          nickname: session.nickname,
        });

        await this.roomModerationService.broadcastUsersList(
          this.server,
          room.passcode,
          room.id,
          this.users,
        );
      }
    }

    return { success: true };
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @MessageBody()
    data: JoinRoomDto,
    @ConnectedSocket()
    client: Socket,
  ) {
    this.watchPartyService.clearWatchPartyDisconnectTimer(data.passcode);
    const userKey = `${data.passcode.trim().toLowerCase()}:${data.nickname.trim().toLowerCase()}`;
    this.clearUserDisconnectDebounceTimer(userKey);

    console.log(
      'JOIN ROOM:',
      data.nickname,
      data.deviceType || '',
      data.deviceModel || '',
      data.browser || '',
      data.os || '',
    );

    const cleanReqPasscode = (data.passcode || '').trim();
    let room = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(room.passcode) = LOWER(:passcode)', {
        passcode: cleanReqPasscode,
      })
      .getOne();

    if (!room) {
      try {
        room = this.roomRepo.create({
          passcode: cleanReqPasscode,
          roomName: `Room-${cleanReqPasscode}`,
        });
        room = await this.roomRepo.save(room);
      } catch (err: any) {
        if (err.code === '23505') {
          room = await this.roomRepo
            .createQueryBuilder('room')
            .where('LOWER(room.passcode) = LOWER(:passcode)', {
              passcode: cleanReqPasscode,
            })
            .getOne();
        } else {
          throw err;
        }
      }
    }

    if (!room) {
      return { success: false, message: 'Could not create or find room' };
    }

    const sanitizedAvatar = sanitizeAvatarUrl(data.avatarUrl);
    let cleanNick = data.nickname.trim();
    const cleanPass = room.passcode.trim();

    let user = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:cleanNick)',
        {
          roomId: room.id,
          cleanNick,
        },
      )
      .getOne();

    if (user) {
      cleanNick = user.nickname;
    }

    if (user && user.isBanned) {
      client.emit('kickedFromRoom', {
        reason: 'You are permanently banned from this room by the host.',
        kickedBy: 'Host',
      });
      return { success: false, message: 'You are banned from this room' };
    }

    if (data.sessionToken) {
      const bannedByToken = await this.userRepo.findOne({
        where: {
          roomId: room.id,
          sessionToken: data.sessionToken,
          isBanned: true,
        },
      });
      if (bannedByToken) {
        client.emit('kickedFromRoom', {
          reason: 'You are permanently banned from this room by the host.',
          kickedBy: 'Host',
        });
        return { success: false, message: 'You are banned from this room' };
      }
    }

    const existingSockets = this.findSocketsInRoom(
      cleanPass,
      cleanNick,
      client.id,
    );
    if (existingSockets.length > 0) {
      for (const existing of existingSockets) {
        const oldSocket =
          this.server.sockets.sockets?.get(existing.socketId) ||
          (this.server as any).of?.('/')?.sockets?.get(existing.socketId);
        if (oldSocket) {
          oldSocket.emit('sessionReplaced', {
            message: 'Your session has been resumed in another connection.',
          });
          try {
            void oldSocket.leave(cleanPass);
            oldSocket.disconnect(true);
          } catch {
            // Ignore disconnect cleanup errors
          }
        }
        this.users.delete(existing.socketId);
      }
    }

    const existingHost = await this.userRepo.findOne({
      where: {
        roomId: room.id,
        role: 'host',
      },
    });

    const defaultRole =
      !existingHost || existingHost.nickname === cleanNick ? 'host' : 'member';

    if (!user) {
      const isRoomCreator = !existingHost;
      user = this.userRepo.create({
        nickname: cleanNick,
        roomId: room.id,
        role: defaultRole,
        isCreator: isRoomCreator,
        sessionToken: data.sessionToken || null,
        isOnline: true,
        deviceType: data.deviceType,
        deviceModel: data.deviceModel,
        browser: data.browser,
        os: data.os,
        avatarUrl: sanitizedAvatar,
        networkLabel: data.networkLabel,
        batteryLabel: data.batteryLabel,
        batteryIsCharging: Boolean(data.batteryIsCharging),
      });
    } else {
      user.isOnline = true;
      user.lastSeen = null;
      if (data.sessionToken) {
        user.sessionToken = data.sessionToken;
      }
      if (!existingHost && (user.isCreator || !user.role)) {
        user.role = 'host';
      }
      user.deviceType = data.deviceType || user.deviceType;
      user.deviceModel = data.deviceModel || user.deviceModel;
      user.browser = data.browser || user.browser;
      user.os = data.os || user.os;
      if (data.networkLabel) user.networkLabel = data.networkLabel;
      if (data.batteryLabel) user.batteryLabel = data.batteryLabel;
      if (typeof data.batteryIsCharging === 'boolean') {
        user.batteryIsCharging = data.batteryIsCharging;
      }
      if (sanitizedAvatar) user.avatarUrl = sanitizedAvatar;
    }

    try {
      await this.userRepo.save(user);
    } catch (err: any) {
      if (err.code === '23505') {
        user =
          (await this.userRepo.findOne({
            where: { nickname: cleanNick, roomId: room.id },
          })) || user;
      } else {
        throw err;
      }
    }

    const roomPasscode = room.passcode.trim();
    const dataPasscode = data.passcode.trim();
    await client.join(roomPasscode);
    await client.join(roomPasscode.toLowerCase());
    await client.join(dataPasscode);
    await client.join(dataPasscode.toLowerCase());

    this.users.set(client.id, {
      nickname: user.nickname,
      passcode: roomPasscode,
      isMuted: Boolean(user.isMuted),
      role: user.role,
    });

    const userCleanNick = (user.nickname || '').trim().toLowerCase();
    const userCleanPass = roomPasscode.toLowerCase();
    const userCleanDataPass = dataPasscode.toLowerCase();
    this.clearUserDisconnectDebounceTimer(`${userCleanPass}:${userCleanNick}`);
    this.clearUserDisconnectDebounceTimer(
      `${userCleanDataPass}:${userCleanNick}`,
    );

    this.callingService.rebindReconnectingUser(
      this.server,
      client,
      roomPasscode,
      data.nickname,
    );

    this.watchPartyService.clearWatchPartyDisconnectTimer(roomPasscode);

    const matchingRoomIds = await this.findMatchingRoomIds(cleanPass);
    if (!matchingRoomIds.includes(room.id)) {
      matchingRoomIds.push(room.id);
    }

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.roomId IN (:...roomIds)', { roomIds: matchingRoomIds })
      .andWhere(
        '(m.isDirect = false OR m.isDirect IS NULL OR LOWER(TRIM(m.nickname)) = LOWER(TRIM(:clientNick)) OR LOWER(TRIM(m.targetNickname)) = LOWER(TRIM(:clientNick)))',
        { clientNick: cleanNick },
      )
      .andWhere('(m.expiresAt IS NULL OR m.expiresAt > :now)', {
        now: new Date(),
      })
      .orderBy('m.createdAt', 'ASC')
      .getMany();

    client.emit('chatHistory', messages);

    const activeWallpaper = this.wallpaperService.getRoomWallpaperState(
      roomPasscode,
      room,
    );
    const isRoomDefault =
      !activeWallpaper.customWallpaper &&
      (activeWallpaper.theme === 'wa-doodle' || !activeWallpaper.theme);
    client.emit('roomWallpaperSync', {
      theme: activeWallpaper.theme,
      customWallpaper: activeWallpaper.customWallpaper,
      isDefault: isRoomDefault,
    });

    const updatedUsersList =
      await this.roomModerationService.getFormattedUsersList(
        room.passcode,
        room.id,
        this.users,
      );
    client.emit('usersList', updatedUsersList);
    await this.roomModerationService.broadcastUsersList(
      this.server,
      room.passcode,
      room.id,
      this.users,
    );

    this.server.to(roomPasscode).emit('userOnline', {
      nickname: user.nickname,
    });
    if (dataPasscode.toLowerCase() !== roomPasscode.toLowerCase()) {
      this.server.to(dataPasscode).emit('userOnline', {
        nickname: user.nickname,
      });
    }

    const joinedPayload = {
      nickname: user.nickname,
      user: {
        id: user.id,
        nickname: user.nickname,
        role: user.role || 'member',
        isCreator: Boolean(user.isCreator),
        isOnline: true,
        isMuted: Boolean(user.isMuted),
        mutedUntil: user.mutedUntil,
        isBanned: Boolean(user.isBanned),
        avatarUrl: user.avatarUrl,
        deviceType: user.deviceType,
        deviceModel: user.deviceModel,
        browser: user.browser,
        os: user.os,
        networkLabel: user.networkLabel,
        batteryLabel: user.batteryLabel,
        batteryIsCharging: user.batteryIsCharging,
      },
    };

    this.server.to(roomPasscode).emit('userJoined', joinedPayload);
    if (dataPasscode.toLowerCase() !== roomPasscode.toLowerCase()) {
      this.server.to(dataPasscode).emit('userJoined', joinedPayload);
    }

    const now = new Date();
    const activeStatuses = await this.statusRepo
      .createQueryBuilder('status')
      .where('status.roomId = :roomId', { roomId: room.id })
      .andWhere('(status.expiresAt IS NULL OR status.expiresAt > :now)', {
        now,
      })
      .orderBy('status.createdAt', 'ASC')
      .getMany();

    client.emit('statusesList', activeStatuses);
    client.emit('statusesUpdated', activeStatuses);

    if (room.pinnedMessageId) {
      const pinnedMsg = await this.messageRepo.findOne({
        where: { id: room.pinnedMessageId, roomId: room.id },
      });
      client.emit('pinnedMessageUpdated', pinnedMsg || null);
    }

    return {
      success: true,
      roomId: room.id,
      passcode: room.passcode,
    };
  }

  // --- Message Handlers ---

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    if (!this.checkRateLimit(client, 10, 3000)) {
      return { success: false, message: 'Rate limit exceeded' };
    }
    const session = this.users.get(client.id);
    return this.messageService.sendMessage(
      this.server,
      client,
      session,
      data,
      (passcode) => this.findRoomByPasscode(passcode),
    );
  }

  @SubscribeMessage('sendDirectMessage')
  async sendDirectMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      passcode: string;
      targetNickname: string;
      message: string;
      fileUrl?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      tempId?: string;
    },
  ) {
    if (!this.checkRateLimit(client, 10, 3000)) {
      return { success: false, message: 'Rate limit exceeded' };
    }
    const session = this.users.get(client.id);
    return this.messageService.sendDirectMessage(
      this.server,
      client,
      session,
      data,
      (passcode, nickname) => this.findSocketsInRoom(passcode, nickname),
    );
  }

  @SubscribeMessage('markRead')
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarkReadDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.markRead(this.server, client, session, payload);
  }

  @SubscribeMessage('votePoll')
  async votePoll(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VotePollDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.votePoll(this.server, client, session, payload);
  }

  @SubscribeMessage('getMessages')
  async getMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GetRoomDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.getMessages(
      client,
      session,
      data,
      (passcode) => this.findRoomByPasscode(passcode),
      (passcode) => this.findMatchingRoomIds(passcode),
    );
  }

  @SubscribeMessage('editMessage')
  async editMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: EditMessageDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.editMessage(this.server, client, session, data);
  }

  @SubscribeMessage('deleteMessage')
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeleteMessageDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.deleteMessage(
      this.server,
      client,
      session,
      data,
    );
  }

  @SubscribeMessage('clearHistory')
  async clearHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ClearHistoryDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.clearHistory(this.server, client, session, data);
  }

  @SubscribeMessage('pinMessage')
  async pinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: PinMessageDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.pinMessage(this.server, client, session, data);
  }

  @SubscribeMessage('reactToMessage')
  async reactToMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ReactToMessageDto,
  ) {
    const session = this.users.get(client.id);
    return this.messageService.reactToMessage(
      this.server,
      client,
      session,
      data,
    );
  }

  @SubscribeMessage('reactMessage')
  async reactMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ReactToMessageDto,
  ) {
    return this.reactToMessage(client, data);
  }

  // --- Typing Handlers ---

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() client: Socket, @MessageBody() data: TypingDto) {
    if (!this.checkRateLimit(client, 6, 2000)) return;
    const session = this.users.get(client.id);
    if (!session || session.isMuted) return;

    const trimmedPasscode = (data.passcode || session.passcode).trim();
    client.to(trimmedPasscode).emit('userTyping', {
      nickname: session.nickname,
    });
  }

  @SubscribeMessage('stopTyping')
  stopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingDto,
  ) {
    const session = this.users.get(client.id);
    if (!session || session.isMuted) return;

    const trimmedPasscode = (data.passcode || session.passcode).trim();
    client.to(trimmedPasscode).emit('userStoppedTyping', {
      nickname: session.nickname,
    });
    client.to(trimmedPasscode).emit('userStopTyping', {
      nickname: session.nickname,
    });
  }

  // --- Moderation & Roster Handlers ---

  @SubscribeMessage('getUsers')
  async getUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GetRoomDto,
  ) {
    return this.roomModerationService.getUsers(client, data, this.users);
  }

  @SubscribeMessage('updateMetadata')
  async updateMetadata(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      passcode?: string;
      batteryLabel?: string;
      batteryIsCharging?: boolean;
      networkLabel?: string;
      avatarUrl?: string;
    },
  ) {
    if (!this.checkRateLimit(client, 4, 4000)) return;
    const session = this.users.get(client.id);
    return this.roomModerationService.updateMetadata(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('kickUser')
  async kickUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string; targetNickname: string },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.kickUser(
      this.server,
      client,
      session,
      data,
      this.users,
      (passcode, nickname, excludeSocketId) =>
        this.findSocketsInRoom(passcode, nickname, excludeSocketId),
      (key) => this.clearUserDisconnectDebounceTimer(key),
    );
  }

  @SubscribeMessage('banUser')
  async banUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string; targetNickname: string },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.banUser(
      this.server,
      client,
      session,
      data,
      this.users,
      (passcode, nickname, excludeSocketId) =>
        this.findSocketsInRoom(passcode, nickname, excludeSocketId),
      (key) => this.clearUserDisconnectDebounceTimer(key),
    );
  }

  @SubscribeMessage('unbanUser')
  async unbanUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string; targetNickname: string },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.unbanUser(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('promoteUser')
  async promoteUser(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      passcode: string;
      targetNickname: string;
      role: 'admin' | 'member';
    },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.promoteUser(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('transferHost')
  async transferHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string; targetNickname: string },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.transferHost(
      this.server,
      client,
      session,
      data,
      this.users,
      (passcode, nickname, excludeSocketId) =>
        this.findSocketsInRoom(passcode, nickname, excludeSocketId),
    );
  }

  @SubscribeMessage('reclaimHost')
  async reclaimHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.reclaimHost(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('clearInactiveUsers')
  async clearInactiveUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { passcode: string; daysInactive?: number },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.clearInactiveUsers(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('muteUser')
  async muteUser(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      passcode: string;
      targetNickname: string;
      isMuted: boolean;
      durationMinutes?: number;
    },
  ) {
    const session = this.users.get(client.id);
    return this.roomModerationService.muteUser(
      this.server,
      client,
      session,
      data,
      this.users,
      (passcode, nickname, excludeSocketId) =>
        this.findSocketsInRoom(passcode, nickname, excludeSocketId),
    );
  }

  // --- WebRTC Calling Handlers ---

  @SubscribeMessage('callUser')
  async callUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CallUserDto,
  ) {
    const session = this.users.get(client.id);
    return this.callingService.callUser(
      this.server,
      client,
      session,
      data,
      this.users,
      (passcode, nickname, excludeSocketId) =>
        this.findSocketInRoom(passcode, nickname, excludeSocketId),
    );
  }

  @SubscribeMessage('acceptCall')
  acceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AcceptCallDto,
  ) {
    const session = this.users.get(client.id);
    return this.callingService.acceptCall(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('declineCall')
  declineCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeclineCallDto,
  ) {
    const session = this.users.get(client.id);
    return this.callingService.declineCall(this.server, client, session, data);
  }

  @SubscribeMessage('webrtcOffer')
  webrtcOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WebrtcOfferDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.webrtcOffer(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('webrtcAnswer')
  webrtcAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WebrtcAnswerDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.webrtcAnswer(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('webrtcCandidate')
  webrtcCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WebrtcCandidateDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.webrtcCandidate(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  @SubscribeMessage('endCall')
  endCall(@ConnectedSocket() client: Socket, @MessageBody() data: EndCallDto) {
    const session = this.users.get(client.id);
    this.callingService.endCall(this.server, client, session, data);
  }

  @SubscribeMessage('getIceServers')
  getIceServers(@ConnectedSocket() client: Socket) {
    const session = this.users.get(client.id);
    this.callingService.getIceServers(client, session);
  }

  @SubscribeMessage('togglePip')
  togglePip(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TogglePipDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.togglePip(client, session, data);
  }

  @SubscribeMessage('screenShareStatus')
  screenShareStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ScreenShareStatusDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.screenShareStatus(client, session, data);
  }

  @SubscribeMessage('webrtcMediaState')
  webrtcMediaState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WebrtcMediaStateDto,
  ) {
    const session = this.users.get(client.id);
    this.callingService.webrtcMediaState(
      this.server,
      client,
      session,
      data,
      this.users,
    );
  }

  // --- Status Stories Handlers ---

  @SubscribeMessage('createStatus')
  async createStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CreateStatusDto,
  ) {
    if (!this.checkRateLimit(client, 5, 5000)) {
      return { success: false, message: 'Rate limit exceeded' };
    }
    const session = this.users.get(client.id);
    return this.statusService.createStatus(this.server, client, session, data);
  }

  @SubscribeMessage('getStatuses')
  async getStatuses(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GetStatusesDto,
  ) {
    const session = this.users.get(client.id);
    return this.statusService.getStatuses(client, session, data);
  }

  @SubscribeMessage('viewStatus')
  async viewStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ViewStatusDto,
  ) {
    const session = this.users.get(client.id);
    return this.statusService.viewStatus(this.server, session, data);
  }

  @SubscribeMessage('deleteStatus')
  async deleteStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeleteStatusDto,
  ) {
    const session = this.users.get(client.id);
    return this.statusService.deleteStatus(this.server, session, data);
  }

  // --- Watch Party Handlers ---

  @SubscribeMessage('watchPartyAction')
  handleWatchPartyAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WatchPartyActionDto,
  ) {
    const session = this.users.get(client.id);
    return this.watchPartyService.handleWatchPartyAction(
      this.server,
      client,
      session,
      data,
      (c, m, w) => this.checkRateLimit(c, m, w),
    );
  }

  @SubscribeMessage('watchPartyClockPing')
  handleWatchPartyClockPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WatchPartyClockPingDto,
  ) {
    return this.watchPartyService.handleWatchPartyClockPing(client, data);
  }

  @SubscribeMessage('clientPing')
  handleClientPing(@MessageBody() data?: any) {
    return { success: true, serverTime: Date.now(), ...(data || {}) };
  }

  @SubscribeMessage('getWatchPartyState')
  getWatchPartyState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GetWatchPartyDto,
  ) {
    const session = this.users.get(client.id);
    return this.watchPartyService.getWatchPartyState(client, session, data);
  }

  @SubscribeMessage('watchPartyReaction')
  watchPartyReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WatchPartyReactionDto,
  ) {
    const session = this.users.get(client.id);
    this.watchPartyService.watchPartyReaction(this.server, session, data);
  }

  @SubscribeMessage('watchPartyComment')
  async watchPartyComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WatchPartyCommentDto,
  ) {
    const session = this.users.get(client.id);
    return this.watchPartyService.watchPartyComment(
      this.server,
      client,
      session,
      data,
    );
  }

  // --- Wallpaper & Theme Handlers ---

  @SubscribeMessage('updateRoomWallpaper')
  async updateRoomWallpaper(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateRoomWallpaperDto,
  ) {
    const session = this.users.get(client.id);
    return this.wallpaperService.updateRoomWallpaper(
      this.server,
      session,
      data,
    );
  }
}
