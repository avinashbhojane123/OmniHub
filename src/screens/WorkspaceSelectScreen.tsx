import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  BackHandler,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
} from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppTheme } from '../hooks/useTheme';
import {
  settingsRepository,
  taskRepository,
} from '../database/repositories';
import {
  batteryService,
  BatteryStatus,
} from '../services/battery/BatteryService';
import { otaService, OTAStatus } from '../services/ota/OTAService';

export type WorkspaceMode = 'planner' | 'battery' | 'chat' | 'movies';

interface WorkspaceConfig {
  id: WorkspaceMode;
  name: string;
  tagline: string;
  category: string;
  icon: string;
  color: string;
  colorLight: string;
  darkBg: string;
  lightBg: string;
  route: string;
  features: string[];
}

const WORKSPACES: WorkspaceConfig[] = [
  {
    id: 'planner',
    name: 'LifePlanner & Tasks',
    tagline: 'Tasks, habits, focus & timelines',
    category: 'ORGANIZATION',
    icon: '✓',
    color: '#8B5CF6',
    colorLight: '#A78BFA',
    darkBg: '#1E1B4B',
    lightBg: '#F5F3FF',
    route: 'MainTabs',
    features: ['Tasks & Habits', 'Focus Timer', 'Timelines & Backup'],
  },
  {
    id: 'battery',
    name: 'Battery Guard & Alarm',
    tagline: 'Eco charge & anti-overcharge',
    category: 'BATTERY HEALTH',
    icon: '⚡',
    color: '#10B981',
    colorLight: '#34D399',
    darkBg: '#062E25',
    lightBg: '#ECFDF5',
    route: 'BatteryAlarm',
    features: ['80% Eco Full Alarm', 'Overcharge Protection', 'Overheat Siren'],
  },
  {
    id: 'chat',
    name: 'ChatRoom',
    tagline: 'Real-time chat, calls & watch party',
    category: 'COMMUNICATION',
    icon: '💬',
    color: '#06B6D4',
    colorLight: '#38BDF8',
    darkBg: '#082F49',
    lightBg: '#F0F9FF',
    route: 'ChatRoom',
    features: ['Real-Time Chat & Polls', 'Voice/Video Calling', 'Watch Party & Stories'],
  },
  {
    id: 'movies',
    name: 'CineVerse & Movies',
    tagline: 'TMDb movies, trailers, cast & watchlist',
    category: 'ENTERTAINMENT',
    icon: '🎬',
    color: '#E11D48',
    colorLight: '#FB7185',
    darkBg: '#1C1014',
    lightBg: '#FFF1F2',
    route: 'MovieWorkspace',
    features: ['Trending & In Theaters', 'Trailers & Cast Details', 'My Watchlist & Watched'],
  },
];

