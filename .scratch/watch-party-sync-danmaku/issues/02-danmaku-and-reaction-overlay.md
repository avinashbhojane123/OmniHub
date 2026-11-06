# 02: Danmaku Bullet Comments & Floating Emoji Burst Overlay in Video Player

**What to build:**
A visual animation overlay on top of the Watch Party video player that displays incoming live reaction comments as horizontal Danmaku bullet text flying across the screen, and incoming reaction emojis as floating bubbles ascending from the bottom-right and fading out. An overlay toggle button (👁️) allows users to hide or show the overlay at any time without blocking player touch controls.

**Blocked by:** 01 (Watch Party Socket Event Subscription & Drift Tolerance Engine)

Status: resolved

- [x] Danmaku comments float smoothly from right to left across varied vertical tracks on top of the video player.
- [x] Reaction emojis float upward from the bottom in animated bubble bursts and fade out cleanly.
- [x] Overlay uses non-blocking touch behavior (`pointerEvents="box-none"`) so user taps still interact with the video player.
- [x] An on-screen Danmaku toggle button allows participants to show or hide all floating animations with immediate feedback.
- [x] Smooth performance at 60 FPS using React Native native-driver animations.

## Comments

Built `DanmakuOverlay` component utilizing React Native native-driver animations, randomized vertical tracks/offsets, and non-blocking pointer events (`box-none`) with an on-screen toggle button.
