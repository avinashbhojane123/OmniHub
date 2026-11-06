# 02: Backend Watch Party Service Queue Management & Reactions

**What to build:**
Implement queue operations (`suggest_video`, `play_queue_item`, `remove_queue_item`) in `backend/src/chat/services/watch-party.service.ts`, maintain room-level `queue` in `watchPartyRooms`, serialize `queue` in `watchPartyUpdate` and `getWatchPartyState`, and broadcast unicode emojis to room subscribers.

**Blocked by:** 01 (Backend Chat Types & DTO Expansion)

Status: resolved

- [x] Initialize `queue: []` when a new watch party opens in `WatchPartyService`.
- [x] Add `suggest_video` handler: append `QueuedVideoItem` to `state.queue` without incrementing version.
- [x] Add `play_queue_item` handler: set video source, remove from queue, reset current time to 0, start playback, and increment version.
- [x] Add `remove_queue_item` handler: remove item by ID from `state.queue` without incrementing version.
- [x] Include `queue: state.queue || []` in all `watchPartyUpdate` and `watchPartyState` broadcasts.
- [x] Ensure `watchPartyReaction` transmits unicode emoji string payloads cleanly.

## Comments

Implemented queue management actions (`suggest_video`, `play_queue_item`, `remove_queue_item`) in `WatchPartyService`, ensured version bumping rules match scrub snapping specs, and broadcast unicode emoji reactions to room channels.
