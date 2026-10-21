import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { Status } from '../../status/status.entity';
import { UserSession } from '../chat.types';
import { sanitizeAvatarUrl } from '../chat.utils';
import { CallingService } from './calling.service';
import { WatchPartyService } from './watch-party.service';
import { GetRoomDto } from '../dto/get-room.dto';

@Injectable()
export class RoomModerationService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Status)
    private readonly statusRepo: Repository<Status>,

    private readonly callingService: CallingService,
    private readonly watchPartyService: WatchPartyService,
  ) {}

  async resetUsersOnlineStatusOnBootstrap(): Promise<void> {
    try {
      console.log('Resetting all users online status to offline on startup...');
      await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ isOnline: false })
        .execute();
    } catch {
      console.log('User status reset skipped during startup');
    }
  }

  async cleanupStaleUsers(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await this.userRepo
        .createQueryBuilder()
        .delete()
        .from(User)
        .where(
          'role = :memberRole AND (isBanned IS NULL OR isBanned = false) AND (isCreator IS NULL OR isCreator = false) AND isOnline = false AND ((lastSeen IS NOT NULL AND lastSeen <= :thirtyDaysAgo) OR (lastSeen IS NULL AND createdAt <= :thirtyDaysAgo))',
          {
            memberRole: 'member',
            thirtyDaysAgo,
          },
        )
        .execute();
    } catch (e) {
      console.warn('[UserCleanup] Stale users cleanup skipped', e);
    }
  }

  async getFormattedUsersList(
    roomPasscode: string,
    roomId: number,
    usersMap: Map<string, UserSession>,
  ) {
    const cleanPass = roomPasscode.trim().toLowerCase();
    const activeSockets = Array.from(usersMap.values()).filter(
      (s) => (s.passcode || '').trim().toLowerCase() === cleanPass,
    );
    const activeNicknames = new Set(
      activeSockets.map((s) => (s.nickname || '').trim().toLowerCase()),
    );

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeNicksList = Array.from(activeNicknames);

    const query = this.userRepo
      .createQueryBuilder('user')
      .where('user.roomId = :roomId', { roomId });

    if (activeNicksList.length > 0) {
      query.andWhere(
        '(LOWER(user.nickname) IN (:...activeNicksList) OR user.isOnline = true OR user.isBanned = true OR user.role = :hostRole OR user.role = :adminRole OR user.isCreator = true OR user.lastSeen > :sevenDaysAgo OR (user.lastSeen IS NULL AND user.createdAt > :sevenDaysAgo))',
        { activeNicksList, sevenDaysAgo, hostRole: 'host', adminRole: 'admin' },
      );
    } else {
      query.andWhere(
        '(user.isOnline = true OR user.isBanned = true OR user.role = :hostRole OR user.role = :adminRole OR user.isCreator = true OR user.lastSeen > :sevenDaysAgo OR (user.lastSeen IS NULL AND user.createdAt > :sevenDaysAgo))',
        { sevenDaysAgo, hostRole: 'host', adminRole: 'admin' },
      );
    }

    const roomUsers = await query
      .orderBy('user.isOnline', 'DESC')
      .addOrderBy('user.lastSeen', 'DESC')
      .take(300)
      .getMany();

    const relevant = roomUsers.filter((u) => {
      const cleanNick = (u.nickname || '').trim().toLowerCase();
      if (activeNicknames.has(cleanNick)) return true;
      if (u.isOnline && !u.isBanned) return true;
      if (u.isBanned || u.role === 'host' || u.role === 'admin' || u.isCreator)
        return true;
      const activityDate = u.lastSeen
        ? new Date(u.lastSeen)
        : u.createdAt
          ? new Date(u.createdAt)
          : null;
      return activityDate ? activityDate > sevenDaysAgo : false;
    });

    return relevant.map((u) => {
      const cleanNick = (u.nickname || '').trim().toLowerCase();
      const isOnline =
        (activeNicknames.has(cleanNick) || Boolean(u.isOnline)) && !u.isBanned;

      return {
        id: u.id,
        nickname: u.nickname,
        role: u.role || 'member',
        isCreator: Boolean(u.isCreator),
        isMuted: Boolean(u.isMuted),
        mutedUntil: u.mutedUntil,
        isBanned: Boolean(u.isBanned),
        isOnline,
        lastSeen: u.lastSeen,
        deviceType: u.deviceType,
        deviceModel: u.deviceModel,
        browser: u.browser,
        os: u.os,
        avatarUrl: u.avatarUrl,
        networkLabel: u.networkLabel,
        batteryLabel: u.batteryLabel,
        batteryIsCharging: u.batteryIsCharging,
      };
    });
  }

  async broadcastUsersList(
    server: Server,
    roomPasscode: string,
    roomId: number,
    usersMap: Map<string, UserSession>,
  ) {
    const list = await this.getFormattedUsersList(
      roomPasscode,
      roomId,
      usersMap,
    );
    const cleanPass = roomPasscode.trim();
    server.to(cleanPass).emit('usersList', list);
    if (cleanPass.toLowerCase() !== cleanPass) {
      server.to(cleanPass.toLowerCase()).emit('usersList', list);
    }
  }

  async getUsers(
    client: Socket,
    data: GetRoomDto,
    usersMap: Map<string, UserSession>,
  ) {
    const passcode = (data?.passcode || '').trim();
    if (!passcode) {
      client.emit('usersList', []);
      return;
    }

    const room = await this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(room.passcode) = LOWER(:passcode)', { passcode })
      .getOne();

    if (!room) {
      client.emit('usersList', []);
      return;
    }

    const list = await this.getFormattedUsersList(
      room.passcode,
      room.id,
      usersMap,
    );
    client.emit('usersList', list);
  }

  async updateMetadata(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode?: string;
      batteryLabel?: string;
      batteryIsCharging?: boolean;
      networkLabel?: string;
      avatarUrl?: string;
    },
    usersMap: Map<string, UserSession>,
  ) {
    if (!session) return;
    const passcode = (data.passcode || session.passcode || '').trim();
    const room = await this.roomRepo.findOne({ where: { passcode } });
    if (!room) return;

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
    if (!user) return;

    let hasChanged = false;
    if (data.batteryLabel !== undefined) {
      const cleanBat =
        typeof data.batteryLabel === 'string'
          ? data.batteryLabel.trim().slice(0, 30)
          : null;
      if (cleanBat !== user.batteryLabel) {
        user.batteryLabel = cleanBat;
        hasChanged = true;
      }
    }
    if (
      typeof data.batteryIsCharging === 'boolean' &&
      data.batteryIsCharging !== user.batteryIsCharging
    ) {
      user.batteryIsCharging = data.batteryIsCharging;
      hasChanged = true;
    }
    if (data.networkLabel !== undefined) {
      const cleanNet =
        typeof data.networkLabel === 'string'
          ? data.networkLabel.trim().slice(0, 50)
          : null;
      if (cleanNet !== user.networkLabel) {
        user.networkLabel = cleanNet;
        hasChanged = true;
      }
    }
    if (data.avatarUrl !== undefined) {
      const cleanAvatar = sanitizeAvatarUrl(data.avatarUrl);
      if (cleanAvatar !== user.avatarUrl) {
        user.avatarUrl = cleanAvatar;
        hasChanged = true;
      }
    }

    if (hasChanged) {
      await this.userRepo.save(user);
      server.to(passcode).emit('userMetadataUpdated', {
        nickname: session.nickname,
        batteryLabel: user.batteryLabel,
        batteryIsCharging: user.batteryIsCharging,
        networkLabel: user.networkLabel,
        avatarUrl: user.avatarUrl,
      });
      if (data.avatarUrl !== undefined) {
        await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
      }
    }
  }

  async kickUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
    },
    usersMap: Map<string, UserSession>,
    findSocketsInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
    clearUserDisconnectDebounceTimer: (key: string) => void,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || (hostUser.role !== 'host' && hostUser.role !== 'admin')) {
      return {
        success: false,
        message: 'Only room host or admin can kick participants',
      };
    }

    if (data.targetNickname.trim() === session.nickname.trim()) {
      return { success: false, message: 'Cannot kick yourself' };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'User not found in room' };

    if (targetUser.role === 'host') {
      return { success: false, message: 'Cannot kick the room host' };
    }
    if (targetUser.isCreator) {
      return {
        success: false,
        message: 'Cannot kick the original room creator',
      };
    }
    if (hostUser.role === 'admin' && targetUser.role === 'admin') {
      return { success: false, message: 'Admins cannot kick other admins' };
    }

    // Disconnect all sockets of target user in room if online and terminate calls
    const targets = findSocketsInRoom(
      data.passcode.trim(),
      targetUser.nickname,
    );
    for (const target of targets) {
      this.callingService.terminateCallForSocket(
        server,
        target.socketId,
        'Call ended: participant was removed from the room.',
      );

      const targetSocket = server.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('kickedFromRoom', {
          reason: 'You have been removed from the room by the host.',
          kickedBy: session.nickname,
        });
        void targetSocket.leave(data.passcode.trim());
        usersMap.delete(target.socketId);
        targetSocket.disconnect(true);
      }
    }

    // Clean up Watch Party state if kicked participant was buffering or hosting
    this.watchPartyService.cleanupKickedUser(
      data.passcode.trim(),
      targetUser.nickname,
      session.nickname,
    );

    const kickedUserKey = `${data.passcode.trim().toLowerCase()}:${targetUser.nickname.trim().toLowerCase()}`;
    clearUserDisconnectDebounceTimer(kickedUserKey);

    targetUser.isOnline = false;
    targetUser.lastSeen = new Date();
    await this.userRepo.save(targetUser);

    server.to(data.passcode.trim()).emit('userKicked', {
      targetNickname: targetUser.nickname,
      kickedBy: session.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true };
  }

  async banUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
    },
    usersMap: Map<string, UserSession>,
    findSocketsInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
    clearUserDisconnectDebounceTimer: (key: string) => void,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || (hostUser.role !== 'host' && hostUser.role !== 'admin')) {
      return {
        success: false,
        message: 'Only room host or admin can ban participants',
      };
    }

    if (data.targetNickname.trim() === session.nickname.trim()) {
      return { success: false, message: 'Cannot ban yourself' };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'User not found in room' };

    if (targetUser.role === 'host') {
      return { success: false, message: 'Cannot ban the room host' };
    }
    if (targetUser.isCreator) {
      return {
        success: false,
        message: 'Cannot ban the original room creator',
      };
    }
    if (hostUser.role === 'admin' && targetUser.role === 'admin') {
      return { success: false, message: 'Admins cannot ban other admins' };
    }

    targetUser.isBanned = true;
    targetUser.bannedAt = new Date();
    targetUser.isOnline = false;
    targetUser.lastSeen = new Date();
    await this.userRepo.save(targetUser);

    const targets = findSocketsInRoom(
      data.passcode.trim(),
      targetUser.nickname,
    );
    for (const target of targets) {
      this.callingService.terminateCallForSocket(
        server,
        target.socketId,
        'Call ended: participant was banned from the room.',
      );

      const targetSocket = server.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('kickedFromRoom', {
          reason:
            'You have been permanently banned from this room by the host.',
          kickedBy: session.nickname,
        });
        void targetSocket.leave(data.passcode.trim());
        usersMap.delete(target.socketId);
        targetSocket.disconnect(true);
      }
    }

    // Clean up Watch Party state if banned participant was buffering or hosting
    this.watchPartyService.cleanupKickedUser(
      data.passcode.trim(),
      targetUser.nickname,
      session.nickname,
    );

    const bannedUserKey = `${data.passcode.trim().toLowerCase()}:${targetUser.nickname.trim().toLowerCase()}`;
    clearUserDisconnectDebounceTimer(bannedUserKey);

    server.to(data.passcode.trim()).emit('userBanned', {
      targetNickname: targetUser.nickname,
      bannedBy: session.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true };
  }

  async unbanUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
    },
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || (hostUser.role !== 'host' && hostUser.role !== 'admin')) {
      return {
        success: false,
        message: 'Only room host or admin can unban participants',
      };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'User not found in room' };

    targetUser.isBanned = false;
    targetUser.bannedAt = null;
    await this.userRepo.save(targetUser);

    server.to(data.passcode.trim()).emit('userUnbanned', {
      targetNickname: targetUser.nickname,
      unbannedBy: session.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true };
  }

  async promoteUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
      role: 'admin' | 'member';
    },
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || hostUser.role !== 'host') {
      return {
        success: false,
        message: 'Only room host can promote or demote admins',
      };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'User not found in room' };

    if (
      targetUser.role === 'host' ||
      targetUser.nickname.toLowerCase() === session.nickname.toLowerCase()
    ) {
      return {
        success: false,
        message:
          'Cannot change host role. Use transferHost to reassign room ownership.',
      };
    }
    if (targetUser.isBanned) {
      return { success: false, message: 'Cannot promote a banned user' };
    }

    targetUser.role = data.role === 'admin' ? 'admin' : 'member';
    await this.userRepo.save(targetUser);

    for (const [, user] of usersMap.entries()) {
      if (
        user.passcode === data.passcode.trim() &&
        user.nickname.toLowerCase() === targetUser.nickname.toLowerCase()
      ) {
        user.role = targetUser.role;
      }
    }

    server.to(data.passcode.trim()).emit('userPromoted', {
      targetNickname: targetUser.nickname,
      role: targetUser.role,
      promotedBy: session.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true, role: targetUser.role };
  }

  async transferHost(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
    },
    usersMap: Map<string, UserSession>,
    findSocketsInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || hostUser.role !== 'host') {
      return {
        success: false,
        message: 'Only current host can transfer room ownership',
      };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'Target user not found' };
    if (targetUser.nickname.toLowerCase() === session.nickname.toLowerCase()) {
      return { success: false, message: 'You are already the room host' };
    }
    if (targetUser.isBanned) {
      return {
        success: false,
        message: 'Cannot transfer room ownership to a banned user',
      };
    }
    if (targetUser.isMuted) {
      return {
        success: false,
        message: 'Cannot transfer room ownership to a muted user',
      };
    }
    const targetSockets = findSocketsInRoom(
      data.passcode.trim(),
      targetUser.nickname,
    );
    if (targetSockets.length === 0) {
      return {
        success: false,
        message:
          'Cannot transfer room ownership to an offline participant. The user must be online.',
      };
    }

    hostUser.role = 'admin';
    targetUser.role = 'host';
    await this.userRepo.save([hostUser, targetUser]);

    for (const [, user] of usersMap.entries()) {
      if (user.passcode === data.passcode.trim()) {
        if (user.nickname.toLowerCase() === hostUser.nickname.toLowerCase())
          user.role = 'admin';
        if (user.nickname.toLowerCase() === targetUser.nickname.toLowerCase())
          user.role = 'host';
      }
    }

    server.to(data.passcode.trim()).emit('hostChanged', {
      newHostNickname: targetUser.nickname,
      newHost: targetUser.nickname,
      previousHostNickname: hostUser.nickname,
      previousHost: hostUser.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true };
  }

  async reclaimHost(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
    },
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const creatorUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!creatorUser || !creatorUser.isCreator) {
      return {
        success: false,
        message: 'Only the original room creator can reclaim host status.',
      };
    }
    if (creatorUser.role === 'host') {
      return { success: false, message: 'You are already the room host.' };
    }
    if (creatorUser.isBanned || creatorUser.isMuted) {
      return {
        success: false,
        message: 'Cannot reclaim host while restricted.',
      };
    }

    const currentHost = await this.userRepo.findOne({
      where: { roomId: room.id, role: 'host' },
    });

    if (currentHost) {
      currentHost.role = 'admin';
      await this.userRepo.save(currentHost);
    }
    creatorUser.role = 'host';
    await this.userRepo.save(creatorUser);

    for (const [, user] of usersMap.entries()) {
      if (user.passcode === data.passcode.trim()) {
        if (
          currentHost &&
          user.nickname.toLowerCase() === currentHost.nickname.toLowerCase()
        ) {
          user.role = 'admin';
        }
        if (
          user.nickname.toLowerCase() === creatorUser.nickname.toLowerCase()
        ) {
          user.role = 'host';
        }
      }
    }

    server.to(data.passcode.trim()).emit('hostChanged', {
      newHostNickname: creatorUser.nickname,
      newHost: creatorUser.nickname,
      previousHostNickname: currentHost?.nickname || 'Previous Host',
      previousHost: currentHost?.nickname || 'Previous Host',
      reason: 'Original creator reclaimed room host privileges',
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true };
  }

  async clearInactiveUsers(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      daysInactive?: number;
    },
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || (hostUser.role !== 'host' && hostUser.role !== 'admin')) {
      return {
        success: false,
        message: 'Only room host or admin can clear inactive participants',
      };
    }

    const days = Math.max(1, Math.min(365, Number(data.daysInactive || 7)));
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Safeguard: NEVER delete host, admins, or banned participants as "inactive"
    const deleteResult = await this.userRepo
      .createQueryBuilder()
      .delete()
      .from(User)
      .where(
        'roomId = :roomId AND role = :memberRole AND (isBanned IS NULL OR isBanned = false) AND (isCreator IS NULL OR isCreator = false) AND isOnline = false AND ((lastSeen IS NOT NULL AND lastSeen < :cutoffDate) OR (lastSeen IS NULL AND createdAt < :cutoffDate))',
        {
          roomId: room.id,
          memberRole: 'member',
          cutoffDate,
        },
      )
      .execute();

    // Clean up expired statuses in this room as well
    await this.statusRepo
      .createQueryBuilder()
      .delete()
      .from(Status)
      .where(
        'roomId = :roomId AND expiresAt IS NOT NULL AND expiresAt < :now',
        {
          roomId: room.id,
          now: new Date(),
        },
      )
      .execute();

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return { success: true, removedCount: deleteResult.affected || 0 };
  }

  async muteUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: {
      passcode: string;
      targetNickname: string;
      isMuted: boolean;
      durationMinutes?: number;
    },
    usersMap: Map<string, UserSession>,
    findSocketsInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => Array<{ socketId: string; nickname: string }>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) {
      return { success: false, message: 'Unauthorized session' };
    }

    const room = await this.roomRepo.findOne({
      where: { passcode: data.passcode.trim() },
    });
    if (!room) return { success: false, message: 'Room not found' };

    const hostUser = await this.userRepo.findOne({
      where: { nickname: session.nickname, roomId: room.id },
    });
    if (!hostUser || (hostUser.role !== 'host' && hostUser.role !== 'admin')) {
      return {
        success: false,
        message: 'Only room host or admin can mute/unmute participants',
      };
    }

    const targetUser = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(user.nickname) = LOWER(:target)',
        {
          roomId: room.id,
          target: data.targetNickname.trim(),
        },
      )
      .getOne();
    if (!targetUser)
      return { success: false, message: 'User not found in room' };

    if (
      data.targetNickname.trim().toLowerCase() ===
      session.nickname.trim().toLowerCase()
    ) {
      return { success: false, message: 'Cannot mute yourself' };
    }

    if (targetUser.role === 'host') {
      return { success: false, message: 'Cannot mute the room host' };
    }
    if (targetUser.isCreator) {
      return {
        success: false,
        message: 'Cannot mute the original room creator',
      };
    }
    if (hostUser.role === 'admin' && targetUser.role === 'admin') {
      return { success: false, message: 'Admins cannot mute other admins' };
    }

    targetUser.isMuted = Boolean(data.isMuted);
    targetUser.mutedUntil =
      data.isMuted && data.durationMinutes && data.durationMinutes > 0
        ? new Date(Date.now() + data.durationMinutes * 60 * 1000)
        : null;
    await this.userRepo.save(targetUser);

    for (const [, user] of usersMap.entries()) {
      if (
        user.passcode === data.passcode.trim() &&
        user.nickname.toLowerCase() === targetUser.nickname.toLowerCase()
      ) {
        user.isMuted = targetUser.isMuted;
      }
    }

    if (targetUser.isMuted) {
      const targets = findSocketsInRoom(
        data.passcode.trim(),
        targetUser.nickname,
      );
      for (const target of targets) {
        this.callingService.terminateCallForSocket(
          server,
          target.socketId,
          'Call ended: participant was muted by the host.',
          'Call ended: you were muted by the host.',
        );
      }
    }

    server.to(data.passcode.trim()).emit('userMuteToggled', {
      targetNickname: targetUser.nickname,
      isMuted: targetUser.isMuted,
      mutedUntil: targetUser.mutedUntil,
      mutedBy: session.nickname,
    });

    await this.broadcastUsersList(server, room.passcode, room.id, usersMap);
    return {
      success: true,
      isMuted: targetUser.isMuted,
      mutedUntil: targetUser.mutedUntil,
    };
  }
}
