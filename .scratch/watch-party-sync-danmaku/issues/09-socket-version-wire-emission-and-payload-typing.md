# 09: Socket Version Wire Emission & Payload Typing

**What to build:**
Ensure that whenever a host performs playback-altering actions (`seek`, `play`, `pause`, `change_video`, `play_queue_item`), the incremented state `version` is transmitted in the socket emission payload so remote participants receive the sync generation number and snap to timeline scrubbing.

**Blocked by:** None (can start immediately)

Status: resolved

- [x] Add `version?: number;` to `WatchPartyActionPayload` in `src/types/chat.ts`.
- [x] In `ChatSocketService.ts` `watchPartyAction`, include `version: this.watchParty?.version` in `this.socket.emit('watchPartyAction', ...)`.
- [x] Add unit test verifying that `watchPartyAction` emits `version` in the socket payload.

## Comments

Added `version?: number;` to `WatchPartyActionPayload` in `src/types/chat.ts`. Included `version: this.watchParty?.version` in `this.socket.emit('watchPartyAction', ...)`. Verified in `__tests__/ChatService.test.ts` that socket emissions carry `version`.
