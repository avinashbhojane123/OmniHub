# 04: Dual Delivery Room Chat Badges & Shared Up-Next Queue

**What to build:**
Complete the end-to-end user experience by mirroring live watch party comments into the main room chat log with a special watch party badge (allowing participants who minimize the modal to stay engaged), and providing an "Up Next" queue in the watch party modal where any room participant can propose a video link and the host can switch to it with a single tap.

**Blocked by:** 02 (Danmaku Bullet Comments & Floating Emoji Burst Overlay in Video Player), 03 (Player Sync Drift Hardening & Manual Re-sync Action)

**Status:** resolved

- [x] Incoming watch party comments are captured in `ChatRoomScreen` and rendered in the main message stream with a distinct "🍿 Watch Party" badge.
- [x] Add an "Up Next" suggestions drawer/list inside `WatchPartyModal`.
- [x] Any participant can submit a video URL and title to the shared queue.
- [x] The host can view queued items and tap "Play Now" to switch the current video for everyone.

## Answer
Added `isWatchPartyComment` to `ChatMessage`, mirrored watch party comments into `ChatSocketService.messages` and `ChatMessageBubble.tsx` with a `🍿 Watch Party Comment` badge. Added the "Up Next" suggestions drawer and queue playback switching directly into `WatchPartyModal.tsx`.
