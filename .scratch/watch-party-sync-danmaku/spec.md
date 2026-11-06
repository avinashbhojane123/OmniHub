# Spec: Watch Party Socket Version Sync, Drift Parameter Refactor & Governance Alignment

Status: resolved

## Problem Statement

During deep code review of the Watch Party synchronization system, several architectural defects and governance inconsistencies were identified:
1. When a host pauses, plays, seeks, or changes the video, `version` is incremented on local `this.watchParty.version`, but `version` is completely omitted from the socket emission payload (`this.socket.emit('watchPartyAction', ...)`), and `version` is missing from `WatchPartyActionPayload` in `src/types/chat.ts`. Consequently, remote participants never receive the host's incremented generation sequence across the wire, preventing participants from triggering scrub snapping under 2 seconds.
2. `calculateWatchPartyDrift` exhibits a "Data Clumps" code smell by taking 6 loose primitive parameters (`hostTime`, `participantTime`, `hostIsPlaying`, `participantIsPlaying`, `toleranceSeconds`, `forceResync`).
3. Testing dispatch hooks (`dispatchWatchPartyReactionForTesting` and `dispatchWatchPartyCommentForTesting`) in `ChatSocketService.ts` duplicate socket handler logic and create an unnecessary testing backdoor in production code.
4. Issue tickets in `.scratch/watch-party-sync-danmaku/issues/` use bold formatting `**Status:** resolved` and `## Answer` sections rather than unadorned `Status: <role>` and `## Comments` conforming to `docs/agents/issue-tracker.md`.

## Solution

1. **Wire-Level Version Propagation**:
   - Add optional `version?: number;` to `WatchPartyActionPayload` in `src/types/chat.ts`.
   - In `ChatSocketService.watchPartyAction`, include `version: this.watchParty?.version` in the payload passed to `this.socket.emit('watchPartyAction', ...)`.
2. **Data Clump Refactoring**:
   - Introduce and export `WatchPartyDriftParams` interface containing `{ hostTime, participantTime, hostIsPlaying, participantIsPlaying, toleranceSeconds?, forceResync? }`.
   - Refactor `calculateWatchPartyDrift` to accept a single `WatchPartyDriftParams` object, updating call sites in `WatchPartyModal.tsx` and unit tests in `__tests__/ChatService.test.ts`.
3. **Event Handler Unification**:
   - Replace testing-specific backdoors with unified public methods `handleIncomingWatchPartyReaction(payload)` and `handleIncomingWatchPartyComment(payload)`.
   - Direct socket event listeners (`this.socket.on('watchPartyReaction')` and `this.socket.on('watchPartyComment')`) to these methods, removing duplication.
4. **Issue Tracker Governance Compliance**:
   - Standardize all issue ticket files to use unbolded `Status: resolved` and conversation/resolution updates under `## Comments`.
   - Track and mark tickets for this cycle under `.scratch/watch-party-sync-danmaku/issues/`.

## User Stories

1. As a watch party host, I want my scrub, play, and pause actions to transmit the updated playback version over the socket, so that all participants immediately snap to my exact timestamp.
2. As a watch party participant, I want to receive the host's version counter in incoming socket updates, so that my player triggers instant resynchronization even for timeline jumps smaller than 2 seconds.
3. As a developer maintaining `ChatSocketService`, I want drift calculations to accept a typed `WatchPartyDriftParams` object, so that coordinates and flags do not clump into loose positional arguments.
4. As a test author, I want to invoke standard message handling methods (`handleIncomingWatchPartyReaction` and `handleIncomingWatchPartyComment`), so that test assertions exercise genuine production code paths without testing backdoor artifacts.
5. As an agent or CI bot parsing `.scratch/` tickets, I want issue files to use unbolded `Status: <role>` headers and `## Comments` sections, so that issue parser scripts process statuses reliably.
6. As a repository maintainer, I want `src/types/chat.ts` to strictly type the socket action payload, preventing runtime omission of protocol metadata.

## Implementation Decisions

- **Payload Typing**: In `src/types/chat.ts`, add `version?: number;` to `WatchPartyActionPayload`.
- **Socket Emission**: In `ChatSocketService.watchPartyAction`, update the socket emit to:
  ```ts
  this.socket.emit('watchPartyAction', {
    passcode: this.currentPasscode,
    action,
    version: this.watchParty?.version,
    ...payload,
  });
  ```
- **Drift Signature**: In `ChatSocketService.ts`:
  ```ts
  export interface WatchPartyDriftParams {
    hostTime: number;
    participantTime: number;
    hostIsPlaying: boolean;
    participantIsPlaying: boolean;
    toleranceSeconds?: number;
    forceResync?: boolean;
  }
  export function calculateWatchPartyDrift(params: WatchPartyDriftParams): WatchPartyDriftResult;
  ```
- **Modal Call Site**: In `WatchPartyModal.tsx`, invoke `calculateWatchPartyDrift({ hostTime, participantTime: localTime, hostIsPlaying, participantIsPlaying: localIsPlaying, toleranceSeconds: 2.0, forceResync: isNewHostVersion })`.
- **Public Event Handlers**: Expose `public handleIncomingWatchPartyReaction(payload: WatchPartyReactionPayload): void` and `public handleIncomingWatchPartyComment(payload: WatchPartyCommentPayload): void` on `ChatSocketManager`, wired to `socket.on('watchPartyReaction')` and `socket.on('watchPartyComment')`.
- **Issue Governance**: Strip `**` bolding from `Status: ` in all tickets and change `## Answer` to `## Comments`.

## Testing Decisions

- Test all new behaviors in `__tests__/ChatService.test.ts`.
- Verify `version` propagation: Inspect socket emit payload when `watchPartyAction('seek' | 'play' | 'pause')` is called.
- Verify `calculateWatchPartyDrift`: Test with the new `WatchPartyDriftParams` object across all boundary cases.
- Verify incoming reaction and comment handling via `chatSocketService.handleIncomingWatchPartyReaction` and `chatSocketService.handleIncomingWatchPartyComment`.

## Out of Scope

- Changing backend database schemas.
- Modifying UI components other than `WatchPartyModal.tsx`.

## Further Notes

This cycle completes the hardening against code review findings and establishes strict compliance with repository standards.