export const WorkspaceSelectScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark, changeTheme } = useAppTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Robust orientation detection: ensures portrait tablets aren't misclassified as landscape
  const isLandscape = windowWidth > windowHeight && windowWidth > 580;

  // Responsive dynamic widths to prevent flex-wrap layout breakage on any screen size
  const horizontalPadding = 16;
  const gridGap = 12;
  const gridCardWidth = useMemo(() => {
    return Math.floor((windowWidth - horizontalPadding * 2 - gridGap) / 2);
  }, [windowWidth]);

  const carouselCardWidth = useMemo(() => {
    if (isLandscape) {
      return Math.min(windowWidth * 0.45, 360);
    }
    return Math.min(windowWidth - 52, 340);
  }, [windowWidth, isLandscape]);

  const carouselSpacing = 14;
  const carouselSnapStep = carouselCardWidth + carouselSpacing;

  const [selectedMode, setSelectedMode] = useState<WorkspaceMode>(
    route?.params?.currentMode || route?.params?.initialMode || 'planner',
  );
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');

  // Live Telemetry states
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus | null>(
    null,
  );
  const [pendingTasksCount, setPendingTasksCount] = useState<number | null>(
    null,
  );

  // OTA Updates State
  const [otaStatus, setOtaStatus] = useState<OTAStatus | null>(null);
  const [otaChecking, setOtaChecking] = useState(false);
  const [otaServerHost, setOtaServerHost] = useState('10.16.64.73:8888');

  const carouselScrollRef = useRef<any>(null);

  // Load preferences (view mode and default workspace) on mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      settingsRepository.get('workspace_view_mode', 'grid'),
      settingsRepository.get('default_workspace', 'planner'),
    ])
      .then(([savedViewMode, savedDefaultWorkspace]) => {
        if (!isMounted) return;
        if (savedViewMode === 'grid' || savedViewMode === 'carousel') {
          setViewMode(savedViewMode as 'grid' | 'carousel');
        }
        if (!route?.params?.currentMode && !route?.params?.initialMode) {
          if (
            savedDefaultWorkspace === 'planner' ||
            savedDefaultWorkspace === 'battery' ||
            savedDefaultWorkspace === 'chat' ||
            savedDefaultWorkspace === 'movies'
          ) {
            setSelectedMode(savedDefaultWorkspace as WorkspaceMode);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [route?.params?.currentMode, route?.params?.initialMode]);

  // Sync carousel scroll position on screen resize / orientation change
  useEffect(() => {
    if (viewMode === 'carousel' && carouselScrollRef.current) {
      const targetIndex = WORKSPACES.findIndex(w => w.id === selectedMode);
      if (targetIndex >= 0) {
        requestAnimationFrame(() => {
          carouselScrollRef.current?.scrollTo({
            x: targetIndex * carouselSnapStep,
            animated: false,
          });
        });
      }
    }
  }, [windowWidth, isLandscape, viewMode, carouselSnapStep, selectedMode]);

  // OTA Status refresh callback
  const refreshOtaStatus = useCallback(async () => {
    try {
      const [status, serverUrl] = await Promise.all([
        otaService.getStatus(),
        otaService.getServerUrl(),
      ]);
      setOtaStatus(status);
      if (serverUrl) {
        setOtaServerHost(serverUrl.replace(/^https?:\/\//, ''));
      }
    } catch {
      // Ignored non-critical OTA telemetry error
    }
  }, []);

  // Fresh Telemetry on Every Screen Focus (fixes stale counts, includes overdue tasks)
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      // 1. Planner Tasks Telemetry (Include today's pending AND overdue pending tasks)
      const refreshTasks = async () => {
        try {
          const now = new Date();
          const todayStr = format(now, 'yyyy-MM-dd');
          const timeStr = format(now, 'HH:mm');

          const [todayTasks, overdueTasks] = await Promise.all([
            taskRepository.findByDate(todayStr),
            taskRepository.findOverdue(todayStr, timeStr),
          ]);

          if (!isMounted) return;

          const pendingToday = todayTasks.filter(
            t => t.status !== 'completed' && t.status !== 'cancelled',
          );
          const pendingOverdue = overdueTasks.filter(
            t => t.status !== 'completed' && t.status !== 'cancelled',
          );

          const uniqueTaskIds = new Set<string>();
          pendingToday.forEach(t => uniqueTaskIds.add(t.id));
          pendingOverdue.forEach(t => uniqueTaskIds.add(t.id));

          setPendingTasksCount(uniqueTaskIds.size);
        } catch {
          if (isMounted) setPendingTasksCount(null);
        }
      };

      refreshTasks();
      refreshOtaStatus();
      // Low-frequency polling interval to prevent battery/CPU thrashing
      const taskInterval = setInterval(refreshTasks, 15000);

      // 2. Battery Telemetry: Subscribe to live events without duplicate immediate dispatch
      let unsubBattery: (() => void) | undefined;
      try {
        unsubBattery = batteryService.subscribeStatus(st => {
          if (isMounted) setBatteryStatus(st);
        });
      } catch {
        // Fallback gracefully
      }

      // 3. Hardware Back Handler support
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const backSub = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );

      return () => {
        isMounted = false;
        clearInterval(taskInterval);
        if (unsubBattery) unsubBattery();
        backSub.remove();
      };
    }, [navigation, refreshOtaStatus]),
  );

  const handleSelectViewMode = async (mode: 'grid' | 'carousel') => {
    if (viewMode === mode) return;
    setViewMode(mode);
    try {
      await settingsRepository.set('workspace_view_mode', mode);
    } catch {
      // Ignored non-critical setting persistence failure
    }

    if (mode === 'carousel') {
      const targetIndex = WORKSPACES.findIndex(w => w.id === selectedMode);
      if (targetIndex >= 0) {
        setTimeout(() => {
          carouselScrollRef.current?.scrollTo({
            x: targetIndex * carouselSnapStep,
            animated: true,
          });
        }, 80);
      }
    }
  };

  const handleSelectMode = (mode: WorkspaceMode, scrollIndex?: number) => {
    setSelectedMode(mode);
    if (viewMode === 'carousel' && carouselScrollRef.current) {
      const targetIndex =
        scrollIndex !== undefined
          ? scrollIndex
          : WORKSPACES.findIndex(w => w.id === mode);
      if (targetIndex >= 0) {
        carouselScrollRef.current.scrollTo({
          x: targetIndex * carouselSnapStep,
          animated: true,
        });
      }
    }
  };

  const handleLaunch = (modeToEnter: WorkspaceMode) => {
    const targetConfig = WORKSPACES.find(w => w.id === modeToEnter);
    const targetRoute = targetConfig?.route || 'MainTabs';

    // Persist default workspace preference so future app launches remember the choice
    settingsRepository.set('default_workspace', modeToEnter).catch(() => {});

    // Clean reset to the target workspace
    navigation.reset({
      index: 0,
      routes: [{ name: targetRoute }],
    });
  };

  const handleCheckOtaUpdate = async () => {
    if (otaChecking) return;
    setOtaChecking(true);
    try {
      const result = await otaService.checkForUpdate();
      if (result.available) {
        Alert.alert(
          'Update Available! 🚀',
          `New Bundle v${result.remoteVersion} is ready to install.\n${
            result.notes ? `\nNotes: ${result.notes}\n` : ''
          }\nWould you like to download and install now?`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Download & Apply',
              onPress: async () => {
                try {
                  setOtaChecking(true);
                  await otaService.downloadAndApplyUpdate(
                    result.bundleUrl,
                    result.remoteVersion,
                  );
                  await refreshOtaStatus();
                  Alert.alert(
                    'Update Installed! 🎉',
                    'The update bundle was successfully installed. Restart the app to apply changes.',
                    [
                      { text: 'Later', style: 'cancel' },
                      {
                        text: 'Restart Now',
                        onPress: () => otaService.restartApp(),
                      },
                    ],
                  );
                } catch (e: any) {
                  Alert.alert('Installation Failed', e.message || 'Unknown error');
                } finally {
                  setOtaChecking(false);
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Up to Date ✨',
          `You have the latest version (v${result.currentVersion || 0}).`,
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Update Check Failed',
        e.message || 'Could not connect to update server.',
      );
    } finally {
      setOtaChecking(false);
    }
  };

  const handleSaveServerHost = async () => {
    const raw = otaServerHost.trim();
    if (!raw) {
      Alert.alert('Invalid Server', 'Please enter a valid IP:port or hostname.');
      return;
    }
    let hostWithoutProtocol = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!hostWithoutProtocol.includes(':')) {
      hostWithoutProtocol = `${hostWithoutProtocol}:8888`;
    }
    const fullUrl = `http://${hostWithoutProtocol}`;
    await otaService.setServerUrl(fullUrl);
    setOtaServerHost(hostWithoutProtocol);
    Alert.alert('Server Saved', `OTA Server URL updated to ${fullUrl}`);
    await refreshOtaStatus();
  };

  const handleRevertOta = () => {
    Alert.alert(
      'Revert to Factory Bundle?',
      'This removes downloaded OTA updates and restores the base embedded APK bundle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert & Restart',
          style: 'destructive',
          onPress: async () => {
            await otaService.revertToDefault();
            await refreshOtaStatus();
            otaService.restartApp();
          },
        },
      ],
    );
  };

  // Carousel scroll sync bound to both momentum end and scroll drag end
  const handleCarouselScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapStep);
      const clampedIndex = Math.max(0, Math.min(WORKSPACES.length - 1, index));
      const currentMode = WORKSPACES[clampedIndex].id;
      setSelectedMode(prev => (prev !== currentMode ? currentMode : prev));
    },
    [carouselSnapStep],
  );

  const activeWorkspace = useMemo(() => {
    return WORKSPACES.find(w => w.id === selectedMode) || WORKSPACES[0];
  }, [selectedMode]);

  const getLiveTelemetryBadge = (id: WorkspaceMode) => {
    switch (id) {
      case 'planner':
        if (pendingTasksCount === 0) {
          return '✓ All Tasks Done';
        }
        if (pendingTasksCount !== null && pendingTasksCount > 0) {
          return `📅 ${pendingTasksCount} Pending Today`;
        }
        return '📅 Schedule Ready';
      case 'battery':
        if (batteryStatus) {
          if (batteryStatus.level >= 99 && batteryStatus.isCharging) {
            return '⚡ 100% • Fully Charged';
          }
          if (batteryStatus.level <= 15 && !batteryStatus.isCharging) {
            return `🪫 ${batteryStatus.level}% • Low Battery`;
          }
          return `⚡ ${batteryStatus.level}% ${
            batteryStatus.isCharging ? '• Charging' : '• Guarded'
          }`;
        }
        return '⚡ Guard Active';
      case 'chat':
        return '💬 ChatRoom & Calling Ready';
      case 'movies':
        return '🍿 TMDb Trending Live';
      default:
        return 'Ready';
    }
  };

  return (
    <View
      style={[
        styles.outerContainer,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 16) + 4,
          paddingBottom: Math.max(insets.bottom, 16) + 4,
        },
      ]}
    >
      <StatusBar barStyle={colors.statusBar} />

      {/* Main Vertical Scroll Container */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        directionalLockEnabled={true}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.topLeftGroup}>
              <View
                style={[
                  styles.brandPill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(15, 23, 42, 0.05)',
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <Text style={styles.brandIcon}>💎</Text>
                <Text style={[styles.brandText, { color: colors.text }]}>
                  OmniHub
                </Text>
              </View>
            </View>

            {/* Top Right Group: Quick Theme Toggle & Segmented View Switcher */}
            <View style={styles.topRightGroup}>
              <TouchableOpacity
                style={[
                  styles.quickThemeBtn,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(15, 23, 42, 0.06)',
                    borderColor: colors.borderSubtle,
                  },
                ]}
                onPress={() => changeTheme(isDark ? 'light' : 'dark')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Toggle theme, currently ${
                  isDark ? 'dark' : 'light'
                }`}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.quickThemeBtnIcon}>
                  {isDark ? '🌙' : '☀️'}
                </Text>
              </TouchableOpacity>

              {/* Segmented Control (Grid vs Carousel) */}
              <View
                style={[
                  styles.segmentedWrapper,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(15, 23, 42, 0.06)',
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.segmentedBtn,
                    viewMode === 'grid' && [
                      styles.segmentedBtnActive,
                      { backgroundColor: isDark ? colors.card : '#FFFFFF' },
                    ],
                  ]}
                  onPress={() => handleSelectViewMode('grid')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Switch to Grid view"
                  accessibilityState={{ selected: viewMode === 'grid' }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      {
                        color:
                          viewMode === 'grid' ? colors.text : colors.textMuted,
                        fontWeight: viewMode === 'grid' ? '800' : '600',
                      },
                    ]}
                  >
                    ⊞ Grid
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.segmentedBtn,
                    viewMode === 'carousel' && [
                      styles.segmentedBtnActive,
                      { backgroundColor: isDark ? colors.card : '#FFFFFF' },
                    ],
                  ]}
                  onPress={() => handleSelectViewMode('carousel')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Switch to Carousel view"
                  accessibilityState={{ selected: viewMode === 'carousel' }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      {
                        color:
                          viewMode === 'carousel'
                            ? colors.text
                            : colors.textMuted,
                        fontWeight: viewMode === 'carousel' ? '800' : '600',
                      },
                    ]}
                  >
                    ⊟ Slide
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.mainTitle, { color: colors.text }]}>
            Choose Your Workspace
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            4 standalone power suites. Tap to select or launch directly.
          </Text>
        </View>

        {/* Main Content Area: 2x2 Bento Grid vs. Carousel */}
        {viewMode === 'grid' ? (
          <View style={[styles.gridContainer, { gap: gridGap }]}>
            {WORKSPACES.map(ws => {
              const isSelected = selectedMode === ws.id;
              return (
                <TouchableOpacity
                  key={ws.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (isSelected) {
                      handleLaunch(ws.id);
                    } else {
                      handleSelectMode(ws.id);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${ws.name}, ${ws.category}. ${ws.tagline}`}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityHint="Tap to select or launch this workspace"
                  style={[
                    styles.gridCard,
                    {
                      width: gridCardWidth,
                      backgroundColor: isDark
                        ? isSelected
                          ? ws.darkBg
                          : colors.card
                        : isSelected
                        ? ws.lightBg
                        : colors.surface,
                      borderColor: isSelected ? ws.color : colors.border,
                      borderWidth: isSelected ? 2.5 : 1,
                      shadowColor: isSelected ? ws.color : '#000000',
                      shadowOpacity: isSelected ? 0.35 : 0.06,
                      elevation: isSelected ? 6 : 2,
                    },
                  ]}
                >
                  {/* Card Top: Category & Selection Badge */}
                  <View style={styles.gridCardHeader}>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : `${ws.color}18`,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.categoryBadgeText, { color: ws.color }]}
                        numberOfLines={1}
                      >
                        {ws.category}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.checkCircle,
                        {
                          backgroundColor: isSelected
                            ? ws.color
                            : isDark
                            ? 'rgba(255, 255, 255, 0.12)'
                            : 'rgba(0, 0, 0, 0.08)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.checkIcon,
                          { color: isSelected ? '#FFFFFF' : 'transparent' },
                        ]}
                      >
                        ✓
                      </Text>
                    </View>
                  </View>

                  {/* Card Middle: Icon & Balanced Height Multi-line Title */}
                  <View style={styles.gridCardMiddle}>
                    <View
                      style={[
                        styles.gridIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${ws.color}25`
                            : `${ws.color}18`,
                          borderColor: ws.colorLight,
                        },
                      ]}
                    >
                      <Text style={styles.gridIconEmoji}>{ws.icon}</Text>
                    </View>

                    <View style={styles.titleContainer}>
                      <Text
                        style={[styles.gridCardTitle, { color: colors.text }]}
                        numberOfLines={2}
                      >
                        {ws.name}
                      </Text>
                    </View>
                  </View>

                  {/* Card Bottom: Live Badge & Explicit Open Button */}
                  <View style={styles.gridCardBottom}>
                    <View
                      style={[
                        styles.liveTelemetryBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.06)'
                            : `${ws.color}12`,
                          borderColor: isSelected
                            ? `${ws.color}60`
                            : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.liveTelemetryText,
                          {
                            color: isSelected ? ws.color : colors.textSecondary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {getLiveTelemetryBadge(ws.id)}
                      </Text>
                    </View>

                    <View style={styles.gridActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleLaunch(ws.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[
                          styles.gridActionPill,
                          {
                            backgroundColor: isSelected
                              ? ws.color
                              : isDark
                              ? 'rgba(255, 255, 255, 0.08)'
                              : 'rgba(15, 23, 42, 0.05)',
                            borderColor: isSelected
                              ? ws.color
                              : colors.borderSubtle,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.gridActionHint,
                            {
                              color: isSelected
                                ? '#FFFFFF'
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {isSelected ? 'Launch ➔' : 'Select'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* Carousel View Mode */
          <View style={styles.carouselContainer}>
            <ScrollView
              ref={carouselScrollRef}
              horizontal
              directionalLockEnabled={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.carouselScroll,
                {
                  paddingHorizontal: Math.max(
                    (windowWidth - carouselCardWidth) / 2,
                    16,
                  ),
                },
              ]}
              decelerationRate="fast"
              snapToOffsets={WORKSPACES.map((_, i) => i * carouselSnapStep)}
              onMomentumScrollEnd={handleCarouselScroll}
              onScrollEndDrag={handleCarouselScroll}
            >
              {WORKSPACES.map((ws, idx) => {
                const isSelected = selectedMode === ws.id;
                return (
                  <TouchableOpacity
                    key={ws.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      if (isSelected) {
                        handleLaunch(ws.id);
                      } else {
                        handleSelectMode(ws.id, idx);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${ws.name}, ${ws.category}. ${ws.tagline}`}
                    accessibilityState={{ selected: isSelected }}
                    accessibilityHint="Tap to select or launch this workspace"
                    style={[
                      styles.carouselCard,
                      {
                        width: carouselCardWidth,
                        backgroundColor: isDark
                          ? isSelected
                            ? ws.darkBg
                            : colors.card
                          : isSelected
                          ? ws.lightBg
                          : colors.surface,
                        borderColor: isSelected ? ws.color : colors.border,
                        borderWidth: isSelected ? 2.5 : 1,
                        shadowColor: isSelected ? ws.color : '#000000',
                        shadowOpacity: isSelected ? 0.35 : 0.08,
                        elevation: isSelected ? 8 : 2,
                      },
                    ]}
                  >
                    {/* Top Badge */}
                    <View
                      style={[
                        styles.cardTopBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : `${ws.color}15`,
                        },
                      ]}
                    >
                      <Text style={[styles.cardBadgeText, { color: ws.color }]}>
                        {ws.category}
                      </Text>
                    </View>

                    {/* Icon Circle */}
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: isDark
                            ? `${ws.color}25`
                            : `${ws.color}18`,
                          borderColor: ws.colorLight,
                        },
                      ]}
                    >
                      <Text style={styles.iconEmoji}>{ws.icon}</Text>
                    </View>

                    {/* Title & Tagline */}
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {ws.name}
                    </Text>
                    <Text
                      style={[
                        styles.cardTagline,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {ws.tagline}
                    </Text>

                    {/* Live Status Pill */}
                    <View
                      style={[
                        styles.carouselLivePill,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.06)'
                            : `${ws.color}15`,
                          borderColor: `${ws.color}50`,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.carouselLiveText, { color: ws.color }]}
                      >
                        {getLiveTelemetryBadge(ws.id)}
                      </Text>
                    </View>

                    {/* Feature Chips */}
                    <View style={styles.featureChipsWrapper}>
                      {ws.features.map((feat, fIdx) => (
                        <View
                          key={fIdx}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255, 255, 255, 0.06)'
                                : 'rgba(15, 23, 42, 0.04)',
                              borderColor: colors.borderSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {feat}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Hint */}
                    <Text
                      style={[
                        styles.cardTapHint,
                        { color: isSelected ? ws.color : colors.textMuted },
                      ]}
                    >
                      {isSelected ? '✓ Tap again to launch ➔' : 'Tap to select'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Dots Indicator */}
            <View style={styles.dotsRow}>
              {WORKSPACES.map((ws, idx) => (
                <TouchableOpacity
                  key={ws.id}
                  onPress={() => handleSelectMode(ws.id, idx)}
                  hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Page ${idx + 1} of ${
                    WORKSPACES.length
                  }: ${ws.name}`}
                  accessibilityState={{ selected: selectedMode === ws.id }}
                  style={styles.dotTouchWrapper}
                >
                  <View
                    style={[
                      styles.dot,
                      selectedMode === ws.id
                        ? [styles.dotActive, { backgroundColor: ws.color }]
                        : {
                            backgroundColor: isDark
                              ? 'rgba(255, 255, 255, 0.25)'
                              : 'rgba(0, 0, 0, 0.2)',
                          },
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Bottom Launch Button Section */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              {
                backgroundColor: activeWorkspace.color,
                shadowColor: activeWorkspace.color,
              },
            ]}
            activeOpacity={0.88}
            onPress={() => handleLaunch(selectedMode)}
            accessibilityRole="button"
            accessibilityLabel={`Launch ${activeWorkspace.name}`}
            accessibilityHint="Enters the selected workspace suite"
          >
            <Text style={styles.continueButtonText}>
              Launch {activeWorkspace.name} →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Over-The-Air (OTA) Updates Section */}
        <View style={styles.otaContainer}>
          <View
            style={[
              styles.otaCard,
              {
                backgroundColor: isDark
                  ? 'rgba(30, 27, 75, 0.45)'
                  : colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            {/* Header Row */}
            <View style={styles.otaHeaderRow}>
              <View style={styles.otaHeaderLeft}>
                <View
                  style={[
                    styles.otaIconBadge,
                    {
                      backgroundColor: isDark
                        ? 'rgba(139, 92, 246, 0.2)'
                        : 'rgba(139, 92, 246, 0.1)',
                      borderColor: 'rgba(139, 92, 246, 0.35)',
                    },
                  ]}
                >
                  <Text style={styles.otaIconText}>⚡</Text>
                </View>
                <View style={styles.otaTitleCol}>
                  <Text style={[styles.otaTitle, { color: colors.text }]}>
                    Over-The-Air Updates
                  </Text>
                  <Text
                    style={[styles.otaSubtitle, { color: colors.textSecondary }]}
                  >
                    Wireless hot-patching & live bundle updates
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.otaStatusBadge,
                  {
                    backgroundColor: otaStatus?.hasCustomBundle
                      ? 'rgba(16, 185, 129, 0.15)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.05)',
                    borderColor: otaStatus?.hasCustomBundle
                      ? '#10B981'
                      : colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.otaStatusBadgeText,
                    {
                      color: otaStatus?.hasCustomBundle
                        ? '#10B981'
                        : colors.textMuted,
                    },
                  ]}
                >
                  {otaStatus?.hasCustomBundle
                    ? `v${otaStatus.installedVersion} Live`
                    : 'Base APK'}
                </Text>
              </View>
            </View>

            {/* Quick Actions / Status Row */}
            <View style={styles.otaActionRow}>
              <View
                style={[
                  styles.otaInfoPill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.04)',
                    borderColor: colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[styles.otaInfoPillText, { color: colors.textSecondary }]}
                >
                  {otaStatus?.hasCustomBundle
                    ? `📦 ${(otaStatus.bundleSize / 1024).toFixed(0)} KB installed`
                    : '📦 Embedded bundle'}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.otaCheckBtn,
                  {
                    backgroundColor: activeWorkspace.color,
                    opacity: otaChecking ? 0.7 : 1,
                  },
                ]}
                onPress={handleCheckOtaUpdate}
                disabled={otaChecking}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Check for OTA updates"
              >
                <Text style={styles.otaCheckBtnText}>
                  {otaChecking ? 'Checking...' : 'Check Updates ⚡'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Server Configuration */}
            <View style={styles.otaServerSection}>
              <Text
                style={[styles.otaServerLabel, { color: colors.textSecondary }]}
              >
                HOTSPOT SERVER (IP:PORT)
              </Text>
              <View style={styles.otaInputRow}>
                <TextInput
                  style={[
                    styles.otaServerInput,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(0, 0, 0, 0.03)',
                      borderColor: colors.borderSubtle,
                      color: colors.text,
                    },
                  ]}
                  value={otaServerHost}
                  onChangeText={setOtaServerHost}
                  placeholder="10.16.64.73:8888"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.otaSaveBtn,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(15, 23, 42, 0.08)',
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                  onPress={handleSaveServerHost}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.otaSaveBtnText, { color: colors.text }]}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Revert Option if Custom Bundle is Installed */}
            {otaStatus?.hasCustomBundle && (
              <TouchableOpacity
                style={styles.otaRevertBtn}
                onPress={handleRevertOta}
                activeOpacity={0.7}
              >
                <Text style={[styles.otaRevertBtnText, { color: '#EF4444' }]}>
                  ↺ Revert to Original Base APK
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  brandIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickThemeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickThemeBtnIcon: {
    fontSize: 14,
  },
  segmentedWrapper: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segmentedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedBtnActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedBtnText: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 340,
    marginBottom: 6,
  },

  // 2x2 Bento Grid Styles (Guaranteed Equal Width Alignment without flex-wrap overflow)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginVertical: 8,
  },
  gridCard: {
    borderRadius: 20,
    padding: 12,
    minHeight: 200,
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  gridCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '75%',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 11,
    fontWeight: '900',
  },
  gridCardMiddle: {
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  gridIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 6,
  },
  gridIconEmoji: {
    fontSize: 18,
  },
  titleContainer: {
    minHeight: 38,
    justifyContent: 'center',
  },
  gridCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  gridCardBottom: {
    marginTop: 4,
  },
  liveTelemetryBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  liveTelemetryText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  gridActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  gridActionPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridActionHint: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Carousel Styles
  carouselContainer: {
    marginVertical: 8,
  },
  carouselScroll: {
    gap: 14,
    alignItems: 'center',
  },
  carouselCard: {
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    minHeight: 330,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },
  cardTopBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 10,
  },
  iconEmoji: {
    fontSize: 26,
  },
  cardTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 3,
  },
  cardTagline: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  carouselLivePill: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  carouselLiveText: {
    fontSize: 11,
    fontWeight: '700',
  },
  featureChipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  cardTapHint: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 'auto',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  dotTouchWrapper: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
    borderRadius: 4,
  },

  // Bottom Section Styles
  bottomSection: {
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
  },
  continueButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
    minHeight: 48,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // OTA Updates Section Styles
  otaContainer: {
    width: '100%',
    marginTop: 18,
    marginBottom: 8,
  },
  otaCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  otaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  otaHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  otaIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  otaIconText: {
    fontSize: 16,
  },
  otaTitleCol: {
    flex: 1,
  },
  otaTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  otaSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  otaStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  otaStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  otaActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  otaInfoPill: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  otaInfoPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  otaCheckBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  otaCheckBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  otaServerSection: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  otaServerLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  otaInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otaServerInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  otaSaveBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otaSaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  otaRevertBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  otaRevertBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
