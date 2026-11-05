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
  appVersion?: string | null;
  avatarUrl?: string | null;
  networkLabel?: string | null;
  batteryLabel?: string | null;
  batteryLevel?: number | null;
  batteryIsCharging?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
  isScreenSharing?: boolean;
}

export type StatusMediaType = 'text' | 'image' | 'video';

export interface StatusSticker {
  id: number;
  emoji: string;
}

export interface ChatStatusStory {
  id: number;
  nickname: string;
  roomId?: number;
  type: StatusMediaType;
  content?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  bgColor?: string | null;
  fontStyle?: string | null;
  stickers?: StatusSticker[] | null;
  viewers?: string[] | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
}

export type WatchPartyVideoType = 'direct' | 'youtube' | 'embed';

export interface WatchPartyVideoSource {
  url: string;
  title?: string;
  type?: WatchPartyVideoType;
  duration?: number;
  provider?: string;
  originalUrl?: string;
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
  | 'lock_controls'
  | 'toggle_host_lock'
  | 'sync'
  | 'sync_tick'
  | 'heartbeat';

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
  reaction?: string;
  comment?: string;
  passcode?: string;
}

export interface WatchPartyComment {
  id: string | number;
  nickname: string;
  comment: string;
  timestamp: number;
}

export interface WatchPartyReactionPayload {
  passcode?: string;
  emoji?: string;
  from?: string;
  reaction?: string;
  timestamp?: number;
}

