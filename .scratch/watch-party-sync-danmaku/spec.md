# Spec: Watch Party Queue Synchronization & Sync Hardening

Status: ready-for-agent

## Problem Statement

Following the initial implementation of the Danmaku reactions and drift tolerance engine, code review identified several critical gaps:
1. Video suggestions added to the Up Next queue remained isolated in local React component state, preventing other room participants and the host from seeing or playing queued videos.
2. Immediate host timeline scrubs within 2 seconds did not bypass drift tolerance, delaying participant synchronization until larger time differences accumulated.
3. Overlay markup was duplicated between player states in the modal, and git casing prevented `chatSocketService.ts` from being committed with dual delivery comment mirroring.
4. Ticket tracking files did not comply with canonical triage role labels.

## Solution

1. **Synchronized Video Queue**: Add a shared `queue: QueuedVideoItem[]` to `WatchPartyState` and extend `ChatSocketService.watchPartyAction` with `suggest_video` and `play_queue_item` actions so any participant can propose videos that sync in real-time across the room.
2. **Immediate Host Scrub Snapping**: Track host `state.version` increments and host seek/play/pause actions, executing immediate `forceResync = true` seeks on participants regardless of drift threshold.
3. **Dedicated Overlay Architecture**: Extract `DanmakuOverlay` into a clean reusable component, eliminating duplication between the real player WebView and fallback player.
4. **Git Index Alignment & Standards Compliance**: Ensure `src/services/chat/chatSocketService.ts` is tracked with correct casing and commit dual-delivery comment mirroring; update issue tracker files to use canonical triage roles and `## Comments` headers.

## User Stories

1. As a watch party participant, I want my suggested videos to appear in everyone's "Up Next" queue, so the host can see my recommendations.
2. As a watch party host, I want to see a live synchronized list of suggested videos from all room members, so I can seamlessly choose what to play next.
3. As a watch party host, I want to tap "Play Now" on any queued video to immediately switch playback for all viewers and remove it from the queue.
4. As a watch party participant, I want my video player to snap immediately to the host's new timestamp when the host scrubs the timeline, even if the jump is under 2 seconds.
5. As a developer, I want the Danmaku and floating emoji overlay logic encapsulated in a single component, so rendering is clean and maintainable.
6. As a developer, I want all chat socket service changes committed under proper repository casing, so dual delivery comment mirroring functions across all platforms.
7. As an issue tracker consumer, I want all ticket files to use canonical triage labels, so agent tooling can correctly identify ticket readiness.

## Implementation Decisions

- **State Model Expansion**: Update `WatchPartyState` in the chat domain types to include `queue?: QueuedVideoItem[]`.
- **Action Dispatching**: Implement `suggest_video` and `play_queue_item` handlers in `ChatSocketService` to emit and optimistically update the shared queue in `WatchPartyState`.
- **Host Version Scrub Tracking**: In `WatchPartyModal`, retain a reference to `lastSeenVersionRef`. When `state.version > lastSeenVersionRef.current`, flag the sync update as a forced resync (`forceResync = true`) to immediately post the seek command to the WebView.
- **Component Decomposition**: Create `DanmakuOverlay.tsx` in `src/components/chat/` containing `DanmakuCommentView`, `FloatingReactionView`, and the overlay container with `pointerEvents="box-none"`.
- **Standards Conformance**: Update `.scratch/` issue files to use canonical triage strings and replace non-standard `## Answer` sections with `## Comments`.

## Testing Decisions

- **Test Boundaries**: Test external behavior at `ChatSocketService` in `__tests__/ChatService.test.ts`.
- **Behavior to Verify**:
  1. `watchPartyAction('suggest_video', ...)` correctly appends items to `WatchPartyState.queue`.
  2. `watchPartyAction('play_queue_item', ...)` switches the video source and prunes the item from `WatchPartyState.queue`.
  3. `calculateWatchPartyDrift` correctly forces seeks when `forceResync = true` is supplied.
  4. Control lock state formatting and toggling work reliably.

## Out of Scope

- YouTube playlist scraping/parsing (only direct links or IDs).
- Automatic video queue voting/upvoting system (FIFO queue is sufficient).

## Further Notes

All changes strictly preserve existing styling, native driver performance, and room chat integrations.
