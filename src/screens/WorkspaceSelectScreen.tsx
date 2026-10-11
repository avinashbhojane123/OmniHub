import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  StatusBar,
  ScrollView,
  Modal,
  Alert,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { taskRepository } from '../database/repositories/TaskRepository';
import { batteryService, BatteryStatus } from '../services/battery/BatteryService';
import { safeGuardStore } from '../services/safeguard/SafeGuardStore';
import { chatSocketService } from '../services/chat/chatSocketService';

export type WorkspaceMode = 'planner' | 'chat' | 'battery' | 'safeguard';

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
    id: 'chat',
    name: 'Chat & Connect',
    tagline: 'Passcode rooms & presence',
    category: 'MESSAGING',
    icon: '💬',
    color: '#06B6D4',
    colorLight: '#22D3EE',
    darkBg: '#082F3B',
    lightBg: '#ECFEFF',
    route: 'Chat',
    features: ['Passcode-Locked Rooms', 'Real-Time Presence', 'Private Channels'],
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
    id: 'safeguard',
    name: 'SafeGuard Family',
    tagline: 'Parent-child protection & GPS',
    category: 'FAMILY SAFETY',
    icon: '🛡️',
    color: '#EC4899',
    colorLight: '#F472B6',
    darkBg: '#3B0728',
    lightBg: '#FDF2F8',
    route: 'SafeGuard',
    features: ['Parent & Child Dual-Role', 'Live GPS & Geofencing', 'AI Risk Detection'],
  },
];

