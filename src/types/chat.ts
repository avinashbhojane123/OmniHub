export type UserRole = 'host' | 'admin' | 'member';

export type MessageDeliveryStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface PollOption {
  id: number | string;
  text: string;
  votes: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  allowMultiple?: boolean;
  expiresAt?: string | Date | null;
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
  updatedAt?: string | Date | null;
  replyTo?: ReplyReference | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  duration?: number | null; // Duration in seconds for voice notes and media
  isVoiceNote?: boolean;
  isVideoNote?: boolean;
  isWithoutSound?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  reactions?: Record<string, string[]> | null; // emoji -> array of nicknames
  expiresAt?: string | Date | null;
  expiresIn?: number | null; // Expiration duration in seconds configured on creation
  pollData?: PollData | null;
  locationData?: LocationData | null;
  readBy?: string[] | null;
  isDirect?: boolean;
  targetNickname?: string | null;
  tempId?: string | null;
  status?: MessageDeliveryStatus;
  avatarUrl?: string | null;
}

export interface RoomUser {
  id?: number;
  nickname: string;
  role: UserRole;
  socketId?: string | null;
  isCreator?: boolean;
  isMuted?: boolean;
  mutedUntil?: string | Date | null;
  isBanned?: boolean;
  isOnline: boolean;
  isPip?: boolean;
  isTyping?: boolean;
  lastSeen?: string | Date | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  browser?: string | null;
  os?: string | null;
  avatarUrl?: string | null;
  networkLabel?: string | null;
  batteryLabel?: string | null;
  batteryLevel?: number | null;
  batteryIsCharging?: boolean;
}

