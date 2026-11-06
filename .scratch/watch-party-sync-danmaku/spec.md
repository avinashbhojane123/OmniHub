# Spec: Watch Party Sync Hardening & Danmaku Floating Reactions

Status: ready-for-agent

## Problem Statement

Users watching synchronized streams in chat rooms currently experience two major friction points:
1. Playback synchronization can jitter or repeatedly seek if network latency creates slight timestamp differences between the host and participants.
2. In-stream social interactions are detached: reaction emojis and live comments submitted within the watch party are not visually animated over the video player (danmaku/bullet comments), making the watch party feel static and passive rather than an interactive group viewing experience.

## Solution

Upgrade the Watch Party system to provide:
1. **Intelligent Playback Synchronization**: Implement a 2-second drift tolerance window so participants only seek when genuine divergence occurs, avoiding micro-stuttering. Provide instant alignment on host play/pause/seek events and a dedicated manual "Re-sync to Host" action.
2. **Dynamic Danmaku & Floating Reactions**: Deliver rich real-time visual overlays directly on top of the video player:
   - Live comments fly smoothly from right to left across the video (bullet comments / danmaku style).
   - Emoji reactions float upward from the bottom in animated bubble bursts that fade out.
3. **Overlay Visibility Controls**: Allow participants to toggle the floating overlay on or off with a single tap (eye icon) so viewers who prefer an uncluttered video can disable it at any time.
4. **Dual Stream Delivery**: Ensure watch party comments are simultaneously animated as Danmaku over the video and recorded with badge styling in the room chat history.
5. **Shared Video Queue**: Allow participants to propose video URLs to an "Up Next" queue while the host retains playback authority and controls.

## User Stories

1. As a watch party participant, I want reaction emojis to float upward over the video in animated bubbles, so that I can see the room's live emotional reactions in real time.
2. As a watch party participant, I want live comments to float across the video screen as danmaku bullet text, so that I can follow group commentary without taking my eyes off the video.
3. As a watch party participant, I want to toggle floating danmaku text and emoji reactions on and off with a single tap, so that I can enjoy a clean view of the video when desired.
4. As a watch party participant, I want playback to tolerate up to 2 seconds of network drift without seeking, so that my audio and video stream does not stutter from minor network fluctuations.
5. As a watch party participant, I want playback to immediately seek and match when the host scrubs the timeline, so that I stay in sync with major timeline shifts.
6. As a watch party participant, I want an on-screen "Re-sync to Host" button, so that I can instantly force my video to snap to the host's exact position if I fall behind.
7. As a room member, I want watch party comments to appear as highlighted badge entries in the room chat, so that participants who have the video modal minimized do not miss conversation context.
8. As a watch party host, I want to lock or unlock playback controls for other participants, so that unauthorized viewers cannot accidentally pause or fast-forward the show.
9. As a watch party participant, I want to submit video links to an "Up Next" suggestions queue, so that the host can seamlessly pick subsequent videos to watch together.
10. As a watch party host, I want to view the queue and switch to queued videos with one tap, so that group viewing sessions can continue smoothly without downtime.
11. As a watch party participant, I want to see clear notifications when a video fails to embed (such as restricted YouTube embeds), so that I know why playback stopped and what action to take.
12. As a mobile viewer, I want floating reactions and comments to perform smoothly at 60 FPS without dropping frames or blocking touch interaction with player controls.

## Implementation Decisions

- **Floating Animation Engine**: Use lightweight React Native Animated / native driver transforms for danmaku comments and emoji reaction bubbles over the video viewport. Ensure pointer events for the overlay layer are configured to `box-none` so native player controls remain fully interactive.
- **Sync Drift Logic**: Compare incoming host timestamp with local player timestamp. If the absolute difference is less than or equal to 2 seconds and playback state (playing/paused) matches, preserve local playback. If drift exceeds 2 seconds or playback state diverges, trigger a player seek and state synchronization.
- **Immediate State Triggers**: Force unconditional synchronization when the host explicitly initiates a play, pause, or seek action, bypassing drift tolerance.
- **Manual Re-sync Action**: Expose an explicit re-sync trigger that fetches the host's latest state and forces a hard player seek to the host's current timestamp.
- **Overlay Toggle State**: Persist overlay visibility (`isOverlayVisible`) in local component state defaulting to active. Toggling hides rendered danmaku tracks and emoji particle containers immediately.
- **Event Dispatching Seam**: Connect socket reaction and comment subscriptions to the chat room and watch party components, ensuring incoming payloads populate both the active overlay animation buffer and room chat message log.
- **Video Queue Architecture**: Maintain a FIFO queue of candidate video sources in the watch party state, enabling room members to append suggestions and hosts to promote queued items.

## Testing Decisions

- **Test Boundaries**: Test external behavior at the ChatSocketService boundary in `__tests__/ChatService.test.ts`.
- **Behavior to Verify**:
  1. Proper registration, receipt, and notification of watch party reaction and comment listeners.
  2. Calculation of sync drift (verifying whether a drift delta <= 2s is treated as within tolerance versus > 2s requiring seek intervention).
  3. Correct state formatting for video queue additions and control lock toggles.
- **Style and Prior Art**: Mirror existing test suites such as `__tests__/ChatService.test.ts` and `__tests__/MovieService.test.ts`. Avoid asserting on internal React Native WebView rendering internals.

## Out of Scope

- Peer-to-peer screen sharing of local device desktop/screen (WebRTC screen capture).
- In-player live drawing/pen annotation over video frames.
- Automated DRM bypass for paid streaming services (Netflix, Disney+, Prime Video).

## Further Notes

The existing `ChatSocketService` already defines socket emission methods (`watchPartyReaction`, `watchPartyComment`) and subscription listeners. The primary effort will bridge these events to UI Danmaku render tracks, implement drift tolerance filtering, and add the queue structure.

