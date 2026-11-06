# Spec: Full-Stack Contract Alignment & Bi-Directional WebSocket Hardening

Status: resolved

## Problem Statement

A comprehensive audit of the frontend React Native codebase and backend NestJS codebase revealed critical contract discrepancies and validation barriers:
1. **Watch Party Action Rejection**: The backend's `WatchPartyActionDto` uses `@IsIn` validation restricting actions to a legacy set (`open`, `play`, `pause`, `seek`, `rate`, `change_video`, `buffering`, `ready`, `close`, `toggle_host_lock`, `sync_tick`, `heartbeat`). When the frontend dispatches `'suggest_video'`, `'play_queue_item'`, or `'remove_queue_item'`, or includes fields like `version`, `queueId`, `queueItem`, or `suggestedBy`, the NestJS global `ValidationPipe` (`forbidNonWhitelisted: true`) immediately rejects the packet as an invalid request.
2. **Watch Party Queue State Absence**: Backend `WatchPartyState` in `backend/src/chat/chat.types.ts` and `WatchPartyService` lacks the `queue: QueuedVideoItem[]` property. When the server broadcasts `watchPartyUpdate` or `watchPartyState`, `queue` is omitted, wiping out participant queues during remote updates.
3. **Emoji Reaction Rejection**: `WatchPartyReactionDto` enforces `@IsIn(['', 'heart', 'laugh', 'fire', 'cry', 'applause', 'thumbsup', 'surprised'])`, rejecting unicode emojis (`🍿`, `🔥`, `❤️`, `😂`, `👏`, `🎬`) emitted by the frontend UI.
4. **Contract Parity Drift**: Key WebSocket and REST payloads lack 1-to-1 schema parity between `src/types/chat.ts` and `backend/src/chat/chat.types.ts`.

## Solution

1. **Backend DTO Expansion**:
   - Update `WatchPartyActionDto` in `backend/src/chat/dto/watch-party.dto.ts` to allow actions `'suggest_video'`, `'play_queue_item'`, and `'remove_queue_item'`.
   - Add optional fields to `WatchPartyActionDto`: `version?: number`, `queueItem?: QueuedVideoItem`, `queueId?: string`, `suggestedBy?: string`, `url?: string`, `title?: string`.
   - Update `WatchPartyReactionDto` to accept unicode emojis alongside legacy keyword strings.
2. **Backend Service Queue & Version Alignment**:
   - Add `queue?: QueuedVideoItem[]` to `WatchPartyState` in `backend/src/chat/chat.types.ts`.
   - Implement `suggest_video`, `play_queue_item`, and `remove_queue_item` in `WatchPartyService.handleWatchPartyAction`.
   - Ensure `watchPartyUpdate` and `watchPartyState` socket broadcasts retain and serialize `state.queue`.
3. **Shared Type Schema Parity**:
   - Synchronize domain interfaces (`QueuedVideoItem`, `WatchPartyState`, `WatchPartyActionType`, `WatchPartyActionPayload`) between `src/types/chat.ts` and `backend/src/chat/chat.types.ts`.
4. **Full-Stack Verification**:
   - Add unit and integration tests in `backend/src/chat/services/watch-party.service.spec.ts` covering queue management and emoji reaction handling.
   - Run typecheck and full test suites in both backend (`npm --prefix backend run build`, `npm --prefix backend test`) and frontend (`npx tsc --noEmit`, `npm test`).

## User Stories

1. As a watch party host, I want video suggestions submitted by participants to be validated and stored on the server, so that the entire room shares the exact same "Up Next" queue.
2. As a watch party participant, I want to react with emojis (🍿, 🔥, ❤️, 😂, 👏, 🎬) without them being rejected by server validation, so that my reactions display on everyone's screens.
3. As a watch party host, I want tapping "Play Now" on a queued video to switch playback on the server and notify all participants, so that the session transitions seamlessly to the next video.
4. As a participant joining late or reconnecting, I want `getWatchPartyState` to return the current video queue, so that I can see what videos are upcoming.
5. As a developer maintaining the full-stack codebase, I want `chat.types.ts` in the backend and `chat.ts` in the frontend to have 1-to-1 matching types, so that protocol discrepancies are caught at compile time.
6. As an API client, I want `WatchPartyActionDto` to accept `version`, so that host scrub snapping generation counters pass server validation unhindered.

## Implementation Decisions

- **DTO Changes in `backend/src/chat/dto/watch-party.dto.ts`**:
  - Add `'suggest_video' | 'play_queue_item' | 'remove_queue_item'` to `action` validator.
  - Add `@IsOptional() @IsNumber() version?: number;`
  - Add `@IsOptional() @IsString() queueId?: string;`
  - Add `@IsOptional() @IsString() url?: string;`
  - Add `@IsOptional() @IsString() title?: string;`
  - Add `@IsOptional() @IsString() suggestedBy?: string;`
  - Add `@IsOptional() @IsObject() queueItem?: QueuedVideoItem;`
  - In `WatchPartyReactionDto`, replace strict `@IsIn` with `@IsString() @IsNotEmpty()` allowing both named reactions and unicode emojis.
- **Service Changes in `backend/src/chat/services/watch-party.service.ts`**:
  - In `handleWatchPartyAction`:
    - `case 'suggest_video'`: generate item ID if absent, append to `state.queue`, broadcast update without bumping version.
    - `case 'play_queue_item'`: find item by `data.queueId || data.id`, set as `state.videoSource`, remove from `state.queue`, reset `currentTime: 0`, set `isPlaying: true`, bump `version`.
    - `case 'remove_queue_item'`: filter out item by ID, update `state.queue`, broadcast update without bumping version.
  - In `watchPartyReaction`: broadcast `reaction: data.reaction`, `from: session.nickname`.
- **Type Parity in `backend/src/chat/chat.types.ts`**:
  - Export `QueuedVideoItem`.
  - Include `queue?: QueuedVideoItem[];` on `WatchPartyState`.
  - Include `'suggest_video' | 'play_queue_item' | 'remove_queue_item'` on `WatchPartyActionType`.

## Testing Decisions

- Test backend behavior in `backend/src/chat/services/watch-party.service.spec.ts`:
  - `suggest_video` adds item to queue and broadcasts.
  - `play_queue_item` switches video source, removes item from queue, and increments version.
  - `remove_queue_item` deletes item from queue.
  - `watchPartyReaction` handles unicode emojis (🍿, 🔥).
- Test frontend behavior in `__tests__/ChatService.test.ts`:
  - Ensure client emit payload formats align with backend DTOs.
- Run `npm --prefix backend run build` and `npm --prefix backend test`.
- Run `npx tsc --noEmit` and `npm test` on frontend.

## Out of Scope

- Changing relational database migrations for rooms.
- Adding third-party OAuth integrations.

## Further Notes

This cycle completes the end-to-end contract handshake between the React Native frontend and NestJS backend.
