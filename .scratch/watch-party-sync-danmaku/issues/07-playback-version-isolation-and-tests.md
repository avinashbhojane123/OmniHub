# 07: Playback Version Isolation & Scrub Snapping in ChatSocketService

**What to build:**
Ensure `ChatSocketService.watchPartyAction` increments `this.watchParty.version` exclusively on playback-altering actions (`play`, `pause`, `seek`, `change_video`, `play_queue_item`), while leaving `version` unchanged on metadata actions (`suggest_video`, `remove_queue_item`, `toggle_host_lock`). Consistently track `ChatSocketService.ts` in the git index with uppercase `C`.

**Blocked by:** None (can start immediately)

Status: resolved

- [x] In `ChatSocketService.ts`, increment `version` on `play`, `pause`, and `seek`.
- [x] In `ChatSocketService.ts`, do NOT increment `version` on `suggest_video` or `remove_queue_item`.
- [x] Fix git index casing for `src/services/chat/ChatSocketService.ts` to uppercase `C`.
- [x] Add unit tests in `__tests__/ChatService.test.ts` verifying that `seek`, `play`, and `pause` increment `version`, while `suggest_video` preserves `version`.

## Comments

Implemented isolated version increments in `ChatSocketService.ts` (`seek`, `play`, `pause` bump `version` while `suggest_video` preserves it). Fixed file casing in git index, and verified with 100% passing tests in `__tests__/ChatService.test.ts`.
