import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  BackHandler,
  AppState,
  useWindowDimensions,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

import { StreamingServer, StreamLanguage } from '../../types';
export type { StreamingServer, StreamLanguage };

export const STREAM_LANGUAGES: StreamLanguage[] = [
  { code: '', label: 'Original Audio', flag: '🌐' },
  { code: 'hi', label: 'Hindi (हिन्दी)', flag: '🇮🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ta', label: 'Tamil (தமிழ்)', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu (తెలుగు)', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam (മലയാളം)', flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)', flag: '🇮🇳' },
  { code: 'ko', label: 'Korean (한국어)', flag: '🇰🇷' },
  { code: 'ja', label: 'Japanese (日本語)', flag: '🇯🇵' },
  { code: 'es', label: 'Spanish (Español)', flag: '🇪🇸' },
  { code: 'fr', label: 'French (Français)', flag: '🇫🇷' },
  { code: 'de', label: 'German (Deutsch)', flag: '🇩🇪' },
];

export const STREAMING_SERVERS: StreamingServer[] = [
  { id: 'vidsrc_sh', name: 'VidSrc Instant', label: '⚡ Server 1 (Instant Play)', badge: 'Zero Wait • 1080p' },
  { id: 'autoembed', name: 'AutoEmbed', label: '⚡ Server 2 (AutoEmbed)', badge: 'Multi-Source Instant' },
  { id: 'vidsrc_pm', name: 'VidSrc Pro', label: '⚡ Server 3 (VidSrc Pro)', badge: 'Fast CDN' },
  { id: 'cinesrc', name: 'CineSrc', label: '⚡ Server 4 (CineSrc)', badge: 'Backup Mirror' },
  { id: 'direct_hls', name: 'Zero-Ad Scraper', label: '🛡️ Server 5 (Ad-Free Scraper)', badge: 'Scraped HLS' },
];

export const getUniversalEmbedUrl = (
  serverId: string,
  mediaId: number | string,
  isTv: boolean,
  season: number,
  episode: number,
  lang?: string,
): string => {
  const langQuery = lang ? `&lang=${lang}&ds_lang=${lang}&sub_lang=${lang}` : '';
  const langPrefix = lang ? `?lang=${lang}&ds_lang=${lang}&sub_lang=${lang}` : '';
  const isImdb = typeof mediaId === 'string' && mediaId.startsWith('tt');
  const autoEmbedType = isImdb ? 'imdb' : 'tmdb';

  switch (serverId) {
    case 'autoembed':
      return isTv
        ? `https://autoembed.co/tv/${autoEmbedType}/${mediaId}/${season}/${episode}${langPrefix}`
        : `https://autoembed.co/movie/${autoEmbedType}/${mediaId}${langPrefix}`;
    case 'vidsrc_pm':
      return isTv
        ? `https://vidsrc.pm/embed/tv/${mediaId}/${season}/${episode}${langPrefix}`
        : `https://vidsrc.pm/embed/movie/${mediaId}${langPrefix}`;
    case 'cinesrc':
      return isTv
        ? `https://cinesrc.st/embed/tv/${mediaId}?season=${season}&episode=${episode}${langQuery}`
        : `https://cinesrc.st/embed/movie/${mediaId}${langPrefix}`;
    case 'vidsrc_sh':
    default:
      return isTv
        ? `https://vidsrc.sh/embed/tv/${mediaId}/${season}/${episode}${langPrefix}`
        : `https://vidsrc.sh/embed/movie/${mediaId}${langPrefix}`;
  }
};

export const INJECTED_ADBLOCK_JS = `
  (function() {
    try {
      const purgePopups = () => {
        // 1. Remove high-z-index ad overlays, ensuring we NEVER delete video or iframe player elements
        const suspicious = document.querySelectorAll(
          'div[style*="z-index: 2147483647"], div[style*="z-index: 999999"], div[id*="ad_"], div[class*="popup_"], div[id*="pop_"], a[target="_blank"]'
        );
        suspicious.forEach(el => {
          if (el.tagName === 'A') {
            el.removeAttribute('target');
          } else if (
            !el.querySelector('video') &&
            el.tagName !== 'VIDEO' &&
            !el.querySelector('iframe') &&
            el.tagName !== 'IFRAME' &&
            !el.id?.toLowerCase().includes('player') &&
            !el.className?.toLowerCase().includes('player')
          ) {
            el.remove();
          }
        });

        // 2. Kill fake phone number / SMS verification scam overlays
        const phoneInputs = document.querySelectorAll('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i]');
        phoneInputs.forEach(inp => {
          const container = inp.closest('div[style*="position: fixed"], div[style*="position: absolute"], form, .modal, .overlay, .popup');
          if (container && !container.querySelector('video') && !container.querySelector('iframe')) {
            container.remove();
          }
        });

        // 3. Purge elements containing fake robot captcha / carrier billing keywords
        const elements = document.querySelectorAll('div, form, p, span, h2, h3, button');
        elements.forEach(el => {
          const txt = (el.innerText || '').toLowerCase();
          if (
            (txt.includes('not a robot') && txt.includes('mobile')) ||
            (txt.includes('enter your mobile') && txt.includes('verify')) ||
            (txt.includes('जारी रखना') && txt.includes('+91'))
          ) {
            const container = el.closest('div[style*="position"], form, .modal') || el;
            if (!container.querySelector('video') && !container.querySelector('iframe')) {
              container.remove();
            }
          }
        });
      };
      purgePopups();
      setInterval(purgePopups, 1200);

      // Track progress inside embed video player
      setInterval(function() {
        try {
          var v = document.querySelector('video');
          if (v && !v._hasAgyTracker) {
            v._hasAgyTracker = true;
            v.addEventListener('timeupdate', function() {
              if (Math.floor(v.currentTime) % 4 === 0) {
                try {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'PROGRESS',
                    currentTime: Math.floor(v.currentTime),
                    duration: Math.floor(v.duration || 0)
                  }));
                } catch(e) {}
              }
            });
          }
        } catch(e) {}
      }, 1500);

    } catch(e) {}
  })();
  true;
`;

