import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  Modal,
  Clipboard,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../hooks/useTheme';
import { teraboxService, ExtractTeraBoxResult, TeraBoxStream } from '../services/terabox/TeraBoxService';
import { nativePlayerBridge } from '../services/terabox/TeraBoxNativePlayer';
import { HLS_LIGHT_SCRIPT } from '../services/terabox/hlsScript';

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p'];

export interface SessionStreamItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  lastQuality: string;
}

export const TeraBoxWorkspaceScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();

  // State: Input & Extraction
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // State: Session Streams (In-Memory only, no database)
  const [sessionStreams, setSessionStreams] = useState<SessionStreamItem[]>([]);

  // State: Video Details Modal
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<ExtractTeraBoxResult | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('720p');

  // State: Player Screen / Modal
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string>('');
  const [activeManifest, setActiveManifest] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerReloadKey, setPlayerReloadKey] = useState(0);

  const webViewRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendVideoCommand = useCallback((js: string) => {
    try {
      webViewRef.current?.injectJavaScript(`(function(){ try { ${js} } catch(e){} })(); true;`);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        nativePlayerBridge.setKeepScreenOn(false);
        nativePlayerBridge.setOrientation('portrait');
      };
    }, []),
  );

  // Handle hardware back button when player is open
  useEffect(() => {
    const onBackPress = () => {
      if (playerModalVisible) {
        closePlayer();
        return true;
      }
      if (detailModalVisible) {
        setDetailModalVisible(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [playerModalVisible, detailModalVisible]);

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getString();
      if (text && text.trim()) {
        setUrlInput(text.trim());
        setExtractionError(null);
      }
    } catch {
      // ignore
    }
  };

  // Perform Extraction
  const handleExtract = async (targetUrl?: string) => {
    const url = (targetUrl || urlInput).trim();
    if (!url) {
      setExtractionError('Please enter or paste a TeraBox share link');
      return;
    }

    if (!teraboxService.isValidTeraBoxInput(url)) {
      setExtractionError(
        'Please enter a valid TeraBox link (e.g. https://terabox.com/s/1xxxx or 1024tera.com/s/xxxx)',
      );
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);

    try {
      const result = await teraboxService.extractStream(url);
      setCurrentMedia(result);

      // Pick highest quality available or default to 720p
      const qualities = result.streams.map((s) => s.quality);
      const initialQuality =
        QUALITY_ORDER.find((q) => qualities.includes(q)) || qualities[0] || '720p';
      setSelectedQuality(initialQuality);

      // Save in-memory session only (no database storage)
      setSessionStreams((prev) => {
        const withoutCurrent = prev.filter((s) => s.url !== url);
        return [
          {
            id: `session_${Date.now()}`,
            url,
            title: result.title,
            thumbnail: result.thumbnail,
            duration: result.duration,
            lastQuality: initialQuality,
          },
          ...withoutCurrent,
        ].slice(0, 10);
      });

      setDetailModalVisible(true);
    } catch (err: any) {
      setExtractionError(
        err.message ||
          'Failed to extract video from TeraBox. Link may be expired or invalid.',
      );
    } finally {
      setIsExtracting(false);
    }
  };

  // Launch Player
  const startPlayback = (streamUrl: string, startFromSeconds = 0, manifest = '') => {
    setActiveStreamUrl(streamUrl);
    setActiveManifest(manifest);
    setCurrentTime(startFromSeconds);
    setTotalDuration(currentMedia?.duration || 7200);
    setIsPlaying(true);
    setIsBuffering(false);
    setPlayerError(null);
    setDetailModalVisible(false);
    setPlayerModalVisible(true);

    nativePlayerBridge.setKeepScreenOn(true);
    resetControlsTimeout();
  };

  const closePlayer = () => {
    nativePlayerBridge.setKeepScreenOn(false);
    nativePlayerBridge.setOrientation('portrait');
    setIsFullscreen(false);
    setPlayerModalVisible(false);
  };

  // Simulate progress playback ticker when playing
  useEffect(() => {
    if (!playerModalVisible || !isPlaying || isBuffering) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 1 * playbackSpeed;
        if (totalDuration > 0 && next >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [playerModalVisible, isPlaying, isBuffering, playbackSpeed, totalDuration]);

  // Toggle Controls auto-hide
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setControlsVisible(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4500);
  };

  const handleSeek = (deltaSeconds: number) => {
    resetControlsTimeout();
    setCurrentTime((prev) => {
      const next = Math.max(0, Math.min(totalDuration, prev + deltaSeconds));
      sendVideoCommand(`var v = document.getElementById('player'); if (v) v.currentTime = ${next};`);
      return next;
    });
  };

  const handleQualityChange = (quality: string) => {
    if (!currentMedia) return;
    const stream = currentMedia.streams.find((s) => s.quality === quality);
    if (stream) {
      setSelectedQuality(quality);
      setActiveStreamUrl(stream.url);
      setActiveManifest(stream.manifest || '');
      setPlayerReloadKey((k) => k + 1);
      setIsBuffering(true);
    }
  };

  const handleToggleFullscreen = () => {
    resetControlsTimeout();
    const nextState = !isFullscreen;
    setIsFullscreen(nextState);
    if (nextState) {
      nativePlayerBridge.setOrientation('landscape');
    } else {
      nativePlayerBridge.setOrientation('portrait');
    }
  };

  const handleEnterPiP = async () => {
    const supported = await nativePlayerBridge.isPiPSupported();
    if (!supported) {
      Alert.alert('Picture-in-Picture', 'PiP mode is not supported on this device/version.');
      return;
    }
    await nativePlayerBridge.enterPiP(16, 9);
  };

  const handleDeleteSessionItem = (url: string) => {
    setSessionStreams((prev) => prev.filter((s) => s.url !== url));
  };

  // Render Session Item (In-Memory only)
  const renderHistoryItem = ({ item }: { item: SessionStreamItem }) => {
    return (
      <View style={[styles.historyCard, { backgroundColor: colors.surfaceElevated }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleExtract(item.url)}
          style={styles.historyThumbContainer}
        >
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.historyThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.historyThumbPlaceholder, { backgroundColor: colors.surface }]}>
              <Text style={{ fontSize: 24 }}>🎬</Text>
            </View>
          )}
          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>
              {teraboxService.formatDuration(item.duration)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.historyContent}>
          <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.historyMetaRow}>
            <Text style={[styles.historyMetaText, { color: colors.textMuted }]}>
              Session Link
            </Text>
            <View style={[styles.qualityPill, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
              <Text style={[styles.qualityPillText, { color: '#06B6D4' }]}>
                {item.lastQuality || '720p'}
              </Text>
            </View>
          </View>

          <View style={styles.historyActionsRow}>
            <TouchableOpacity
              style={[styles.resumeButton, { backgroundColor: '#06B6D4' }]}
              onPress={() => handleExtract(item.url)}
            >
              <Text style={styles.resumeButtonText}>▶ Play</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteSessionItem(item.url)}
            >
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surfaceElevated }]}
        >
          <Text style={[styles.backBtnText, { color: colors.text }]}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={styles.titleBadgeRow}>
            <Text style={[styles.screenTitle, { color: colors.text }]}>TeraStream</Text>
            <View style={styles.zeroAdBadge}>
              <Text style={styles.zeroAdBadgeText}>🛡️ ZERO ADS</Text>
            </View>
          </View>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            Pure ExoPlayer Streaming • No TeraBox UI
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* URL Input Box */}
        <View style={[styles.inputCard, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
            Paste TeraBox Share Link
          </Text>

          <View style={[styles.inputWrapper, { borderColor: colors.borderSubtle, backgroundColor: colors.surface }]}>
            <Text style={styles.inputIcon}>🔗</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="https://terabox.com/s/1xxxx or 1024tera.com/s/..."
              placeholderTextColor={colors.textMuted}
              value={urlInput}
              onChangeText={(text) => {
                setUrlInput(text);
                if (extractionError) setExtractionError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {urlInput.length > 0 ? (
              <TouchableOpacity onPress={() => setUrlInput('')} style={styles.iconActionBtn}>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handlePasteClipboard} style={styles.pasteBtn}>
                <Text style={styles.pasteBtnText}>📋 Paste</Text>
              </TouchableOpacity>
            )}
          </View>

          {extractionError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{extractionError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.extractBtn,
              { backgroundColor: '#06B6D4' },
              isExtracting && { opacity: 0.7 },
            ]}
            onPress={() => handleExtract()}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <View style={styles.extractLoadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.extractBtnText}>Extracting Streams...</Text>
              </View>
            ) : (
              <Text style={styles.extractBtnText}>⚡ Fetch & Stream Video</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Feature Highlights Pills */}
        <View style={styles.featuresRow}>
          <View style={[styles.featurePill, { backgroundColor: colors.surface }]}>
            <Text style={styles.featurePillText}>⚡ ExoPlayer</Text>
          </View>
          <View style={[styles.featurePill, { backgroundColor: colors.surface }]}>
            <Text style={styles.featurePillText}>📺 Fullscreen & PiP</Text>
          </View>
          <View style={[styles.featurePill, { backgroundColor: colors.surface }]}>
            <Text style={styles.featurePillText}>🎯 1080p Quality</Text>
          </View>
          <View style={[styles.featurePill, { backgroundColor: colors.surface }]}>
            <Text style={styles.featurePillText}>🛡️ Zero Storage</Text>
          </View>
        </View>

        {/* Recent Session Streams (In-Memory) */}
        <View style={styles.historySection}>
          <View style={styles.historySectionHeader}>
            <Text style={[styles.historySectionTitle, { color: colors.text }]}>
              Recent Streams ({sessionStreams.length})
            </Text>
            {sessionStreams.length > 0 && (
              <TouchableOpacity onPress={() => setSessionStreams([])}>
                <Text style={[styles.clearAllText, { color: '#EF4444' }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {sessionStreams.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Recent Streams</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Paste any public TeraBox video link above to watch in pure high definition.
              </Text>
            </View>
          ) : (
            <FlatList
              data={sessionStreams}
              renderItem={renderHistoryItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            />
          )}
        </View>
      </ScrollView>

      {/* Video Details & Quality Selection Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModalCard, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Stream Ready</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Text style={[styles.modalCloseBtn, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {currentMedia && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Image
                  source={{ uri: currentMedia.thumbnail }}
                  style={styles.detailThumbnail}
                  resizeMode="cover"
                />

                <Text style={[styles.detailVideoTitle, { color: colors.text }]}>
                  {currentMedia.title}
                </Text>

                <View style={styles.detailMetaRow}>
                  <Text style={[styles.detailMetaItem, { color: colors.textSecondary }]}>
                    ⏱️ {teraboxService.formatDuration(currentMedia.duration)}
                  </Text>
                  {currentMedia.size && (
                    <Text style={[styles.detailMetaItem, { color: colors.textSecondary }]}>
                      💾 {teraboxService.formatSize(currentMedia.size)}
                    </Text>
                  )}
                </View>

                {/* Quality Selection */}
                <Text style={[styles.qualitySectionTitle, { color: colors.text }]}>
                  Select Playback Quality
                </Text>
                <View style={styles.qualityChipsContainer}>
                  {currentMedia.streams.map((stream) => {
                    const isSelected = selectedQuality === stream.quality;
                    return (
                      <TouchableOpacity
                        key={stream.quality}
                        style={[
                          styles.qualityChip,
                          {
                            backgroundColor: isSelected ? '#06B6D4' : colors.surface,
                            borderColor: isSelected ? '#06B6D4' : colors.borderSubtle,
                          },
                        ]}
                        onPress={() => setSelectedQuality(stream.quality)}
                      >
                        <Text
                          style={[
                            styles.qualityChipText,
                            { color: isSelected ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {stream.quality}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Play Buttons */}
                <View style={styles.detailButtonsCol}>
                  <TouchableOpacity
                    style={[styles.playFromStartBtn, { backgroundColor: '#06B6D4' }]}
                    onPress={() => {
                      const targetStream =
                        currentMedia.streams.find((s) => s.quality === selectedQuality) ||
                        currentMedia.streams[0];
                      startPlayback(targetStream.url, 0, targetStream.manifest || '');
                    }}
                  >
                    <Text style={styles.playFromStartBtnText}>▶ Stream with ExoPlayer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ExoPlayer Streaming Fullscreen View Modal */}
      <Modal
        visible={playerModalVisible}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closePlayer}
      >
        <View style={styles.playerContainer}>
          <StatusBar hidden={isFullscreen} />

          {/* Hardware-Accelerated Video Surface */}
          <View style={styles.playerVideoSurface}>
            {activeStreamUrl ? (
              <WebView
                ref={webViewRef}
                key={`tb-${activeStreamUrl}-${playerReloadKey}`}
                originWhitelist={['*']}
                source={{
                  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; background: #000; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
  </style>
  <script>
${HLS_LIGHT_SCRIPT}
  </script>
</head>
<body>
  <video id="player" playsinline autoplay controls poster="${currentMedia?.thumbnail || ''}"></video>
  <script>
    var v = document.getElementById('player');
    var streamUrl = "${activeStreamUrl}";
    var manifestText = ${JSON.stringify(activeManifest || '').replace(/<\/script/gi, '<\\/script')};
    var isHls = streamUrl.includes('m3u8') || streamUrl.includes('share/streaming') || !!manifestText;
    var retryCount = 0;

    function notify(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, data || {})));
      }
    }

    window.onerror = function(msg, source, lineno, colno) {
      notify('ERROR', { message: 'Player JS Error: ' + msg });
    };

    function CustomPlaylistLoader(config) {
      var defaultLoader = new Hls.DefaultConfig.loader(config);
      this.destroy = function() { try { defaultLoader.destroy(); } catch(e){} };
      this.abort = function() { try { defaultLoader.abort(); } catch(e){} };
      this.load = function(context, cfg, callbacks) {
        if (manifestText && (context.type === 'manifest' || context.type === 'level')) {
          setTimeout(function() {
            var now = performance.now();
            callbacks.onSuccess(
              { url: context.url, data: manifestText },
              {
                trequest: now,
                tfirst: now,
                tload: now,
                loaded: manifestText.length,
                total: manifestText.length
              },
              context
            );
          }, 0);
          return;
        }
        defaultLoader.load(context, cfg, callbacks);
      };
    }

    function initHls() {
      if (isHls && window.Hls && Hls.isSupported()) {
        var hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          pLoader: CustomPlaylistLoader
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(v);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          notify('BUFFERING', { buffering: false });
          if (${currentTime} > 0) v.currentTime = ${currentTime};
          v.playbackRate = ${playbackSpeed};
          v.play().catch(function() {
            v.muted = true;
            v.play();
          });
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCount < 3) {
              retryCount++;
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryCount < 3) {
              retryCount++;
              hls.recoverMediaError();
            } else {
              var detail = (data.details || 'stream failure') + (data.response && data.response.code ? ' (' + data.response.code + ')' : '');
              notify('ERROR', { message: 'Video stream could not be loaded: ' + detail });
              hls.destroy();
            }
          }
        });
      } else {
        v.src = streamUrl;
        if (${currentTime} > 0) v.currentTime = ${currentTime};
        v.playbackRate = ${playbackSpeed};
        v.play().catch(function() {
          v.muted = true;
          v.play();
        });
      }
    }

    initHls();

    v.addEventListener('timeupdate', function() {
      notify('PROGRESS', {
        currentTime: Math.floor(v.currentTime),
        duration: Math.floor(v.duration || ${totalDuration || 0})
      });
    });
    v.addEventListener('waiting', function() {
      notify('BUFFERING', { buffering: true });
    });
    v.addEventListener('playing', function() {
      notify('BUFFERING', { buffering: false, playing: true });
      notify('PLAYING');
    });
    v.addEventListener('pause', function() {
      notify('PAUSED');
    });
    v.addEventListener('error', function(e) {
      if (!isHls) {
        notify('ERROR', { message: 'Native Video Error: Stream could not be played' });
      }
    });
  </script>
</body>
</html>`,
                  baseUrl: 'https://www.terabox.app/',
                }}
                style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}
                allowsFullscreenVideo={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                mixedContentMode="always"
                androidLayerType="hardware"
                onMessage={(event: any) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg.type === 'PROGRESS') {
                      if (typeof msg.currentTime === 'number') setCurrentTime(msg.currentTime);
                      if (typeof msg.duration === 'number' && msg.duration > 0) setTotalDuration(msg.duration);
                    } else if (msg.type === 'BUFFERING') {
                      setIsBuffering(!!msg.buffering);
                    } else if (msg.type === 'PAUSED') {
                      setIsPlaying(false);
                    } else if (msg.type === 'PLAYING') {
                      setIsPlaying(true);
                      setIsBuffering(false);
                    } else if (msg.type === 'ERROR') {
                      setPlayerError(msg.message || 'Stream loading error');
                    }
                  } catch {}
                }}
              />
            ) : null}

            {/* Buffering Indicator */}
            {isBuffering && !playerError && (
              <View style={styles.bufferingOverlay}>
                <ActivityIndicator size="large" color="#06B6D4" />
                <Text style={styles.bufferingText}>Buffering stream...</Text>
              </View>
            )}

            {/* Error Overlay */}
            {playerError && (
              <View style={styles.playerErrorOverlay}>
                <Text style={styles.playerErrorIcon}>⚠️</Text>
                <Text style={styles.playerErrorTitle}>Playback Error</Text>
                <Text style={styles.playerErrorMessage}>{playerError}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setPlayerError(null);
                    setIsBuffering(true);
                    setTimeout(() => setIsBuffering(false), 800);
                  }}
                >
                  <Text style={styles.retryBtnText}>↻ Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Custom ExoPlayer Controls Overlay */}
            {controlsVisible && (
              <View style={styles.controlsOverlay}>
                {/* Top Controls Bar */}
                <View style={styles.topControlsBar}>
                  <TouchableOpacity onPress={closePlayer} style={styles.playerIconButton}>
                    <Text style={styles.playerIconText}>✕</Text>
                  </TouchableOpacity>

                  <Text style={styles.playerVideoTitleText} numberOfLines={1}>
                    {currentMedia?.title || 'TeraStream'}
                  </Text>

                  <View style={styles.topRightControls}>
                    <TouchableOpacity onPress={handleEnterPiP} style={styles.playerPillButton}>
                      <Text style={styles.playerPillText}>⧉ PiP</Text>
                    </TouchableOpacity>

                    <View style={styles.qualityDropdownBadge}>
                      <Text style={styles.qualityDropdownText}>{selectedQuality}</Text>
                    </View>
                  </View>
                </View>

                {/* Center Transport Controls */}
                <View style={styles.centerControlsRow}>
                  <TouchableOpacity onPress={() => handleSeek(-10)} style={styles.transportBtn}>
                    <Text style={styles.transportIcon}>⏪ -10s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      resetControlsTimeout();
                      if (isPlaying) {
                        sendVideoCommand('var v = document.getElementById("player"); if (v) v.pause();');
                        setIsPlaying(false);
                      } else {
                        sendVideoCommand('var v = document.getElementById("player"); if (v) v.play();');
                        setIsPlaying(true);
                      }
                    }}
                    style={styles.playPauseBtn}
                  >
                    <Text style={styles.playPauseIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => handleSeek(10)} style={styles.transportBtn}>
                    <Text style={styles.transportIcon}>+10s ⏩</Text>
                  </TouchableOpacity>
                </View>

                {/* Bottom Scrubber & Settings Bar */}
                <View style={styles.bottomControlsBar}>
                  <View style={styles.scrubberRow}>
                    <Text style={styles.timeLabel}>
                      {teraboxService.formatDuration(currentTime)}
                    </Text>

                    {/* Scrubber slider track */}
                    <View style={styles.scrubberTrack}>
                      <View
                        style={[
                          styles.scrubberProgress,
                          {
                            width: `${
                              totalDuration > 0
                                ? Math.min(100, (currentTime / totalDuration) * 100)
                                : 0
                            }%`,
                          },
                        ]}
                      />
                    </View>

                    <Text style={styles.timeLabel}>
                      {teraboxService.formatDuration(totalDuration)}
                    </Text>
                  </View>

                  <View style={styles.bottomSecondaryRow}>
                    {/* Speed selector */}
                    <TouchableOpacity
                      onPress={() => {
                        resetControlsTimeout();
                        const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
                        const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                        const newSpeed = speeds[nextIndex];
                        setPlaybackSpeed(newSpeed);
                        sendVideoCommand(`var v = document.getElementById('player'); if (v) v.playbackRate = ${newSpeed};`);
                      }}
                      style={styles.speedButton}
                    >
                      <Text style={styles.speedButtonText}>{playbackSpeed}x Speed</Text>
                    </TouchableOpacity>

                    {/* Quality Switcher Pills */}
                    <View style={styles.playerQualityRow}>
                      {QUALITY_ORDER.map((q) => (
                        <TouchableOpacity
                          key={q}
                          onPress={() => handleQualityChange(q)}
                          style={[
                            styles.playerQualityPill,
                            selectedQuality === q && styles.playerQualityPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.playerQualityPillText,
                              selectedQuality === q && styles.playerQualityPillTextActive,
                            ]}
                          >
                            {q}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Fullscreen Toggle */}
                    <TouchableOpacity
                      onPress={handleToggleFullscreen}
                      style={styles.fullscreenBtn}
                    >
                      <Text style={styles.fullscreenIconText}>
                        {isFullscreen ? '⤦ Collapse' : '⛶ Fullscreen'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backBtnText: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  zeroAdBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#06B6D4',
  },
  zeroAdBadgeText: {
    color: '#06B6D4',
    fontSize: 10,
    fontWeight: '800',
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  inputCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: 48,
  },
  iconActionBtn: {
    padding: 6,
  },
  pasteBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pasteBtnText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 13,
  },
  extractBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extractLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extractBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  featurePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  featurePillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  historySection: {
    marginTop: 4,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  historyCard: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 10,
    overflow: 'hidden',
  },
  historyThumbContainer: {
    width: 110,
    height: 75,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  historyThumb: {
    width: '100%',
    height: '100%',
  },
  historyThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#06B6D4',
  },
  historyContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  historyMetaText: {
    fontSize: 12,
  },
  qualityPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  qualityPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  resumeButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  resumeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  detailModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    fontSize: 20,
    padding: 4,
  },
  detailThumbnail: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 14,
  },
  detailVideoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 22,
  },
  detailMetaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  detailMetaItem: {
    fontSize: 13,
  },
  qualitySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  qualityChipsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  qualityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  qualityChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailButtonsCol: {
    gap: 10,
    marginBottom: 16,
  },
  resumePlaybackBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumePlaybackBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  playFromStartBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFromStartBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  // Fullscreen Player Styles
  playerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  playerVideoSurface: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bufferingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '600',
  },
  playerErrorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  playerErrorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  playerErrorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  playerErrorMessage: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#06B6D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'space-between',
    padding: 16,
    zIndex: 15,
  },
  topControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  playerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerVideoTitleText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerPillButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  playerPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  qualityDropdownBadge: {
    backgroundColor: '#06B6D4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qualityDropdownText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  transportBtn: {
    padding: 12,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  transportIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  playPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseIcon: {
    color: '#FFFFFF',
    fontSize: 28,
  },
  bottomControlsBar: {
    paddingBottom: 8,
  },
  scrubberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  timeLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  scrubberTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scrubberProgress: {
    height: '100%',
    backgroundColor: '#06B6D4',
  },
  bottomSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  speedButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  playerQualityRow: {
    flexDirection: 'row',
    gap: 6,
  },
  playerQualityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  playerQualityPillActive: {
    backgroundColor: '#06B6D4',
  },
  playerQualityPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  playerQualityPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  fullscreenBtn: {
    padding: 6,
  },
  fullscreenIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