export interface WatchPartyCommentPayload {
  passcode?: string;
  comment?: string;
  id?: string | number;
  from?: string;
  text?: string;
  top?: number;
  timestamp?: number;
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
  theme: RoomWallpaperThemeId | string;
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
  | 'timeout'
  | 'reconnecting';

export interface ActiveCallData {
  callId: string;
  callerNickname: string;
  callerSocketId?: string;
  calleeNickname?: string;
  calleeSocketId?: string;
  targetSocketId?: string;
  isVoiceOnly: boolean;
  state: CallState;
  startedAt?: number;
  durationSeconds?: number;
  reason?: string;
}

// WebRTC Signaling Payloads
export type WebrtcSignalType =
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'media_state'
  | 'mediaState'
  | 'iceServers'
  | 'screenShare'
  | 'peerReconnecting'
  | 'peerReconnected'
  | 'callRestored'
  | 'callEnded';

export interface WebrtcSignalEvent<T = any> {
  type: WebrtcSignalType | string;
  payload: T;
}

export interface WebRtcOfferPayload {
  callerSocketId?: string;
  callerNickname?: string;
  callerName?: string;
  from?: string;
  targetSocketId?: string;
  targetNickname?: string;
  offer?: any;
  sdp?: any;
  isVoiceOnly?: boolean;
  callId?: string;
  passcode?: string;
}

export interface WebRtcAnswerPayload {
  calleeSocketId?: string;
  receiverSocketId?: string;
  calleeNickname?: string;
  receiverName?: string;
  from?: string;
  targetSocketId?: string;
  answer?: any;
  sdp?: any;
  callId?: string;
  passcode?: string;
}

export interface WebRtcCandidatePayload {
  candidate: any;
  targetSocketId?: string;
  fromSocketId?: string;
  from?: string;
  callId?: string;
  passcode?: string;
}

export interface WebRtcMediaStatePayload {
  targetSocketId?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
  from?: string;
  fromSocketId?: string;
  callId?: string;
  passcode?: string;
}

// Client Socket Payloads & DTOs
export interface JoinRoomConfig {
  serverUrl?: string;
  nickname: string;
  passcode: string;
  avatarUrl?: string;
}

export interface JoinRoomPayload {
  passcode: string;
  nickname: string;
  sessionToken?: string;
  deviceType?: string;
  deviceModel?: string;
  os?: string;
  browser?: string;
  networkLabel?: string;
  batteryLabel?: string;
  batteryIsCharging?: boolean;
  avatarUrl?: string;
  appVersion?: string;
}

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

export interface ClearHistoryPayload {
  passcode: string;
}

export interface CreateStatusPayload {
  passcode: string;
  type?: StatusMediaType;
  content?: string;
  mediaUrl?: string;
  bgColor?: string;
  fontStyle?: string;
  stickers?: StatusSticker[];
}

export interface ViewStatusPayload {
  passcode: string;
  statusId: number;
}

export interface DeleteStatusPayload {
  passcode: string;
  statusId: number;
}

export interface CallUserPayload {
  passcode: string;
  callerName?: string;
  from?: string;
  targetNickname?: string;
  targetSocketId?: string;
  isVoiceOnly?: boolean;
}

export interface AcceptCallPayload {
  passcode: string;
  receiverName?: string;
  from?: string;
  targetSocketId?: string;
  callId?: string;
}

export interface DeclineCallPayload {
  passcode: string;
  receiverName?: string;
  from?: string;
  targetSocketId?: string;
  callId?: string;
  reason?: string;
}

export interface EndCallPayload {
  passcode: string;
  callId?: string;
  targetSocketId?: string;
  reason?: string;
}

export interface TogglePipPayload {
  passcode: string;
  isPip: boolean;
}

export interface ScreenShareStatusPayload {
  passcode: string;
  isSharing: boolean;
  targetSocketId?: string;
  callId?: string;
}

export interface UpdateRoomWallpaperPayload {
  passcode: string;
  theme: string;
  customWallpaper?: string | null;
}

export interface MuteUserPayload {
  passcode: string;
  targetNickname: string;
  isMuted: boolean;
  durationMinutes?: number;
}

export interface KickUserPayload {
  passcode: string;
  targetNickname: string;
}

export interface BanUserPayload {
  passcode: string;
  targetNickname: string;
}

export interface UnbanUserPayload {
  passcode: string;
  targetNickname: string;
}

export interface PromoteUserPayload {
  passcode: string;
  targetNickname: string;
  role: 'admin' | 'member';
}

export interface TransferHostPayload {
  passcode: string;
  targetNickname: string;
}

export interface ReclaimHostPayload {
  passcode: string;
}

export interface ClearInactiveUsersPayload {
  passcode: string;
  daysInactive?: number;
}

export interface TypingPayload {
  passcode: string;
  nickname?: string;
}

export interface UserMetadataPayload {
  passcode: string;
  batteryLabel?: string;
  batteryIsCharging?: boolean;
  networkLabel?: string;
  avatarUrl?: string;
}

export interface SocketAckResponse<T = Record<string, unknown>> {
  success: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
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

export const DEFAULT_ROOM_WALLPAPER: Readonly<RoomWallpaperState> = Object.freeze({
  theme: 'wa-doodle',
  customWallpaper: null,
  isDefault: true,
});

export const DEFAULT_WATCH_PARTY_STATE: Readonly<WatchPartyState> = Object.freeze({
  isActive: false,
  videoSource: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  lastUpdatedTimestamp: 0,
  version: 0,
  lastActorNickname: '',
  isBuffering: false,
  bufferingUsers: Object.freeze([]) as unknown as string[],
  isHostOnly: true,
});

// Runtime Type Guards
export function isChatMessage(val: unknown): val is ChatMessage {
  if (!val || typeof val !== 'object') return false;
  const msg = val as Partial<ChatMessage>;
  return (
    (typeof msg.id === 'string' || (typeof msg.id === 'number' && !isNaN(msg.id))) &&
    typeof msg.nickname === 'string' &&
    typeof msg.message === 'string' &&
    ((typeof msg.createdAt === 'string' && msg.createdAt.trim().length > 0) ||
      (msg.createdAt instanceof Date && !isNaN(msg.createdAt.getTime())))
  );
}

export function isRoomUser(val: unknown): val is RoomUser {
  if (!val || typeof val !== 'object') return false;
  const user = val as Partial<RoomUser>;
  return (
    typeof user.nickname === 'string' &&
    (user.role === 'host' || user.role === 'admin' || user.role === 'member') &&
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
        typeof opt === 'object' &&
        ((typeof opt.id === 'number' && !isNaN(opt.id)) || typeof opt.id === 'string') &&
        typeof opt.text === 'string' &&
        Array.isArray(opt.votes) &&
        opt.votes.every((v) => typeof v === 'string')
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
    !isNaN(wp.currentTime) &&
    typeof wp.isPlaying === 'boolean' &&
    typeof wp.version === 'number' &&
    !isNaN(wp.version) &&
    Array.isArray(wp.bufferingUsers)
  );
}

export function isChatStatusStory(val: unknown): val is ChatStatusStory {
  if (!val || typeof val !== 'object') return false;
  const story = val as Partial<ChatStatusStory>;
  return (
    typeof story.id === 'number' &&
    !isNaN(story.id) &&
    typeof story.nickname === 'string' &&
    (story.type === 'text' || story.type === 'image' || story.type === 'video') &&
    (typeof story.createdAt === 'string' ||
      (story.createdAt instanceof Date && !isNaN(story.createdAt.getTime())))
  );
}

export function isCallActive(call: ActiveCallData | null | undefined): boolean {
  if (!call) return false;
  return (
    call.state === 'active' ||
    call.state === 'calling' ||
    call.state === 'incoming' ||
    call.state === 'reconnecting'
  );
}

export function isRoomWallpaperState(val: unknown): val is RoomWallpaperState {
  if (!val || typeof val !== 'object') return false;
  const wp = val as Partial<RoomWallpaperState>;
  return typeof wp.theme === 'string' && (wp.customWallpaper === null || typeof wp.customWallpaper === 'string');
}

export function isAudioPlayerState(val: unknown): val is AudioPlayerState {
  if (!val || typeof val !== 'object') return false;
  const a = val as Partial<AudioPlayerState>;
  return (
    (a.activeId === null || typeof a.activeId === 'string' || (typeof a.activeId === 'number' && !isNaN(a.activeId))) &&
    (a.url === null || typeof a.url === 'string') &&
    typeof a.isPlaying === 'boolean' &&
    typeof a.currentTime === 'number' &&
    !isNaN(a.currentTime) &&
    typeof a.duration === 'number' &&
    !isNaN(a.duration) &&
    typeof a.isLoading === 'boolean' &&
    typeof a.playbackRate === 'number' &&
    !isNaN(a.playbackRate)
  );
}

export function isReplyReference(val: unknown): val is ReplyReference {
  if (!val || typeof val !== 'object') return false;
  const r = val as Partial<ReplyReference>;
  return (
    (r.id === undefined || typeof r.id === 'string' || (typeof r.id === 'number' && !isNaN(r.id))) &&
    typeof r.nickname === 'string' &&
    typeof r.message === 'string'
  );
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
