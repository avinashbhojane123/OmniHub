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
    const key = (passcode || '').trim().toLowerCase();
    const timer = this.watchPartyBufferTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.watchPartyBufferTimers.delete(key);
    }
  }

  clearWatchPartyDisconnectTimer(passcode: string) {
    const key = (passcode || '').trim().toLowerCase();
    const timer = this.watchPartyDisconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.watchPartyDisconnectTimers.delete(key);
    }
  }

  getLeadTimeMs(): number {
    const raw = process.env.WATCH_PARTY_LEAD_TIME_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed >= 0 ? parsed : 300;
  }

  getSyncToleranceMs(): number {
    const raw = process.env.WATCH_PARTY_SYNC_TOLERANCE_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed >= 0 ? parsed : 500;
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
    const normPasscode = targetPasscode.toLowerCase();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== normPasscode
    ) {
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

    let state = this.watchPartyRooms.get(normPasscode);
    const now = Date.now();

    // Cancel pending eviction timer if users are actively interacting
    if (this.watchPartyCleanupTimers.has(normPasscode)) {
      clearTimeout(this.watchPartyCleanupTimers.get(normPasscode));
      this.watchPartyCleanupTimers.delete(normPasscode);
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
        version: data.version || 1,
        lastActorNickname: session.nickname,
        hostNickname: session.nickname,
        isHostOnly: false,
        isBuffering: false,
        bufferingUsers: [],
        queue: [],
      };
      this.watchPartyRooms.set(normPasscode, state);
    }

    // Enforce host-only permissions when lock is active
    if (
      state.isHostOnly &&
      session.nickname.trim().toLowerCase() !==
        (state.hostNickname || '').trim().toLowerCase() &&
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
        const acceptScheduledStart = now + this.getLeadTimeMs() + 50;
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
          Math.abs(now - state.scheduledStartServerTime) <
            this.getSyncToleranceMs()
        ) {
          return { success: true };
        }
        const playScheduledStart = now + this.getLeadTimeMs();
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
          const seekScheduledStart = now + this.getLeadTimeMs();
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
        const nickTrim = session.nickname.trim();
        const nickLower = nickTrim.toLowerCase();
        if (
          !state.bufferingUsers.some(
            (u) => (u || '').trim().toLowerCase() === nickLower,
          )
        ) {
          state.bufferingUsers.push(nickTrim);
        }
        state.isBuffering = true;
        state.currentTime = currentPos;
        state.lastUpdatedTimestamp = now;
        state.scheduledStartServerTime = undefined;
        state.version = (state.version || 0) + 1;

        this.clearWatchPartyBufferTimer(targetPasscode);
        const bufferTimeoutMs =
          Number(process.env.WATCH_PARTY_BUFFER_TIMEOUT_MS) || 10000;
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
        }, bufferTimeoutMs);
        this.watchPartyBufferTimers.set(targetPasscode, bufWatchdog);
        break;
      }

      case 'ready': {
        const nickLower = session.nickname.trim().toLowerCase();
        state.bufferingUsers = state.bufferingUsers.filter(
          (u) => (u || '').trim().toLowerCase() !== nickLower,
        );
        if (state.bufferingUsers.length === 0) {
          state.isBuffering = false;
          if (state.isPlaying) {
            const readyScheduledStart = now + this.getLeadTimeMs();
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
        this.clearWatchPartyBufferTimer(normPasscode);
        this.watchPartyRooms.delete(normPasscode);
        server.to(targetPasscode).to(normPasscode).emit('watchPartyClosed', {
          closedBy: session.nickname,
        });
        return { success: true };
      }

      case 'toggle_host_lock': {
        if (
          session.nickname.trim().toLowerCase() ===
          (state.hostNickname || '').trim().toLowerCase()
        ) {
          state.isHostOnly = !state.isHostOnly;
          state.lastUpdatedTimestamp = now;
          state.version = (state.version || 0) + 1;
        }
        break;
      }

      case 'suggest_video': {
        const item = data.queueItem || {
          id: data.queueId || data.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          url: data.url || (data.videoSource ? data.videoSource.url : ''),
          title: data.title || (data.videoSource ? data.videoSource.title : 'Suggested Video'),
          suggestedBy: data.suggestedBy || session.nickname,
        };
        if (!state.queue) state.queue = [];
        state.queue.push(item);
        state.lastActorNickname = session.nickname;
        state.lastUpdatedTimestamp = now;
        break;
      }

      case 'play_queue_item': {
        const targetId = data.queueId || data.id;
        const currentQueue = state.queue || [];
        const targetItem = currentQueue.find((q) => q.id === targetId);
        state.queue = currentQueue.filter((q) => q.id !== targetId);

        const nextSource = data.videoSource || (targetItem ? {
          url: targetItem.url,
          title: targetItem.title,
          type: (targetItem.url.includes('youtube.com') || targetItem.url.includes('youtu.be')) ? ('youtube' as const) : ('direct' as const),
        } : state.videoSource);

        state.videoSource = nextSource;
        state.currentTime = 0;
        state.isPlaying = true;
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

      case 'remove_queue_item': {
        const targetId = data.queueId || data.id;
        state.queue = (state.queue || []).filter((q) => q.id !== targetId);
        state.lastActorNickname = session.nickname;
        state.lastUpdatedTimestamp = now;
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
      queue: state.queue || [],
      serverTime: now,
    };

    server
      .to(targetPasscode)
      .to(normPasscode)
      .emit('watchPartyUpdate', payload);
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
    const normPasscode = targetPasscode.toLowerCase();
    if (
      !session ||
      !targetPasscode ||
      session.passcode.trim().toLowerCase() !== normPasscode
    ) {
      return { success: false, message: 'Unauthorized session' };
    }

    if (this.watchPartyCleanupTimers.has(normPasscode)) {
      clearTimeout(this.watchPartyCleanupTimers.get(normPasscode));
      this.watchPartyCleanupTimers.delete(normPasscode);
    }

    const state = this.watchPartyRooms.get(normPasscode);
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
      queue: state.queue || [],
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
    if (
      !session ||
      !targetPasscode ||
      session.passcode.toLowerCase() !== targetPasscode.toLowerCase()
    ) {
      return;
    }

    const emojiOrReaction = data.emoji || data.reaction;
    server
      .to(targetPasscode)
      .to(targetPasscode.toLowerCase())
      .emit('watchPartyReaction', {
        from: session.nickname,
        reaction: emojiOrReaction,
        emoji: emojiOrReaction,
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
    if (
      !session ||
      !targetPasscode ||
      session.passcode.toLowerCase() !== targetPasscode.toLowerCase()
    ) {
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
        server
          .to(targetPasscode)
          .to(targetPasscode.toLowerCase())
          .emit('userMuteToggled', {
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

    server
      .to(targetPasscode)
      .to(targetPasscode.toLowerCase())
      .emit('watchPartyComment', {
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

    // Auto-pause Watch Party if a user leaves/disconnects during active movie playback
    if (wpState && wpState.isActive && wpState.isPlaying) {
      const disconnectGraceMs =
        Number(process.env.WATCH_PARTY_DISCONNECT_GRACE_PERIOD_MS) || 5000;
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
      }, disconnectGraceMs);
      this.watchPartyDisconnectTimers.set(passcode, timer);
    }

    // Clean up in-memory Watch Party state with a grace period if no users remain
    if (!anyUserInRoom) {
      const cleanupGraceMs =
        Number(process.env.WATCH_PARTY_ROOM_CLEANUP_MS) || 60000;
      const existingTimer = this.watchPartyCleanupTimers.get(passcode);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.watchPartyCleanupTimers.delete(passcode);
        if (!anyUserInRoom) {
          this.watchPartyRooms.delete(passcode);
        }
      }, cleanupGraceMs);
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
