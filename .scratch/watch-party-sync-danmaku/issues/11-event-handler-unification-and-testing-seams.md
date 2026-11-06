# 11: Event Handler Unification & Testing Seam Removal

**What to build:**
Unify socket reaction and comment reception with public service methods `handleIncomingWatchPartyReaction` and `handleIncomingWatchPartyComment` in `ChatSocketService.ts`, wiring socket event listeners directly into them and removing testing backdoors.

**Blocked by:** None (can start immediately)

Status: resolved

- [x] Implement `handleIncomingWatchPartyReaction(payload: WatchPartyReactionPayload)` on `ChatSocketManager`.
- [x] Implement `handleIncomingWatchPartyComment(payload: WatchPartyCommentPayload)` on `ChatSocketManager`.
- [x] Connect `this.socket.on('watchPartyReaction', (payload) => this.handleIncomingWatchPartyReaction(payload))` and `this.socket.on('watchPartyComment', (payload) => this.handleIncomingWatchPartyComment(payload))`.
- [x] Deprecate/replace `dispatchWatchPartyReactionForTesting` and `dispatchWatchPartyCommentForTesting`.
- [x] Update test assertions in `__tests__/ChatService.test.ts` to call the production handler methods.

## Comments

Implemented production handler methods `handleIncomingWatchPartyReaction` and `handleIncomingWatchPartyComment` on `ChatSocketService`, directly wired to socket listener callbacks to eliminate code duplication, and updated unit tests to exercise these production handlers.