export const WorkspaceSelectScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isLandscape = windowWidth > 580;

  // Responsive Carousel Width
  const carouselCardWidth = Math.min(windowWidth - 64, 330);
  const carouselSpacing = 14;
  const carouselSnapStep = carouselCardWidth + carouselSpacing;

  const [selectedMode, setSelectedMode] = useState<WorkspaceMode>('planner');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [savedDefaultWorkspace, setSavedDefaultWorkspace] = useState<WorkspaceMode>('planner');
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');

  // Live Telemetry states
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus | null>(null);
  const [pendingTasksCount, setPendingTasksCount] = useState<number | null>(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);
  const [chatOnlineStatus, setChatOnlineStatus] = useState<string>('Encrypted Rooms');

  // Parent PIN Verification Modal (for Child Mode SafeGuard exit protection)
  const [sessionParentUnlocked, setSessionParentUnlocked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pendingTargetMode, setPendingTargetMode] = useState<WorkspaceMode | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLockoutUntil, setPinLockoutUntil] = useState<number | null>(null);

  const carouselScrollRef = useRef<any>(null);
  const parentUnlockTimerRef = useRef<any>(null);

  // Auto-rearm Child Mode protection after 60 seconds of inactivity on OmniHub
  useEffect(() => {
    if (sessionParentUnlocked || route?.params?.parentUnlocked) {
      if (parentUnlockTimerRef.current) clearTimeout(parentUnlockTimerRef.current);
      parentUnlockTimerRef.current = setTimeout(() => {
        setSessionParentUnlocked(false);
        if (route?.params?.parentUnlocked) {
          navigation.setParams({ parentUnlocked: false });
        }
      }, 60000);
    }
    return () => {
      if (parentUnlockTimerRef.current) clearTimeout(parentUnlockTimerRef.current);
    };
  }, [sessionParentUnlocked, route?.params?.parentUnlocked, navigation]);

  // Load preferences concurrently on mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      settingsRepository.get('remember_workspace', 'false'),
      settingsRepository.get('default_workspace', 'planner'),
      settingsRepository.get('workspace_view_mode', 'grid'),
    ])
      .then(([rememberVal, defaultVal, viewModeVal]) => {
        if (!isMounted) return;
        setRememberChoice(rememberVal === 'true');
        const validWs =
          defaultVal === 'planner' ||
          defaultVal === 'chat' ||
          defaultVal === 'battery' ||
          defaultVal === 'safeguard'
            ? (defaultVal as WorkspaceMode)
            : 'planner';
        setSelectedMode(validWs);
        setSavedDefaultWorkspace(validWs);
        if (viewModeVal === 'grid' || viewModeVal === 'carousel') {
          setViewMode(viewModeVal as 'grid' | 'carousel');
          if (viewModeVal === 'carousel') {
            const targetIndex = WORKSPACES.findIndex((w) => w.id === validWs);
            if (targetIndex >= 0) {
              setTimeout(() => {
                carouselScrollRef.current?.scrollTo({
                  x: targetIndex * carouselSnapStep,
                  animated: false,
                });
              }, 120);
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [carouselSnapStep]);

  // Fresh Telemetry on Every Screen Focus (fixes stale counts)
  useFocusEffect(
    useCallback(() => {
      // 1. Planner Tasks Telemetry (Exclude completed AND cancelled) with reactive refresh
      let taskInterval: any;
      const refreshTasks = () => {
        try {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          taskRepository
            .findByDate(todayStr)
            .then((tasks) => {
              const pending = tasks.filter(
                (t) => t.status !== 'completed' && t.status !== 'cancelled'
              ).length;
              setPendingTasksCount(pending);
            })
            .catch(() => setPendingTasksCount(null));
        } catch {
          setPendingTasksCount(null);
        }
      };
      refreshTasks();
      taskInterval = setInterval(refreshTasks, 4000);

      // 2. Battery Telemetry & live listener
      let unsubBattery: (() => void) | undefined;
      try {
        setBatteryStatus(batteryService.getStatus());
        unsubBattery = batteryService.subscribeStatus((st) => setBatteryStatus(st));
      } catch {
        // Fallback gracefully
      }

      // 3. SafeGuard Risk Alerts Telemetry & live store listener
      const updateSafeGuardAlerts = () => {
        try {
          const alerts = safeGuardStore.getAlerts();
          const unreadCount = alerts.filter((a) => !a.isRead).length;
          setActiveAlertsCount(unreadCount);
        } catch {
          setActiveAlertsCount(0);
        }
      };
      updateSafeGuardAlerts();
      const unsubSafeGuard = safeGuardStore.subscribe(updateSafeGuardAlerts);

      // 4. Chat Telemetry (real live status)
      try {
        if (chatSocketService.isConnected) {
          const users = chatSocketService.getCachedUsers();
          const userCount = users.length > 0 ? users.length : 1;
          const roomTag = chatSocketService.passcode ? ` • Room ${chatSocketService.passcode}` : '';
          setChatOnlineStatus(`${userCount} Online${roomTag}`);
        } else if (chatSocketService.wasInRoom && chatSocketService.passcode) {
          setChatOnlineStatus(`Room ${chatSocketService.passcode} Saved`);
        } else {
          setChatOnlineStatus('Encrypted Rooms');
        }
      } catch {
        setChatOnlineStatus('Encrypted Rooms');
      }

      // 5. Hardware Back Handler support
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        if (taskInterval) clearInterval(taskInterval);
        if (unsubBattery) unsubBattery();
        if (unsubSafeGuard) unsubSafeGuard();
        backSub.remove();
        // Clear temporary parent unlocked state upon screen blur for strict security
        setSessionParentUnlocked(false);
      };
    }, [navigation])
  );

  const handleSelectViewMode = async (mode: 'grid' | 'carousel') => {
    if (viewMode === mode) return;
    setViewMode(mode);
    await settingsRepository.set('workspace_view_mode', mode);
    if (mode === 'carousel') {
      const targetIndex = WORKSPACES.findIndex((w) => w.id === selectedMode);
      if (targetIndex >= 0) {
        setTimeout(() => {
          carouselScrollRef.current?.scrollTo({
            x: targetIndex * carouselSnapStep,
            animated: false,
          });
        }, 60);
      }
    }
  };

  const handleSelectMode = async (mode: WorkspaceMode, scrollIndex?: number) => {
    setSelectedMode(mode);
    if (rememberChoice) {
      setSavedDefaultWorkspace(mode);
      await settingsRepository.set('default_workspace', mode);
    }
    if (viewMode === 'carousel' && carouselScrollRef.current) {
      const targetIndex =
        scrollIndex !== undefined
          ? scrollIndex
          : WORKSPACES.findIndex((w) => w.id === mode);
      if (targetIndex >= 0) {
        carouselScrollRef.current.scrollTo({
          x: targetIndex * carouselSnapStep,
          animated: true,
        });
      }
    }
  };

  const executeLaunch = async (modeToEnter: WorkspaceMode) => {
    if (rememberChoice) {
      await settingsRepository.set('remember_workspace', 'true');
      await settingsRepository.set('default_workspace', modeToEnter);
      setSavedDefaultWorkspace(modeToEnter);
    } else {
      await settingsRepository.set('remember_workspace', 'false');
    }

    const targetConfig = WORKSPACES.find((w) => w.id === modeToEnter);
    const targetRoute = targetConfig?.route || 'MainTabs';

    // Clean reset to the target workspace so backstack does not accumulate duplicate screens or loop
    navigation.reset({
      index: 0,
      routes: [{ name: targetRoute }],
    });
  };

  // Safe launch check: verifies Parent PIN if child account tries to switch out of SafeGuard
  const handleInitiateLaunch = (modeToEnter: WorkspaceMode) => {
    const currentRole = safeGuardStore.getRole();
    const settings = safeGuardStore.getSettings();
    const isUnlocked = sessionParentUnlocked || route?.params?.parentUnlocked;
    if (
      currentRole === 'CHILD' &&
      !isUnlocked &&
      modeToEnter !== 'safeguard' &&
      settings.requirePinForChildSwitch
    ) {
      setPendingTargetMode(modeToEnter);
      setEnteredPin('');
      setPinError(false);
      setIsVerifyingPin(false);
      setPinModalVisible(true);
      return;
    }
    executeLaunch(modeToEnter);
  };

  const handlePinDigit = (digit: string) => {
    if (isVerifyingPin) return;
    if (pinLockoutUntil && Date.now() < pinLockoutUntil) return;
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handlePinDelete = () => {
    if (isVerifyingPin) return;
    if (enteredPin.length > 0) {
      setEnteredPin(enteredPin.slice(0, -1));
      setPinError(false);
    }
  };

  const verifyPin = (pinToTest: string) => {
    setIsVerifyingPin(true);
    const settings = safeGuardStore.getSettings();
    if (pinToTest === settings.parentPin) {
      setPinModalVisible(false);
      setEnteredPin('');
      setPinError(false);
      setIsVerifyingPin(false);
      setSessionParentUnlocked(true);
      setPinAttempts(0);
      setPinLockoutUntil(null);
      if (pendingTargetMode) {
        executeLaunch(pendingTargetMode);
      }
    } else {
      setPinError(true);
      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      if (newAttempts >= 5) {
        setPinLockoutUntil(Date.now() + 10000);
      }
      setTimeout(() => {
        setEnteredPin('');
        setPinError(false);
        setIsVerifyingPin(false);
      }, 700);
    }
  };

  const handleToggleRemember = async (val: boolean) => {
    setRememberChoice(val);
    await settingsRepository.set('remember_workspace', val ? 'true' : 'false');
    if (val) {
      await settingsRepository.set('default_workspace', selectedMode);
      setSavedDefaultWorkspace(selectedMode);
    }
  };

  // Carousel scroll sync (updates active preview without mutating persisted database default until launch)
  const handleCarouselScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / carouselSnapStep);
      if (index >= 0 && index < WORKSPACES.length) {
        const currentMode = WORKSPACES[index].id;
        if (currentMode !== selectedMode) {
          setSelectedMode(currentMode);
        }
      }
    },
    [carouselSnapStep, selectedMode]
  );

  const activeWorkspace =
    WORKSPACES.find((w) => w.id === selectedMode) || WORKSPACES[0];

  const getLiveTelemetryBadge = (id: WorkspaceMode) => {
    switch (id) {
      case 'planner':
        if (pendingTasksCount !== null && pendingTasksCount > 0) {
          return `📅 ${pendingTasksCount} Pending Today`;
        }
        return '📅 Schedule Ready';
      case 'chat':
        return `💬 ${chatOnlineStatus}`;
      case 'battery':
        if (batteryStatus) {
          return `⚡ ${batteryStatus.level}% ${batteryStatus.isCharging ? '• Charging' : '• Normal'}`;
        }
        return '⚡ Guard Active';
      case 'safeguard':
        if (activeAlertsCount > 0) {
          return `🛡️ ${activeAlertsCount} Alert${activeAlertsCount > 1 ? 's' : ''}`;
        }
        return '🛡️ Shield Active';
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

      {/* Responsive Vertical Scroll Wrapper to prevent cutoff on any screen size */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: '100%' },
        ]}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.topLeftGroup}>
              {navigation.canGoBack() && (
                <TouchableOpacity
                  style={[
                    styles.backBtn,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(15, 23, 42, 0.06)',
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Back to previous screen"
                >
                  <Text
                    style={[
                      styles.backBtnText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    ‹ Back
                  </Text>
                </TouchableOpacity>
              )}

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
                <Text
                  style={[
                    styles.brandText,
                    { color: colors.text },
                  ]}
                >
                  OmniHub
                </Text>
              </View>
            </View>

            {/* Intuitive Segmented Control (Grid vs Carousel) */}
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
                    { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
                  ],
                ]}
                onPress={() => handleSelectViewMode('grid')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Switch to Grid view"
                accessibilityState={{ selected: viewMode === 'grid' }}
              >
                <Text
                  style={[
                    styles.segmentedBtnText,
                    {
                      color:
                        viewMode === 'grid'
                          ? colors.text
                          : colors.textMuted,
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
                    { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
                  ],
                ]}
                onPress={() => handleSelectViewMode('carousel')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Switch to Carousel view"
                accessibilityState={{ selected: viewMode === 'carousel' }}
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

          <Text
            style={[
              styles.mainTitle,
              { color: colors.text },
            ]}
          >
            Choose Your Workspace
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary },
            ]}
          >
            4 standalone power suites. Tap to select or launch directly.
          </Text>

          {/* Current Default Startup Badge */}
          {rememberChoice && (
            <View
              style={[
                styles.startupBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(15, 23, 42, 0.05)',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.startupBadgeText,
                  { color: colors.textSecondary },
                ]}
              >
                ⭐ Startup Default:{' '}
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {WORKSPACES.find((w) => w.id === savedDefaultWorkspace)?.name || 'Planner'}
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* Main Content Area: 2x2 Bento Grid vs. Detailed Carousel */}
        {viewMode === 'grid' ? (
          <View style={styles.gridContainer}>
            {WORKSPACES.map((ws) => {
              const isSelected = selectedMode === ws.id;
              return (
                <TouchableOpacity
                  key={ws.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (isSelected) {
                      handleInitiateLaunch(ws.id);
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
                    isLandscape && styles.gridCardLandscape,
                    {
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
                      shadowOpacity: isSelected ? 0.38 : 0.06,
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
                        style={[
                          styles.categoryBadgeText,
                          { color: ws.color },
                        ]}
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
                        style={[
                          styles.gridCardTitle,
                          { color: colors.text },
                        ]}
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
                            color: isSelected
                              ? ws.color
                              : colors.textSecondary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {getLiveTelemetryBadge(ws.id)}
                      </Text>
                    </View>

                    <View style={styles.gridActionRow}>
                      <View
                        style={[
                          styles.gridActionPill,
                          {
                            backgroundColor: isSelected
                              ? ws.color
                              : isDark
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'rgba(15, 23, 42, 0.04)',
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
                      </View>
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
              nestedScrollEnabled={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.carouselScroll,
                { paddingHorizontal: Math.max((windowWidth - carouselCardWidth) / 2, 16) },
              ]}
              decelerationRate="fast"
              snapToOffsets={WORKSPACES.map((_, i) => i * carouselSnapStep)}
              snapToAlignment="center"
              onMomentumScrollEnd={handleCarouselScroll}
            >
              {WORKSPACES.map((ws, idx) => {
                const isSelected = selectedMode === ws.id;
                return (
                  <TouchableOpacity
                    key={ws.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      if (isSelected) {
                        handleInitiateLaunch(ws.id);
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
                        shadowOpacity: isSelected ? 0.38 : 0.08,
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
                      <Text
                        style={[
                          styles.cardBadgeText,
                          { color: ws.color },
                        ]}
                      >
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
                    <Text
                      style={[
                        styles.cardTitle,
                        { color: colors.text },
                      ]}
                    >
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
                        style={[
                          styles.carouselLiveText,
                          { color: ws.color },
                        ]}
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

            {/* Dots Indicator with Accessible Touch Target */}
            <View style={styles.dotsRow}>
              {WORKSPACES.map((ws, idx) => (
                <TouchableOpacity
                  key={ws.id}
                  onPress={() => handleSelectMode(ws.id, idx)}
                  hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Page ${idx + 1} of ${WORKSPACES.length}: ${ws.name}`}
                  accessibilityState={{ selected: selectedMode === ws.id }}
                  style={[
                    styles.dotTouchWrapper,
                  ]}
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

        {/* Bottom Controls Section */}
        <View style={styles.bottomSection}>
          <View
            style={[
              styles.rememberCard,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(15, 23, 42, 0.03)',
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.rememberRow}>
              <Switch
                value={rememberChoice}
                onValueChange={handleToggleRemember}
                accessibilityRole="switch"
                accessibilityLabel="Remember choice for startup"
                accessibilityState={{ checked: rememberChoice }}
                trackColor={{
                  false: isDark ? '#334155' : '#CBD5E1',
                  true: activeWorkspace.color,
                }}
                thumbColor={rememberChoice ? '#FFFFFF' : '#94A3B8'}
              />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleToggleRemember(!rememberChoice)}
                style={styles.rememberLabelCol}
              >
                <Text
                  style={[
                    styles.rememberLabel,
                    { color: colors.text },
                  ]}
                >
                  Remember choice for startup
                </Text>
                <Text
                  style={[
                    styles.rememberSubtext,
                    { color: colors.textSecondary },
                  ]}
                >
                  {rememberChoice
                    ? `Auto-opens ${activeWorkspace.name} on launch`
                    : 'Show this workspace selector each time app starts'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Prominent Launch Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              {
                backgroundColor: activeWorkspace.color,
                shadowColor: activeWorkspace.color,
              },
            ]}
            activeOpacity={0.88}
            onPress={() => handleInitiateLaunch(selectedMode)}
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

      {/* Parental PIN Authentication Modal (Protects against Child Mode Escape) */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.pinBackdrop}>
          <View
            style={[
              styles.pinCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.pinHeader}>
              <Text style={styles.pinIcon}>🔒</Text>
              <Text style={[styles.pinTitle, { color: colors.text }]}>
                Parent Security PIN
              </Text>
              <Text style={[styles.pinSubtitle, { color: colors.textSecondary }]}>
                SafeGuard Child Agent Mode is active. Enter Parent Security PIN to unlock OmniHub.
              </Text>
            </View>

            {/* 4-digit PIN Dots */}
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((idx) => {
                const filled = enteredPin.length > idx;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinDot,
                      {
                        borderColor: pinError ? '#EF4444' : colors.border,
                        backgroundColor: filled
                          ? pinError
                            ? '#EF4444'
                            : activeWorkspace.color
                          : 'transparent',
                      },
                    ]}
                  />
                );
              })}
            </View>

            {pinLockoutUntil && Date.now() < pinLockoutUntil ? (
              <Text style={styles.pinErrorText}>Too many attempts. Wait 10 seconds.</Text>
            ) : pinError ? (
              <Text style={styles.pinErrorText}>Incorrect PIN. Try again.</Text>
            ) : null}

            {/* Numeric Keypad */}
            <View style={styles.keypad}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['CANCEL', '0', '⌫'],
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map((item) => (
                    <TouchableOpacity
                      key={item}
                      disabled={
                        item !== 'CANCEL' &&
                        (isVerifyingPin || Boolean(pinLockoutUntil && Date.now() < pinLockoutUntil))
                      }
                      style={[
                        styles.keypadBtn,
                        item === 'CANCEL' && styles.keypadBtnCancel,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(15, 23, 42, 0.05)',
                          opacity:
                            item !== 'CANCEL' &&
                            (isVerifyingPin || Boolean(pinLockoutUntil && Date.now() < pinLockoutUntil))
                              ? 0.4
                              : 1,
                        },
                      ]}
                      onPress={() => {
                        if (item === 'CANCEL') {
                          setPinModalVisible(false);
                          setEnteredPin('');
                          setPinError(false);
                          setIsVerifyingPin(false);
                        } else if (item === '⌫') {
                          handlePinDelete();
                        } else {
                          handlePinDigit(item);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.keypadBtnText,
                          item === 'CANCEL' && styles.cancelText,
                          {
                            color:
                              item === 'CANCEL'
                                ? '#EF4444'
                                : colors.text,
                          },
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* PIN Help / Recovery Guidance */}
            <TouchableOpacity
              style={styles.pinHelpBtn}
              onPress={() => {
                Alert.alert(
                  'Parent PIN Assistance',
                  'The Parent Security PIN is configured inside SafeGuard Family settings (factory default: 1234).\n\nIf you need to change or reset your PIN, switch to Parent Dashboard inside SafeGuard.'
                );
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pinHelpText, { color: colors.textSecondary }]}>
                Forgot PIN or need help? ⓘ
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    justifyContent: 'space-between',
    paddingBottom: 12,
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
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
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
  segmentedWrapper: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 2.5,
    gap: 2,
  },
  segmentedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 13,
  },
  segmentedBtnActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedBtnText: {
    fontSize: 11,
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
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 320,
    marginBottom: 6,
  },
  startupBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  startupBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // 2x2 Bento Grid Styles (Guaranteed Equal-Height Row Alignment)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 8,
    gap: 10,
  },
  gridCard: {
    width: '48%',
    borderRadius: 20,
    padding: 12,
    minHeight: 200,
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  gridCardLandscape: {
    width: '23.5%',
    minHeight: 185,
  },
  gridCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    maxWidth: '75%',
  },
  categoryBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 11,
    fontWeight: '900',
  },
  gridCardMiddle: {
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  gridIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 6,
  },
  gridIconEmoji: {
    fontSize: 17,
  },
  titleContainer: {
    height: 34,
    justifyContent: 'center',
  },
  gridCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 16.5,
  },
  gridCardBottom: {
    marginTop: 2,
  },
  liveTelemetryBadge: {
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 5,
  },
  liveTelemetryText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  gridActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  gridActionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  gridActionHint: {
    fontSize: 9.5,
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
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardBadgeText: {
    fontSize: 10,
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
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 2,
  },
  cardTagline: {
    fontSize: 11.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  carouselLivePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontSize: 11,
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
    marginTop: 8,
  },
  rememberCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  rememberLabelCol: {
    marginLeft: 10,
    flex: 1,
  },
  rememberLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  rememberSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1.5,
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
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Parental PIN Modal Styles
  pinBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pinCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  pinHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  pinIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  pinTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  pinSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  keypad: {
    width: '100%',
    gap: 8,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  keypadBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadBtnCancel: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  keypadBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cancelText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pinHelpBtn: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pinHelpText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
