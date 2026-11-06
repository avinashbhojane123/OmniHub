# 01: Watch Party Socket Event Subscription & Drift Tolerance Engine

**What to build:**
A robust drift calculation and socket dispatch engine for watch parties that determines when a participant has drifted far enough from the host to warrant seeking (> 2.0s) versus when minor differences (<= 2.0s) should play smoothly without micro-stuttering. Also ensures all watch party reaction and comment events are properly captured, normalized, and dispatched to subscribers.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Provide a pure `calculateWatchPartyDrift` helper that evaluates host timestamp vs participant timestamp and returns whether a seek is required based on a 2.0-second tolerance window.
- [x] Verify that immediate host state changes (play, pause, seek) bypass tolerance and trigger immediate synchronization.
- [x] Ensure `ChatSocketService` reaction and comment event subscriptions reliably receive and format incoming payloads.
- [x] Unit tests in `__tests__/ChatService.test.ts` pass verifying drift calculations and subscription dispatches.

## Answer

Implemented `calculateWatchPartyDrift` with `WatchPartyDriftResult` in `ChatSocketService.ts`, exported for use across components, with full test coverage in `__tests__/ChatService.test.ts`.
