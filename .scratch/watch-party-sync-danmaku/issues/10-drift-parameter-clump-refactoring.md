# 10: Drift Parameter Clump Refactoring (WatchPartyDriftParams)

**What to build:**
Refactor `calculateWatchPartyDrift` from six loose positional arguments into a strongly typed `WatchPartyDriftParams` interface, updating call sites in `WatchPartyModal.tsx` and test assertions in `__tests__/ChatService.test.ts`.

**Blocked by:** None (can start immediately)

Status: resolved

- [x] Export `interface WatchPartyDriftParams` in `ChatSocketService.ts`.
- [x] Refactor `calculateWatchPartyDrift(params: WatchPartyDriftParams)` to unpack the options object.
- [x] Update call site in `WatchPartyModal.tsx` to pass the structured object.
- [x] Update all unit tests in `__tests__/ChatService.test.ts` to supply `WatchPartyDriftParams`.

## Comments

Introduced `WatchPartyDriftParams` in `ChatSocketService.ts`, refactored `calculateWatchPartyDrift`, updated call site in `WatchPartyModal.tsx`, and updated all unit tests in `__tests__/ChatService.test.ts` to pass the params object. Zero regressions.
