import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as crypto from 'crypto';

import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
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
} from '../dto/call-signal.dto';
import { ActiveCallSession, UserSession } from '../chat.types';

@Injectable()
export class CallingService implements OnModuleDestroy {
  private activeCallSessions = new Map<string, ActiveCallSession>();
  private callDisconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleDestroy() {
    for (const timer of this.callDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    for (const session of this.activeCallSessions.values()) {
      if (session.ringTimer) clearTimeout(session.ringTimer);
    }
    this.callDisconnectTimers.clear();
    this.activeCallSessions.clear();
  }

  findCallBySocketId(socketId: string): ActiveCallSession | undefined {
    if (!socketId) return undefined;
    let fallback: ActiveCallSession | undefined;
    for (const session of this.activeCallSessions.values()) {
      if (
        session.callerSocketId === socketId ||
        session.calleeSocketId === socketId
      ) {
        if (session.state === 'active') {
          return session;
        }
        if (!fallback) {
          fallback = session;
        }
      }
    }
    return fallback;
  }

  resolveCallSession(
    callId?: string,
    socketId?: string,
    room?: string,
  ): ActiveCallSession | undefined {
    let session: ActiveCallSession | undefined;
    if (callId && this.activeCallSessions.has(callId)) {
      session = this.activeCallSessions.get(callId);
    } else if (socketId) {
      session = this.findCallBySocketId(socketId);
    }
    if (session && room) {
      if (session.room?.trim().toLowerCase() !== room.trim().toLowerCase()) {
        return undefined;
      }
    }
    return session;
  }

  clearCallDisconnectTimer(callId: string) {
    if (!callId) return;
    const timer = this.callDisconnectTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.callDisconnectTimers.delete(callId);
    }
  }

  private async findRoom(passcode?: string): Promise<Room | null> {
    if (!passcode || typeof passcode !== 'string') return null;
    const cleanPasscode = passcode.trim().toLowerCase();
    if (!cleanPasscode) return null;
    return this.roomRepo
      .createQueryBuilder('room')
      .where('LOWER(TRIM(room.passcode)) = :cleanPasscode', { cleanPasscode })
      .getOne();
  }

