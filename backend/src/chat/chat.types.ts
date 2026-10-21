export interface UserSession {
  nickname: string;
  passcode: string;
  isPip?: boolean;
  isMuted?: boolean;
  role?: 'host' | 'admin' | 'member';
}

export interface ActiveCallSession {
  callId: string;
  room: string;
  callerSocketId: string;
  callerNickname: string;
  calleeSocketId?: string;
  calleeNickname?: string;
  isVoiceOnly?: boolean;
  state: 'calling' | 'active' | 'ended';
  startedAt: number;
  ringTimer?: NodeJS.Timeout;
}

export interface WatchPartyState {
  isActive: boolean;
  videoSource: {
    url: string;
    title: string;
    type?: 'direct' | 'youtube' | 'embed';
    duration?: number;
    provider?: string;
    originalUrl?: string;
  } | null;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  lastUpdatedTimestamp: number;
  scheduledStartServerTime?: number;
  version: number;
  lastActorNickname: string;
  isBuffering: boolean;
  bufferingUsers: string[];
  hostNickname?: string;
  isHostOnly?: boolean;
}

export interface RoomWallpaperState {
  theme: string;
  customWallpaper: string | null;
}
