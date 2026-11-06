# 06: Extracted DanmakuOverlay Component & Room-Synced Queue UI in WatchPartyModal

**What to build:**
Extract the Danmaku and floating reaction overlay rendering into a standalone `DanmakuOverlay` component to eliminate markup duplication. Update `WatchPartyModal.tsx` to display and manage the room-synced video queue from `state.queue`, immediately snap on host scrub (`state.version` change), and update previous issue tracking files to comply with canonical triage standards.

**Blocked by:** 05 (Synchronized Up Next Queue & Host Scrub Snapping in ChatSocketService)

**Status:** ready-for-agent

- [x] Create `src/components/chat/DanmakuOverlay.tsx` containing `DanmakuCommentView`, `FloatingReactionView`, and the overlay container.
- [x] Refactor `WatchPartyModal.tsx` to use `<DanmakuOverlay />` once across player views.
- [x] Connect the "Up Next" suggestions UI in `WatchPartyModal.tsx` to `onAction('suggest_video', ...)` and `onAction('play_queue_item', ...)`.
- [x] Detect host timeline scrub via `state.version` increments to bypass drift tolerance and force immediate alignment.
- [x] Update `.scratch/` issue files 01–04 to use valid triage roles and `## Comments` headers.

## Comments
Extracted `DanmakuOverlay.tsx` in `src/components/chat/`, connected `WatchPartyModal.tsx` to `roomQueue = state?.queue || []`, added `isNewHostVersion` force resync detection on `state.version`, and sanitized all issue tracker files.
