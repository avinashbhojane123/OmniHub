# 03: Player Sync Drift Hardening & Manual Re-sync Action

**What to build:**
Refined video player synchronization that uses the 2-second drift tolerance logic so participants' video players don't stutter or repeatedly seek during minor network variations, snaps immediately when the host scrubs or pauses, and offers an explicit "⚡ Re-sync to Host" button on the controls bar for participants who want to instantly align with the host.

**Blocked by:** 01 (Watch Party Socket Event Subscription & Drift Tolerance Engine)

**Status:** resolved

- [x] In `WatchPartyModal`, incoming periodic timestamp updates only trigger player seeks if drift exceeds 2 seconds.
- [x] Explicit host actions (play, pause, seek) trigger immediate postMessage commands to the WebView player.
- [x] For participants, an on-screen "⚡ Re-sync to Host" button is available in the player control bar to immediately snap playback to the host's current time.
- [x] Clear visual indicator showing current sync offset status (e.g., "In Sync 🟢" vs "Syncing... 🟡").

## Answer

Integrated `calculateWatchPartyDrift` inside `WatchPartyModal.tsx`'s sync `useEffect` comparing host time against `localPlayerTimeRef.current`. Added dedicated "⚡ Re-sync" action, host version scrub detection, and a live sync status pill.