export interface ChatStatusStory {
  id: number;
  nickname: string;
  roomId?: number;
  type: 'text' | 'image' | 'video';
  content?: string | null;
  caption?: string | null;
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

export type WatchPartyActionType =
  | 'open'
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_video'
  | 'close'
  | 'lock_controls'
  | 'sync'
  | 'rate'
  | 'buffering';

export interface WatchPartyActionPayload {
  action: WatchPartyActionType;
  currentTime?: number;
  playbackRate?: number;
  videoSource?: WatchPartyVideoSource | null;
  isBuffering?: boolean;
}

export interface WatchPartyComment {
  id: string | number;
  nickname: string;
  comment: string;
  timestamp: number;
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

export type RoomWallpaperThemeId =
  | 'wa-doodle'
  | 'dark-slate'
  | 'deep-purple'
  | 'emerald-night'
  | 'ocean-blue'
  | 'custom';

export interface RoomWallpaperState {
  theme: string;
  customWallpaper: string | null;
  isDefault?: boolean;
}

export type CallState =
  | 'idle'
  | 'calling'
  | 'incoming'
  | 'active'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'busy'
  | 'timeout';

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

// WebRTC Signaling Payloads
export interface WebRtcOfferPayload {
  callerSocketId: string;
  callerNickname?: string;
  targetSocketId?: string;
  sdp: any;
  isVoiceOnly?: boolean;
}

export interface WebRtcAnswerPayload {
  calleeSocketId: string;
  calleeNickname?: string;
  targetSocketId?: string;
  sdp: any;
}

export interface WebRtcCandidatePayload {
  candidate: any;
  targetSocketId: string;
  fromSocketId?: string;
}

export interface WebRtcMediaStatePayload {
  targetSocketId: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
}

// Client Socket Payloads & DTOs
export interface SendMessagePayload {
  passcode: string;
  nickname?: string;
  message: string;
  replyTo?: ReplyReference | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  isVoiceNote?: boolean;
  isVideoNote?: boolean;
  isWithoutSound?: boolean;
  expiresIn?: number | null;
  pollData?: PollData | null;
  locationData?: LocationData | null;
  tempId?: string | null;
}

export interface SendDirectMessagePayload extends SendMessagePayload {
  targetNickname: string;
}

export interface VotePollPayload {
  passcode: string;
  messageId: number | string;
  optionId: number | string;
}

export interface ReactMessagePayload {
  passcode: string;
  messageId: number | string;
  emoji: string;
}

export interface EditMessagePayload {
  passcode: string;
  messageId: number | string;
  newMessage: string;
}

export interface DeleteMessagePayload {
  passcode: string;
  messageId: number | string;
}

export interface PinMessagePayload {
  passcode: string;
  messageId: number | string | null;
}

export interface MarkReadPayload {
  passcode: string;
  messageIds: Array<number | string>;
}

export interface AudioPlayerState {
  activeId: string | number | null;
  url: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  playbackRate: number;
}

// Constants
export const MAX_CHAT_MESSAGE_LENGTH = 10000;
export const MAX_POLL_OPTIONS = 5;
export const MIN_POLL_OPTIONS = 2;

export const DEFAULT_ROOM_WALLPAPER: RoomWallpaperState = {
  theme: 'wa-doodle',
  customWallpaper: null,
  isDefault: true,
};

export const DEFAULT_WATCH_PARTY_STATE: WatchPartyState = {
  isActive: false,
  videoSource: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  lastUpdatedTimestamp: 0,
  version: 0,
  lastActorNickname: '',
  isBuffering: false,
  bufferingUsers: [],
  isHostOnly: true,
};

// Runtime Type Guards
export function isChatMessage(val: unknown): val is ChatMessage {
  if (!val || typeof val !== 'object') return false;
  const msg = val as Partial<ChatMessage>;
  return (
    (typeof msg.id === 'string' || typeof msg.id === 'number') &&
    typeof msg.nickname === 'string' &&
    typeof msg.message === 'string' &&
    (typeof msg.createdAt === 'string' || msg.createdAt instanceof Date)
  );
}

export function isRoomUser(val: unknown): val is RoomUser {
  if (!val || typeof val !== 'object') return false;
  const user = val as Partial<RoomUser>;
  return (
    typeof user.nickname === 'string' &&
    typeof user.role === 'string' &&
    typeof user.isOnline === 'boolean'
  );
}

export function isPollData(val: unknown): val is PollData {
  if (!val || typeof val !== 'object') return false;
  const p = val as Partial<PollData>;
  return (
    typeof p.question === 'string' &&
    Array.isArray(p.options) &&
    p.options.every(
      (opt) =>
        opt &&
        (typeof opt.id === 'number' || typeof opt.id === 'string') &&
        typeof opt.text === 'string' &&
        Array.isArray(opt.votes)
    )
  );
}

export function isLocationData(val: unknown): val is LocationData {
  if (!val || typeof val !== 'object') return false;
  const loc = val as Partial<LocationData>;
  return (
    typeof loc.lat === 'number' &&
    !isNaN(loc.lat) &&
    typeof loc.lng === 'number' &&
    !isNaN(loc.lng)
  );
}

export function isWatchPartyState(val: unknown): val is WatchPartyState {
  if (!val || typeof val !== 'object') return false;
  const wp = val as Partial<WatchPartyState>;
  return (
    typeof wp.isActive === 'boolean' &&
    typeof wp.currentTime === 'number' &&
    typeof wp.isPlaying === 'boolean' &&
    typeof wp.version === 'number' &&
    Array.isArray(wp.bufferingUsers)
  );
}

export function isChatStatusStory(val: unknown): val is ChatStatusStory {
  if (!val || typeof val !== 'object') return false;
  const story = val as Partial<ChatStatusStory>;
  return (
    typeof story.id === 'number' &&
    typeof story.nickname === 'string' &&
    (story.type === 'text' || story.type === 'image' || story.type === 'video') &&
    (typeof story.createdAt === 'string' || story.createdAt instanceof Date)
  );
}

export function isCallActive(call: ActiveCallData | null | undefined): boolean {
  if (!call) return false;
  return call.state === 'active' || call.state === 'calling' || call.state === 'incoming';
}

// Default State Factories
export function createDefaultWatchPartyState(): WatchPartyState {
  return { ...DEFAULT_WATCH_PARTY_STATE, bufferingUsers: [] };
}

export function createDefaultRoomWallpaper(): RoomWallpaperState {
  return { ...DEFAULT_ROOM_WALLPAPER };
}

export function createDefaultAudioPlayerState(): AudioPlayerState {
  return {
    activeId: null,
    url: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    playbackRate: 1,
  };
}
