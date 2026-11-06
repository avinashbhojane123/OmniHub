# 03: Backend Watch Party Unit & Integration Tests

**What to build:**
Write test coverage in `backend/src/chat/services/watch-party.service.spec.ts` exercising queue addition, queue playback, queue removal, version isolation, and emoji reactions through `WatchPartyService`.

**Blocked by:** 02 (Backend Watch Party Service Queue Management & Reactions)

Status: resolved

- [x] Add tests for `suggest_video`: adds item to `state.queue` and emits update without version bump.
- [x] Add tests for `play_queue_item`: updates video source, clears queued item, and increments version.
- [x] Add tests for `remove_queue_item`: removes item from queue without version bump.
- [x] Add tests for `watchPartyReaction`: emits unicode emoji (🍿, 🔥) to room.
- [x] Ensure all 33+ backend test suites pass.

## Comments

Created `backend/src/chat/services/watch-party.service.spec.ts` with 5 targeted tests covering all queue operations, version generation isolation, and unicode emoji reactions. All 5 tests passed.
