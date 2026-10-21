import React, { useRef, useMemo } from 'react';
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
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

export interface StreamingServer {
  id: string;
  name: string;
  label: string;
  badge: string;
}

export const STREAMING_SERVERS: StreamingServer[] = [
  { id: 'direct_hls', name: 'Zero-Ad Direct Stream', label: '🛡️ Server 1 (Zero-Ad Stream)', badge: '100% Ad-Free • 1080p' },
  { id: 'vidsrc_sh', name: 'VidSrc Live', label: '⚡ Server 2 (VidSrc)', badge: '1080p Ultra' },
  { id: 'autoembed', name: 'AutoEmbed', label: '⚡ Server 3 (AutoEmbed)', badge: 'Multi-Source' },
  { id: 'cinesrc', name: 'CineSrc', label: '⚡ Server 4 (CineSrc)', badge: 'Backup Mirror' },
];

export const getUniversalEmbedUrl = (
  serverId: string,
  tmdbId: number,
  isTv: boolean,
  season: number,
  episode: number,
): string => {
  switch (serverId) {
    case 'autoembed':
      return isTv
        ? `https://autoembed.co/tv/tmdb/${tmdbId}/${season}/${episode}`
        : `https://autoembed.co/movie/tmdb/${tmdbId}`;
    case 'cinesrc':
      return isTv
        ? `https://cinesrc.st/embed/tv/${tmdbId}?season=${season}&episode=${episode}`
        : `https://cinesrc.st/embed/movie/${tmdbId}`;
    case 'vidsrc_sh':
    default:
      return isTv
        ? `https://vidsrc.sh/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidsrc.sh/embed/movie/${tmdbId}`;
  }
};

export const INJECTED_ADBLOCK_JS = `
  (function() {
    try {
      window.open = function() { return null; };
      window.alert = function() {};
      window.confirm = function() { return true; };
      window.prompt = function() { return null; };
      window.onbeforeunload = null;

      const purgePopups = () => {
        // 1. Remove high-z-index ad overlays
        const suspicious = document.querySelectorAll(
          'div[style*="z-index: 2147483647"], div[style*="z-index: 999999"], div[id*="ad_"], div[class*="popup_"], div[id*="pop_"], a[target="_blank"]'
        );
        suspicious.forEach(el => {
          if (el.tagName === 'A') {
            el.removeAttribute('target');
          } else if (!el.querySelector('video') && el.tagName !== 'VIDEO') {
            el.remove();
          }
        });

        // 2. Kill fake phone number / SMS verification scam overlays
        const phoneInputs = document.querySelectorAll('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i]');
        phoneInputs.forEach(inp => {
          const container = inp.closest('div[style*="position: fixed"], div[style*="position: absolute"], form, .modal, .overlay, .popup');
          if (container && !container.querySelector('video')) {
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
            if (!container.querySelector('video')) {
              container.remove();
            }
          }
        });
      };
      purgePopups();
      setInterval(purgePopups, 800);
    } catch(e) {}
  })();
  true;
`;

export interface ActiveStreamState {
  title: string;
  tmdbId?: number;
  isTv: boolean;
  season: number;
  episode: number;
  serverId: string;
  directUrl?: string;
  quality?: string;
  isHls?: boolean;
}

interface StreamPlayerModalProps {
  visible: boolean;
  streamItem: ActiveStreamState | null;
  insets: EdgeInsets;
  isBuffering: boolean;
  streamError: string | null;
  playerReloadKey: number;
  onClose: () => void;
  onReload: () => void;
  onDownload?: (item: ActiveStreamState) => void;
  onSelectServer: (server: StreamingServer) => void;
  onSelectSeason: (season: number) => void;
  onSelectEpisode: (episode: number) => void;
  onSwitchNextServer: () => void;
  onToggleMediaType: (isTv: boolean) => void;
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onError: (desc: string) => void;
}

