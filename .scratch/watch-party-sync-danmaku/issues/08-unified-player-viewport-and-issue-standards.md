# 08: Single DanmakuOverlay Mounting Viewport & Issue Tracker Governance

**What to build:**
Refactor `WatchPartyModal.tsx` so the WebView player and fallback box are wrapped inside a single `playerViewport` container, mounting `<DanmakuOverlay />` once across all playback states. Update all `.scratch/` issue files (01–08) to use canonical `Status: resolved` and `## Answer` headings per `docs/agents/issue-tracker.md`.

**Blocked by:** 07 (Playback Version Isolation & Scrub Snapping in ChatSocketService)

**Status:** resolved

- [x] In `WatchPartyModal.tsx`, mount `<DanmakuOverlay />` exactly once over a parent `styles.playerViewport` box.
- [x] Remove duplicate `<DanmakuOverlay />` from inside `realPlayerBox` and `streamFallbackBox`.
- [x] Align all ticket files in `.scratch/watch-party-sync-danmaku/issues/` to `Status: resolved` with `## Answer` sections.

## Answer

Created `styles.playerViewport` wrapping both player states and mounted a single `<DanmakuOverlay />` instance. Harmonized all issue files 01–08 to `Status: resolved` with `## Answer` blocks in full compliance with project issue tracker standards.
