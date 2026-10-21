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
    for (const session of this.activeCallSessions.values()) {
      if (
        session.callerSocketId === socketId ||
        session.calleeSocketId === socketId
      ) {
        return session;
      }
    }
    return undefined;
  }

  clearCallDisconnectTimer(callId: string) {
    const timer = this.callDisconnectTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.callDisconnectTimers.delete(callId);
    }
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
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();

    if (session.isMuted) {
      const roomEntity = await this.roomRepo.findOne({
        where: { passcode: room },
      });
      const callerUser = roomEntity
        ? await this.userRepo.findOne({
            where: { nickname: session.nickname, roomId: roomEntity.id },
          })
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
        const remainingMinutes = callerUser?.mutedUntil
          ? Math.ceil(
              (new Date(callerUser.mutedUntil).getTime() - Date.now()) / 60000,
            )
          : null;
        client.emit('callError', {
          message: remainingMinutes
            ? `You are muted for ${remainingMinutes} more minute(s) and cannot place calls.`
            : 'You have been muted by the host and cannot place calls.',
        });
        return;
      }
    }

    // Clean up any stale call sessions previously initiated by this socket
    const prevCall = this.findCallBySocketId(client.id);
    if (prevCall) {
      if (prevCall.ringTimer) clearTimeout(prevCall.ringTimer);
      this.activeCallSessions.delete(prevCall.callId);
    }

    // Resolve target socket (explicit socket ID, targeted nickname, or other participant in 2-person room)
    let target: { socketId: string; nickname: string } | undefined;
    if (data.targetSocketId) {
      const targetSession = usersMap.get(data.targetSocketId);
      if (targetSession && targetSession.passcode.trim() === room) {
        target = {
          socketId: data.targetSocketId,
          nickname: targetSession.nickname,
        };
      }
    } else {
      target = findSocketInRoom(room, data.targetNickname, client.id);
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
        const roomEntity = await this.roomRepo.findOne({
          where: { passcode: room },
        });
        const targetDbUser = roomEntity
          ? await this.userRepo.findOne({
              where: {
                nickname: targetSession.nickname,
                roomId: roomEntity.id,
              },
            })
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
          targetActiveCall.calleeSocketId === client.id
        ) {
          const myNick = session.nickname.toLowerCase();
          const peerNick = target.nickname.toLowerCase();
          if (myNick > peerNick) {
            client.emit('callInfo', {
              message: `${target.nickname} is already calling you.`,
            });
            return;
          } else {
            if (targetActiveCall.ringTimer)
              clearTimeout(targetActiveCall.ringTimer);
            this.activeCallSessions.delete(targetActiveCall.callId);
          }
        } else if (targetActiveCall.state === 'calling') {
          client.emit('callBusy', {
            nickname: target.nickname,
            reason: 'User is currently placing or receiving another call.',
          });
          return;
        }
      }
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

    // Auto-timeout ring timer (35 seconds)
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
        }
      }
    }, 35000);

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

  acceptCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: AcceptCallDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    if (session.isMuted) {
      client.emit('callError', {
        message:
          'You have been muted by the host and cannot join voice or video calls.',
      });
      return;
    }

    const room = session.passcode.trim();

    const callSession =
      (data.callId && this.activeCallSessions.get(data.callId)) ||
      this.findCallBySocketId(client.id) ||
      Array.from(this.activeCallSessions.values()).find(
        (c) => c.room === room && c.state === 'calling',
      );

    if (callSession) {
      if (callSession.ringTimer) {
        clearTimeout(callSession.ringTimer);
        callSession.ringTimer = undefined;
      }
      callSession.state = 'active';
      callSession.calleeSocketId = client.id;
      callSession.calleeNickname = session.nickname;
    }

    console.log(
      `[AcceptCall] ${session.nickname} accepted call in room: ${room}`,
    );

    const acceptPayload = {
      receiverName: data.receiverName || session.nickname,
      from: session.nickname,
      receiverSocketId: client.id,
      callId: callSession?.callId,
    };

    if (callSession?.callerSocketId) {
      server.to(callSession.callerSocketId).emit('callAccepted', acceptPayload);
      server.to(callSession.callerSocketId).emit('acceptCall', acceptPayload);
    } else if (data.targetSocketId) {
      const targetSession = usersMap.get(data.targetSocketId);
      if (targetSession && targetSession.passcode.trim() === room) {
        server.to(data.targetSocketId).emit('callAccepted', acceptPayload);
        server.to(data.targetSocketId).emit('acceptCall', acceptPayload);
      }
    }
    client.to(room).emit('callAccepted', acceptPayload);
    client.to(room).emit('acceptCall', acceptPayload);
  }

  declineCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: DeclineCallDto,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    console.log(
      `[DeclineCall] ${session.nickname} declined the call in room: ${room}`,
    );

    const callSession = this.findCallBySocketId(client.id);
    if (callSession) {
      if (callSession.ringTimer) clearTimeout(callSession.ringTimer);
      this.clearCallDisconnectTimer(callSession.callId);
      this.activeCallSessions.delete(callSession.callId);
    }

    const declinePayload = {
      receiverName: data.receiverName || session.nickname,
      from: session.nickname,
      reason: data.reason || 'Call declined',
      callId: callSession?.callId,
    };

    if (callSession?.callerSocketId) {
      server
        .to(callSession.callerSocketId)
        .emit('callDeclined', declinePayload);
      server.to(callSession.callerSocketId).emit('declineCall', declinePayload);
    } else if (data.targetSocketId) {
      server.to(data.targetSocketId).emit('callDeclined', declinePayload);
      server.to(data.targetSocketId).emit('declineCall', declinePayload);
    }
    client.to(room).emit('callDeclined', declinePayload);
    client.to(room).emit('declineCall', declinePayload);
  }

  webrtcOffer(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcOfferDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    console.log(
      `[WebRTCOffer] Relaying WebRTC offer from ${session.nickname} in room: ${room}`,
    );

    const callSession = this.findCallBySocketId(client.id);

    const offerPayload = {
      offer: data.offer,
      from: session.nickname,
      callerName: data.callerName || session.nickname,
      callerSocketId: client.id,
      callId: callSession?.callId,
    };

    const targetSocketId =
      data.targetSocketId ||
      (callSession && callSession.callerSocketId === client.id
        ? callSession.calleeSocketId
        : undefined);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (targetSession && targetSession.passcode.trim() === room) {
        server.to(targetSocketId).emit('webrtcOffer', offerPayload);
      }
    } else {
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
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    console.log(
      `[WebRTCAnswer] Relaying WebRTC answer from ${session.nickname} in room: ${room}`,
    );

    const callSession = this.findCallBySocketId(client.id);

    const answerPayload = {
      answer: data.answer,
      from: session.nickname,
      receiverName: data.receiverName || session.nickname,
      receiverSocketId: client.id,
      callId: callSession?.callId,
    };

    const targetSocketId =
      data.targetSocketId ||
      (callSession && callSession.calleeSocketId === client.id
        ? callSession.callerSocketId
        : undefined);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (targetSession && targetSession.passcode.trim() === room) {
        server.to(targetSocketId).emit('webrtcAnswer', answerPayload);
        server.to(targetSocketId).emit('callAccepted', {
          receiverName: data.receiverName || session.nickname,
          from: session.nickname,
        });
      }
    } else {
      client.to(room).emit('webrtcAnswer', answerPayload);
      client.to(room).emit('callAccepted', {
        receiverName: data.receiverName || session.nickname,
        from: session.nickname,
      });
    }
  }

  webrtcCandidate(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcCandidateDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    const candidatePayload = {
      candidate: data.candidate,
      fromSocketId: client.id,
    };

    const callSession = this.findCallBySocketId(client.id);
    const targetSocketId =
      data.targetSocketId ||
      (callSession
        ? callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId
        : undefined);

    if (targetSocketId) {
      const targetSession = usersMap.get(targetSocketId);
      if (targetSession && targetSession.passcode.trim() === room) {
        server.to(targetSocketId).emit('webrtcCandidate', candidatePayload);
      }
    } else {
      client.to(room).emit('webrtcCandidate', candidatePayload);
    }
  }

  endCall(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: EndCallDto,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    console.log(`[EndCall] Relaying endCall in room: ${room}`);

    const callSession = this.findCallBySocketId(client.id);
    if (callSession) {
      if (callSession.ringTimer) clearTimeout(callSession.ringTimer);
      this.clearCallDisconnectTimer(callSession.callId);
      this.activeCallSessions.delete(callSession.callId);

      const peerSocketId =
        callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId;

      if (peerSocketId) {
        server.to(peerSocketId).emit('callEnded', {
          reason: data.reason || 'Call ended by participant',
          from: session.nickname,
          callId: callSession.callId,
        });
        server.to(peerSocketId).emit('endCall', {
          reason: data.reason || 'Call ended by participant',
          from: session.nickname,
          callId: callSession.callId,
        });
      }
    }

    client.to(room).emit('callEnded', {
      reason: data.reason || 'Call ended',
      from: session.nickname,
    });
    client.to(room).emit('endCall', {
      reason: data.reason || 'Call ended',
      from: session.nickname,
    });
  }

  getIceServers(client: Socket, session: UserSession | undefined) {
    const stunServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];

    const turnUrl = process.env.TURN_SERVER_URL;
    const turnSecret = process.env.TURN_SECRET;

    const iceServers: any[] = [...stunServers];

    if (turnUrl && turnSecret && session) {
      try {
        const ttl = 86400;
        const timestamp = Math.floor(Date.now() / 1000) + ttl;
        const username = `${timestamp}:${session.nickname}`;
        const hmac = crypto.createHmac('sha1', turnSecret);
        hmac.update(username);
        const credential = hmac.digest('base64');

        iceServers.push({
          urls: turnUrl.split(',').map((u) => u.trim()),
          username,
          credential,
        });
      } catch (err) {
        console.warn('Failed generating dynamic HMAC TURN credential:', err);
      }
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
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    session.isPip = data.isPip;
    const room = session.passcode.trim();

    console.log(
      `[TogglePip] ${session.nickname} set PIP mode to ${data.isPip} in room: ${room}`,
    );
    client.to(room).emit('pipStateChanged', {
      nickname: session.nickname,
      isPip: data.isPip,
    });
  }

  screenShareStatus(
    client: Socket,
    session: UserSession | undefined,
    data: ScreenShareStatusDto,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    console.log(
      `[ScreenShareStatus] ${session.nickname} screen sharing: ${data.isSharing} in room: ${room}`,
    );
    client.to(room).emit('screenShareStatus', {
      isSharing: data.isSharing,
      from: session.nickname,
    });
  }

  webrtcMediaState(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WebrtcMediaStateDto,
    usersMap: Map<string, UserSession>,
  ) {
    if (!session || session.passcode.trim() !== data.passcode?.trim()) return;

    const room = session.passcode.trim();
    const callSession = this.findCallBySocketId(client.id);
    const targetSocketId =
      data.targetSocketId ||
      (callSession
        ? callSession.callerSocketId === client.id
          ? callSession.calleeSocketId
          : callSession.callerSocketId
        : undefined);

    const isMicMuted =
      data.micMuted !== undefined ? data.micMuted : data.isAudioMuted;
    const isCameraOff =
      data.cameraOff !== undefined ? data.cameraOff : data.isVideoMuted;

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
      if (targetSession && targetSession.passcode.trim() === room) {
        server.to(targetSocketId).emit('webrtcMediaState', payload);
      }
    } else {
      client.to(room).emit('webrtcMediaState', payload);
    }
  }

  handleDisconnect(server: Server, socketId: string, userInfo: UserSession) {
    const existingCall = this.findCallBySocketId(socketId);
    if (existingCall) {
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
            from: userInfo.nickname,
            callId: existingCall.callId,
          });
        }
      } else if (existingCall.state === 'active') {
        console.log(
          `[CallGracePeriod] Socket ${socketId} (${userInfo.nickname}) disconnected during active call ${existingCall.callId}. Starting 12s grace period.`,
        );

        const peerSocketId =
          existingCall.callerSocketId === socketId
            ? existingCall.calleeSocketId
            : existingCall.callerSocketId;

        if (peerSocketId) {
          server.to(peerSocketId).emit('peerReconnecting', {
            nickname: userInfo.nickname,
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
                from: userInfo.nickname,
                callId,
              });
            }
            if (currentCall.room) {
              server.to(currentCall.room).emit('callEnded', {
                reason: 'Call ended: participant disconnected',
                from: userInfo.nickname,
                callId,
              });
            }
          }
        }, 12000);

        this.callDisconnectTimers.set(callId, timer);
      }
    }
  }

  handleLeaveRoom(server: Server, socketId: string) {
    const activeCall = this.findCallBySocketId(socketId);
    if (activeCall) {
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
      }
    }
  }

  terminateCallForSocket(
    server: Server,
    socketId: string,
    reason: string,
    clientReason?: string,
  ) {
    const activeCall = this.findCallBySocketId(socketId);
    if (activeCall) {
      if (activeCall.ringTimer) clearTimeout(activeCall.ringTimer);
      this.clearCallDisconnectTimer(activeCall.callId);
      this.activeCallSessions.delete(activeCall.callId);
      const peerId =
        activeCall.callerSocketId === socketId
          ? activeCall.calleeSocketId
          : activeCall.callerSocketId;
      if (peerId) {
        server.to(peerId).emit('callEnded', {
          reason,
          callId: activeCall.callId,
        });
      }
      if (clientReason) {
        server.to(socketId).emit('callEnded', {
          reason: clientReason,
          callId: activeCall.callId,
        });
      }
    }
  }

  rebindReconnectingUser(
    server: Server,
    client: Socket,
    roomPasscode: string,
    nickname: string,
  ) {
    for (const session of this.activeCallSessions.values()) {
      if (session.room === roomPasscode && session.state === 'active') {
        let reconnected = false;
        let peerId: string | undefined;

        if (session.callerNickname === nickname) {
          session.callerSocketId = client.id;
          peerId = session.calleeSocketId;
          reconnected = true;
        } else if (session.calleeNickname === nickname) {
          session.calleeSocketId = client.id;
          peerId = session.callerSocketId;
          reconnected = true;
        }

        if (reconnected) {
          console.log(
            `[CallReconnected] ${nickname} reconnected to active call ${session.callId} with socket ${client.id}`,
          );
          this.clearCallDisconnectTimer(session.callId);

          if (peerId) {
            server.to(peerId).emit('peerReconnected', {
              nickname,
              callId: session.callId,
              socketId: client.id,
            });
          }
          client.emit('callRestored', {
            callId: session.callId,
            targetSocketId: peerId,
            isVoiceOnly: session.isVoiceOnly,
          });
        }
      }
    }
  }
}
