# 05: Synchronized Up Next Queue & Host Scrub Snapping in ChatSocketService

**What to build:**
Synchronize the Watch Party "Up Next" video queue across all participants via `WatchPartyState.queue` and provide socket action handlers (`suggest_video`, `play_queue_item`) in `chatSocketService.ts`. Ensure `calculateWatchPartyDrift` forces seek when host scrub or state version jump occurs, and write comprehensive unit tests in `__tests__/ChatService.test.ts`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Add `QueuedVideoItem` interface and `queue?: QueuedVideoItem[]` to `WatchPartyState` in `src/types/chat.ts`.
- [x] Add `suggest_video` and `play_queue_item` handling in `chatSocketService.ts` to update `this.watchParty.queue` and emit socket events.
- [x] Ensure `chatSocketService.ts` is staged with correct casing in git index.
- [x] Add tests for queue addition, queue item playback, and forced resync in `__tests__/ChatService.test.ts`.

## Comments

Implemented `queue?: QueuedVideoItem[]` in `WatchPartyState`, added `suggest_video` and `play_queue_item` optimistic and emission handlers in `chatSocketService.ts`, staged under accurate casing, and added 100% passing tests in `__tests__/ChatService.test.ts`.
