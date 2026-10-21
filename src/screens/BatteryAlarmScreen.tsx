import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Animated,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import notifee from '@notifee/react-native';
import { useAppTheme } from '../hooks/useTheme';
import {
  batteryService,
  BatteryStatus,
  BatteryAlarmSettings,
} from '../services/battery/BatteryService';
import { alarmService, AlarmState } from '../services/alarm/AlarmService';

export const BatteryAlarmScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isDark } = useAppTheme();

  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>(batteryService.getStatus());
  const [settings, setSettings] = useState<BatteryAlarmSettings>(batteryService.getSettings());
  const [alarmState, setAlarmState] = useState<AlarmState>({
    isRinging: false,
    title: '',
    secondsRemaining: 60,
  });
  const [testingAlarm, setTestingAlarm] = useState(false);

  const handleGoBack = useCallback(() => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('WorkspaceSelect');
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [handleGoBack])
  );

  // Pulse animation for charging indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Request notifications permission on Android 13+
  useEffect(() => {
    async function initPerms() {
      try {
        if (typeof notifee?.requestPermission === 'function') {
          await notifee.requestPermission();
        }
      } catch {}
    }
    initPerms();
  }, []);

  useEffect(() => {
    const unsubStatus = batteryService.subscribeStatus((st) => setBatteryStatus(st));
    const unsubSettings = batteryService.subscribeSettings((st) => setSettings(st));
    const unsubAlarm = alarmService.subscribe((st) => setAlarmState(st));

    batteryService.refreshBatteryStatus();

    return () => {
      unsubStatus();
      unsubSettings();
      unsubAlarm();
    };
  }, []);

  useEffect(() => {
    if (batteryStatus.isCharging) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [batteryStatus.isCharging, pulseAnim]);

  const handleToggleGuard = (val: boolean) => {
    batteryService.updateSettings({ batteryGuardActive: val });
  };

  const handleToggleFullAlarm = (val: boolean) => {
    batteryService.updateSettings({ fullChargeAlarmEnabled: val });
  };

  const handleSetFullTarget = (target: number) => {
    const clamped = Math.max(50, Math.min(100, target));
    batteryService.updateSettings({ fullChargeTarget: clamped });
  };

  const handleToggleOvercharge100 = (val: boolean) => {
    batteryService.updateSettings({ overchargeFailsafeEnabled: val });
  };

  const handleToggleLowAlarm = (val: boolean) => {
    batteryService.updateSettings({ lowBatteryAlarmEnabled: val });
  };

  const handleSetLowTarget = (target: number) => {
    const clamped = Math.max(10, Math.min(40, target));
    batteryService.updateSettings({ lowBatteryTarget: clamped });
  };

  const handleToggleCriticalLow = (val: boolean) => {
    batteryService.updateSettings({ criticalLowAlarmEnabled: val });
  };

  const handleToggleTempAlarm = (val: boolean) => {
    batteryService.updateSettings({ tempAlarmEnabled: val });
  };

  const handleSetTempTarget = (target: number) => {
    const clamped = Math.max(40, Math.min(55, target));
    batteryService.updateSettings({ tempTarget: clamped });
  };

  const handleToggleContinuous = (val: boolean) => {
    batteryService.updateSettings({ continuousRingtone: val });
  };

  const handleToggleAutoRepeat = (val: boolean) => {
    batteryService.updateSettings({ autoRepeatAlarm: val });
  };

  const handleToggleSound = (val: boolean) => {
    batteryService.updateSettings({ soundEnabled: val });
  };

  const handleToggleVibration = (val: boolean) => {
    batteryService.updateSettings({ vibrationEnabled: val });
  };

  const handleTogglePluggedAlert = (val: boolean) => {
    batteryService.updateSettings({ pluggedAlertEnabled: val });
  };

  const handleToggleUnpluggedAlert = (val: boolean) => {
    batteryService.updateSettings({ unpluggedAlertEnabled: val });
  };

  const handleTestAlarm = async (type: 'full' | 'low' | 'temp') => {
    setTestingAlarm(true);
    try {
      await batteryService.testAlarm(type);
    } finally {
      setTimeout(() => setTestingAlarm(false), 2000);
    }
  };

  const handleStopAlarm = async () => {
    await batteryService.stopAlarm();
  };

  // Color dynamics based on battery %
  const getBatteryColor = () => {
    if (batteryStatus.level <= 20) return '#EF4444'; // Red
    if (batteryStatus.level < 40) return '#F59E0B'; // Amber
    if (batteryStatus.level >= 80) return '#10B981'; // Vibrant Emerald
    return '#06B6D4'; // Cyan
  };

  const batteryColor = getBatteryColor();

  // Dynamic estimate to full charge or remaining runtime
  const getChargeEstimate = () => {
    if (!batteryStatus.isCharging) {
      const baseHours = (batteryStatus.level / 100) * (batteryStatus.health === 'Good' ? 14 : 10.5);
      const hours = Math.floor(baseHours);
      const mins = Math.round((baseHours - hours) * 60);
      return `~${hours}h ${mins}m est. battery life (mixed use)`;
    }
    const needed = settings.fullChargeTarget - batteryStatus.level;
    if (needed <= 0) {
      return `Target (${settings.fullChargeTarget}%) reached! Unplug now.`;
    }
    const baseRate = batteryStatus.chargingType === 'AC' ? 0.85 : 1.25;
    const phaseMultiplier = batteryStatus.level >= 70 ? 1.35 : 1.0;
    const estMinutes = Math.max(1, Math.round(needed * baseRate * phaseMultiplier));
    return `~${estMinutes} min until ${settings.fullChargeTarget}% target`;
  };

  // Dynamic health description
  const getHealthDescription = () => {
    const h = (batteryStatus.health || '').toLowerCase();
    if (h === 'good') return 'Optimal';
    if (h === 'overheat') return 'High Temp';
    if (h === 'dead') return 'Replace Cell';
    if (h === 'over_voltage') return 'Over Voltage';
    if (h === 'cold') return 'Cold Cell';
    return 'Normal';
  };

  // Dynamic temperature rating
  const getTempRating = () => {
    if (batteryStatus.temperature >= 44) return { text: 'Hot', color: '#EF4444' };
    if (batteryStatus.temperature >= 40) return { text: 'Warm', color: '#F59E0B' };
    return { text: 'Normal', color: '#10B981' };
  };

  const tempRating = getTempRating();

  // Radial precision dial ticks (28 segments = ~12.8 deg per step)
  const TOTAL_TICKS = 28;
  const activeTicksCount = Math.round((Math.max(0, Math.min(100, batteryStatus.level)) / 100) * TOTAL_TICKS);
  const targetTickIndex = Math.min(
    TOTAL_TICKS - 1,
    Math.round((settings.fullChargeTarget / 100) * (TOTAL_TICKS - 1))
  );

  const isCurrentAboveTarget = batteryStatus.isCharging && batteryStatus.level >= settings.fullChargeTarget;
  const sessionStats = batteryService.getSessionStats();

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
          paddingTop: Math.max(insets.top, 12),
        },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          {/* Active Screen Badge */}
          <View style={[styles.brandPill, { borderColor: batteryColor }]}>
            <Text style={styles.brandIcon}>⚡</Text>
            <Text style={styles.brandTitle}>Battery Guard</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 40 },
        ]}
      >
        <View style={styles.responsiveContainer}>
          {/* Active Ringing Alarm Alert Banner */}
          {alarmState.isRinging && (
            <View style={styles.activeAlarmBanner}>
              <View style={styles.activeAlarmLeft}>
                <Text style={styles.activeAlarmIcon}>🚨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeAlarmTitle}>Battery Alarm Ringing!</Text>
                  <Text style={styles.activeAlarmSub}>
                    {alarmState.title || 'Target charge or safety limit reached'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.stopAlarmBtn}
                onPress={handleStopAlarm}
                activeOpacity={0.8}
              >
                <Text style={styles.stopAlarmBtnText}>🔕 STOP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Master Guard Toggle Banner */}
          <View
            style={[
              styles.masterBanner,
              {
                backgroundColor: settings.batteryGuardActive
                  ? isDark
                    ? '#064E3B'
                    : '#D1FAE5'
                  : isDark
                  ? '#1E293B'
                  : '#E2E8F0',
                borderColor: settings.batteryGuardActive ? '#10B981' : '#64748B',
              },
            ]}
          >
            <View style={styles.masterBannerLeft}>
              <Text style={styles.masterIcon}>
                {settings.batteryGuardActive ? '🛡️' : '⚪'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.masterTitle,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  {settings.batteryGuardActive ? 'Battery Guard Active' : 'Battery Guard Paused'}
                </Text>
                <Text
                  style={[
                    styles.masterSubtitle,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  {settings.batteryGuardActive
                    ? 'Foreground charge & temperature monitoring active'
                    : 'Tap switch to enable background alarms'}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.batteryGuardActive}
              onValueChange={handleToggleGuard}
              trackColor={{ false: '#64748B', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Hero Battery Visualizer Card */}
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            {/* Circular Precision Radial Gauge */}
            <View style={styles.circleOuter}>
              {/* 28 Radial Ticks around Perimeter */}
              {Array.from({ length: TOTAL_TICKS }).map((_, i) => {
                const angle = (i * 360) / TOTAL_TICKS;
                const isActive = i < activeTicksCount;
                const isTargetTick = i === targetTickIndex;
                const tickColor = isTargetTick
                  ? '#10B981'
                  : isActive
                  ? batteryColor
                  : isDark
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.1)';
                return (
                  <View
                    key={i}
                    style={[
                      styles.radialTickContainer,
                      { transform: [{ rotate: `${angle}deg` }] },
                    ]}
                  >
                    <View
                      style={[
                        styles.radialTick,
                        {
                          backgroundColor: tickColor,
                          height: isTargetTick ? 14 : 9,
                          width: isTargetTick ? 4 : 3,
                          borderRadius: 2,
                        },
                      ]}
                    />
                  </View>
                );
              })}

              {/* Inner Concentric Dial */}
              <View
                style={[
                  styles.circleInnerContent,
                  {
                    borderColor: isDark ? '#1E293B' : '#E2E8F0',
                    backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC',
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.boltWrapper,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <Text style={styles.boltEmoji}>
                    {batteryStatus.isCharging ? '⚡' : '🔋'}
                  </Text>
                </Animated.View>
                <Text
                  style={[styles.bigPercent, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                >
                  {batteryStatus.level}%
                </Text>
                <Text style={[styles.statusPillText, { color: batteryColor }]}>
                  {batteryStatus.isCharging
                    ? `CHARGING (${batteryStatus.chargingType})`
                    : 'DISCHARGING'}
                </Text>
              </View>
            </View>

            {/* Linear Target Distance Bar */}
            <View style={styles.linearBarContainer}>
              <View
                style={[
                  styles.linearBarTrack,
                  { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                ]}
              >
                <View
                  style={[
                    styles.linearBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, batteryStatus.level))}%`,
                      backgroundColor: batteryColor,
                    },
                  ]}
                />
                {/* Target Marker Pin - Centered */}
                <View
                  style={[
                    styles.targetPin,
                    {
                      left: `${Math.min(98, Math.max(2, settings.fullChargeTarget))}%`,
                    },
                  ]}
                >
                  <View style={styles.targetPinDot} />
                </View>
              </View>

              <View style={styles.targetPinLabelRow}>
                <Text style={[styles.linearBarLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  0%
                </Text>
                <Text style={[styles.targetPinLabel, { color: '#10B981' }]}>
                  🎯 Target: {settings.fullChargeTarget}%
                </Text>
                <Text style={[styles.linearBarLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  100%
                </Text>
              </View>
            </View>

            {/* Charge / Discharge Estimate Badge */}
            <View
              style={[
                styles.estimateBox,
                {
                  backgroundColor: isDark ? '#0A0F1D' : '#F8FAFC',
                  borderColor: isDark ? '#1E293B' : '#E2E8F0',
                },
              ]}
            >
              <Text style={styles.estimateIcon}>⏱️</Text>
              <Text
                style={[
                  styles.estimateText,
                  { color: isDark ? '#CBD5E1' : '#334155' },
                ]}
              >
                {getChargeEstimate()}
              </Text>
            </View>

            {/* Live Charging Session Stats (When Connected) */}
            {sessionStats && (
              <View
                style={[
                  styles.sessionBox,
                  {
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
                    borderColor: '#10B98140',
                  },
                ]}
              >
                <Text style={styles.sessionIcon}>⚡</Text>
                <Text style={[styles.sessionText, { color: isDark ? '#34D399' : '#065F46' }]}>
                  Session: <Text style={{ fontWeight: '800' }}>+{sessionStats.gained}%</Text> in {sessionStats.elapsedMinutes}m (~{sessionStats.speedPerHour}%/hr)
                </Text>
              </View>
            )}

            {/* Metrics 2x2 Grid with Real-time Power & Current */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                <Text style={styles.metricLabel}>🌡️ Temp</Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: tempRating.color },
                  ]}
                >
                  {batteryStatus.temperature.toFixed(1)}°C
                </Text>
                <Text style={[styles.metricSub, { color: tempRating.color }]}>
                  {tempRating.text}
                </Text>
              </View>

              <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                <Text style={styles.metricLabel}>⚡ Voltage & Current</Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  {(batteryStatus.voltage / 1000).toFixed(2)} V
                </Text>
                <Text style={styles.metricSub}>
                  {batteryStatus.currentNow ? `${batteryStatus.currentNow} mA` : batteryStatus.technology || 'Li-poly'}
                </Text>
              </View>

              <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                <Text style={styles.metricLabel}>💚 Health</Text>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color:
                        batteryStatus.health === 'Good'
                          ? '#10B981'
                          : '#F59E0B',
                    },
                  ]}
                >
                  {batteryStatus.health || 'Good'}
                </Text>
                <Text style={styles.metricSub}>{getHealthDescription()}</Text>
              </View>

              <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                <Text style={styles.metricLabel}>🔌 Power & Speed</Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  {batteryStatus.wattage && batteryStatus.wattage > 0
                    ? `${batteryStatus.wattage} W`
                    : batteryStatus.chargingType}
                </Text>
                <Text style={styles.metricSub}>
                  {batteryStatus.isCharging
                    ? batteryStatus.wattage && batteryStatus.wattage >= 15
                      ? '⚡ Fast Charge'
                      : 'Standard Charge'
                    : 'Unplugged'}
                </Text>
              </View>
            </View>
          </View>

          {/* Section 1: Full Charge Alarm */}
          <View
            style={[
              styles.configCard,
              {
                backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Text style={styles.iconBadgeText}>⚡</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      { color: isDark ? '#FFFFFF' : '#0F172A' },
                    ]}
                  >
                    Full Charge Alarm
                  </Text>
                  <Text
                    style={[
                      styles.cardHeaderSub,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    Rings when battery reaches target
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.fullChargeAlarmEnabled}
                onValueChange={handleToggleFullAlarm}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Target percentage selector with +/- Steppers & Presets */}
            {settings.fullChargeAlarmEnabled && (
              <View style={styles.targetSection}>
                <View style={styles.targetHeaderRow}>
                  <Text
                    style={[
                      styles.targetLabel,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    TARGET LEVEL: {settings.fullChargeTarget}%
                  </Text>
                  {/* 1% Fine Steppers */}
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetFullTarget(settings.fullChargeTarget - 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetFullTarget(settings.fullChargeTarget + 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 5 Equal Preset Pills */}
                <View style={styles.equalPillsRow}>
                  {[80, 85, 90, 95, 100].map((pct) => {
                    const isSelected = settings.fullChargeTarget === pct;
                    return (
                      <TouchableOpacity
                        key={pct}
                        onPress={() => handleSetFullTarget(pct)}
                        style={[
                          styles.equalTargetPill,
                          isSelected
                            ? styles.targetPillActive
                            : {
                                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                                borderColor: isDark ? '#334155' : '#E2E8F0',
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.targetPillText,
                            isSelected
                              ? styles.targetPillTextActive
                              : { color: isDark ? '#CBD5E1' : '#475569' },
                          ]}
                        >
                          {pct}%
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Notice when current level already equals/exceeds target */}
                {isCurrentAboveTarget && (
                  <View style={styles.alreadyReachedBanner}>
                    <Text style={styles.alreadyReachedIcon}>ℹ️</Text>
                    <Text style={styles.alreadyReachedText}>
                      {batteryStatus.level >= 100
                        ? 'Device is fully charged at 100%! Disconnect your charger to protect battery longevity and prevent electrolyte degradation.'
                        : `Device is at ${batteryStatus.level}%, which meets or exceeds your ${settings.fullChargeTarget}% target. Set a higher target (e.g. ${Math.min(100, Math.ceil((batteryStatus.level + 5) / 5) * 5)}%) to monitor this charge cycle.`}
                    </Text>
                  </View>
                )}

                {/* Secondary 100% Emergency Overcharge Alarm */}
                <View style={styles.subSettingRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.subSettingTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      🚨 100% Overcharge Failsafe
                    </Text>
                    <Text style={[styles.subSettingDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      Emergency siren if phone remains plugged in and reaches 100%
                    </Text>
                  </View>
                  <Switch
                    value={settings.overchargeFailsafeEnabled}
                    onValueChange={handleToggleOvercharge100}
                    trackColor={{ false: '#64748B', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Section 2: Low Battery Alarm */}
          <View
            style={[
              styles.configCard,
              {
                backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Text style={styles.iconBadgeText}>🪫</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      { color: isDark ? '#FFFFFF' : '#0F172A' },
                    ]}
                  >
                    Low Battery Reminder
                  </Text>
                  <Text
                    style={[
                      styles.cardHeaderSub,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    Alerts before deep discharge
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.lowBatteryAlarmEnabled}
                onValueChange={handleToggleLowAlarm}
                trackColor={{ false: '#64748B', true: '#EF4444' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {settings.lowBatteryAlarmEnabled && (
              <View style={styles.targetSection}>
                <View style={styles.targetHeaderRow}>
                  <Text
                    style={[
                      styles.targetLabel,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    ALERT LEVEL: {settings.lowBatteryTarget}%
                  </Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetLowTarget(settings.lowBatteryTarget - 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetLowTarget(settings.lowBatteryTarget + 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.equalPillsRow}>
                  {[10, 15, 20, 25].map((pct) => {
                    const isSelected = settings.lowBatteryTarget === pct;
                    return (
                      <TouchableOpacity
                        key={pct}
                        onPress={() => handleSetLowTarget(pct)}
                        style={[
                          styles.equalTargetPill,
                          isSelected
                            ? [styles.targetPillActive, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]
                            : {
                                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                                borderColor: isDark ? '#334155' : '#E2E8F0',
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.targetPillText,
                            isSelected
                              ? styles.targetPillTextActive
                              : { color: isDark ? '#CBD5E1' : '#475569' },
                          ]}
                        >
                          {pct}%
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Critical 5% Discharge Alarm */}
                <View style={styles.subSettingRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.subSettingTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      ⚠️ Critical 5% Shutdown Siren
                    </Text>
                    <Text style={[styles.subSettingDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      Emergency warning when battery is dangerously close to 0%
                    </Text>
                  </View>
                  <Switch
                    value={settings.criticalLowAlarmEnabled}
                    onValueChange={handleToggleCriticalLow}
                    trackColor={{ false: '#64748B', true: '#EF4444' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Section 3: Battery Overheat Warning */}
          <View
            style={[
              styles.configCard,
              {
                backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Text style={styles.iconBadgeText}>🔥</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.cardHeaderTitle,
                      { color: isDark ? '#FFFFFF' : '#0F172A' },
                    ]}
                  >
                    Overheat Alert
                  </Text>
                  <Text
                    style={[
                      styles.cardHeaderSub,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    Alarms when battery exceeds temperature
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.tempAlarmEnabled}
                onValueChange={handleToggleTempAlarm}
                trackColor={{ false: '#64748B', true: '#F59E0B' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {settings.tempAlarmEnabled && (
              <View style={styles.targetSection}>
                <View style={styles.targetHeaderRow}>
                  <Text
                    style={[
                      styles.targetLabel,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    THRESHOLD: {settings.tempTarget}°C{' '}
                    <Text style={{ color: tempRating.color, fontWeight: '700' }}>
                      (Live: {batteryStatus.temperature.toFixed(1)}°C)
                    </Text>
                  </Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetTempTarget(settings.tempTarget - 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                      onPress={() => handleSetTempTarget(settings.tempTarget + 1)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stepperBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Realistic threshold options (42, 45, 48, 50) */}
                <View style={styles.equalPillsRow}>
                  {[42, 45, 48, 50].map((temp) => {
                    const isSelected = settings.tempTarget === temp;
                    return (
                      <TouchableOpacity
                        key={temp}
                        onPress={() => handleSetTempTarget(temp)}
                        style={[
                          styles.equalTargetPill,
                          isSelected
                            ? [styles.targetPillActive, { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]
                            : {
                                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                                borderColor: isDark ? '#334155' : '#E2E8F0',
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.targetPillText,
                            isSelected
                              ? styles.targetPillTextActive
                              : { color: isDark ? '#CBD5E1' : '#475569' },
                          ]}
                        >
                          {temp}°C{temp === 45 ? '★' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.tempNote, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  Fast chargers normally heat batteries to 40–43°C. 45°C★ is recommended to catch genuine thermal risk.
                </Text>
              </View>
            )}
          </View>

          {/* Section 4: Sound, Vibration & Chime Settings */}
          <View
            style={[
              styles.configCard,
              {
                backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#94A3B8' : '#64748B' },
              ]}
            >
              ALARM BEHAVIOR & SOUND
            </Text>

            {/* Warning if both sound and vibration are muted */}
            {!settings.soundEnabled && !settings.vibrationEnabled && (
              <View style={styles.silentWarningBanner}>
                <Text style={styles.silentWarningIcon}>⚠️</Text>
                <Text style={styles.silentWarningText}>
                  Both Audio and Vibration are disabled! Alarms will only trigger a silent notification on screen.
                </Text>
              </View>
            )}

            {/* Alarm Sound Audio */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Alarm Sound Audio
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Play loud audio siren through Android alarm stream
                </Text>
              </View>
              <Switch
                value={settings.soundEnabled}
                onValueChange={handleToggleSound}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />

            {/* Continuous Siren */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Continuous Loud Siren
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Rings continuously until manually stopped or unplugged
                </Text>
              </View>
              <Switch
                value={settings.continuousRingtone}
                onValueChange={handleToggleContinuous}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />

            {/* Auto Repeat Alarm */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Auto-Repeat Every 3 Min
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Repeats reminder if charger is left connected at target
                </Text>
              </View>
              <Switch
                value={settings.autoRepeatAlarm}
                onValueChange={handleToggleAutoRepeat}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />

            {/* Vibration */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Hardware Vibration
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Strong pulsing vibration pattern
                </Text>
              </View>
              <Switch
                value={settings.vibrationEnabled}
                onValueChange={handleToggleVibration}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />

            {/* Charger Plugged Chime */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Charger Connected Chime
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Notify when cable is plugged in
                </Text>
              </View>
              <Switch
                value={settings.pluggedAlertEnabled}
                onValueChange={handleTogglePluggedAlert}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />

            {/* Charger Unplugged Chime */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: isDark ? '#FFFFFF' : '#0F172A' },
                  ]}
                >
                  Charger Unplugged Chime
                </Text>
                <Text
                  style={[
                    styles.settingDesc,
                    { color: isDark ? '#94A3B8' : '#64748B' },
                  ]}
                >
                  Notify if someone accidentally unplugs phone
                </Text>
              </View>
              <Switch
                value={settings.unpluggedAlertEnabled}
                onValueChange={handleToggleUnpluggedAlert}
                trackColor={{ false: '#64748B', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Testing & System Whitelist Section */}
          <View style={styles.actionButtonsCol}>
            {alarmState.isRinging && (
              <TouchableOpacity
                style={[styles.stopButtonLarge, { backgroundColor: '#EF4444' }]}
                activeOpacity={0.85}
                onPress={handleStopAlarm}
              >
                <Text style={styles.stopButtonLargeText}>🔕 Stop Active Alarm</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: '#10B981' }]}
              activeOpacity={0.85}
              onPress={() => handleTestAlarm('full')}
              disabled={testingAlarm}
            >
              <Text style={styles.testButtonText}>
                {testingAlarm ? '🔔 Ringing Test Alarm...' : `⚡ Test Full Charge (${settings.fullChargeTarget}%)`}
              </Text>
            </TouchableOpacity>

            {/* Sub-row for testing Low Battery & Overheat Alarms */}
            <View style={styles.testSubRow}>
              <TouchableOpacity
                style={[styles.testSubButton, { backgroundColor: '#EF4444' }]}
                activeOpacity={0.85}
                onPress={() => handleTestAlarm('low')}
                disabled={testingAlarm}
              >
                <Text style={styles.testSubButtonText}>🪫 Test Low ({settings.lowBatteryTarget}%)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testSubButton, { backgroundColor: '#F59E0B' }]}
                activeOpacity={0.85}
                onPress={() => handleTestAlarm('temp')}
                disabled={testingAlarm}
              >
                <Text style={styles.testSubButtonText}>🔥 Test Heat ({settings.tempTarget}°C)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  responsiveContainer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    gap: 14,
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  brandIcon: {
    fontSize: 15,
    marginRight: 4,
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.3,
  },
  quickNavScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  navPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  navPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  activeAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  activeAlarmLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  activeAlarmIcon: {
    fontSize: 24,
  },
  activeAlarmTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
  },
  activeAlarmSub: {
    fontSize: 12,
    color: '#F87171',
    marginTop: 2,
  },
  stopAlarmBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  stopAlarmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  masterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  masterBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  masterIcon: {
    fontSize: 26,
  },
  masterTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  masterSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  circleOuter: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    position: 'relative',
  },
  radialTickContainer: {
    position: 'absolute',
    top: 0,
    left: 92,
    width: 6,
    height: 190,
    alignItems: 'center',
  },
  radialTick: {
    marginTop: 1,
  },
  circleInnerContent: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  boltWrapper: {
    marginBottom: 2,
  },
  boltEmoji: {
    fontSize: 24,
  },
  bigPercent: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  linearBarContainer: {
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  linearBarTrack: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    position: 'relative',
  },
  linearBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  targetPin: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    marginLeft: -1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetPinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginTop: -8,
  },
  targetPinLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  linearBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  targetPinLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  estimateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    gap: 6,
  },
  estimateIcon: {
    fontSize: 14,
  },
  estimateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sessionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    gap: 6,
  },
  sessionIcon: {
    fontSize: 13,
  },
  sessionText: {
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginTop: 16,
  },
  metricItem: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  configCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: {
    fontSize: 22,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardHeaderSub: {
    fontSize: 12,
    marginTop: 2,
  },
  targetSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  targetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  equalPillsRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  equalTargetPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  targetPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  targetPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  alreadyReachedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginTop: 10,
    gap: 6,
  },
  alreadyReachedIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  alreadyReachedText: {
    fontSize: 11,
    color: '#F59E0B',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    gap: 8,
  },
  tipIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  tipText: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
    lineHeight: 18,
  },
  subSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  subSettingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  subSettingDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  tempNote: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  actionButtonsCol: {
    gap: 12,
  },
  stopButtonLarge: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  stopButtonLargeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  testButton: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  testSubRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testSubButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  testSubButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  silentWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginBottom: 12,
    gap: 8,
  },
  silentWarningIcon: {
    fontSize: 18,
  },
  silentWarningText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '700',
    flex: 1,
    lineHeight: 16,
  },
});
