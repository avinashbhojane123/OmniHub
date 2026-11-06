export type UserRole = 'host' | 'admin' | 'member';

export interface UserSession {
  userId?: number;
  nickname: string;
  passcode: string;
  socketId?: string;
  isPip?: boolean;
  isMuted?: boolean;
  isOnline?: boolean;
  isScreenSharing?: boolean;
  role?: UserRole;
  avatarUrl?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
  os?: string | null;
  networkLabel?: string | null;
  batteryLabel?: string | null;
  batteryIsCharging?: boolean;
}

export interface ChatRoomUser {
  id: number;
  nickname: string;
  role: UserRole;
  isCreator: boolean;
  isMuted: boolean;
  mutedUntil: Date | null;
  isBanned: boolean;
  isOnline: boolean;
  lastSeen: Date | null;
  deviceType: string | null;
  deviceModel: string | null;
  appVersion: string | null;
  os: string | null;
  avatarUrl: string | null;
  networkLabel: string | null;
  batteryLabel: string | null;
  batteryIsCharging: boolean;
}

export interface UserMetadataUpdatedPayload {
  nickname: string;
  batteryLabel?: string | null;
  batteryIsCharging?: boolean;
  networkLabel?: string | null;
  avatarUrl?: string | null;
}

export interface UserModerationEventPayload {
  targetNickname: string;
  kickedBy?: string;
  bannedBy?: string;
  unbannedBy?: string;
}

export interface UserPromotedPayload {
  targetNickname: string;
  role: UserRole;
  promotedBy: string;
}

export interface HostChangedPayload {
  newHostNickname: string;
  newHost: string;
  previousHostNickname: string;
  previousHost: string;
  reason?: string;
}

export interface UserMuteToggledPayload {
  targetNickname: string;
  isMuted: boolean;
  mutedUntil?: Date | null;
  mutedBy?: string;
}

export type CallState = 'calling' | 'active' | 'ended';

export interface ActiveCallSession {
  callId: string;
  room: string;
  callerSocketId: string;
  callerNickname: string;
  calleeSocketId?: string;
  calleeNickname?: string;
  isVoiceOnly?: boolean;
  state: CallState;
  startedAt: number;
  ringTimer?: NodeJS.Timeout;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type WatchPartyVideoType = 'direct' | 'youtube' | 'embed';

export interface WatchPartyVideoSource {
  url: string;
  title: string;
  type?: WatchPartyVideoType;
  duration?: number;
  provider?: string;
  originalUrl?: string;
}

export interface QueuedVideoItem {
  id: string;
  url: string;
  title: string;
  suggestedBy: string;
}

export type WatchPartyActionType =
  | 'open'
  | 'invite'
  | 'accept'
  | 'decline'
  | 'play'
  | 'pause'
  | 'seek'
  | 'rate'
  | 'change_video'
  | 'buffering'
  | 'ready'
  | 'close'
  | 'toggle_host_lock'
  | 'lock_controls'
  | 'sync_tick'
  | 'heartbeat'
  | 'suggest_video'
  | 'play_queue_item'
  | 'remove_queue_item';

export interface WatchPartyActionPayload {
  action: WatchPartyActionType;
  currentTime?: number;
  playbackRate?: number;
  videoSource?: WatchPartyVideoSource | null;
  isPlaying?: boolean;
  isBuffering?: boolean;
  buffering?: boolean;
  isHostOnly?: boolean;
  scheduledStartServerTime?: number;
  clientSendTime?: number;
  queueItem?: QueuedVideoItem;
  queueId?: string;
  id?: string;
  url?: string;
  title?: string;
  suggestedBy?: string;
  reaction?: string;
  comment?: string;
  passcode?: string;
  version?: number;
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
  queue?: QueuedVideoItem[];
}

export interface WatchPartyUpdatePayload {
  action?: WatchPartyActionType | 'sync';
  videoSource: WatchPartyVideoSource | null;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  isBuffering: boolean;
  bufferingUsers: string[];
  lastUpdatedTimestamp: number;
  scheduledStartServerTime?: number;
  version: number;
  lastActorNickname: string;
  hostNickname?: string;
  isHostOnly: boolean;
  serverTime: number;
  queue?: QueuedVideoItem[];
}

export interface WatchPartyReactionPayload {
  from: string;
  reaction: string;
  timestamp: number;
}

export interface WatchPartyCommentPayload {
  id: string;
  from: string;
  text: string;
  top: number;
  timestamp: number;
}

export type RoomTheme = 'wa-doodle' | 'dark' | 'light' | 'custom' | string;

export interface RoomWallpaperState {
  theme: RoomTheme;
  customWallpaper: string | null;
}

export type StatusType = 'text' | 'image' | 'video';

export interface StatusSticker {
  id: number;
  emoji: string;
}

export interface PollOption {
  id: number;
  text: string;
  votes: string[];
}

export interface MessagePollData {
  question: string;
  options: PollOption[];
  allowMultiple?: boolean;
  expiresAt?: string | Date;
}

export interface MessageReplyTo {
  id?: number | string;
  nickname: string;
  message: string;
}

export interface MessageLocationData {
  lat: number;
  lng: number;
}

export type MessageReactions = Record<string, string[]>;

export interface ChatMessagePayload {
  id: number;
  tempId?: string | null;
  roomId: number;
  nickname: string;
  message: string;
  createdAt: Date;
  replyTo?: MessageReplyTo | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  isVoiceNote?: boolean;
  isVideoNote?: boolean;
  isWithoutSound?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: MessageReactions | null;
  expiresAt?: Date | null;
  pollData?: MessagePollData | null;
  locationData?: MessageLocationData | null;
  readBy?: string[] | null;
  isDirect?: boolean;
  targetNickname?: string | null;
}

export interface WebRtcMediaStatePayload {
  from: string;
  fromSocketId: string;
  micMuted: boolean;
  cameraOff: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  callId?: string;
}

export interface CallSignalPayload {
  callerName?: string;
  receiverName?: string;
  from: string;
  callId: string;
  callerSocketId?: string;
  targetSocketId?: string;
  isVoiceOnly?: boolean;
}

export interface SocketAckResponse<T = Record<string, any>> {
  success: boolean;
  message?: string;
  data?: T;
  [key: string]: any;
}
