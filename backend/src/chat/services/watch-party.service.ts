import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import {
  WatchPartyActionDto,
  WatchPartyClockPingDto,
  GetWatchPartyDto,
  WatchPartyReactionDto,
  WatchPartyCommentDto,
} from '../dto/watch-party.dto';
import { WatchPartyState, UserSession } from '../chat.types';

@Injectable()
export class WatchPartyService implements OnModuleDestroy {
  private watchPartyRooms = new Map<string, WatchPartyState>();
  private watchPartyCleanupTimers = new Map<string, NodeJS.Timeout>();
  private watchPartyBufferTimers = new Map<string, NodeJS.Timeout>();
  private watchPartyDisconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleDestroy() {
    for (const timer of this.watchPartyCleanupTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.watchPartyBufferTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.watchPartyDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.watchPartyCleanupTimers.clear();
    this.watchPartyBufferTimers.clear();
    this.watchPartyDisconnectTimers.clear();
    this.watchPartyRooms.clear();
  }

  clearWatchPartyBufferTimer(passcode: string) {
    const timer = this.watchPartyBufferTimers.get(passcode);
    if (timer) {
      clearTimeout(timer);
      this.watchPartyBufferTimers.delete(passcode);
    }
  }

  clearWatchPartyDisconnectTimer(passcode: string) {
    const timer = this.watchPartyDisconnectTimers.get(passcode);
    if (timer) {
      clearTimeout(timer);
      this.watchPartyDisconnectTimers.delete(passcode);
    }
  }

  getCalculatedWatchPartyPosition(state: WatchPartyState): number {
    if (!state.isPlaying || state.isBuffering) {
      return state.currentTime;
    }
    const now = Date.now();
    if (
      state.scheduledStartServerTime &&
      state.scheduledStartServerTime > now
    ) {
      return state.currentTime;
    }
    const anchorTime =
      state.scheduledStartServerTime || state.lastUpdatedTimestamp;
    const elapsedSec =
      Math.max(0, (now - anchorTime) / 1000) * (state.playbackRate || 1);
    const calculated = state.currentTime + elapsedSec;
    if (
      state.videoSource?.duration &&
      state.videoSource.duration > 0 &&
      calculated > state.videoSource.duration
    ) {
      return state.videoSource.duration;
    }
    return Math.max(0, isNaN(calculated) ? 0 : calculated);
  }

  handleWatchPartyAction(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WatchPartyActionDto,
    checkRateLimit: (
      client: Socket,
      maxLimit?: number,
      windowMs?: number,
    ) => boolean,
  ) {
    const targetPasscode = (data.passcode || session?.passcode || '').trim();
    if (!session || !targetPasscode || session.passcode !== targetPasscode) {
      return { success: false, message: 'Unauthorized session' };
    }

    if (session.isMuted) {
      client.emit('error', {
        message:
          'You have been muted by the host and cannot control the watch party.',
      });
      return {
        success: false,
        message:
          'You have been muted by the host and cannot control the watch party.',
      };
    }

    let state = this.watchPartyRooms.get(targetPasscode);
    const now = Date.now();

    // Cancel pending eviction timer if users are actively interacting
    if (this.watchPartyCleanupTimers.has(targetPasscode)) {
      clearTimeout(this.watchPartyCleanupTimers.get(targetPasscode));
      this.watchPartyCleanupTimers.delete(targetPasscode);
    }

    if (!state) {
      state = {
        isActive: true,
        videoSource: data.videoSource || null,
        currentTime: data.currentTime || 0,
        isPlaying: Boolean(data.isPlaying),
        playbackRate: data.playbackRate || 1,
        lastUpdatedTimestamp: now,
        scheduledStartServerTime: undefined,
        version: 1,
        lastActorNickname: session.nickname,
        hostNickname: session.nickname,
        isHostOnly: false,
        isBuffering: false,
        bufferingUsers: [],
      };
      this.watchPartyRooms.set(targetPasscode, state);
    }

    // Enforce host-only permissions when lock is active
    if (
      state.isHostOnly &&
      session.nickname !== state.hostNickname &&
      ['play', 'pause', 'seek', 'rate', 'change_video'].includes(data.action)
    ) {
      return {
        success: false,
        message: 'Only the party host can control movie playback',
      };
    }

    if (session.isMuted) {
      return {
        success: false,
        message: 'You are muted and cannot initiate or control Watch Party',
      };
    }

    const currentPos = this.getCalculatedWatchPartyPosition(state);

    switch (data.action) {
      case 'open':
      case 'invite': {
        if (!checkRateLimit(client, 2, 6000)) {
          return {
            success: false,
            message: 'Please wait between Watch Party invites.',
          };
        }
        state.isActive = true;
        if (data.videoSource) state.videoSource = data.videoSource;
        if (data.currentTime !== undefined)
          state.currentTime = data.currentTime;
        state.lastActorNickname = session.nickname;
        state.lastUpdatedTimestamp = now;
        state.version = (state.version || 0) + 1;
        client.to(targetPasscode).emit('watchPartyInvite', {
          from: session.nickname,
          videoSource: state.videoSource,
          timestamp: now,
        });
        break;
      }

      case 'accept': {
        state.isActive = true;
        state.isPlaying = true;
        state.currentTime =
          currentPos > 0
            ? currentPos
            : data.currentTime !== undefined
              ? data.currentTime
              : state.currentTime || 0;
        const acceptScheduledStart = now + 350;
        state.lastUpdatedTimestamp = acceptScheduledStart;
        state.scheduledStartServerTime = acceptScheduledStart;
        state.lastActorNickname = session.nickname;
        state.isBuffering = false;
        state.bufferingUsers = [];
        state.version = (state.version || 0) + 1;
        server.to(targetPasscode).emit('watchPartyAccepted', {
          acceptedBy: session.nickname,
          videoSource: state.videoSource,
          scheduledStartServerTime: acceptScheduledStart,
          currentTime: state.currentTime,
        });
        break;
      }

      case 'decline': {
        client.to(targetPasscode).emit('watchPartyDeclined', {
          declinedBy: session.nickname,
        });
        return { success: true };
      }

      case 'play': {
        if (
          state.isPlaying &&
          state.scheduledStartServerTime &&
          Math.abs(now - state.scheduledStartServerTime) < 500
        ) {
          return { success: true };
        }
        const playScheduledStart = now + 300;
        state.isPlaying = true;
        state.currentTime =
          data.currentTime !== undefined ? data.currentTime : currentPos;
        state.lastUpdatedTimestamp = playScheduledStart;
        state.scheduledStartServerTime = playScheduledStart;
        state.lastActorNickname = session.nickname;
        state.isBuffering = false;
        state.bufferingUsers = [];
        state.version = (state.version || 0) + 1;
        break;
      }

      case 'pause': {
        if (
          !state.isPlaying &&
          (data.currentTime === undefined ||
            Math.abs(data.currentTime - state.currentTime) < 0.5)
        ) {
          return { success: true };
        }
        state.isPlaying = false;
        state.currentTime =
          data.currentTime !== undefined ? data.currentTime : currentPos;
        state.lastUpdatedTimestamp = now;
        state.scheduledStartServerTime = undefined;
        state.lastActorNickname = session.nickname;
        state.version = (state.version || 0) + 1;
        break;
      }

      case 'seek': {
        state.currentTime =
          data.currentTime !== undefined ? Math.max(0, data.currentTime) : 0;
        if (data.isPlaying !== undefined) {
          state.isPlaying = data.isPlaying;
        }
        if (state.isPlaying) {
          const seekScheduledStart = now + 300;
          state.lastUpdatedTimestamp = seekScheduledStart;
          state.scheduledStartServerTime = seekScheduledStart;
        } else {
          state.lastUpdatedTimestamp = now;
          state.scheduledStartServerTime = undefined;
        }
        state.lastActorNickname = session.nickname;
        state.version = (state.version || 0) + 1;
        break;
      }

      case 'rate': {
        state.currentTime =
          data.currentTime !== undefined ? data.currentTime : currentPos;
        state.playbackRate = data.playbackRate || 1;
        state.lastUpdatedTimestamp = now;
        state.scheduledStartServerTime = undefined;
        state.lastActorNickname = session.nickname;
        state.version = (state.version || 0) + 1;
        break;
      }

      case 'change_video': {
        state.videoSource = data.videoSource || null;
        state.currentTime = 0;
        state.isPlaying = false;
        state.playbackRate = 1;
        state.lastUpdatedTimestamp = now;
        state.scheduledStartServerTime = undefined;
        state.lastActorNickname = session.nickname;
        state.isBuffering = false;
        state.bufferingUsers = [];
        state.isActive = true;
        state.version = (state.version || 0) + 1;
        this.clearWatchPartyBufferTimer(targetPasscode);
        break;
      }

      case 'buffering': {
        if (!state.bufferingUsers.includes(session.nickname)) {
          state.bufferingUsers.push(session.nickname);
        }
        state.isBuffering = true;
        state.currentTime = currentPos;
        state.lastUpdatedTimestamp = now;
        state.scheduledStartServerTime = undefined;
        state.version = (state.version || 0) + 1;

        this.clearWatchPartyBufferTimer(targetPasscode);
        const bufWatchdog = setTimeout(() => {
          this.watchPartyBufferTimers.delete(targetPasscode);
          const st = this.watchPartyRooms.get(targetPasscode);
          if (st && st.isBuffering) {
            st.isBuffering = false;
            st.bufferingUsers = [];
            st.lastUpdatedTimestamp = Date.now();
            st.scheduledStartServerTime = undefined;
            st.version = (st.version || 0) + 1;
            server.to(targetPasscode).emit('watchPartyUpdate', {
              action: 'ready',
              videoSource: st.videoSource,
              currentTime: st.currentTime,
              isPlaying: st.isPlaying,
              playbackRate: st.playbackRate,
              isBuffering: false,
              bufferingUsers: [],
              lastUpdatedTimestamp: st.lastUpdatedTimestamp,
              scheduledStartServerTime: undefined,
              version: st.version,
              lastActorNickname: 'Auto-Watchdog',
              hostNickname: st.hostNickname,
              serverTime: Date.now(),
            });
          }
        }, 10000);
        this.watchPartyBufferTimers.set(targetPasscode, bufWatchdog);
        break;
      }

      case 'ready': {
        state.bufferingUsers = state.bufferingUsers.filter(
          (u) => u !== session.nickname,
        );
        if (state.bufferingUsers.length === 0) {
          state.isBuffering = false;
          if (state.isPlaying) {
            const readyScheduledStart = now + 300;
            state.lastUpdatedTimestamp = readyScheduledStart;
            state.scheduledStartServerTime = readyScheduledStart;
          } else {
            state.lastUpdatedTimestamp = now;
            state.scheduledStartServerTime = undefined;
          }
          this.clearWatchPartyBufferTimer(targetPasscode);
        }
        state.version = (state.version || 0) + 1;
        break;
      }

      case 'sync_tick':
      case 'heartbeat': {
        if (state.isPlaying && !state.isBuffering) {
          state.currentTime = currentPos;
          state.lastUpdatedTimestamp = now;
        }
        break;
      }

      case 'close': {
        state.isActive = false;
        state.isPlaying = false;
        this.clearWatchPartyBufferTimer(targetPasscode);
        this.watchPartyRooms.delete(targetPasscode);
        server.to(targetPasscode).emit('watchPartyClosed', {
          closedBy: session.nickname,
        });
        return { success: true };
      }

      case 'toggle_host_lock': {
        if (session.nickname === state.hostNickname) {
          state.isHostOnly = !state.isHostOnly;
          state.lastUpdatedTimestamp = now;
          state.version = (state.version || 0) + 1;
        }
        break;
      }
    }

    const payload = {
      action: data.action,
      videoSource: state.videoSource,
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      playbackRate: state.playbackRate,
      isBuffering: state.isBuffering,
      bufferingUsers: state.bufferingUsers,
      lastUpdatedTimestamp: state.lastUpdatedTimestamp,
      scheduledStartServerTime: state.scheduledStartServerTime,
      version: state.version || 1,
      lastActorNickname: session.nickname,
      hostNickname: state.hostNickname,
      isHostOnly: Boolean(state.isHostOnly),
      serverTime: now,
    };

    server.to(targetPasscode).emit('watchPartyUpdate', payload);
    return { success: true, state: payload };
  }

  handleWatchPartyClockPing(client: Socket, data: WatchPartyClockPingDto) {
    const serverTime = Date.now();
    return {
      clientSendTime: data?.clientSendTime || 0,
      serverTime,
    };
  }

  getWatchPartyState(
    client: Socket,
    session: UserSession | undefined,
    data: GetWatchPartyDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();
    if (!session || !targetPasscode || session.passcode !== targetPasscode) {
      return { success: false, message: 'Unauthorized session' };
    }

    if (this.watchPartyCleanupTimers.has(targetPasscode)) {
      clearTimeout(this.watchPartyCleanupTimers.get(targetPasscode));
      this.watchPartyCleanupTimers.delete(targetPasscode);
    }

    const state = this.watchPartyRooms.get(targetPasscode);
    if (!state || !state.isActive) {
      client.emit('watchPartyState', null);
      return { success: true, state: null };
    }

    const calculatedTime = this.getCalculatedWatchPartyPosition(state);
    const now = Date.now();
    const payload = {
      action: 'sync',
      videoSource: state.videoSource,
      currentTime: calculatedTime,
      isPlaying: state.isPlaying,
      playbackRate: state.playbackRate,
      isBuffering: state.isBuffering,
      bufferingUsers: state.bufferingUsers,
      lastUpdatedTimestamp: state.lastUpdatedTimestamp,
      scheduledStartServerTime: state.scheduledStartServerTime,
      version: state.version || 1,
      lastActorNickname: state.lastActorNickname,
      hostNickname: state.hostNickname,
      isHostOnly: Boolean(state.isHostOnly),
      serverTime: now,
    };

    client.emit('watchPartyState', payload);
    return { success: true, state: payload };
  }

  watchPartyReaction(
    server: Server,
    session: UserSession | undefined,
    data: WatchPartyReactionDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();
    if (!session || !targetPasscode || session.passcode !== targetPasscode) {
      return;
    }

    server.to(targetPasscode).emit('watchPartyReaction', {
      from: session.nickname,
      reaction: data.reaction,
      timestamp: Date.now(),
    });
  }

  async watchPartyComment(
    server: Server,
    client: Socket,
    session: UserSession | undefined,
    data: WatchPartyCommentDto,
  ) {
    const targetPasscode = (data?.passcode || session?.passcode || '').trim();
    if (!session || !targetPasscode || session.passcode !== targetPasscode) {
      return;
    }

    if (session.isMuted) {
      const room = await this.roomRepo.findOne({
        where: { passcode: targetPasscode },
      });
      const user = room
        ? await this.userRepo.findOne({
            where: { nickname: session.nickname, roomId: room.id },
          })
        : null;
      if (user?.mutedUntil && new Date(user.mutedUntil) <= new Date()) {
        user.isMuted = false;
        user.mutedUntil = null;
        await this.userRepo.save(user);
        session.isMuted = false;
        server.to(targetPasscode).emit('userMuteToggled', {
          targetNickname: user.nickname,
          isMuted: false,
          mutedBy: 'System (Timed Mute Expired)',
        });
      } else {
        client.emit('error', {
          message: 'You are muted and cannot post watch party comments.',
        });
        return;
      }
    }

    server.to(targetPasscode).emit('watchPartyComment', {
      id: `${Date.now()}-${Math.random()}`,
      from: session.nickname,
      text: data.text,
      top:
        typeof data.top === 'number'
          ? data.top
          : Math.floor(Math.random() * 60) + 15,
      timestamp: Date.now(),
    });
  }

  handleUserDisconnect(
    server: Server,
    passcode: string,
    nickname: string,
    anyUserInRoom: boolean,
  ) {
    const wpState = this.watchPartyRooms.get(passcode);
    if (
      wpState &&
      wpState.isActive &&
      wpState.bufferingUsers?.includes(nickname)
    ) {
      wpState.bufferingUsers = wpState.bufferingUsers.filter(
        (u) => u !== nickname,
      );
      if (wpState.bufferingUsers.length === 0) {
        wpState.isBuffering = false;
        wpState.lastUpdatedTimestamp = Date.now();
        wpState.scheduledStartServerTime = undefined;
        this.clearWatchPartyBufferTimer(passcode);
      }
      wpState.version = (wpState.version || 0) + 1;
      server.to(passcode).emit('watchPartyUpdate', {
        action: 'ready',
        videoSource: wpState.videoSource,
        currentTime: wpState.currentTime,
        isPlaying: wpState.isPlaying,
        playbackRate: wpState.playbackRate,
        isBuffering: wpState.isBuffering,
        bufferingUsers: wpState.bufferingUsers,
        lastUpdatedTimestamp: wpState.lastUpdatedTimestamp,
        scheduledStartServerTime: undefined,
        version: wpState.version,
        lastActorNickname: nickname,
        hostNickname: wpState.hostNickname,
        serverTime: Date.now(),
      });
    }

    // Auto-pause Watch Party if a user leaves/disconnects during active movie playback (with 5-second grace period)
    if (wpState && wpState.isActive && wpState.isPlaying) {
      this.clearWatchPartyDisconnectTimer(passcode);
      const timer = setTimeout(() => {
        this.watchPartyDisconnectTimers.delete(passcode);
        const currentWp = this.watchPartyRooms.get(passcode);
        if (currentWp && currentWp.isActive && currentWp.isPlaying) {
          currentWp.isPlaying = false;
          currentWp.currentTime =
            this.getCalculatedWatchPartyPosition(currentWp);
          currentWp.lastUpdatedTimestamp = Date.now();
          currentWp.scheduledStartServerTime = undefined;
          currentWp.version = (currentWp.version || 0) + 1;
          server.to(passcode).emit('watchPartyUpdate', {
            action: 'partner_disconnected',
            videoSource: currentWp.videoSource,
            currentTime: currentWp.currentTime,
            isPlaying: false,
            playbackRate: currentWp.playbackRate,
            isBuffering: false,
            bufferingUsers: currentWp.bufferingUsers || [],
            lastUpdatedTimestamp: currentWp.lastUpdatedTimestamp,
            scheduledStartServerTime: undefined,
            version: currentWp.version,
            lastActorNickname: nickname,
            hostNickname: currentWp.hostNickname,
            isHostOnly: currentWp.isHostOnly,
            serverTime: Date.now(),
          });
        }
      }, 5000);
      this.watchPartyDisconnectTimers.set(passcode, timer);
    }

    // Clean up in-memory Watch Party state with a 60-second grace period if no users remain
    if (!anyUserInRoom) {
      const existingTimer = this.watchPartyCleanupTimers.get(passcode);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.watchPartyCleanupTimers.delete(passcode);
        if (!anyUserInRoom) {
          this.watchPartyRooms.delete(passcode);
        }
      }, 60000);
      this.watchPartyCleanupTimers.set(passcode, timer);
    }
  }

  cleanupKickedUser(
    passcode: string,
    kickedNickname: string,
    hostNickname: string,
  ) {
    const wpState = this.watchPartyRooms.get(passcode);
    if (wpState) {
      if (
        wpState.bufferingUsers?.some(
          (u) => u.toLowerCase() === kickedNickname.toLowerCase(),
        )
      ) {
        wpState.bufferingUsers = wpState.bufferingUsers.filter(
          (u) => u.toLowerCase() !== kickedNickname.toLowerCase(),
        );
      }
      if (
        wpState.hostNickname?.toLowerCase() === kickedNickname.toLowerCase()
      ) {
        wpState.hostNickname = hostNickname;
        wpState.isHostOnly = false;
      }
    }
  }
}