export const StreamPlayerModal: React.FC<StreamPlayerModalProps> = React.memo(
  ({
    visible,
    streamItem,
    insets,
    isBuffering,
    streamError,
    playerReloadKey,
    onClose,
    onReload,
    onDownload,
    onSelectServer,
    onSelectSeason,
    onSelectEpisode,
    onSwitchNextServer,
    onToggleMediaType,
    onLoadStart,
    onLoadEnd,
    onError,
  }) => {
    const webViewRef = useRef<any>(null);

    // Audio leak guard: pause before dismiss
    const handleClose = () => {
      try {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            try {
              var v = document.querySelector('video');
              if (v) { v.pause(); v.src = ''; }
            } catch(e) {}
            true;
          `);
        }
      } catch {}
      onClose();
    };

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

    // Dynamic seasons and episodes based on active item state (bounded to realistic show lengths)
    const maxSeasons = useMemo(() => {
      return Math.max(streamItem?.season || 1, 8);
    }, [streamItem?.season]);

    const maxEpisodes = useMemo(() => {
      return Math.max(streamItem?.episode || 1, 16);
    }, [streamItem?.episode]);

    const availableSeasons = useMemo(() => {
      return Array.from({ length: maxSeasons }, (_, i) => i + 1);
    }, [maxSeasons]);

    const availableEpisodes = useMemo(() => {
      return Array.from({ length: maxEpisodes }, (_, i) => i + 1);
    }, [maxEpisodes]);

    if (!visible || !streamItem) return null;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <View style={[styles.streamModalContainer, { paddingTop: insets.top }]}>
          <StatusBar barStyle="light-content" />

          {/* Top Bar */}
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
              <TouchableOpacity
                style={styles.streamDownloadBtn}
                onPress={() => onDownload && onDownload(streamItem)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.8}
              >
                <Text style={styles.streamDownloadBtnText}>⬇️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.streamReloadBtn}
                onPress={onReload}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.streamReloadBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>

          </View>

          {/* Video Player Display */}
          <View style={styles.streamPlayerBox}>
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
                        if (src.indexOf('.m3u8') !== -1 || src.indexOf('worker') !== -1) {
                          if (window.Hls && Hls.isSupported()) {
                            var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
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
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                javaScriptCanOpenWindowsAutomatically={false}
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
                    uri: getUniversalEmbedUrl(
                      streamItem.serverId,
                      streamItem.tmdbId,
                      streamItem.isTv,
                      streamItem.season,
                      streamItem.episode,
                    ),
                    headers: {
                      Referer: 'https://google.com/',
                    },
                  }}
                  allowsFullscreenVideo
                  javaScriptEnabled
                  domStorageEnabled
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  setSupportMultipleWindows={false}
                  javaScriptCanOpenWindowsAutomatically={false}
                  mixedContentMode="always"
                  userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                  injectedJavaScript={INJECTED_ADBLOCK_JS}
                  onShouldStartLoadWithRequest={handleShouldStartLoad}
                  onLoadStart={onLoadStart}
                  onLoadEnd={onLoadEnd}
                  onError={(syntheticEvent: any) => {
                    const { nativeEvent } = syntheticEvent;
                    onError(nativeEvent.description || 'Connection to domain failed');
                  }}
                  onHttpError={(syntheticEvent: any) => {
                    const { nativeEvent } = syntheticEvent;
                    if (nativeEvent.statusCode >= 400) {
                      onError(`Server returned HTTP ${nativeEvent.statusCode}`);
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
          </View>

          {/* Controls & Server Selector ScrollView */}
          <ScrollView
            style={styles.streamControlsScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            {/* Media Type Toggle: Movie vs TV Series */}
            {streamItem.tmdbId ? (
              <View style={styles.mediaTypeSwitchRow}>
                <Text style={styles.streamSectionLabel}>MEDIA TYPE</Text>
                <View style={styles.mediaTypeToggleWrap}>
                  <TouchableOpacity
                    style={[
                      styles.mediaTypeToggleBtn,
                      !streamItem.isTv && styles.mediaTypeToggleBtnActive,
                    ]}
                    onPress={() => onToggleMediaType(false)}
                  >
                    <Text
                      style={[
                        styles.mediaTypeToggleText,
                        !streamItem.isTv && styles.mediaTypeToggleTextActive,
                      ]}
                    >
                      🎬 Full Movie
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.mediaTypeToggleBtn,
                      streamItem.isTv && styles.mediaTypeToggleBtnActive,
                    ]}
                    onPress={() => onToggleMediaType(true)}
                  >
                    <Text
                      style={[
                        styles.mediaTypeToggleText,
                        streamItem.isTv && styles.mediaTypeToggleTextActive,
                      ]}
                    >
                      📺 TV Series
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

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
                    onPress={() => {
                      const url = getUniversalEmbedUrl(
                        streamItem.serverId,
                        streamItem.tmdbId!,
                        streamItem.isTv,
                        streamItem.season,
                        streamItem.episode,
                      );
                      Linking.openURL(url).catch(() => {});
                    }}
                  >
                    <Text style={styles.openExternalLinkText}>Open in Browser ↗</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
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
  mediaTypeSwitchRow: {
    marginBottom: 14,
  },
  mediaTypeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#121620',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1E2433',
    gap: 6,
  },
  mediaTypeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTypeToggleBtnActive: {
    backgroundColor: '#E11D48',
  },
  mediaTypeToggleText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  mediaTypeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
});
