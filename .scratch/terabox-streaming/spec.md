# Feature Spec: TeraBox Video Streaming Support (Zero-Ad ExoPlayer)

## Status: ready-for-agent

## Goal
Enable OmniHub users to paste any public TeraBox video share link into the Android application and stream the video directly with ExoPlayer without opening the TeraBox website, without displaying TeraBox ads, and without any third-party UI or branding.

## Requirements
1. **Target**: Android native application within OmniHub workspace system.
2. **Playback**: Google ExoPlayer (AndroidX Media3) with Fullscreen, Landscape/Portrait auto-rotation, Picture-in-Picture (PiP), seeking, and playback speed control.
3. **No TeraBox UI/Ads**: Zero WebViews for playback, pure stream extraction.
4. **Multi-Quality**: Quality track selection (360p, 480p, 720p, 1080p).
5. **Persistence**: Watch progress autosaved locally with seamless resume playback.
6. **Robustness**: Buffering indicators, exponential backoff retries, SSRF & malicious link defenses.
7. **Scale**: Modular backend extraction microservice with multi-tier caching (L1 memory + Redis), rate limiting, and HTTP 206 Partial Content range streaming proxy.

