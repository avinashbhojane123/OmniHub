# Spec: Watch Party Scrub Snapping, Version Isolation & Single Overlay Layer

Status: ready-for-agent

## Problem Statement

Two specific behavioral defects were detected during code review:
1. When a host scrubs the playback timeline or pauses/plays, `state.version` does not increment, preventing participant players from triggering the immediate force-resync needed to snap to timeline jumps under 2 seconds.
2. When a participant suggests a video to the queue, `state.version` mistakenly increments, falsely signaling a host scrub and triggering unwanted participant playback seeks.
3. In `WatchPartyModal.tsx`, `<DanmakuOverlay />` is duplicated across conditional player branches instead of mounting once over a unified viewport.
4. Git index casing discrepancy on `ChatSocketService.ts` risks breaking cross-platform builds.

## Solution

1. **Playback Versioning Isolation**:
   - Increment `state.version` only on playback-altering actions (`play`, `pause`, `seek`, `change_video`, `play_queue_item`).
   - Preserve `state.version` on metadata actions (`suggest_video`, `remove_queue_item`, `toggle_host_lock`) so queue updates never interrupt playback.
2. **Unified Player Viewport**: Wrap the player WebView and fallback state within a single `styles.playerViewport` container and mount `<DanmakuOverlay />` exactly once across all states.
3. **Repository Casing Alignment**: Consistently track and import `src/services/chat/ChatSocketService.ts` with uppercase `C` matching all project call sites and tsconfig resolution.
4. **Ticket Governance Compliance**: Align all issue files under `.scratch/` with `Status: resolved` and `## Answer` per `docs/agents/issue-tracker.md`.

## User Stories

1. As a watch party participant, I want my video to instantly jump to the host's position when they scrub the timeline, even for small jumps under 2 seconds.
2. As a watch party participant, I want video playback to remain uninterrupted when someone adds a video to the "Up Next" queue, so my stream does not glitch.
3. As a watch party host, I want my pauses, plays, and seeks to immediately enforce synchronization across all participants.
4. As a mobile developer, I want the Danmaku overlay mounted once over a single player viewport container, avoiding duplicate component instances and unnecessary rerenders.
5. As a developer on Linux/CI, I want consistent file casing for `ChatSocketService.ts`, so builds pass reliably across all platforms.
6. As a workflow consumer, I want issue tracking files to correctly report `Status: resolved` with `## Answer` sections when criteria are met.

## Implementation Decisions

- **Version Bumping Rules**: In `ChatSocketService.watchPartyAction`, add `version: (this.watchParty.version || 0) + 1` to `play`, `pause`, and `seek` handlers. In `suggest_video` and `remove_queue_item`, omit version mutation.
- **Single Mounting Point**: Restructure `WatchPartyModal.tsx` so `styles.playerViewport` wraps both the WebView player box and fallback stream box, hosting a single `<DanmakuOverlay />` layer at `position: 'absolute'`.
- **Git Index Renaming**: Run `git mv` or fix index tracking so `src/services/chat/ChatSocketService.ts` is explicitly tracked with uppercase `C`.
- **Triage Alignment**: Update all ticket files in `.scratch/watch-party-sync-danmaku/issues/` to `Status: resolved` with `## Answer`.

## Testing Decisions

- **Test Boundaries**: Test external behavior in `__tests__/ChatService.test.ts`.
- **Behavior to Verify**:
  1. `watchPartyAction('seek', { currentTime: 45 })` increments `getWatchParty.version`.
  2. `watchPartyAction('pause')` and `watchPartyAction('play')` increment `getWatchParty.version`.
  3. `watchPartyAction('suggest_video', ...)` preserves `getWatchParty.version`.
  4. Forced seek behaves correctly when `forceResync = true`.

## Out of Scope

- Redesigning the bottom controls toolbar.
- Adding server-side WebSocket authentication middleware.

## Further Notes

This cycle completes the entire hardening, alignment, and review loop for the Watch Party feature set.