  private async findUser(
    roomId?: number,
    nickname?: string,
  ): Promise<User | null> {
    if (!roomId || !nickname || typeof nickname !== 'string') return null;
    const cleanNick = nickname.trim().toLowerCase();
    if (!cleanNick) return null;
    return this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.roomId = :roomId AND LOWER(TRIM(user.nickname)) = :cleanNick',
        {
          roomId,
          cleanNick,
        },
      )
      .getOne();
  }

  private sanitizeReason(reason?: string, defaultMsg = 'Call ended'): string {
    if (!reason || typeof reason !== 'string') return defaultMsg;
    const trimmed = reason.trim().replace(/[\r\n\t]/g, ' ');
    return (trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed) || defaultMsg;
  }

  async callUser(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: CallUserDto,
    usersMap: Map<string, UserSession>,
    findSocketInRoom: (
      passcode: string,
      nickname?: string,
      excludeSocketId?: string,
    ) => { socketId: string; nickname: string } | undefined,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();

    if (session.isMuted) {
      const roomEntity = await this.findRoom(room);
      const callerUser = roomEntity
        ? await this.findUser(roomEntity.id, session.nickname)
        : null;

      if (
        callerUser?.mutedUntil &&
        new Date(callerUser.mutedUntil) <= new Date()
      ) {
        callerUser.isMuted = false;
        callerUser.mutedUntil = null;
        await this.userRepo.save(callerUser);
        session.isMuted = false;
        server.to(room).emit('userMuteToggled', {
          targetNickname: callerUser.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        const muteTime = callerUser?.mutedUntil
          ? new Date(callerUser.mutedUntil).getTime()
          : NaN;
        const remainingMinutes = !isNaN(muteTime)
          ? Math.max(1, Math.ceil((muteTime - Date.now()) / 60000))
          : null;
        client.emit('callError', {
          message: remainingMinutes
            ? `You are muted for ${remainingMinutes} more minute(s) and cannot place calls.`
            : 'You have been muted by the host and cannot place calls.',
        });
        return;
      }
    }

    // Clean up any stale call sessions previously initiated by this caller socket
    const prevCallerCall = Array.from(this.activeCallSessions.values()).find(
      (c) => c.callerSocketId === client.id,
    );
    if (prevCallerCall) {
      if (prevCallerCall.ringTimer) clearTimeout(prevCallerCall.ringTimer);
      this.clearCallDisconnectTimer(prevCallerCall.callId);
      this.activeCallSessions.delete(prevCallerCall.callId);
    }

    // Resolve target socket (explicit socket ID, targeted nickname, or other participant in 2-person room)
    let target: { socketId: string; nickname: string } | undefined;
    const roomUsers = Array.from(usersMap.entries()).filter(
      ([id, u]) =>
        u.passcode?.trim().toLowerCase() === room.toLowerCase() &&
        id !== client.id,
    );

    if (data.targetSocketId && typeof data.targetSocketId === 'string') {
      const targetSession = usersMap.get(data.targetSocketId.trim());
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        target = {
          socketId: data.targetSocketId.trim(),
          nickname: targetSession.nickname,
        };
      }
    } else if (data.targetNickname && typeof data.targetNickname === 'string') {
      target = findSocketInRoom(room, data.targetNickname, client.id);
    } else if (roomUsers.length === 1) {
      target = {
        socketId: roomUsers[0][0],
        nickname: roomUsers[0][1].nickname,
      };
    }

    // If target was specified but no matching online user was found in this room
    if ((data.targetNickname || data.targetSocketId) && !target) {
      client.emit('callError', {
        message: `${data.targetNickname || 'Participant'} is currently offline or unavailable.`,
      });
      return;
    }

    if (
      target &&
      (target.socketId === client.id ||
        target.nickname.trim().toLowerCase() ===
          session.nickname.trim().toLowerCase())
    ) {
      client.emit('callError', {
        message: 'You cannot place a call to yourself.',
      });
      return;
    }

    // Check if target is already in an active call or is muted
    if (target) {
      const targetSession = usersMap.get(target.socketId);
      if (targetSession?.isMuted) {
        const roomEntity = await this.findRoom(room);
        const targetDbUser = roomEntity
          ? await this.findUser(roomEntity.id, targetSession.nickname)
          : null;
        if (
          targetDbUser?.mutedUntil &&
          new Date(targetDbUser.mutedUntil) <= new Date()
        ) {
          targetDbUser.isMuted = false;
          targetDbUser.mutedUntil = null;
          await this.userRepo.save(targetDbUser);
          targetSession.isMuted = false;
          server.to(room).emit('userMuteToggled', {
            targetNickname: targetDbUser.nickname,
            isMuted: false,
            mutedBy: 'System (Timed Mute Expired)',
          });
        } else {
          client.emit('callError', {
            message: `${target.nickname} is currently muted by the host and cannot receive calls.`,
          });
          return;
        }
      }

      const targetActiveCall = this.findCallBySocketId(target.socketId);
      if (targetActiveCall) {
        if (targetActiveCall.state === 'active') {
          client.emit('callBusy', {
            nickname: target.nickname,
            reason: 'User is currently on another call.',
          });
          return;
        }

        // WebRTC Glare: Both participants initiated a call to each other simultaneously!
        if (
          targetActiveCall.state === 'calling' &&
          targetActiveCall.callerSocketId === target.socketId &&
          (targetActiveCall.calleeSocketId === client.id ||
            targetActiveCall.calleeNickname?.trim().toLowerCase() ===
              session.nickname.trim().toLowerCase())
        ) {
          // Both called each other! Bridge them into the existing call directly as an accept.
          if (targetActiveCall.ringTimer) {
            clearTimeout(targetActiveCall.ringTimer);
            targetActiveCall.ringTimer = undefined;
          }
          targetActiveCall.state = 'active';
          targetActiveCall.calleeSocketId = client.id;
          targetActiveCall.calleeNickname = session.nickname;
          targetActiveCall.startedAt = Date.now();

          const acceptPayload = {
            receiverName: session.nickname,
            from: session.nickname,
            receiverSocketId: client.id,
            callId: targetActiveCall.callId,
          };

          server.to(target.socketId).emit('callAccepted', acceptPayload);
          server.to(target.socketId).emit('acceptCall', acceptPayload);
          client.emit('callAccepted', {
            receiverName: target.nickname,
            from: target.nickname,
            receiverSocketId: target.socketId,
            callId: targetActiveCall.callId,
          });
          return;
        }

        if (targetActiveCall.state === 'calling') {
          client.emit('callBusy', {
            nickname: target.nickname,
            reason: 'User is currently placing or receiving another call.',
          });
          return;
        }
      }
    }

    const callId = `call_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newCallSession: ActiveCallSession = {
      callId,
      room,
      callerSocketId: client.id,
      callerNickname: session.nickname,
      calleeSocketId: target?.socketId,
      calleeNickname: target?.nickname,
      isVoiceOnly: Boolean(data.isVoiceOnly),
      state: 'calling',
      startedAt: Date.now(),
    };

    // Auto-timeout ring timer (configurable via CALL_RING_TIMEOUT_MS, default 35s)
    const ringTimeoutMs =
      Number(process.env.CALL_RING_TIMEOUT_MS) || 35000;
    newCallSession.ringTimer = setTimeout(() => {
      const active = this.activeCallSessions.get(callId);
      if (active && active.state === 'calling') {
        this.activeCallSessions.delete(callId);
        server.to(active.callerSocketId).emit('callTimeout', {
          reason: 'No answer. Call timed out.',
          callId,
        });
        if (active.calleeSocketId) {
          server.to(active.calleeSocketId).emit('callMissed', {
            callerName: active.callerNickname,
            callId,
          });
        } else if (active.room) {
          server.to(active.room).emit('callMissed', {
            callerName: active.callerNickname,
            callId,
          });
        }
      }
    }, ringTimeoutMs);

    if (newCallSession.ringTimer && typeof newCallSession.ringTimer.unref === 'function') {
      newCallSession.ringTimer.unref();
    }

    this.activeCallSessions.set(callId, newCallSession);

    const callPayload = {
      callerName: data.callerName || session.nickname,
      from: session.nickname,
      callerSocketId: client.id,
      targetSocketId: target?.socketId,
      isVoiceOnly: Boolean(data.isVoiceOnly),
      callId,
    };

    console.log(
      `[CallUser] ${session.nickname} calling ${target ? target.nickname : 'room'} (callId: ${callId}) in room: ${room}`,
    );

    if (target?.socketId) {
      server.to(target.socketId).emit('userCalling', callPayload);
      server.to(target.socketId).emit('callUser', callPayload);
    } else {
      client.to(room).emit('userCalling', callPayload);
      client.to(room).emit('callUser', callPayload);
    }
  }

  async acceptCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: AcceptCallDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();

    if (session.isMuted) {
      const roomEntity = await this.findRoom(room);
      const callerUser = roomEntity
        ? await this.findUser(roomEntity.id, session.nickname)
        : null;

      if (
        callerUser?.mutedUntil &&
        new Date(callerUser.mutedUntil) <= new Date()
      ) {
        callerUser.isMuted = false;
        callerUser.mutedUntil = null;
        await this.userRepo.save(callerUser);
        session.isMuted = false;
        server.to(room).emit('userMuteToggled', {
          targetNickname: callerUser.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        const muteTime = callerUser?.mutedUntil
          ? new Date(callerUser.mutedUntil).getTime()
          : NaN;
        const remainingMinutes = !isNaN(muteTime)
          ? Math.max(1, Math.ceil((muteTime - Date.now()) / 60000))
          : null;
        client.emit('callError', {
          message: remainingMinutes
            ? `You are muted for ${remainingMinutes} more minute(s) and cannot join voice or video calls.`
            : 'You have been muted by the host and cannot join voice or video calls.',
        });
        return;
      }
    }

    const callSession =
      this.resolveCallSession(data.callId, client.id, room) ||
      Array.from(this.activeCallSessions.values()).find(
        (c) =>
          c.room.trim().toLowerCase() === room.toLowerCase() &&
          c.state === 'calling' &&
          (!c.calleeNickname ||
            c.calleeNickname.trim().toLowerCase() ===
              session.nickname.trim().toLowerCase() ||
            c.calleeSocketId === client.id),
      );

    if (!callSession) {
      client.emit('callError', {
        message: 'Call session has expired or is no longer available.',
      });
      return;
    }

    // Guard against accepting a call that is already active with someone else
    if (
      callSession.state === 'active' &&
      callSession.calleeSocketId &&
      callSession.calleeSocketId !== client.id
    ) {
      client.emit('callError', {
        message: 'Call has already been answered by another user.',
      });
      return;
    }

    // Verify recipient identity if call was targeted to a specific user
    if (
      callSession.calleeNickname &&
      callSession.calleeNickname.trim().toLowerCase() !==
        session.nickname.trim().toLowerCase()
    ) {
      client.emit('callError', {
        message: 'This call was directed to another participant.',
      });
      return;
    }

    if (callSession.ringTimer) {
      clearTimeout(callSession.ringTimer);
      callSession.ringTimer = undefined;
    }
    callSession.state = 'active';
    callSession.calleeSocketId = client.id;
    callSession.calleeNickname = session.nickname;
    callSession.startedAt = Date.now();

    console.log(
      `[AcceptCall] ${session.nickname} accepted call ${callSession.callId} in room: ${room}`,
    );

    const acceptPayload = {
      receiverName: data.receiverName || session.nickname,
      from: session.nickname,
      receiverSocketId: client.id,
      callId: callSession.callId,
    };

    if (callSession.callerSocketId) {
      server.to(callSession.callerSocketId).emit('callAccepted', acceptPayload);
      server.to(callSession.callerSocketId).emit('acceptCall', acceptPayload);
    } else if (data.targetSocketId) {
      const targetSession = usersMap.get(data.targetSocketId);
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        server.to(data.targetSocketId).emit('callAccepted', acceptPayload);
        server.to(data.targetSocketId).emit('acceptCall', acceptPayload);
      }
    } else {
      client.to(room).emit('callAccepted', acceptPayload);
      client.to(room).emit('acceptCall', acceptPayload);
    }
  }

  declineCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: DeclineCallDto,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    console.log(
      `[DeclineCall] ${session.nickname} declined the call in room: ${room}`,
    );

    const callSession = this.resolveCallSession(data.callId, client.id, room);
    if (callSession) {
      const isParticipant =
        callSession.callerSocketId === client.id ||
        callSession.calleeSocketId === client.id ||
        (callSession.callerNickname &&
          callSession.callerNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase()) ||
        (callSession.calleeNickname &&
          callSession.calleeNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase()) ||
        !callSession.calleeSocketId;

      if (!isParticipant) {
        return;
      }

      if (callSession.ringTimer) clearTimeout(callSession.ringTimer);
      this.clearCallDisconnectTimer(callSession.callId);
      this.activeCallSessions.delete(callSession.callId);
    }

    const declinePayload = {
      receiverName: data.receiverName || session.nickname,
      from: session.nickname,
      reason: this.sanitizeReason(data.reason, 'Call declined'),
      callId: callSession?.callId || data.callId,
    };

    const targetSocketId =
      callSession?.callerSocketId ||
      data.targetSocketId;

    if (targetSocketId) {
      server.to(targetSocketId).emit('callDeclined', declinePayload);
      server.to(targetSocketId).emit('declineCall', declinePayload);
    } else {
      client.to(room).emit('callDeclined', declinePayload);
      client.to(room).emit('declineCall', declinePayload);
    }
  }

  webrtcOffer(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcOfferDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      !data?.offer ||
      (typeof data.offer !== 'object' && typeof data.offer !== 'string') ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    console.log(
      `[WebRTCOffer] Relaying WebRTC offer from ${session.nickname} in room: ${room}`,
    );

    const callSession = this.resolveCallSession(data.callId, client.id, room);
    if (callSession) {
      const isParticipant =
        callSession.callerSocketId === client.id ||
        callSession.calleeSocketId === client.id ||
        (callSession.callerNickname &&
          callSession.callerNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase());
      if (!isParticipant) return;
    }

    const offerPayload = {
      offer: data.offer,
      from: session.nickname,
      callerName: data.callerName || session.nickname,
      callerSocketId: client.id,
      callId: callSession?.callId || data.callId,
    };

    const targetSocketId =
      data.targetSocketId ||
      (callSession && callSession.callerSocketId === client.id
        ? callSession.calleeSocketId
        : callSession?.callerSocketId);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        server.to(targetSocketId).emit('webrtcOffer', offerPayload);
      }
    } else if (!callSession) {
      client.to(room).emit('webrtcOffer', offerPayload);
    }
  }

  webrtcAnswer(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcAnswerDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      !data?.answer ||
      (typeof data.answer !== 'object' && typeof data.answer !== 'string') ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    console.log(
      `[WebRTCAnswer] Relaying WebRTC answer from ${session.nickname} in room: ${room}`,
    );

    const callSession = this.resolveCallSession(data.callId, client.id, room);
    if (callSession) {
      const isParticipant =
        callSession.callerSocketId === client.id ||
        callSession.calleeSocketId === client.id ||
        (callSession.calleeNickname &&
          callSession.calleeNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase());
      if (!isParticipant) return;
    }

    const answerPayload = {
      answer: data.answer,
      from: session.nickname,
      receiverName: data.receiverName || session.nickname,
      receiverSocketId: client.id,
      callId: callSession?.callId || data.callId,
    };

    const targetSocketId =
      data.targetSocketId ||
      (callSession && callSession.calleeSocketId === client.id
        ? callSession.callerSocketId
        : callSession?.calleeSocketId);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        server.to(targetSocketId).emit('webrtcAnswer', answerPayload);
      }
    } else if (!callSession) {
      client.to(room).emit('webrtcAnswer', answerPayload);
    }
  }

  webrtcCandidate(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcCandidateDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      data?.candidate === undefined ||
      data?.candidate === null ||
      (typeof data.candidate !== 'object' &&
        typeof data.candidate !== 'string') ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    const callSession = this.resolveCallSession(data.callId, client.id, room);
    if (callSession) {
      const isParticipant =
        callSession.callerSocketId === client.id ||
        callSession.calleeSocketId === client.id;
      if (!isParticipant) return;
    }

    const candidatePayload = {
      candidate: data.candidate,
      fromSocketId: client.id,
      callId: callSession?.callId || data.callId,
    };

    const targetSocketId =
      data.targetSocketId ||
      (callSession
        ? callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId
        : undefined);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        server.to(targetSocketId).emit('webrtcCandidate', candidatePayload);
      }
    } else if (!callSession) {
      client.to(room).emit('webrtcCandidate', candidatePayload);
    }
  }

  endCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: EndCallDto,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    console.log(`[EndCall] Relaying endCall in room: ${room}`);

    const callSession = this.resolveCallSession(data.callId, client.id, room);
    const sanitizedReason = this.sanitizeReason(
      data.reason,
      'Call ended by participant',
    );

    if (callSession) {
      const isParticipant =
        callSession.callerSocketId === client.id ||
        callSession.calleeSocketId === client.id ||
        (callSession.callerNickname &&
          callSession.callerNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase()) ||
        (callSession.calleeNickname &&
          callSession.calleeNickname.trim().toLowerCase() ===
            session.nickname.trim().toLowerCase());

      if (!isParticipant) {
        return;
      }

      if (callSession.ringTimer) clearTimeout(callSession.ringTimer);
      this.clearCallDisconnectTimer(callSession.callId);
      this.activeCallSessions.delete(callSession.callId);

      const peerSocketId =
        callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId;

      if (peerSocketId) {
        server.to(peerSocketId).emit('callEnded', {
          reason: sanitizedReason,
          from: session.nickname,
          callId: callSession.callId,
        });
        server.to(peerSocketId).emit('endCall', {
          reason: sanitizedReason,
          from: session.nickname,
          callId: callSession.callId,
        });
        return;
      }
    }

    if (data.targetSocketId) {
      server.to(data.targetSocketId).emit('callEnded', {
        reason: sanitizedReason,
        from: session.nickname,
        callId: data.callId,
      });
      server.to(data.targetSocketId).emit('endCall', {
        reason: sanitizedReason,
        from: session.nickname,
        callId: data.callId,
      });
      return;
    }

    client.to(room).emit('callEnded', {
      reason: sanitizedReason,
      from: session.nickname,
      callId: data.callId,
    });
    client.to(room).emit('endCall', {
      reason: sanitizedReason,
      from: session.nickname,
      callId: data.callId,
    });
  }

  getIceServers(client: Socket, session: UserSession | undefined) {
    if (!session || !client) return;

    const stunServers = process.env.STUN_SERVERS
      ? process.env.STUN_SERVERS.split(',').map((u) => ({ urls: u.trim() }))
      : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ];

    const turnUrl = process.env.TURN_SERVER_URL;
    const turnSecret = process.env.TURN_SECRET;
    const turnUsername = process.env.TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD;

    const iceServers: any[] = [...stunServers];

    if (turnUrl && turnSecret) {
      try {
        const ttl = Number(process.env.TURN_TTL_SECONDS) || 86400;
        const timestamp = Math.floor(Date.now() / 1000) + ttl;
        const cleanNick = (session.nickname || 'user')
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const username = `${timestamp}:${cleanNick}`;
        const hmac = crypto.createHmac('sha1', turnSecret);
        hmac.update(username);
        const credential = hmac.digest('base64');

        const urls = turnUrl
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean);

        iceServers.push({
          urls,
          username,
          credential,
        });
      } catch (err) {
        console.warn('Failed generating dynamic HMAC TURN credential:', err);
      }
    } else if (turnUrl && turnUsername && turnCredential) {
      const urls = turnUrl
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      iceServers.push({
        urls,
        username: turnUsername,
        credential: turnCredential,
      });
    } else {
      iceServers.push({
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelay',
        credential: 'openrelay',
      });
    }

    client.emit('iceServers', { iceServers });
  }

  togglePip(
    client: Socket,
    session: UserSession | undefined,
    data: TogglePipDto,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const isPip = Boolean(data.isPip);
    session.isPip = isPip;
    const room = session.passcode.trim();

    console.log(
      `[TogglePip] ${session.nickname} set PIP mode to ${isPip} in room: ${room}`,
    );
    client.to(room).emit('pipStateChanged', {
      nickname: session.nickname,
      isPip,
    });
  }

  screenShareStatus(
    client: Socket,
    session: UserSession | undefined,
    data: ScreenShareStatusDto,
    server?: Server,
    usersMap?: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    console.log(
      `[ScreenShareStatus] ${session.nickname} screen sharing: ${data.isSharing} in room: ${room}`,
    );

    const callSession = this.resolveCallSession(data.callId, client.id, room);
    const targetSocketId =
      data.targetSocketId ||
      (callSession
        ? callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId
        : undefined);

    const payload = {
      isSharing: Boolean(data.isSharing),
      from: session.nickname,
      callId: callSession?.callId || data.callId,
    };

    if (targetSocketId) {
      if (usersMap) {
        const targetSession = usersMap.get(targetSocketId);
        if (
          !targetSession ||
          targetSession.passcode.trim().toLowerCase() !== room.toLowerCase()
        ) {
          return;
        }
      }
      if (server) {
        server.to(targetSocketId).emit('screenShareStatus', payload);
      } else {
        client.to(targetSocketId).emit('screenShareStatus', payload);
      }
    } else if (!callSession) {
      client.to(room).emit('screenShareStatus', payload);
    }
  }

  webrtcMediaState(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcMediaStateDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (
      !session ||
      !data?.passcode ||
      typeof session.passcode !== 'string' ||
      typeof data.passcode !== 'string' ||
      session.passcode.trim().toLowerCase() !==
        data.passcode.trim().toLowerCase()
    )
      return;

    const room = session.passcode.trim();
    const callSession = this.resolveCallSession(data.callId, client.id, room);
    const targetSocketId =
      data.targetSocketId ||
      (callSession
        ? callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId
        : undefined);

    const isMicMuted =
      data.micMuted !== undefined ? Boolean(data.micMuted) : Boolean(data.isAudioMuted);
    const isCameraOff =
      data.cameraOff !== undefined ? Boolean(data.cameraOff) : Boolean(data.isVideoMuted);

    const payload = {
      from: session.nickname,
      fromSocketId: client.id,
      micMuted: isMicMuted,
      cameraOff: isCameraOff,
      isAudioMuted: isMicMuted,
      isVideoMuted: isCameraOff,
      callId: data.callId || callSession?.callId,
    };

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (
        targetSession &&
        targetSession.passcode.trim().toLowerCase() === room.toLowerCase()
      ) {
        server.to(targetSocketId).emit('webrtcMediaState', payload);
      }
    } else if (!callSession || !targetSocketId) {
      client.to(room).emit('webrtcMediaState', payload);
    }
  }

  handleDisconnect(server: Server, socketId: string, userInfo?: UserSession) {
    if (!socketId) return;
    const existingCall = this.findCallBySocketId(socketId);
    if (!existingCall) return;

    const nickname =
      userInfo?.nickname ||
      (existingCall.callerSocketId === socketId
        ? existingCall.callerNickname
        : existingCall.calleeNickname) ||
      'Participant';

    if (existingCall.state === 'calling') {
      if (existingCall.ringTimer) {
        clearTimeout(existingCall.ringTimer);
      }
      this.clearCallDisconnectTimer(existingCall.callId);
      this.activeCallSessions.delete(existingCall.callId);

      const peerSocketId =
        existingCall.callerSocketId === socketId
          ? existingCall.calleeSocketId
          : existingCall.callerSocketId;

      if (peerSocketId) {
        server.to(peerSocketId).emit('callEnded', {
          reason: 'Call cancelled: participant disconnected',
          from: nickname,
          callId: existingCall.callId,
        });
        server.to(peerSocketId).emit('endCall', {
          reason: 'Call cancelled: participant disconnected',
          from: nickname,
          callId: existingCall.callId,
        });
      } else if (existingCall.room) {
        server.to(existingCall.room).emit('callEnded', {
          reason: 'Call cancelled: participant disconnected',
          from: nickname,
          callId: existingCall.callId,
        });
        server.to(existingCall.room).emit('endCall', {
          reason: 'Call cancelled: participant disconnected',
          from: nickname,
          callId: existingCall.callId,
        });
      }
    } else if (existingCall.state === 'active') {
      const gracePeriodMs =
        Number(process.env.CALL_DISCONNECT_GRACE_PERIOD_MS) || 12000;
      console.log(
        `[CallGracePeriod] Socket ${socketId} (${nickname}) disconnected during active call ${existingCall.callId}. Starting ${Math.round(gracePeriodMs / 1000)}s grace period.`,
      );

      const peerSocketId =
        existingCall.callerSocketId === socketId
          ? existingCall.calleeSocketId
          : existingCall.callerSocketId;

      if (peerSocketId) {
        server.to(peerSocketId).emit('peerReconnecting', {
          nickname,
          callId: existingCall.callId,
        });
      }

      const callId = existingCall.callId;
      this.clearCallDisconnectTimer(callId);

      const timer = setTimeout(() => {
        this.callDisconnectTimers.delete(callId);
        const currentCall = this.activeCallSessions.get(callId);
        if (currentCall && currentCall.state === 'active') {
          console.log(
            `[CallGracePeriod] Grace period expired for call ${callId}. Ending call.`,
          );
          this.activeCallSessions.delete(callId);
          const remainingPeer =
            currentCall.callerSocketId === socketId
              ? currentCall.calleeSocketId
              : currentCall.callerSocketId;

          if (remainingPeer) {
            server.to(remainingPeer).emit('callEnded', {
              reason: 'Call ended: participant disconnected',
              from: nickname,
              callId,
            });
            server.to(remainingPeer).emit('endCall', {
              reason: 'Call ended: participant disconnected',
              from: nickname,
              callId,
            });
          } else if (currentCall.room) {
            server.to(currentCall.room).emit('callEnded', {
              reason: 'Call ended: participant disconnected',
              from: nickname,
              callId,
            });
            server.to(currentCall.room).emit('endCall', {
              reason: 'Call ended: participant disconnected',
              from: nickname,
              callId,
            });
          }
        }
      }, gracePeriodMs);

      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }

      this.callDisconnectTimers.set(callId, timer);
    }
  }

  handleLeaveRoom(server: Server, socketId: string) {
    if (!socketId) return;
    const activeCall = this.findCallBySocketId(socketId);
    if (!activeCall) return;

    if (activeCall.ringTimer) clearTimeout(activeCall.ringTimer);
    this.clearCallDisconnectTimer(activeCall.callId);
    this.activeCallSessions.delete(activeCall.callId);

    const peerId =
      activeCall.callerSocketId === socketId
        ? activeCall.calleeSocketId
        : activeCall.callerSocketId;

    if (peerId) {
      server.to(peerId).emit('callEnded', {
        reason: 'Call ended: participant left the room.',
        callId: activeCall.callId,
      });
      server.to(peerId).emit('endCall', {
        reason: 'Call ended: participant left the room.',
        callId: activeCall.callId,
      });
    } else if (activeCall.room) {
      server.to(activeCall.room).emit('callEnded', {
        reason: 'Call ended: participant left the room.',
        callId: activeCall.callId,
      });
      server.to(activeCall.room).emit('endCall', {
        reason: 'Call ended: participant left the room.',
        callId: activeCall.callId,
      });
    }
  }

  terminateCallForSocket(
    server: Server,
    socketId: string,
    reason: string,
    clientReason?: string,
  ) {
    if (!socketId) return;
    const activeCall = this.findCallBySocketId(socketId);
    if (!activeCall) return;

    if (activeCall.ringTimer) clearTimeout(activeCall.ringTimer);
    this.clearCallDisconnectTimer(activeCall.callId);
    this.activeCallSessions.delete(activeCall.callId);

    const peerId =
      activeCall.callerSocketId === socketId
        ? activeCall.calleeSocketId
        : activeCall.callerSocketId;

    if (peerId) {
      server.to(peerId).emit('callEnded', {
        reason: this.sanitizeReason(reason, 'Call terminated'),
        callId: activeCall.callId,
      });
      server.to(peerId).emit('endCall', {
        reason: this.sanitizeReason(reason, 'Call terminated'),
        callId: activeCall.callId,
      });
    }
    if (clientReason) {
      server.to(socketId).emit('callEnded', {
        reason: this.sanitizeReason(clientReason, 'Call terminated'),
        callId: activeCall.callId,
      });
      server.to(socketId).emit('endCall', {
        reason: this.sanitizeReason(clientReason, 'Call terminated'),
        callId: activeCall.callId,
      });
    }
  }

  rebindReconnectingUser(
    server: Server,
    client: Socket,
    roomPasscode: string,
    nickname: string,
  ) {
    if (!client?.id || !roomPasscode || !nickname) return;
    const cleanRoom = roomPasscode.trim().toLowerCase();
    const normNick = nickname.trim().toLowerCase();

    for (const session of this.activeCallSessions.values()) {
      if (
        session.room?.trim().toLowerCase() === cleanRoom &&
        (session.state === 'active' || session.state === 'calling')
      ) {
        let reconnected = false;
        let peerId: string | undefined;

        if (session.callerNickname?.trim().toLowerCase() === normNick) {
          session.callerSocketId = client.id;
          peerId = session.calleeSocketId;
          reconnected = true;
        } else if (session.calleeNickname?.trim().toLowerCase() === normNick) {
          session.calleeSocketId = client.id;
          peerId = session.callerSocketId;
          reconnected = true;
        }

        if (reconnected) {
          console.log(
            `[CallReconnected] ${nickname} reconnected to call ${session.callId} with socket ${client.id}`,
          );
          this.clearCallDisconnectTimer(session.callId);

          if (peerId) {
            server.to(peerId).emit('peerReconnected', {
              nickname,
              callId: session.callId,
              socketId: client.id,
            });
          }
          if (session.state === 'active') {
            client.emit('callRestored', {
              callId: session.callId,
              targetSocketId: peerId,
              isVoiceOnly: session.isVoiceOnly,
            });
          } else if (
            session.state === 'calling' &&
            session.calleeSocketId === client.id
          ) {
            client.emit('userCalling', {
              callerName: session.callerNickname,
              from: session.callerNickname,
              callerSocketId: session.callerSocketId,
              targetSocketId: client.id,
              isVoiceOnly: session.isVoiceOnly,
              callId: session.callId,
            });
            client.emit('callUser', {
              callerName: session.callerNickname,
              from: session.callerNickname,
              callerSocketId: session.callerSocketId,
              targetSocketId: client.id,
              isVoiceOnly: session.isVoiceOnly,
              callId: session.callId,
            });
          }
        }
      }
    }
  }
}
