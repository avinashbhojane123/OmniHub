export type UserRole = 'host' | 'admin' | 'member';

export interface PollOption {
  id: number;
  text: string;
  votes: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
}

export interface LocationData {
  lat: number;
  lng: number;
  address?: string;
}

export interface ReplyReference {
  id?: number | string;
  nickname: string;
  message: string;
}

export interface ChatMessage {
  id: number | string;
  roomId?: number;
  nickname: string;
  message: string;
  createdAt: string | Date;
  replyTo?: ReplyReference | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  isVoiceNote?: boolean;
  isVideoNote?: boolean;
  isWithoutSound?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: Record<string, string[]> | null; // emoji -> array of nicknames
  expiresAt?: string | Date | null;
  pollData?: PollData | null;
  locationData?: LocationData | null;
  readBy?: string[] | null;
  isDirect?: boolean;
  targetNickname?: string | null;
  tempId?: string | null;
}

export interface RoomUser {
  id?: number;
  nickname: string;
  role: UserRole;
  isCreator?: boolean;
  isMuted?: boolean;
  mutedUntil?: string | Date | null;
  isBanned?: boolean;
  isOnline: boolean;
  lastSeen?: string | Date | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  browser?: string | null;
  os?: string | null;
  avatarUrl?: string | null;
  networkLabel?: string | null;
  batteryLabel?: string | null;
  batteryIsCharging?: boolean;
}

export interface ChatStatusStory {
  id: number;
  nickname: string;
  roomId?: number;
  type: 'text' | 'image' | 'video';
  content?: string | null;
  mediaUrl?: string | null;
  bgColor?: string | null;
  fontStyle?: string | null;
  stickers?: Array<{ id: number; emoji: string }> | null;
  viewers?: string[] | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
}

export interface WatchPartyVideoSource {
  url: string;
  title: string;
  type?: 'direct' | 'youtube' | 'embed';
  duration?: number;
  provider?: string;
  originalUrl?: string;
}

export interface WatchPartyState {
  isActive: boolean;
  videoSource: WatchPartyVideoSource | null;
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
  isDefault?: boolean;
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'active' | 'ended';

export interface ActiveCallData {
  callId: string;
  callerNickname: string;
  callerSocketId?: string;
  calleeNickname?: string;
  calleeSocketId?: string;
  isVoiceOnly: boolean;
  state: CallState;
  startedAt?: number;
  durationSeconds?: number;
}
