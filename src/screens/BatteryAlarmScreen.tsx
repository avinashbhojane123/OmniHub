import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import notifee from '@notifee/react-native';
import { useAppTheme } from '../hooks/useTheme';
import {
  batteryService,
  BatteryStatus,
  BatteryAlarmSettings,
} from '../services/battery/BatteryService';

export const BatteryAlarmScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isDark } = useAppTheme();

  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>(batteryService.getStatus());
  const [settings, setSettings] = useState<BatteryAlarmSettings>(batteryService.getSettings());
  const [testingAlarm, setTestingAlarm] = useState(false);

  // Pulse animation for charging indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsubStatus = batteryService.subscribeStatus((st) => setBatteryStatus(st));
    const unsubSettings = batteryService.subscribeSettings((st) => setSettings(st));

    // Initial fetch
    batteryService.refreshBatteryStatus();

    return () => {
      unsubStatus();
      unsubSettings();
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
    batteryService.updateSettings({ fullChargeTarget: target });
  };

  const handleToggleLowAlarm = (val: boolean) => {
    batteryService.updateSettings({ lowBatteryAlarmEnabled: val });
  };

  const handleSetLowTarget = (target: number) => {
    batteryService.updateSettings({ lowBatteryTarget: target });
  };

  const handleToggleTempAlarm = (val: boolean) => {
    batteryService.updateSettings({ tempAlarmEnabled: val });
  };

  const handleSetTempTarget = (target: number) => {
    batteryService.updateSettings({ tempTarget: target });
  };

  const handleToggleContinuous = (val: boolean) => {
    batteryService.updateSettings({ continuousRingtone: val });
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
      setTimeout(() => setTestingAlarm(false), 1500);
    }
  };

  const handleOpenBatteryOptimization = async () => {
    try {
      await notifee.openBatteryOptimizationSettings();
    } catch {
      Alert.alert(
        'Battery Optimization',
        'Please allow OmniHub to run in the background with "No restrictions" in system settings so the charge alarm reliably triggers.'
      );
    }
  };

  // Color dynamics based on battery %
  const getBatteryColor = () => {
    if (batteryStatus.level <= 20) return '#EF4444'; // Red
    if (batteryStatus.level < 40) return '#F59E0B'; // Amber
    if (batteryStatus.level >= 80) return '#10B981'; // Vibrant Emerald
    return '#06B6D4'; // Cyan
  };

  const batteryColor = getBatteryColor();

  // Dynamic estimate to full charge
  const getChargeEstimate = () => {
    if (!batteryStatus.isCharging) {
      return 'Discharging • Connect charger to monitor';
    }
    const needed = settings.fullChargeTarget - batteryStatus.level;
    if (needed <= 0) {
      return `Target (${settings.fullChargeTarget}%) reached! Unplug now.`;
    }
    // Approximate ~1.2 min per 1% on normal USB, ~0.8 min on AC
    const rate = batteryStatus.chargingType === 'AC' ? 0.9 : 1.4;
    const estMinutes = Math.round(needed * rate);
    return `~${estMinutes} min until ${settings.fullChargeTarget}% target`;
  };

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
          paddingTop: Math.max(insets.top, 20),
        },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header & Workspace Switcher */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={[styles.brandPill, { borderColor: batteryColor }]}>
            <Text style={styles.brandIcon}>⚡</Text>
            <Text style={styles.brandTitle}>Battery Guard</Text>
          </View>

          {/* Quick Switch Buttons */}
          <View style={styles.quickNavRow}>
            <TouchableOpacity
              style={[
                styles.navPill,
                { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
              ]}
              onPress={() => navigation.navigate('MainTabs')}
              activeOpacity={0.8}
            >
              <Text style={styles.navPillText}>📋 Planner</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navPill,
                { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
              ]}
              onPress={() => navigation.navigate('Chat')}
              activeOpacity={0.8}
            >
              <Text style={styles.navPillText}>💬 Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navPill,
                { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
              ]}
              onPress={() => navigation.navigate('WorkspaceSelect')}
              activeOpacity={0.8}
            >
              <Text style={styles.navPillText}>⇄ Modes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 36 },
        ]}
      >
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
            <View>
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
                  ? 'Real-time charge & health monitoring enabled'
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
          {/* Circular Battery Progress Graphic */}
          <View style={styles.circleOuter}>
            <View
              style={[
                styles.circleRing,
                {
                  borderColor: batteryColor,
                  shadowColor: batteryColor,
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
                  ? `Charging (${batteryStatus.chargingType})`
                  : 'Discharging'}
              </Text>
            </View>
          </View>

          {/* Charge Estimate Badge */}
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

          {/* Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={styles.metricLabel}>🌡️ Temp</Text>
              <Text
                style={[
                  styles.metricValue,
                  {
                    color:
                      batteryStatus.temperature >= 40
                        ? '#EF4444'
                        : isDark
                        ? '#FFFFFF'
                        : '#0F172A',
                  },
                ]}
              >
                {batteryStatus.temperature.toFixed(1)}°C
              </Text>
              <Text style={styles.metricSub}>
                {batteryStatus.temperature >= 42
                  ? 'Hot'
                  : batteryStatus.temperature >= 38
                  ? 'Warm'
                  : 'Normal'}
              </Text>
            </View>

            <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={styles.metricLabel}>⚡ Voltage</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: isDark ? '#FFFFFF' : '#0F172A' },
                ]}
              >
                {(batteryStatus.voltage / 1000).toFixed(2)} V
              </Text>
              <Text style={styles.metricSub}>{batteryStatus.technology}</Text>
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
                {batteryStatus.health}
              </Text>
              <Text style={styles.metricSub}>Optimal</Text>
            </View>

            <View style={[styles.metricItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={styles.metricLabel}>🔌 Source</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: isDark ? '#FFFFFF' : '#0F172A' },
                ]}
              >
                {batteryStatus.chargingType}
              </Text>
              <Text style={styles.metricSub}>
                {batteryStatus.isCharging ? 'Active' : 'Unplugged'}
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
              <View>
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

          {/* Target percentage selector */}
          {settings.fullChargeAlarmEnabled && (
            <View style={styles.targetSection}>
              <Text
                style={[
                  styles.targetLabel,
                  { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Target Level: {settings.fullChargeTarget}%
              </Text>
              <View style={styles.pillsRow}>
                {[80, 85, 90, 95, 100].map((pct) => {
                  const isSelected = settings.fullChargeTarget === pct;
                  return (
                    <TouchableOpacity
                      key={pct}
                      onPress={() => handleSetFullTarget(pct)}
                      style={[
                        styles.targetPill,
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
                        {pct}%{pct === 80 ? ' ★' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                style={[
                  styles.tipBanner,
                  {
                    backgroundColor: isDark ? '#064E3B20' : '#ECFDF5',
                    borderColor: '#10B98140',
                  },
                ]}
              >
                <Text style={styles.tipIcon}>💡</Text>
                <Text style={styles.tipText}>
                  <Text style={{ fontWeight: '700', color: '#10B981' }}>
                    Recommended 80% (Eco/Lifespan):
                  </Text>{' '}
                  Charging up to 80% prevents high-voltage electrolyte stress, doubling battery cycle lifespan!
                </Text>
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
              <View>
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
              <Text
                style={[
                  styles.targetLabel,
                  { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Alert Level: {settings.lowBatteryTarget}%
              </Text>
              <View style={styles.pillsRow}>
                {[10, 15, 20, 25].map((pct) => {
                  const isSelected = settings.lowBatteryTarget === pct;
                  return (
                    <TouchableOpacity
                      key={pct}
                      onPress={() => handleSetLowTarget(pct)}
                      style={[
                        styles.targetPill,
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
              <View>
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
              <Text
                style={[
                  styles.targetLabel,
                  { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Threshold: {settings.tempTarget}°C
              </Text>
              <View style={styles.pillsRow}>
                {[40, 42, 45].map((temp) => {
                  const isSelected = settings.tempTarget === temp;
                  return (
                    <TouchableOpacity
                      key={temp}
                      onPress={() => handleSetTempTarget(temp)}
                      style={[
                        styles.targetPill,
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
                        {temp}°C
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#10B981' }]}
            activeOpacity={0.85}
            onPress={() => handleTestAlarm('full')}
            disabled={testingAlarm}
          >
            <Text style={styles.testButtonText}>
              {testingAlarm ? '🔔 Ringing Test Alarm...' : '🔔 Test Full Charge Alarm Now'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.whitelistButton,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#CBD5E1',
              },
            ]}
            activeOpacity={0.85}
            onPress={handleOpenBatteryOptimization}
          >
            <Text style={styles.whitelistIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.whitelistTitle,
                  { color: isDark ? '#FFFFFF' : '#0F172A' },
                ]}
              >
                Battery Optimization Whitelist
              </Text>
              <Text
                style={[
                  styles.whitelistDesc,
                  { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Disable Android OEM background killing for 100% reliable alarms
              </Text>
            </View>
            <Text style={[styles.whitelistChevron, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Battery Health Education Card */}
        <View
          style={[
            styles.guideCard,
            {
              backgroundColor: isDark ? '#131B2E' : '#FFFFFF',
              borderColor: isDark ? '#1E293B' : '#E2E8F0',
            },
          ]}
        >
          <Text
            style={[
              styles.guideTitle,
              { color: isDark ? '#FFFFFF' : '#0F172A' },
            ]}
          >
            🔋 Battery Longevity Golden Rules
          </Text>

          <View style={styles.guideRow}>
            <Text style={styles.guideBullet}>1.</Text>
            <Text
              style={[
                styles.guideText,
                { color: isDark ? '#CBD5E1' : '#475569' },
              ]}
            >
              <Text style={{ fontWeight: '700' }}>The 20% - 80% Rule:</Text> Lithium-ion batteries experience exponential chemical wear above 80% and below 20%. Keeping charge within this zone doubles usable battery lifespan.
            </Text>
          </View>

          <View style={styles.guideRow}>
            <Text style={styles.guideBullet}>2.</Text>
            <Text
              style={[
                styles.guideText,
                { color: isDark ? '#CBD5E1' : '#475569' },
              ]}
            >
              <Text style={{ fontWeight: '700' }}>Avoid Overnight 100% Trickle:</Text> Leaving the phone plugged in all night forces continuous high-voltage trickle charging, causing premature cell capacity loss.
            </Text>
          </View>

          <View style={styles.guideRow}>
            <Text style={styles.guideBullet}>3.</Text>
            <Text
              style={[
                styles.guideText,
                { color: isDark ? '#CBD5E1' : '#475569' },
              ]}
            >
              <Text style={{ fontWeight: '700' }}>Thermal Protection:</Text> Do not charge your phone under heavy gaming loads or under direct sunlight. Temperatures above 40°C rapidly accelerate degradation.
            </Text>
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
  topHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  brandIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.3,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 8,
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
    paddingHorizontal: 20,
    gap: 16,
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
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  circleOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  circleRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  boltWrapper: {
    marginBottom: 4,
  },
  boltEmoji: {
    fontSize: 28,
  },
  bigPercent: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  estimateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    gap: 6,
  },
  estimateIcon: {
    fontSize: 14,
  },
  estimateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginTop: 18,
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
    color: '#64748B',
    marginTop: 2,
  },
  configCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
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
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  targetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  targetPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  targetPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  targetPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
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
  whitelistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  whitelistIcon: {
    fontSize: 22,
  },
  whitelistTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  whitelistDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  whitelistChevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  guideCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 10,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  guideBullet: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  guideText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
});
