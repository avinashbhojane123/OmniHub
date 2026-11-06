# 01: Backend Chat Types & DTO Expansion

**What to build:**
Synchronize backend domain types with the frontend by defining `QueuedVideoItem`, adding `queue?: QueuedVideoItem[]` to `WatchPartyState`, and expanding `WatchPartyActionType` in `backend/src/chat/chat.types.ts`. Update `WatchPartyActionDto` and `WatchPartyReactionDto` in `backend/src/chat/dto/watch-party.dto.ts` to allow queue actions, optional version and queue payload properties, and unicode emoji reactions.

**Blocked by:** None (can start immediately)

Status: resolved

- [x] Export `QueuedVideoItem` in `backend/src/chat/chat.types.ts`.
- [x] Add `queue?: QueuedVideoItem[];` to `WatchPartyState` in `backend/src/chat/chat.types.ts`.
- [x] Add `'suggest_video' | 'play_queue_item' | 'remove_queue_item'` to `WatchPartyActionType` in `backend/src/chat/chat.types.ts`.
- [x] In `backend/src/chat/dto/watch-party.dto.ts`, expand `action` `@IsIn` list to include queue actions.
- [x] In `backend/src/chat/dto/watch-party.dto.ts`, add optional properties `version`, `queueId`, `queueItem`, `suggestedBy`, `url`, `title` to `WatchPartyActionDto`.
- [x] In `backend/src/chat/dto/watch-party.dto.ts`, update `WatchPartyReactionDto` to accept unicode emojis.

## Comments

Exported `QueuedVideoItem`, expanded `WatchPartyActionType` and `WatchPartyState`, and added queue properties to `WatchPartyActionDto` and `WatchPartyReactionDto` with strict validation compliance.
