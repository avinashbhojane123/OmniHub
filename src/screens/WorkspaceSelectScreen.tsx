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
  BackHandler,
  Alert,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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
  movieRepository,
} from '../database/repositories';
import {
  batteryService,
  BatteryStatus,
} from '../services/battery/BatteryService';
import { otaService, OTAStatus, UpdateCheckResult } from '../services/ota/OTAService';
import { alarmService } from '../services/alarm/AlarmService';
import { chatSocketService } from '../services/chat/ChatSocketService';

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
    features: ['Trending & TV Series', 'Trailers & Cast Details', 'My Watchlist & Watched'],
  },
];

const formatVersion = (ver: number | string): string => {
  const num = typeof ver === 'string' ? parseInt(ver, 10) : ver;
  if (!num) return '0';
  if (num > 1577836800000) {
    try {
      return format(new Date(num), 'MM.dd.HHmm');
    } catch {
      return String(num);
    }
  }
  return String(num);
};

export const WorkspaceSelectScreen: React.FC = () => {
  const insetsContext = React.useContext(SafeAreaInsetsContext);
  const insets = insetsContext ?? {
    top: StatusBar.currentHeight || 24,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark, changeTheme } = useAppTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Responsive orientation layout: 4 columns in landscape/tablet, 2 columns in portrait
  const isLandscape = windowWidth > windowHeight && windowWidth > 580;
  const numColumns = isLandscape ? 4 : 2;
  const horizontalPadding = 16;
  const gridGap = 12;
  const gridCardWidth = useMemo(() => {
    const totalGaps = (numColumns - 1) * gridGap;
    return Math.floor((windowWidth - horizontalPadding * 2 - totalGaps) / numColumns);
  }, [windowWidth, numColumns]);

  const [selectedMode, setSelectedMode] = useState<WorkspaceMode>(
    route?.params?.currentMode || route?.params?.initialMode || 'planner',
  );

  // Sync selectedMode when navigation params change
  useEffect(() => {
    const mode = route?.params?.currentMode || route?.params?.initialMode;
    if (
      mode &&
      (mode === 'planner' || mode === 'battery' || mode === 'chat' || mode === 'movies')
    ) {
      setSelectedMode(mode as WorkspaceMode);
    }
  }, [route?.params?.currentMode, route?.params?.initialMode]);

  // Live Telemetry states (no mock data)
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus | null>(null);
  const [todayTasksCount, setTodayTasksCount] = useState<number | null>(null);
  const [pendingTasksCount, setPendingTasksCount] = useState<number | null>(null);
  const [pendingOverdueCount, setPendingOverdueCount] = useState<number>(0);
  const [watchlistCount, setWatchlistCount] = useState<number>(0);
  const [isChatConnected, setIsChatConnected] = useState<boolean>(false);
  const [isChatServerOnline, setIsChatServerOnline] = useState<boolean | null>(null);

  // User Default Workspace preference
  const [isAutoLaunchDefault, setIsAutoLaunchDefault] = useState<boolean>(false);

  // Alarm State & Pulsing Animation (deduplicated boolean to prevent 1-second re-renders)
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const alarmPulseAnim = useRef(new Animated.Value(0)).current;

  // Real-time subscription to AlarmService
  useEffect(() => {
    const unsub = alarmService.subscribe(st => {
      setIsAlarmRinging(prev => (prev !== st.isRinging ? st.isRinging : prev));
    });
    return unsub;
  }, []);

  // Continuous pulsing loop while alarm is ringing
  useEffect(() => {
    if (isAlarmRinging) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(alarmPulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(alarmPulseAnim, {
            toValue: 0.1,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      alarmPulseAnim.setValue(0);
    }
  }, [isAlarmRinging, alarmPulseAnim]);

  // OTA Updates State
  const [otaStatus, setOtaStatus] = useState<OTAStatus | null>(null);
  const [otaChecking, setOtaChecking] = useState(false);
  const [otaServerHost, setOtaServerHost] = useState('10.105.247.73:8888');
  const [isOtaModalVisible, setIsOtaModalVisible] = useState(false);
  const isOtaModalVisibleRef = useRef(false);
  useEffect(() => {
    isOtaModalVisibleRef.current = isOtaModalVisible;
  }, [isOtaModalVisible]);

  const [otaStatusMessage, setOtaStatusMessage] = useState<string | null>(null);
  const [otaUpdateInfo, setOtaUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [otaDownloading, setOtaDownloading] = useState(false);
  const [otaDownloadSuccess, setOtaDownloadSuccess] = useState(false);

  // Check default workspace preference on mount and mode change
  useEffect(() => {
    let isMounted = true;
    settingsRepository
      .get('default_workspace', 'select')
      .then(saved => {
        if (!isMounted) return;
        setIsAutoLaunchDefault(saved === selectedMode);
      })
      .catch(() => { });

    return () => {
      isMounted = false;
    };
  }, [selectedMode]);

  const toggleAutoLaunchDefault = async () => {
    const nextVal = !isAutoLaunchDefault;
    setIsAutoLaunchDefault(nextVal);
    await settingsRepository
      .set('default_workspace', nextVal ? selectedMode : 'select')
      .catch(() => { });
  };

  // OTA Status refresh callback
  const refreshOtaStatus = useCallback(async () => {
    try {
      const [status, serverUrl] = await Promise.all([
        otaService.getStatus(),
        otaService.getServerUrl(),
      ]);
      setOtaStatus(status);
      if (serverUrl) {
        setOtaServerHost(serverUrl.replace(/^https?:\/\//i, ''));
      }
    } catch {
      // Ignored non-critical OTA telemetry error
    }
  }, []);

  // Fresh Telemetry on Every Screen Focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      // 1. Planner Tasks Telemetry (real count, overdue separated from today)
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

          setTodayTasksCount(todayTasks.length);
          setPendingTasksCount(pendingToday.length);
          setPendingOverdueCount(pendingOverdue.length);
        } catch {
          if (isMounted) {
            setTodayTasksCount(null);
            setPendingTasksCount(null);
            setPendingOverdueCount(0);
          }
        }
      };

      // 2. Real Movie Bookmarks Telemetry
      const refreshMovies = async () => {
        try {
          const bookmarks = await movieRepository.findAll();
          if (isMounted) {
            setWatchlistCount(bookmarks.length);
          }
        } catch {
          if (isMounted) setWatchlistCount(0);
        }
      };

      // 3. Real Chat Cloud & Socket Status (pre-warms Render backend)
      const refreshChat = async () => {
        if (!isMounted) return;
        const socketConnected = chatSocketService.isConnected;
        setIsChatConnected(socketConnected);
        if (socketConnected) {
          setIsChatServerOnline(true);
          return;
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch('https://backend-9i6w.onrender.com/api/keep-alive/ping', {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (isMounted) setIsChatServerOnline(resp.ok);
        } catch {
          if (isMounted) setIsChatServerOnline(false);
        }
      };

      refreshTasks();
      refreshMovies();
      refreshChat();
      refreshOtaStatus();

      const telemetryInterval = setInterval(() => {
        refreshTasks();
        refreshMovies();
        refreshChat();
      }, 15000);

      // 4. Battery Telemetry subscription
      let unsubBattery: (() => void) | undefined;
      try {
        unsubBattery = batteryService.subscribeStatus(st => {
          if (isMounted) setBatteryStatus(st);
        });
      } catch { }

      // 5. Hardware Back Handler (Clean application exit without infinite back loop)
      const onBackPress = () => {
        if (isOtaModalVisibleRef.current) {
          setIsOtaModalVisible(false);
          return true;
        }
        BackHandler.exitApp();
        return true;
      };
      const backSub = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );

      return () => {
        isMounted = false;
        clearInterval(telemetryInterval);
        if (unsubBattery) unsubBattery();
        backSub.remove();
      };
    }, [refreshOtaStatus]),
  );

  const handleSelectMode = (mode: WorkspaceMode) => {
    setSelectedMode(mode);
  };

  const handleLaunch = (modeToEnter: WorkspaceMode) => {
    const targetConfig = WORKSPACES.find(w => w.id === modeToEnter);
    const targetRoute = targetConfig?.route || 'MainTabs';

    // Only persist as default if the user explicitly enabled it
    if (isAutoLaunchDefault) {
      settingsRepository.set('default_workspace', modeToEnter).catch(() => { });
    }

    // Reset stack with WorkspaceSelect as base route and targetRoute as active route.
    // This allows any workspace screen to cleanly goBack() to WorkspaceSelect without an infinite loop!
    navigation.reset({
      index: 1,
      routes: [{ name: 'WorkspaceSelect' }, { name: targetRoute }],
    });
  };

  const handleApplyUpdate = async (targetInfo?: UpdateCheckResult | null) => {
    const info = targetInfo || otaUpdateInfo;
    if (!info || otaDownloading) return;
    setOtaDownloading(true);
    setOtaStatusMessage(`Downloading update bundle v${formatVersion(info.remoteVersion)}...`);
    try {
      await otaService.downloadAndApplyUpdate(
        info.bundleUrl,
        info.remoteVersion,
      );
      await refreshOtaStatus();
      setOtaDownloadSuccess(true);
      setOtaStatusMessage('🎉 Update installed successfully! Restart required.');
    } catch (e: any) {
      const err = e.message || 'Unknown error occurred while downloading update';
      setOtaStatusMessage(`❌ Update failed: ${err}`);
      Alert.alert('Installation Failed', err);
    } finally {
      setOtaDownloading(false);
    }
  };

  const handleCheckOtaUpdate = async (isManualClick = false) => {
    if (otaChecking || otaDownloading) return;
    setOtaChecking(true);
    setOtaDownloadSuccess(false);
    setOtaStatusMessage(`Checking server at ${otaServerHost}...`);
    try {
      const result = await otaService.checkForUpdate();
      setOtaUpdateInfo(result);
      if (result.available) {
        const formattedVer = formatVersion(result.remoteVersion);
        setOtaStatusMessage(
          `🚀 Update v${formattedVer} available!${result.notes ? `\nNotes: ${result.notes}` : ''
          }`,
        );
        // Only show native Alert if triggered manually from outside the modal
        if (isManualClick && !isOtaModalVisibleRef.current) {
          Alert.alert(
            'Update Available! 🚀',
            `New Bundle v${formattedVer} is ready to install.\n${result.notes ? `\nNotes: ${result.notes}\n` : ''
            }\nWould you like to download and install now?`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Download & Apply ⚡',
                onPress: () => handleApplyUpdate(result),
              },
            ],
          );
        }
      } else {
        setOtaStatusMessage(
          `OmniHub is up to date (v${formatVersion(result.currentVersion || 0)}) ✨`,
        );
        if (isManualClick && !isOtaModalVisibleRef.current) {
          Alert.alert(
            'Up to Date ✨',
            `You have the latest version (v${formatVersion(result.currentVersion || 0)}).`,
          );
        }
      }
    } catch (e: any) {
      setOtaUpdateInfo(null);
      const errMsg = e.message || 'Could not connect to update server.';
      setOtaStatusMessage(`⚠️ ${errMsg}`);
      if (isManualClick && !isOtaModalVisibleRef.current) {
        Alert.alert('Update Check Failed', errMsg);
      }
    } finally {
      setOtaChecking(false);
    }
  };

  const handleOpenOtaModal = () => {
    setIsOtaModalVisible(true);
    refreshOtaStatus();
    handleCheckOtaUpdate(false);
  };

  const handleSaveServerHost = async () => {
    const raw = otaServerHost.trim();
    if (!raw) {
      Alert.alert('Invalid Server', 'Please enter a valid IP:port or server URL.');
      return;
    }
    let url = raw;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    url = url.replace(/\/+$/, '');

    await otaService.setServerUrl(url);
    setOtaServerHost(url.replace(/^https?:\/\//i, ''));
    setOtaStatusMessage(`OTA server updated to ${url}`);
    Alert.alert('Server Saved', `OTA Server URL updated to ${url}`);
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

  const activeWorkspace = useMemo(() => {
    return WORKSPACES.find(w => w.id === selectedMode) || WORKSPACES[0];
  }, [selectedMode]);

  const getLiveTelemetryBadge = (id: WorkspaceMode) => {
    switch (id) {
      case 'planner':
        if (isAlarmRinging) {
          return '🔔 Ringing Now!';
        }
        if (todayTasksCount === 0) {
          return '📅 No Tasks Today';
        }
        if (todayTasksCount !== null && todayTasksCount > 0 && pendingTasksCount === 0) {
          return '✓ All Done Today';
        }
        if (pendingTasksCount !== null && pendingTasksCount > 0) {
          if (pendingOverdueCount > 0) {
            return `📅 ${pendingTasksCount} Today (+${pendingOverdueCount})`;
          }
          return `📅 ${pendingTasksCount} Pending Today`;
        }
        return '📅 Schedule Ready';
      case 'battery':
        if (batteryStatus && batteryStatus.level > 0) {
          if (batteryStatus.level >= 99 && batteryStatus.isCharging) {
            return '⚡ 100% • Charged';
          }
          if (batteryStatus.level <= 15 && !batteryStatus.isCharging) {
            return `🪫 ${batteryStatus.level}% • Low`;
          }
          return `⚡ ${batteryStatus.level}% ${batteryStatus.isCharging ? '• Charging' : '• Guarded'
            }`;
        }
        return '⚡ Guard Active';
      case 'chat':
        if (isChatConnected) {
          return '💬 Online & Connected';
        }
        if (isChatServerOnline === true) {
          return '💬 Cloud Active & Ready';
        }
        if (isChatServerOnline === false) {
          return '💬 Cloud Idle • Tap to Wake';
        }
        return '💬 Checking Cloud...';
      case 'movies':
        return watchlistCount > 0
          ? `🍿 ${watchlistCount} in Watchlist`
          : '🍿 TMDb Catalog';
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
              <TouchableOpacity
                style={[
                  styles.brandPill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(15, 23, 42, 0.05)',
                    borderColor: otaStatus?.hasCustomBundle
                      ? '#10B981'
                      : colors.borderSubtle,
                  },
                ]}
                onPress={handleOpenOtaModal}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="OmniHub Updates"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.brandIcon}>💎</Text>
                <Text style={[styles.brandText, { color: colors.text }]}>
                  OmniHub
                </Text>
                {otaChecking ? (
                  <ActivityIndicator
                    size="small"
                    color="#8B5CF6"
                    style={{ marginLeft: 6 }}
                  />
                ) : otaStatus?.hasCustomBundle ? (
                  <View style={styles.brandLiveBadge}>
                    <View style={styles.brandLiveDot} />
                    <Text style={styles.brandLiveText}>Live</Text>
                  </View>
                ) : (
                  <View style={styles.brandOtaBadge}>
                    <Text style={styles.brandOtaText}>OTA</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Top Right Group: Quick Theme Toggle */}
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
                accessibilityLabel={`Toggle theme, currently ${isDark ? 'dark' : 'light'
                  }`}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.quickThemeBtnIcon}>
                  {isDark ? '🌙' : '☀️'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.mainTitle, { color: colors.text }]}>
            Choose Your Workspace
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            4 standalone power suites. Tap to select or launch directly.
          </Text>
        </View>

        {/* Main Content Area: Responsive Bento Grid */}
        <View style={[styles.gridContainer, { gap: gridGap }]}>
          {WORKSPACES.map(ws => {
            const isSelected = selectedMode === ws.id;
            const isPlannerAlarming = ws.id === 'planner' && isAlarmRinging;
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
                accessibilityHint="Tap to select or launch this workspace."
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
                {/* Pulsing glowing outline when alarm is ringing */}
                {isPlannerAlarming && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.alarmPulseBorder,
                      {
                        opacity: alarmPulseAnim,
                        transform: [
                          {
                            scale: alarmPulseAnim.interpolate({
                              inputRange: [0.1, 1],
                              outputRange: [1.0, 1.025],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                )}

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

                {/* Card Middle: Icon & Title */}
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
                      numberOfLines={1}
                    >
                      {ws.name}
                    </Text>
                    <Text
                      style={[styles.gridCardTagline, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {ws.tagline}
                    </Text>
                  </View>
                </View>

                {/* Card Bottom: Live Badge & Explicit Open Button */}
                <View style={styles.gridCardBottom}>
                  <View
                    style={[
                      styles.liveTelemetryBadge,
                      {
                        backgroundColor: isPlannerAlarming
                          ? isDark
                            ? 'rgba(139, 92, 246, 0.28)'
                            : '#EDE9FE'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.06)'
                            : `${ws.color}12`,
                        borderColor: isPlannerAlarming
                          ? '#8B5CF6'
                          : isSelected
                            ? `${ws.color}60`
                            : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.liveTelemetryText,
                        {
                          color: isPlannerAlarming
                            ? '#8B5CF6'
                            : isSelected
                              ? ws.color
                              : colors.textSecondary,
                          fontWeight: isPlannerAlarming ? '800' : '700',
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
                      onPress={() => {
                        if (isSelected || isPlannerAlarming) {
                          handleLaunch(ws.id);
                        } else {
                          handleSelectMode(ws.id);
                        }
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={[
                        styles.gridActionPill,
                        {
                          backgroundColor: isPlannerAlarming
                            ? '#8B5CF6'
                            : isSelected
                              ? ws.color
                              : isDark
                                ? 'rgba(255, 255, 255, 0.08)'
                                : 'rgba(15, 23, 42, 0.05)',
                          borderColor: isPlannerAlarming
                            ? '#8B5CF6'
                            : isSelected
                              ? ws.color
                              : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.gridActionHint,
                          {
                            color: isPlannerAlarming || isSelected
                              ? '#FFFFFF'
                              : colors.textSecondary,
                          },
                        ]}
                      >
                        {isPlannerAlarming
                          ? '🔔 Open'
                          : isSelected
                            ? 'Launch ➔'
                            : 'Select'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bottom Section: Suite Features, Default Workspace Toggle & Primary Launch Button */}
        <View style={styles.bottomSection}>
          {/* Active Suite Features Preview */}
          <View style={styles.featuresPreview}>
            <Text style={[styles.featuresPreviewTitle, { color: colors.textMuted }]}>
              {activeWorkspace.name} Highlights
            </Text>
            <View style={styles.featuresRow}>
              {activeWorkspace.features.map((feat, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.featurePill,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(15, 23, 42, 0.04)',
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={[styles.featureDot, { color: activeWorkspace.color }]}>•</Text>
                  <Text
                    style={[styles.featureText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {feat}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.defaultWorkspaceToggle,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(15, 23, 42, 0.04)',
                borderColor: isAutoLaunchDefault
                  ? activeWorkspace.color
                  : colors.borderSubtle,
              },
            ]}
            activeOpacity={0.7}
            onPress={toggleAutoLaunchDefault}
          >
            <View
              style={[
                styles.defaultCheckbox,
                {
                  borderColor: isAutoLaunchDefault
                    ? activeWorkspace.color
                    : colors.border,
                  backgroundColor: isAutoLaunchDefault
                    ? activeWorkspace.color
                    : 'transparent',
                },
              ]}
            >
              {isAutoLaunchDefault && (
                <Text style={styles.defaultCheckmark}>✓</Text>
              )}
            </View>
            <Text
              style={[styles.defaultWorkspaceText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              Always launch{' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {activeWorkspace.name}
              </Text>{' '}
              on app startup
            </Text>
          </TouchableOpacity>

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
      </ScrollView>

      {/* Over-The-Air (OTA) Updates Interactive Modal */}
      <Modal
        visible={isOtaModalVisible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setIsOtaModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.otaModalBackdrop}
          activeOpacity={1}
          onPress={() => setIsOtaModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.otaKeyboardAvoid}
          >
            <TouchableOpacity
              style={[
                styles.otaModalContent,
                {
                  backgroundColor: isDark ? '#111827' : '#FFFFFF',
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.1)',
                },
              ]}
              activeOpacity={1}
              onPress={e => e.stopPropagation?.()}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {/* Modal Header */}
                <View style={styles.otaModalHeader}>
                  <View style={styles.otaModalHeaderLeft}>
                    <View
                      style={[
                        styles.otaModalIconBox,
                        {
                          backgroundColor: isDark
                            ? 'rgba(139, 92, 246, 0.2)'
                            : 'rgba(139, 92, 246, 0.1)',
                          borderColor: 'rgba(139, 92, 246, 0.35)',
                        },
                      ]}
                    >
                      <Text style={styles.otaModalIcon}>💎</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.otaModalTitle, { color: colors.text }]}>
                        OmniHub OTA Update
                      </Text>
                      <Text
                        style={[
                          styles.otaModalSubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Wireless hot-patching & live bundle updates
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.otaModalCloseBtn,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'rgba(0, 0, 0, 0.05)',
                        borderColor: colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setIsOtaModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.otaModalCloseText, { color: colors.text }]}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Status Pills */}
                <View style={styles.otaModalStatusGrid}>
                  <View
                    style={[
                      styles.otaModalStatusPill,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(0, 0, 0, 0.03)',
                        borderColor: otaStatus?.hasCustomBundle
                          ? 'rgba(16, 185, 129, 0.4)'
                          : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.otaModalStatusPillLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Installed Bundle
                    </Text>
                    <Text
                      style={[
                        styles.otaModalStatusPillValue,
                        {
                          color: otaStatus?.hasCustomBundle
                            ? '#10B981'
                            : colors.text,
                        },
                      ]}
                    >
                      {otaStatus?.hasCustomBundle
                        ? `v${formatVersion(otaStatus.installedVersion)} Live`
                        : 'Base APK (Embedded)'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.otaModalStatusPill,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(0, 0, 0, 0.03)',
                        borderColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.otaModalStatusPillLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Bundle Size
                    </Text>
                    <Text
                      style={[
                        styles.otaModalStatusPillValue,
                        { color: colors.text },
                      ]}
                    >
                      {otaStatus?.hasCustomBundle
                        ? `📦 ${(otaStatus.bundleSize / 1024).toFixed(0)} KB`
                        : '📦 Embedded'}
                    </Text>
                  </View>
                </View>

                {/* Live Message Banner */}
                <View
                  style={[
                    styles.otaLiveMessageCard,
                    {
                      backgroundColor: otaDownloadSuccess
                        ? 'rgba(16, 185, 129, 0.12)'
                        : otaUpdateInfo?.available
                          ? 'rgba(139, 92, 246, 0.12)'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.05)'
                            : 'rgba(0, 0, 0, 0.04)',
                      borderColor: otaDownloadSuccess
                        ? '#10B981'
                        : otaUpdateInfo?.available
                          ? '#8B5CF6'
                          : colors.borderSubtle,
                    },
                  ]}
                >
                  {otaChecking || otaDownloading ? (
                    <ActivityIndicator
                      size="small"
                      color={otaDownloading ? '#38BDF8' : '#8B5CF6'}
                    />
                  ) : (
                    <Text style={styles.otaLiveMessageIcon}>
                      {otaDownloadSuccess
                        ? '🎉'
                        : otaUpdateInfo?.available
                          ? '🚀'
                          : otaStatusMessage?.startsWith('⚠️')
                            ? '⚠️'
                            : '✨'}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.otaLiveMessageText,
                      {
                        color: otaDownloadSuccess
                          ? '#10B981'
                          : otaUpdateInfo?.available
                            ? colors.text
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {otaStatusMessage ||
                      'Tap below to check hotspot server for latest updates.'}
                  </Text>
                </View>

                {/* Primary Action Button */}
                <TouchableOpacity
                  style={[
                    styles.otaModalPrimaryBtn,
                    {
                      backgroundColor: otaDownloadSuccess
                        ? '#10B981'
                        : otaUpdateInfo?.available
                          ? '#8B5CF6'
                          : activeWorkspace.color,
                      opacity: otaChecking || otaDownloading ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (otaDownloadSuccess) {
                      otaService.restartApp();
                    } else if (otaUpdateInfo?.available) {
                      handleApplyUpdate();
                    } else {
                      handleCheckOtaUpdate(true);
                    }
                  }}
                  disabled={otaChecking || otaDownloading}
                  activeOpacity={0.8}
                >
                  {otaChecking ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : otaDownloading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : null}
                  <Text style={styles.otaModalPrimaryBtnText}>
                    {otaDownloadSuccess
                      ? '🚀 Restart Application Now'
                      : otaDownloading
                        ? 'Installing Bundle...'
                        : otaChecking
                          ? 'Checking Server...'
                          : otaUpdateInfo?.available
                            ? `⚡ Download & Apply Update v${formatVersion(
                              otaUpdateInfo.remoteVersion,
                            )}`
                            : '⚡ Check & Update Application'}
                  </Text>
                </TouchableOpacity>

                {/* Server Configuration */}
                <View style={styles.otaServerSection}>
                  <Text
                    style={[
                      styles.otaServerLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    HOTSPOT SERVER (IP:PORT OR HOST)
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
                      placeholder="10.105.247.73:8888"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
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
                      <Text
                        style={[styles.otaSaveBtnText, { color: colors.text }]}
                      >
                        Save
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Revert to Base APK if Custom Bundle Active */}
                {otaStatus?.hasCustomBundle && (
                  <TouchableOpacity
                    style={[styles.otaRevertBtn, { marginTop: 12 }]}
                    onPress={handleRevertOta}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.otaRevertBtnText, { color: '#EF4444' }]}>
                      ↺ Revert to Original Base APK
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
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

  // Responsive Bento Grid Styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginVertical: 8,
  },
  gridCard: {
    borderRadius: 20,
    padding: 12,
    minHeight: 185,
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    position: 'relative',
    overflow: 'visible',
  },
  alarmPulseBorder: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 23,
    borderWidth: 3.5,
    borderColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 10,
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
    minHeight: 36,
    justifyContent: 'center',
  },
  gridCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  gridCardTagline: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
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

  // Bottom Section Styles
  bottomSection: {
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  featuresPreview: {
    width: '100%',
    marginBottom: 10,
    marginTop: 2,
  },
  featuresPreviewTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  featureDot: {
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '900',
  },
  featureText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  defaultWorkspaceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    width: '100%',
    gap: 8,
  },
  defaultCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultCheckmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  defaultWorkspaceText: {
    fontSize: 11.5,
    flex: 1,
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

  brandLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  brandLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  brandLiveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.2,
  },
  brandOtaBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  brandOtaText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#8B5CF6',
    letterSpacing: 0.2,
  },

  // OTA Modal Styles
  otaModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  otaKeyboardAvoid: {
    width: '100%',
    maxWidth: 440,
  },
  otaModalContent: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '90%',
  },
  otaModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  otaModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  otaModalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  otaModalIcon: {
    fontSize: 18,
  },
  otaModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  otaModalSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  otaModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  otaModalCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
  otaModalStatusGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  otaModalStatusPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otaModalStatusPillLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  otaModalStatusPillValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  otaLiveMessageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  otaLiveMessageIcon: {
    fontSize: 18,
  },
  otaLiveMessageText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  otaModalPrimaryBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  otaModalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
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
  },
  otaRevertBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