export interface ActiveStreamState {
  title: string;
  tmdbId?: number | string;
  imdbId?: string;
  isTv: boolean;
  season: number;
  episode: number;
  serverId: string;
  directUrl?: string;
  quality?: string;
  isHls?: boolean;
  headers?: Record<string, string>;
  totalSeasons?: number;
  episodesInSeason?: number;
}

interface StreamPlayerModalProps {
  visible: boolean;
  streamItem: ActiveStreamState | null;
  insets: EdgeInsets;
  isBuffering: boolean;
  streamError: string | null;
  playerReloadKey: number;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onClose: () => void;
  onReload: () => void;
  onDownload?: (item: ActiveStreamState) => void;
  onSelectServer: (server: StreamingServer) => void;
  onSelectSeason: (season: number) => void;
  onSelectEpisode: (episode: number) => void;
  onSwitchNextServer: () => void;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onError: (desc: string) => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];
const SLEEP_OPTIONS = [null, 15, 30, 45, 60];

const formatDuration = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    const remMins = mins % 60;
    return `${hours}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const StreamPlayerModal: React.FC<StreamPlayerModalProps> = React.memo(
  ({
    visible,
    streamItem,
    insets,
    isBuffering,
    streamError,
    playerReloadKey,
    isBookmarked,
    onToggleBookmark,
    onClose,
    onReload,
    onDownload,
    onSelectServer,
    onSelectSeason,
    onSelectEpisode,
    onSwitchNextServer,
    onLoadStart,
    onLoadEnd,
    onError,
  }) => {
    const webViewRef = useRef<any>(null);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isPortrait = windowWidth < windowHeight;

    const [isUnloading, setIsUnloading] = useState(false);

    // Player Enhancement States
    const [isFullscreenCinema, setIsFullscreenCinema] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
    const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
    const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
    const [sleepRemainingText, setSleepRemainingText] = useState<string>('');
    const [savedProgress, setSavedProgress] = useState<{ currentTime: number; duration: number } | null>(null);
    const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false);
    const [seekFeedback, setSeekFeedback] = useState<'left' | 'right' | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('');
    const lastSavedPositionRef = useRef<number>(0);

    // Double-tap tracker refs
    const lastLeftTapRef = useRef<number>(0);
    const lastRightTapRef = useRef<number>(0);

    // Dynamic progress key for SQLite
    const progressKey = useMemo(() => {
      if (!streamItem?.tmdbId) return null;
      return streamItem.isTv
        ? `watch_progress_${streamItem.tmdbId}_tv_s${streamItem.season}_e${streamItem.episode}`
        : `watch_progress_${streamItem.tmdbId}_movie`;
    }, [streamItem?.tmdbId, streamItem?.isTv, streamItem?.season, streamItem?.episode]);

    // Dynamic embed URI
    const currentEmbedUri = useMemo(() => {
      if (!streamItem?.tmdbId) return '';
      return getUniversalEmbedUrl(
        streamItem.serverId,
        streamItem.tmdbId,
        streamItem.isTv,
        streamItem.season,
        streamItem.episode,
        selectedLanguage,
      );
    }, [
      streamItem?.serverId,
      streamItem?.tmdbId,
      streamItem?.isTv,
      streamItem?.season,
      streamItem?.episode,
      selectedLanguage,
    ]);

    // Problem 8 Fix: direct_hls automatic fallback guard to prevent infinite spinner
    useEffect(() => {
      if (visible && streamItem?.serverId === 'direct_hls' && !streamItem?.directUrl) {
        const timer = setTimeout(() => {
          onSwitchNextServer();
        }, 4500);
        return () => clearTimeout(timer);
      }
    }, [visible, streamItem?.serverId, streamItem?.directUrl, onSwitchNextServer]);

    // Check SQLite on mount to see if previously watched
    useEffect(() => {
      if (!visible || !progressKey) return;
      setShowResumePrompt(false);
      setSavedProgress(null);

      settingsRepository.get(progressKey).then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (
              parsed.currentTime &&
              parsed.currentTime > 15 &&
              (!parsed.duration || parsed.currentTime < parsed.duration - 30)
            ) {
              setSavedProgress(parsed);
              setShowResumePrompt(true);
            }
          } catch {}
        }
      });
    }, [visible, progressKey]);

    // Problem 3 Fix: Android Hardware Back Button Handler
    useEffect(() => {
      if (!visible) return;
      const onBackPress = () => {
        if (isFullscreenCinema) {
          setIsFullscreenCinema(false);
          StatusBar.setHidden(false, 'fade');
          return true; // handled, don't close modal
        }
        handleClose();
        return true;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [visible, isFullscreenCinema]);

    // Problem 5 Fix: Pause video when app is backgrounded or minimized
    useEffect(() => {
      if (!visible) return;
      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState.match(/inactive|background/)) {
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              try {
                var videos = document.querySelectorAll('video');
                videos.forEach(function(v) { v.pause(); });
              } catch(e) {}
              true;
            `);
          }
        }
      });
      return () => sub.remove();
    }, [visible]);

    // Sleep Timer countdown handler
    useEffect(() => {
      if (!sleepDeadline) {
        setSleepRemainingText('');
        return;
      }
      const interval = setInterval(() => {
        const diff = Math.max(0, Math.floor((sleepDeadline - Date.now()) / 1000));
        if (diff <= 0) {
          clearInterval(interval);
          setSleepDeadline(null);
          setSleepMinutes(null);
          setSleepRemainingText('');
          handleClose();
          Alert.alert('🌙 Sleep Timer', 'Playback paused and player closed by sleep timer.');
        } else {
          const m = Math.floor(diff / 60);
          const s = diff % 60;
          setSleepRemainingText(`${m}:${s < 10 ? '0' : ''}${s}`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }, [sleepDeadline]);

    // Audio leak guard: pause before dismiss and restore StatusBar
    const handleClose = useCallback(() => {
      setIsUnloading(true);
      StatusBar.setHidden(false, 'fade');
      setIsFullscreenCinema(false);

      // Save last position in SQLite on exit
      if (progressKey && lastSavedPositionRef.current > 5) {
        settingsRepository
          .set(
            progressKey,
            JSON.stringify({
              currentTime: lastSavedPositionRef.current,
              updatedAt: Date.now(),
            }),
          )
          .catch(() => {});
      }

      try {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            try {
              var videos = document.querySelectorAll('video');
              videos.forEach(function(v) { v.pause(); v.src = ''; });
              var iframes = document.querySelectorAll('iframe');
              iframes.forEach(function(f) { f.src = 'about:blank'; });
            } catch(e) {}
            true;
          `);
        }
      } catch {}
      setTimeout(() => {
        setIsUnloading(false);
        onClose();
      }, 50);
    }, [progressKey, onClose]);

    // Handle incoming messages from WebView (Watch progress)
    const handleWebViewMessage = useCallback(
      (event: any) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data && data.type === 'PROGRESS' && typeof data.currentTime === 'number') {
            const sec = Math.floor(data.currentTime);
            lastSavedPositionRef.current = sec;
            if (progressKey && sec > 5) {
              settingsRepository
                .set(
                  progressKey,
                  JSON.stringify({
                    currentTime: sec,
                    duration: data.duration || 0,
                    updatedAt: Date.now(),
                  }),
                )
                .catch(() => {});
            }
          }
        } catch {}
      },
      [progressKey],
    );

    // Resume playback at saved point
    const handleResume = useCallback(() => {
      if (savedProgress && webViewRef.current) {
        const sec = savedProgress.currentTime;
        webViewRef.current.injectJavaScript(`
          try {
            var v = document.querySelector('video');
            if (v) {
              v.currentTime = ${sec};
              v.play().catch(function(){});
            }
          } catch(e) {}
          true;
        `);
      }
      setShowResumePrompt(false);
    }, [savedProgress]);

    // Problem 1 Fix: Seek forward / backward with universal iframe postMessage broadcast
    const handleSeek = useCallback((seconds: number) => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          try {
            var v = document.querySelector('video');
            if (v) {
              v.currentTime = Math.max(0, v.currentTime + (${seconds}));
            }
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
              try {
                iframes[i].contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seek', args: [${seconds}] }), '*');
                iframes[i].contentWindow.postMessage(JSON.stringify({ event: 'seek', val: ${seconds} }), '*');
              } catch(e) {}
            }
          } catch(e) {}
          true;
        `);
      }
    }, []);

    // Problem 6 Fix: Double-tap on video detection
    const handleLeftDoubleTap = () => {
      const now = Date.now();
      if (now - lastLeftTapRef.current < 320) {
        handleSeek(-10);
        setSeekFeedback('left');
        setTimeout(() => setSeekFeedback(null), 650);
        lastLeftTapRef.current = 0;
      } else {
        lastLeftTapRef.current = now;
      }
    };

    const handleRightDoubleTap = () => {
      const now = Date.now();
      if (now - lastRightTapRef.current < 320) {
        handleSeek(10);
        setSeekFeedback('right');
        setTimeout(() => setSeekFeedback(null), 650);
        lastRightTapRef.current = 0;
      } else {
        lastRightTapRef.current = now;
      }
    };

    // Cycle Playback Speed (0.75x -> 1.0x -> 1.25x -> 1.5x -> 2.0x)
    const handleCycleSpeed = useCallback(() => {
      const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      setPlaybackSpeed(next);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          try {
            var v = document.querySelector('video');
            if (v) {
              v.playbackRate = ${next};
            }
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
              try {
                iframes[i].contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [${next}] }), '*');
              } catch(e) {}
            }
          } catch(e) {}
          true;
        `);
      }
    }, [playbackSpeed]);

    // Problem 2 Fix: Toggle 1-Tap Landscape Cinema Mode
    const handleToggleFullscreen = useCallback(() => {
      const next = !isFullscreenCinema;
      setIsFullscreenCinema(next);
      StatusBar.setHidden(next, 'fade');
    }, [isFullscreenCinema]);

    // Cycle Sleep Timer (Off -> 15m -> 30m -> 45m -> 60m)
    const handleCycleSleep = useCallback(() => {
      const idx = SLEEP_OPTIONS.indexOf(sleepMinutes);
      const next = SLEEP_OPTIONS[(idx + 1) % SLEEP_OPTIONS.length];
      setSleepMinutes(next);
      if (next) {
        setSleepDeadline(Date.now() + next * 60 * 1000);
      } else {
        setSleepDeadline(null);
        setSleepRemainingText('');
      }
    }, [sleepMinutes]);

    // Problem 4 Fix: TV Next Episode with Season Finale Rollover
    const handleNextEpisode = useCallback(() => {
      if (!streamItem) return;
      const currentEp = streamItem.episode || 1;
      const currentSeason = streamItem.season || 1;
      const epCount = streamItem.episodesInSeason || 0;
      const seasonCountTotal = streamItem.totalSeasons || 1;

      if (epCount > 0 && currentEp >= epCount) {
        if (currentSeason < seasonCountTotal) {
          Alert.alert(
            'Season Finale',
            `You finished Season ${currentSeason}! Advance to Season ${currentSeason + 1}, Episode 1?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Next Season ▶',
                onPress: () => {
                  onSelectSeason(currentSeason + 1);
                  onSelectEpisode(1);
                },
              },
            ],
          );
        } else {
          Alert.alert('Series Completed', `You have reached the final episode of ${streamItem.title}!`);
        }
      } else {
        onSelectEpisode(currentEp + 1);
      }
    }, [streamItem, onSelectSeason, onSelectEpisode]);

    // Open stream in External Player (VLC / MX Player)
    const handleOpenExternal = useCallback(async () => {
      if (!streamItem) return;
      if (streamItem.directUrl) {
        const vlcUrl = `vlc://${streamItem.directUrl}`;
        const intentUrl = `intent:${streamItem.directUrl.replace(/^https?:\/\//, '')}#Intent;action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;end`;
        try {
          const supported = await Linking.canOpenURL(vlcUrl);
          if (supported) {
            await Linking.openURL(vlcUrl);
            return;
          }
          await Linking.openURL(intentUrl);
        } catch {
          Linking.openURL(streamItem.directUrl).catch(() => {
            Alert.alert(
              'External Player',
              'Could not open VLC. You can install VLC for Android from the Play Store for external playback.',
            );
          });
        }
      } else {
        const url = getUniversalEmbedUrl(
          streamItem.serverId,
          streamItem.tmdbId || 0,
          streamItem.isTv,
          streamItem.season,
          streamItem.episode,
        );
        Linking.openURL(url).catch(() => {});
      }
    }, [streamItem]);

    // AdShield & Request Navigation Guard
    const handleShouldStartLoad = (request: { url: string }) => {
      const url = request.url;
      if (!url) return true;
      const lower = url.toLowerCase();

      if (
        lower.startsWith('about:blank') ||
        lower.startsWith('blob:') ||
        lower.startsWith('data:')
      ) {
        return true;
      }

      if (
        lower.startsWith('intent://') ||
        lower.startsWith('market://') ||
        lower.startsWith('whatsapp://') ||
        lower.startsWith('tg://') ||
        lower.startsWith('alipays://') ||
        lower.startsWith('mailto:') ||
        lower.startsWith('tel:')
      ) {
        return false;
      }

      const blockedPatterns = [
        'trueclick',
        'ff-tag',
        'ff-prime',
        'benchform',
        'adsterra',
        'propellerads',
        'popcash',
        'popads',
        'hilltopads',
        'trafficjunky',
        'exoclick',
        'clickadu',
        'monetag',
        'adcash',
        'juicyads',
        'yandex',
      ];

      if (blockedPatterns.some((p) => lower.includes(p))) {
        return false;
      }

      return true;
    };

    // Dynamic seasons and episodes based on active item state
    const seasonCount = useMemo(() => {
      if (streamItem?.totalSeasons && streamItem.totalSeasons > 0) {
        return Math.max(streamItem.totalSeasons, streamItem.season || 1);
      }
      return Math.max(streamItem?.season || 1, 1);
    }, [streamItem?.totalSeasons, streamItem?.season]);

    const episodeCount = useMemo(() => {
      if (streamItem?.episodesInSeason && streamItem.episodesInSeason > 0) {
        return Math.max(streamItem.episodesInSeason, streamItem.episode || 1);
      }
      return Math.max(streamItem?.episode || 1, 12);
    }, [streamItem?.episodesInSeason, streamItem?.episode]);

    const availableSeasons = useMemo(() => {
      return Array.from({ length: seasonCount }, (_, i) => i + 1);
    }, [seasonCount]);

    const availableEpisodes = useMemo(() => {
      return Array.from({ length: episodeCount }, (_, i) => i + 1);
    }, [episodeCount]);

    // Problem 2 Fix: Cinema container style (rotates 90deg on portrait screens for true landscape cinema)
    const cinemaTransformStyle = isFullscreenCinema
      ? isPortrait
        ? {
            position: 'absolute' as const,
            width: windowHeight,
            height: windowWidth,
            top: (windowHeight - windowWidth) / 2,
            left: (windowWidth - windowHeight) / 2,
            transform: [{ rotate: '90deg' }],
            zIndex: 99999,
            backgroundColor: '#000000',
          }
        : {
            position: 'absolute' as const,
            width: windowWidth,
            height: windowHeight,
            top: 0,
            left: 0,
            zIndex: 99999,
            backgroundColor: '#000000',
          }
      : null;

    if (!visible || !streamItem || isUnloading) return null;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <View
          style={[
            styles.streamModalContainer,
            !isFullscreenCinema && { paddingTop: insets.top },
          ]}
        >
          <StatusBar
            barStyle="light-content"
            hidden={isFullscreenCinema}
          />

          {/* Top Bar (Hidden in Fullscreen Cinema Mode) */}
          {!isFullscreenCinema && (
            <View style={styles.streamModalTopBar}>
              <TouchableOpacity
                style={styles.streamModalCloseBtn}
                onPress={handleClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.streamModalCloseBtnText}>✕</Text>
              </TouchableOpacity>

              <View style={styles.streamModalTitleWrap}>
                <Text style={styles.streamModalTitle} numberOfLines={1}>
                  {streamItem.title}
                </Text>
                <Text style={styles.streamModalBadge}>
                  ⚡{' '}
                  {streamItem.serverId === 'local_server'
                    ? 'Local Server (HTTP 206)'
                    : STREAMING_SERVERS.find((s) => s.id === streamItem.serverId)?.name ||
                      'VidSrc Embed'}{' '}
                  • {streamItem.quality || '1080p HD'}
                </Text>
              </View>

              <View style={styles.streamModalTopActions}>
                {/* Watchlist Bookmark Button */}
                {onToggleBookmark && (
                  <TouchableOpacity
                    style={[
                      styles.streamActionBtn,
                      isBookmarked && styles.streamActionBtnBookmarked,
                    ]}
                    onPress={onToggleBookmark}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.streamActionBtnText}>
                      {isBookmarked ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Download Button */}
                <TouchableOpacity
                  style={styles.streamDownloadBtn}
                  onPress={() => onDownload && onDownload(streamItem)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.streamDownloadBtnText}>⬇️</Text>
                </TouchableOpacity>

                {/* Reload Button */}
                <TouchableOpacity
                  style={styles.streamReloadBtn}
                  onPress={onReload}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.streamReloadBtnText}>🔄</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Video Player Display Container (Auto-rotates in Cinema Mode) */}
          <View
            style={[
              styles.streamPlayerBox,
              cinemaTransformStyle,
            ]}
          >
            {streamItem.directUrl ? (
              <WebView
                ref={webViewRef}
                key={`direct-${streamItem.directUrl}-${playerReloadKey}`}
                originWhitelist={['*']}
                source={{
                  html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>
                      <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body, html { width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                        video { width: 100%; height: 100%; object-fit: contain; }
                      </style>
                    </head>
                    <body>
                      <video id="player" controls playsinline autoplay></video>
                      <script>
                        var v = document.getElementById('player');
                        var src = ${JSON.stringify(streamItem.directUrl)};
                        var customHeaders = ${JSON.stringify(streamItem.headers || {})};

                        // Progress event to report timestamp
                        v.addEventListener('timeupdate', function() {
                          if (Math.floor(v.currentTime) % 3 === 0) {
                            try {
                              window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'PROGRESS',
                                currentTime: Math.floor(v.currentTime),
                                duration: Math.floor(v.duration || 0)
                              }));
                            } catch(e) {}
                          }
                        });

                        if (src.indexOf('.m3u8') !== -1 || src.indexOf('worker') !== -1) {
                          if (window.Hls && Hls.isSupported()) {
                            var hls = new Hls({
                              enableWorker: true,
                              lowLatencyMode: true,
                              xhrSetup: function(xhr, url) {
                                if (customHeaders) {
                                  Object.keys(customHeaders).forEach(function(k) {
                                    try { xhr.setRequestHeader(k, customHeaders[k]); } catch(e) {}
                                  });
                                }
                              }
                            });
                            hls.loadSource(src);
                            hls.attachMedia(v);
                            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                              v.play().catch(function(){ v.muted = true; v.play(); });
                            });
                            hls.on(Hls.Events.ERROR, function(event, data) {
                              if (data.fatal) {
                                switch (data.type) {
                                  case Hls.ErrorTypes.NETWORK_ERROR:
                                    hls.startLoad();
                                    break;
                                  case Hls.ErrorTypes.MEDIA_ERROR:
                                    hls.recoverMediaError();
                                    break;
                                  default:
                                    hls.destroy();
                                    v.src = src;
                                    v.play().catch(function(){});
                                    break;
                                }
                              }
                            });
                          } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
                            v.src = src;
                            v.play().catch(function(){ v.muted = true; v.play(); });
                          } else {
                            v.src = src;
                            v.play().catch(function(){ v.muted = true; v.play(); });
                          }
                        } else {
                          v.src = src;
                          v.play().catch(function(){ v.muted = true; v.play(); });
                        }
                      </script>
                    </body>
                    </html>
                  `,
                }}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                thirdPartyCookiesEnabled={true}
                sharedCookiesEnabled={true}
                allowsProtectedMedia={true}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                javaScriptCanOpenWindowsAutomatically={false}
                onMessage={handleWebViewMessage}
                onShouldStartLoadWithRequest={handleShouldStartLoad}
                style={styles.streamWebview}
              />
            ) : streamItem.serverId === 'direct_hls' ? (
              <View style={styles.streamPlayerLoader}>
                <ActivityIndicator size="large" color="#E11D48" />
                <Text style={styles.streamLoaderText}>
                  ⚡ Connecting to Zero-Ad Direct Stream...
                </Text>
                <Text
                  style={[
                    styles.streamLoaderText,
                    { fontSize: 11, opacity: 0.7, marginTop: 4 },
                  ]}
                >
                  Resolving 1080p stream manifest (Zero Ads)
                </Text>
              </View>
            ) : streamItem.tmdbId ? (
              <View style={styles.webviewWrapper}>
                <WebView
                  ref={webViewRef}
                  key={`embed-${streamItem.serverId}-${streamItem.tmdbId}-${streamItem.season}-${streamItem.episode}-${playerReloadKey}`}
                  source={{
                    uri: currentEmbedUri,
                  }}
                  allowsFullscreenVideo
                  javaScriptEnabled
                  domStorageEnabled
                  thirdPartyCookiesEnabled={true}
                  sharedCookiesEnabled={true}
                  allowsProtectedMedia={true}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  setSupportMultipleWindows={false}
                  javaScriptCanOpenWindowsAutomatically={false}
                  mixedContentMode="always"
                  userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                  injectedJavaScript={INJECTED_ADBLOCK_JS}
                  onMessage={handleWebViewMessage}
                  onShouldStartLoadWithRequest={handleShouldStartLoad}
                  onLoadStart={onLoadStart}
                  onLoadEnd={onLoadEnd}
                  onError={(syntheticEvent: any) => {
                    const { nativeEvent } = syntheticEvent;
                    onError(nativeEvent.description || 'Connection to domain failed');
                  }}
                  onHttpError={(syntheticEvent: any) => {
                    const { nativeEvent } = syntheticEvent;
                    // Only surface error if HTTP failure is on the main document itself,
                    // not for subresource tracking beacons, broken favicons, or blocked ad scripts.
                    if (nativeEvent.statusCode >= 400) {
                      const isMainDoc =
                        Boolean(nativeEvent.isForMainFrame) ||
                        (Boolean(nativeEvent.url) &&
                          Boolean(currentEmbedUri) &&
                          nativeEvent.url.split('?')[0] === currentEmbedUri.split('?')[0]);
                      if (isMainDoc) {
                        onError(`Server returned HTTP ${nativeEvent.statusCode}`);
                      }
                    }
                  }}
                  style={styles.streamWebview}
                />
                {isBuffering && !streamError && (
                  <View style={styles.streamPlayerLoader}>
                    <ActivityIndicator size="large" color="#E11D48" />
                    <Text style={styles.streamLoaderText}>
                      Connecting to{' '}
                      {STREAMING_SERVERS.find((s) => s.id === streamItem.serverId)?.name ||
                        'Mirror'}
                      ...
                    </Text>
                  </View>
                )}
                {streamError && (
                  <View style={styles.streamErrorOverlay}>
                    <Text style={styles.streamErrorIcon}>⚠️</Text>
                    <Text style={styles.streamErrorTitle}>Domain Connection Notice</Text>
                    <Text style={styles.streamErrorSubtitle}>
                      {STREAMING_SERVERS.find((s) => s.id === streamItem.serverId)?.name ||
                        'This mirror'}{' '}
                      could not be reached ({streamError}). This domain is often restricted
                      by your ISP's default DNS.
                    </Text>
                    <TouchableOpacity
                      style={styles.switchMirrorBtn}
                      onPress={onSwitchNextServer}
                    >
                      <Text style={styles.switchMirrorBtnText}>
                        ⚡ Switch to Next Working Server
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.dnsTipText}>
                      💡 Tip: Enable Private DNS (dns.google or 1.1.1.1) in phone settings
                      to unlock all mirrors.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Problem 6 Fix: Invisible Double-Tap Seek Zones (Left: -10s, Right: +10s) */}
            <View style={styles.seekZonesOverlay} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.seekZoneHalf}
                activeOpacity={1}
                onPress={handleLeftDoubleTap}
              >
                {seekFeedback === 'left' && (
                  <View style={styles.seekFeedbackBadge}>
                    <Text style={styles.seekFeedbackIcon}>⏪</Text>
                    <Text style={styles.seekFeedbackText}>-10s</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.seekZoneHalf}
                activeOpacity={1}
                onPress={handleRightDoubleTap}
              >
                {seekFeedback === 'right' && (
                  <View style={styles.seekFeedbackBadge}>
                    <Text style={styles.seekFeedbackIcon}>⏩</Text>
                    <Text style={styles.seekFeedbackText}>+10s</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Cinema Mode Floating Controls Overlay */}
            {isFullscreenCinema && (
              <View style={styles.cinemaOverlayControls}>
                <TouchableOpacity
                  style={styles.cinemaExitBtn}
                  onPress={handleToggleFullscreen}
                >
                  <Text style={styles.cinemaExitBtnText}>✕ Exit Cinema</Text>
                </TouchableOpacity>

                <View style={styles.cinemaOverlayRight}>
                  <TouchableOpacity
                    style={styles.cinemaSeekBtn}
                    onPress={() => handleSeek(-10)}
                  >
                    <Text style={styles.cinemaSeekBtnText}>⏪ 10s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cinemaSeekBtn}
                    onPress={() => handleSeek(10)}
                  >
                    <Text style={styles.cinemaSeekBtnText}>⏩ 10s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cinemaSeekBtn}
                    onPress={handleCycleSpeed}
                  >
                    <Text style={styles.cinemaSeekBtnText}>{playbackSpeed}x</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Resume Playback Prompt Banner */}
          {showResumePrompt && savedProgress && !isFullscreenCinema && (
            <View style={styles.resumePromptBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumePromptTitle}>
                  Resume from {formatDuration(savedProgress.currentTime)}?
                </Text>
                <Text style={styles.resumePromptSubtitle}>
                  You were watching this title earlier
                </Text>
              </View>
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
                <Text style={styles.resumeBtnText}>▶ Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resumeDismissBtn}
                onPress={() => setShowResumePrompt(false)}
              >
                <Text style={styles.resumeDismissBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Problem 1 Fix: Mirror controls notification badge */}
          {!isFullscreenCinema && streamItem.serverId !== 'direct_hls' && (
            <View style={styles.mirrorNoticeBar}>
              <Text style={styles.mirrorNoticeText}>
                ⚡ Mirror Player active. Tap Server 1 above for OmniHub custom controls, or use on-screen mirror buttons.
              </Text>
            </View>
          )}

          {/* Dynamic Video Action Toolbar (Seek, Speed, Cinema, Sleep, VLC, Next Episode) */}
          {!isFullscreenCinema && (
            <View style={styles.playerToolbar}>
              {/* Seek -10s */}
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() => handleSeek(-10)}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>⏪</Text>
                <Text style={styles.toolBtnLabel}>-10s</Text>
              </TouchableOpacity>

              {/* Seek +10s */}
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() => handleSeek(10)}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>⏩</Text>
                <Text style={styles.toolBtnLabel}>+10s</Text>
              </TouchableOpacity>

              {/* Playback Speed */}
              <TouchableOpacity
                style={[
                  styles.toolBtn,
                  playbackSpeed !== 1.0 && styles.toolBtnActive,
                ]}
                onPress={handleCycleSpeed}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>⏱️</Text>
                <Text
                  style={[
                    styles.toolBtnLabel,
                    playbackSpeed !== 1.0 && styles.toolBtnLabelActive,
                  ]}
                >
                  {playbackSpeed}x
                </Text>
              </TouchableOpacity>

              {/* 1-Tap Cinema Mode */}
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={handleToggleFullscreen}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>⛶</Text>
                <Text style={styles.toolBtnLabel}>Cinema</Text>
              </TouchableOpacity>

              {/* Sleep Timer */}
              <TouchableOpacity
                style={[
                  styles.toolBtn,
                  Boolean(sleepMinutes) && styles.toolBtnActive,
                ]}
                onPress={handleCycleSleep}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>🌙</Text>
                <Text
                  style={[
                    styles.toolBtnLabel,
                    Boolean(sleepMinutes) && styles.toolBtnLabelActive,
                  ]}
                >
                  {sleepRemainingText || (sleepMinutes ? `${sleepMinutes}m` : 'Sleep')}
                </Text>
              </TouchableOpacity>

              {/* External VLC Player */}
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={handleOpenExternal}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>🍿</Text>
                <Text style={styles.toolBtnLabel}>VLC</Text>
              </TouchableOpacity>

              {/* Language Cycle Button */}
              <TouchableOpacity
                style={[
                  styles.toolBtn,
                  Boolean(selectedLanguage) && styles.toolBtnActive,
                ]}
                onPress={() => {
                  const codes = STREAM_LANGUAGES.map((l) => l.code);
                  const nextCode = codes[(codes.indexOf(selectedLanguage) + 1) % codes.length];
                  setSelectedLanguage(nextCode);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.toolBtnIcon}>🌐</Text>
                <Text
                  style={[
                    styles.toolBtnLabel,
                    Boolean(selectedLanguage) && styles.toolBtnLabelActive,
                  ]}
                >
                  {selectedLanguage ? selectedLanguage.toUpperCase() : 'Lang'}
                </Text>
              </TouchableOpacity>

              {/* Problem 4 Fix: Next Episode Button (TV Series Only) */}
              {streamItem.isTv && (
                <TouchableOpacity
                  style={[styles.toolBtn, styles.toolBtnNextEp]}
                  onPress={handleNextEpisode}
                  activeOpacity={0.7}
                >
                  <Text style={styles.toolBtnIcon}>⏭</Text>
                  <Text style={styles.toolBtnLabelNextEp}>
                    Ep {(streamItem.episode || 1) + 1}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Controls & Server Selector ScrollView (Hidden in Cinema Mode) */}
          {!isFullscreenCinema && (
            <ScrollView
              style={styles.streamControlsScroll}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {/* Episode & Season Selectors (when TV Series mode) */}
              {streamItem.isTv && streamItem.tmdbId ? (
                <View style={styles.seasonEpisodeSection}>
                  <Text style={styles.streamSectionLabel}>SELECT SEASON</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectorPillsRow}
                  >
                    {availableSeasons.map((s) => (
                      <TouchableOpacity
                        key={`s-${s}`}
                        style={[
                          styles.selectorPill,
                          streamItem.season === s && styles.selectorPillActive,
                        ]}
                        onPress={() => onSelectSeason(s)}
                      >
                        <Text
                          style={[
                            styles.selectorPillText,
                            streamItem.season === s && styles.selectorPillTextActive,
                          ]}
                        >
                          Season {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={[styles.streamSectionLabel, { marginTop: 12 }]}>
                    SELECT EPISODE (SEASON {streamItem.season})
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectorPillsRow}
                  >
                    {availableEpisodes.map((e) => (
                      <TouchableOpacity
                        key={`e-${e}`}
                        style={[
                          styles.selectorPill,
                          streamItem.episode === e && styles.selectorPillActive,
                        ]}
                        onPress={() => onSelectEpisode(e)}
                      >
                        <Text
                          style={[
                            styles.selectorPillText,
                            streamItem.episode === e && styles.selectorPillTextActive,
                          ]}
                        >
                          Ep {e}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* Server Mirrors Selector */}
              <View style={styles.serversSection}>
                <View style={styles.serversHeaderRow}>
                  <Text style={styles.streamSectionLabel}>STREAMING MIRRORS</Text>
                  <Text style={styles.serversHint}>Tap mirror if buffering</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectorPillsRow}
                >
                  {STREAMING_SERVERS.map((server) => {
                    const isSelected = streamItem.serverId === server.id;
                    return (
                      <TouchableOpacity
                        key={server.id}
                        style={[
                          styles.serverCard,
                          isSelected && styles.serverCardActive,
                        ]}
                        onPress={() => onSelectServer(server)}
                      >
                        <Text
                          style={[
                            styles.serverCardName,
                            isSelected && styles.serverCardNameActive,
                          ]}
                        >
                          {server.label}
                        </Text>
                        <Text
                          style={[
                            styles.serverCardBadge,
                            isSelected && styles.serverCardBadgeActive,
                          ]}
                        >
                          {server.badge}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {streamItem.directUrl && (
                    <TouchableOpacity
                      style={[
                        styles.serverCard,
                        streamItem.serverId === 'local_server' &&
                          styles.serverCardActive,
                      ]}
                      onPress={() =>
                        onSelectServer({
                          id: 'local_server',
                          name: 'Local Server',
                          label: '💾 Local Server',
                          badge: 'HTTP 206',
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.serverCardName,
                          streamItem.serverId === 'local_server' &&
                            styles.serverCardNameActive,
                        ]}
                      >
                        💾 Local Server
                      </Text>
                      <Text
                        style={[
                          styles.serverCardBadge,
                          streamItem.serverId === 'local_server' &&
                            styles.serverCardBadgeActive,
                        ]}
                      >
                        HTTP 206
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>

              {/* Audio & Subtitle Language Selector Section */}
              <View style={styles.languageSection}>
                <View style={styles.serversHeaderRow}>
                  <Text style={styles.streamSectionLabel}>AUDIO & SUBTITLE LANGUAGE</Text>
                  {Boolean(selectedLanguage) && (
                    <TouchableOpacity onPress={() => setSelectedLanguage('')}>
                      <Text style={styles.resetLangText}>Reset to Original ↺</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.streamLangNotice}>
                  💡 Broadcast streams play in original audio. For subtitles & alternate audio, tap [CC] or ⚙️ inside the video player controls.
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectorPillsRow}
                >
                  {STREAM_LANGUAGES.map((lang) => {
                    const isSelected = selectedLanguage === lang.code;
                    return (
                      <TouchableOpacity
                        key={`lang-opt-${lang.code || 'orig'}`}
                        style={[
                          styles.languagePill,
                          isSelected && styles.languagePillActive,
                        ]}
                        onPress={() => setSelectedLanguage(lang.code)}
                      >
                        <Text
                          style={[
                            styles.languagePillText,
                            isSelected && styles.languagePillTextActive,
                          ]}
                        >
                          {lang.flag} {lang.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* AdShield & Security Protection Info Card */}
              <View style={styles.adShieldCard}>
                <View style={styles.adShieldHeader}>
                  <Text style={styles.adShieldIcon}>🛡️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adShieldTitle}>
                      Zero-Ad Stream Protection Active
                    </Text>
                    <Text style={styles.adShieldDesc}>
                      Streaming directly from raw high-speed video servers with all
                      website ad networks, adult banners, and fake verification popups
                      completely removed.
                    </Text>
                  </View>
                </View>

                {streamItem.tmdbId && (
                  <View style={styles.streamInfoMetaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>
                        TMDb ID: {streamItem.tmdbId}
                      </Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>Dual Audio / Multi-Sub</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.openExternalLinkBtn}
                      onPress={handleOpenExternal}
                    >
                      <Text style={styles.openExternalLinkText}>
                        {streamItem.directUrl ? 'Open in VLC 🍿' : 'Open in Browser ↗'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  streamModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  streamModalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#090B10',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2433',
    gap: 10,
  },
  streamModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E2433',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamModalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  streamModalTitleWrap: {
    flex: 1,
  },
  streamModalTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  streamModalBadge: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  streamModalTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E2433',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  streamActionBtnBookmarked: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: '#FBBF24',
  },
  streamActionBtnText: {
    color: '#FBBF24',
    fontSize: 16,
    fontWeight: 'bold',
  },
  streamDownloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamDownloadBtnText: {
    fontSize: 15,
  },
  streamReloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E2433',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamReloadBtnText: {
    fontSize: 14,
  },
  streamPlayerBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
  },
  webviewWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  streamWebview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  streamPlayerLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090B10',
    zIndex: 10,
  },
  streamLoaderText: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  seekZonesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 15,
  },
  seekZoneHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekFeedbackBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  seekFeedbackIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  seekFeedbackText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cinemaOverlayControls: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  cinemaExitBtn: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cinemaExitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cinemaOverlayRight: {
    flexDirection: 'row',
    gap: 8,
  },
  cinemaSeekBtn: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cinemaSeekBtnText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '700',
  },
  resumePromptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B18',
    borderBottomWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  resumePromptTitle: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
  },
  resumePromptSubtitle: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  resumeBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resumeBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  resumeDismissBtn: {
    padding: 6,
  },
  resumeDismissBtnText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mirrorNoticeBar: {
    backgroundColor: '#141824',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2433',
  },
  mirrorNoticeText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  playerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0F131D',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2433',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#262D3D',
    minWidth: 46,
  },
  toolBtnActive: {
    borderColor: '#E11D48',
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
  },
  toolBtnNextEp: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  toolBtnIcon: {
    fontSize: 14,
  },
  toolBtnLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  toolBtnLabelActive: {
    color: '#E11D48',
  },
  toolBtnLabelNextEp: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  streamControlsScroll: {
    flex: 1,
    backgroundColor: '#090B10',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  streamSectionLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  seasonEpisodeSection: {
    backgroundColor: '#121620',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  selectorPillsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  selectorPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  selectorPillActive: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  selectorPillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  selectorPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  serversSection: {
    marginBottom: 16,
  },
  serversHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serversHint: {
    color: '#6B7280',
    fontSize: 11,
    marginBottom: 8,
  },
  serverCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#121620',
    borderWidth: 1,
    borderColor: '#1E2433',
    marginRight: 2,
    minWidth: 110,
  },
  serverCardActive: {
    backgroundColor: '#1E2433',
    borderColor: '#E11D48',
    borderWidth: 1.5,
  },
  serverCardName: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  serverCardNameActive: {
    color: '#FFFFFF',
  },
  serverCardBadge: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  serverCardBadgeActive: {
    color: '#F43F5E',
    fontWeight: '700',
  },
  adShieldCard: {
    backgroundColor: '#121620',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2433',
    marginBottom: 20,
  },
  adShieldHeader: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  adShieldIcon: {
    fontSize: 22,
  },
  adShieldTitle: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  adShieldDesc: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 16,
  },
  streamInfoMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A1E29',
    paddingTop: 10,
  },
  metaChip: {
    backgroundColor: '#161B26',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaChipText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  openExternalLinkBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1E2433',
  },
  openExternalLinkText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  streamErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 12, 18, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 20,
  },
  streamErrorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  streamErrorTitle: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  streamErrorSubtitle: {
    color: '#D1D5DB',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  switchMirrorBtn: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  switchMirrorBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  dnsTipText: {
    color: '#9CA3AF',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
  },
  languageSection: {
    marginBottom: 16,
  },
  resetLangText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  streamLangNotice: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
    marginTop: 2,
  },
  languagePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#121620',
    borderWidth: 1,
    borderColor: '#1E2433',
    marginRight: 2,
  },
  languagePillActive: {
    backgroundColor: '#1E2433',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  languagePillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  languagePillTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
});
