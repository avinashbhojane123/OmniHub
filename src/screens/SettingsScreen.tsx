import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  StatusBar,
  Platform,
  Linking,
  Share,
  BackHandler,
} from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { SETTINGS_KEYS } from '../constants/settingsKeys';
import { backupService } from '../services/backup/BackupService';
import { radius, spacing, typography } from '../theme';
import { notificationService } from '../services/notifications/NotificationService';
import { alarmService } from '../services/alarm/AlarmService';
import { batteryService } from '../services/battery/BatteryService';
import { getDatabase } from '../database/connection';

const SNOOZE_OPTIONS = ['5', '10', '15', '30'] as const;

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const showBackBtn = Boolean(route?.params?.showBack);

  // Notification Settings State
  const [dndEnabled, setDndEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [snoozeMinutes, setSnoozeMinutes] = useState('10');

  // Backup & Storage Diagnostics State
  const [dbCounts, setDbCounts] = useState({
    tasks: 0,
    habits: 0,
    notes: 0,
    events: 0,
  });

  const loadSettings = useCallback(async () => {
    // 1. Load Notification & Alert Preferences
    try {
      const dnd = (await settingsRepository.get(SETTINGS_KEYS.APP_DND_ENABLED, 'false')) === 'true';
      const notifs = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATIONS_ENABLED, 'true')) === 'true';
      const sound = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATION_SOUND, 'true')) === 'true';
      const vib = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATION_VIBRATION, 'true')) === 'true';
      const snooze = await settingsRepository.get(SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES, '10');
      setDndEnabled(dnd);
      setNotificationsEnabled(notifs);
      setSoundEnabled(sound);
      setVibrationEnabled(vib);
      setSnoozeMinutes(snooze);
    } catch (err) {
      console.warn('Failed to load preferences in SettingsScreen:', err);
    }

    // 2. Load Database Record Counts
    try {
      const db = await getDatabase();
      const [tRes, hRes, nRes, knRes, cRes] = await Promise.all([
        db.execute('SELECT COUNT(*) as count FROM tasks'),
        db.execute('SELECT COUNT(*) as count FROM habits'),
        db.execute('SELECT COUNT(*) as count FROM notes'),
        db.execute('SELECT COUNT(*) as count FROM keep_notes'),
        db.execute('SELECT COUNT(*) as count FROM calendar_events'),
      ]);
      const tasksCount = Number(tRes.rows[0]?.count || 0);
      const habitsCount = Number(hRes.rows[0]?.count || 0);
      const notesCount = Number(nRes.rows[0]?.count || 0) + Number(knRes.rows[0]?.count || 0);
      const eventsCount = Number(cRes.rows[0]?.count || 0);
      setDbCounts({
        tasks: tasksCount,
        habits: habitsCount,
        notes: notesCount,
        events: eventsCount,
      });
    } catch (err) {
      console.warn('Failed to load DB diagnostics in SettingsScreen:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const toggleNotifs = async (val: boolean) => {
    setNotificationsEnabled(val);
    await settingsRepository.set(SETTINGS_KEYS.NOTIFICATIONS_ENABLED, String(val));
    if (!val) {
      // User disabled notifications: cancel scheduled alarms/reminders
      await notificationService.cancelAllReminders();
    } else {
      // User enabled notifications: ensure OS permissions and restore reminders
      if (Platform.OS === 'android') {
        try {
          const permissionSettings = await notifee.requestPermission();
          if (permissionSettings.authorizationStatus === AuthorizationStatus.DENIED) {
            Alert.alert(
              'Notifications Blocked',
              'System notifications are currently disabled for LifePlanner in Android settings. Please enable notifications in device settings to receive reminder alerts.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
          }
        } catch { }
      }
      await notificationService.restoreAllReminders();
    }
  };

  const toggleDnd = async (val: boolean) => {
    setDndEnabled(val);
    try {
      await settingsRepository.set(SETTINGS_KEYS.APP_DND_ENABLED, String(val));
      await alarmService.setDndActive(val);
      batteryService.setDndActive(val);
      if (val) {
        alarmService.stopRinging(true);
        await batteryService.stopAlarm(true);
      }
    } catch (e) {
      console.warn('Failed to toggle DND:', e);
    }
  };

  const toggleSound = async (val: boolean) => {
    setSoundEnabled(val);
    await settingsRepository.set(SETTINGS_KEYS.NOTIFICATION_SOUND, String(val));
  };

  const toggleVib = async (val: boolean) => {
    setVibrationEnabled(val);
    await settingsRepository.set(SETTINGS_KEYS.NOTIFICATION_VIBRATION, String(val));
  };

  const handleSelectSnooze = async (mins: string) => {
    setSnoozeMinutes(mins);
    await settingsRepository.set(SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES, mins);
  };

  const handleExportBackup = async () => {
    try {
      const json = await backupService.exportBackup();
      await Share.share({
        title: 'LifePlanner SQLite Backup',
        message: json,
      });
    } catch (e: any) {
      Alert.alert('Backup Error', e.message);
    }
  };

  const handleGoBack = useCallback(() => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Today');
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

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 24),
        },
      ]}
    >
      <StatusBar barStyle={colors.statusBar} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(90, insets.bottom + 70) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            {showBackBtn && (
              <TouchableOpacity
                onPress={handleGoBack}
                style={[styles.backBtn, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceElevated }]}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={[styles.backBtnText, { color: colors.text }]}>‹</Text>
              </TouchableOpacity>
            )}
            <View style={styles.headerTextCol}>
              <Text style={[styles.title, typography.headerLarge, { color: colors.text }]}>
                Settings
              </Text>
              <Text style={[styles.sub, typography.caption, { color: colors.textSecondary }]}>
                Notifications, Reminders & System Diagnostics
              </Text>
            </View>
          </View>
        </View>

        {/* Section 1: Android Notifications & Alarms */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            ANDROID NOTIFICATIONS & ALARMS
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {/* Master Do Not Disturb (DND) */}
            <View
              style={[
                styles.settingRow,
                styles.dndRow,
                dndEnabled && styles.dndRowActive,
              ]}
            >
              <View style={styles.settingTextCol}>
                <View style={styles.labelWithBadgeRow}>
                  <Text
                    style={[
                      styles.settingLabel,
                      typography.title,
                      { color: dndEnabled ? colors.danger : colors.text },
                    ]}
                  >
                    🌙 Complete Do Not Disturb
                  </Text>
                  {dndEnabled && (
                    <View style={styles.mutedBadge}>
                      <Text style={styles.mutedBadgeText}>MUTED</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  {dndEnabled
                    ? 'All alarms, reminders & alerts are completely silenced application-wide.'
                    : 'Mute all alarms, routines, loud reminders & battery alerts application-wide.'}
                </Text>
              </View>
              <Switch
                value={dndEnabled}
                onValueChange={toggleDnd}
                trackColor={{ false: colors.border, true: colors.danger }}
                thumbColor={Platform.OS === 'android' ? (dndEnabled ? '#EF4444' : '#f4f3f4') : undefined}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Enable Reminders Switch */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Enable Reminders
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Schedule lock-screen & exact alarms
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifs}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Notification Sound */}
            <View
              style={[
                styles.settingRow,
                { opacity: notificationsEnabled ? 1 : 0.45 },
              ]}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Notification Sound
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Play audio on reminder trigger
                </Text>
              </View>
              <Switch
                disabled={!notificationsEnabled}
                value={soundEnabled}
                onValueChange={toggleSound}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Vibration */}
            <View
              style={[
                styles.settingRow,
                { opacity: notificationsEnabled ? 1 : 0.45 },
              ]}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Vibration
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Vibrate on reminder trigger
                </Text>
              </View>
              <Switch
                disabled={!notificationsEnabled}
                value={vibrationEnabled}
                onValueChange={toggleVib}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Snooze Duration Selector (4 Columns) */}
            <View
              style={[
                styles.snoozeSection,
                { opacity: notificationsEnabled ? 1 : 0.45 },
              ]}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Default Snooze
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  DEFAULT ALARM RE-TRIGGER CADENCE
                </Text>
              </View>
              <View style={styles.snoozeGridRow}>
                {SNOOZE_OPTIONS.map((mins) => {
                  const isSnoozeSelected = snoozeMinutes === mins;
                  return (
                    <TouchableOpacity
                      key={mins}
                      disabled={!notificationsEnabled}
                      onPress={() => handleSelectSnooze(mins)}
                      activeOpacity={0.8}
                      style={[
                        styles.snoozeColBtn,
                        {
                          backgroundColor: isSnoozeSelected ? colors.primary : colors.surfaceElevated,
                          borderColor: isSnoozeSelected ? colors.primary : colors.borderSubtle,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Set default alarm snooze duration to ${mins} minutes`}
                      accessibilityState={{ selected: isSnoozeSelected }}
                    >
                      <Text
                        style={[
                          styles.snoozeBtnText,
                          isSnoozeSelected ? styles.snoozeBtnTextActive : { color: colors.textSecondary },
                        ]}
                      >
                        {mins}m
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* 1. Lock Screen & Full-Screen Alarm Pop-up Permission (MIUI & Android 14) */}
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  '📱 Lock Screen Alarm Pop-up',
                  'To show the ringing alarm window over the lock screen on Xiaomi (MIUI / HyperOS):\n\n1. Set "Show on Lock screen" ➔ Always allow\n2. Set "Display pop-up windows in background" ➔ Always allow\n\nTap "Open Settings" to configure this now.',
                  [
                    {
                      text: 'Open Settings',
                      onPress: async () => {
                        try {
                          await alarmService.openFullScreenSettings();
                        } catch {
                          Linking.openSettings();
                        }
                      },
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Lock Screen Alarm Pop-up Settings"
            >
              <View style={styles.actionIconPillPurple}>
                <Text style={styles.actionIconText}>📱</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: '#A78BFA' }]}>
                  Lock Screen Alarm Pop-up (MIUI / HyperOS)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Allow full-screen ringing window over lock screen
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* 2. Auto-Start & Background Battery Restrictions */}
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  '⚡ Auto-Start & Battery (Xiaomi / OEM)',
                  'To ensure alarms ring on time even when the screen is locked or app is cleared from Recents:\n\n1. Enable "AutoStart" in Xiaomi Security.\n2. Set Battery Saver to "No restrictions".\n\nTap "AutoStart" or "Battery" below.',
                  [
                    {
                      text: 'AutoStart Settings',
                      onPress: async () => {
                        try {
                          await alarmService.openAutoStartSettings();
                        } catch {
                          Linking.openSettings();
                        }
                      },
                    },
                    {
                      text: 'Battery Saver',
                      onPress: async () => {
                        try {
                          await alarmService.openBatterySaverSettings();
                        } catch {
                          try {
                            if (typeof notifee?.openBatteryOptimizationSettings === 'function') {
                              await notifee.openBatteryOptimizationSettings();
                            } else {
                              Linking.openSettings();
                            }
                          } catch {
                            Linking.openSettings();
                          }
                        }
                      },
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open AutoStart and Battery Settings"
            >
              <View style={styles.actionIconPillGreen}>
                <Text style={styles.actionIconText}>⚡</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: '#34D399' }]}>
                  Auto-Start & Battery (No Restrictions)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Prevent OEM task killer from terminating background timers
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* 3. Android Exact Alarms & Reminders */}
            <TouchableOpacity
              onPress={async () => {
                try {
                  await alarmService.openExactAlarmSettings();
                } catch {
                  Linking.openSettings();
                }
              }}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Exact Alarm System Settings"
            >
              <View style={styles.actionIconPillAmber}>
                <Text style={styles.actionIconText}>⏰</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: '#FBBF24' }]}>
                  Alarms & Reminders (Android 12+)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Allow exact alarm scheduling without Doze throttling
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 2: Local Data & Cloud Backup */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            LOCAL DATA & BACKUP
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {/* Storage Diagnostic Chips */}
            <View
              style={[
                styles.storageStatsBox,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
              ]}
            >
              <View style={styles.storageHeaderRow}>
                <View style={styles.emeraldBeacon} />
                <Text style={[styles.storageStatsTitle, { color: colors.textSecondary }]}>
                  LOCAL DATABASE INVENTORY
                </Text>
              </View>
              <View style={styles.storageStatsGrid}>
                <View style={[styles.storageStatBadge, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.storageStatChip, { color: colors.text }]}>
                    📋 <Text style={styles.boldNum}>{dbCounts.tasks}</Text> Tasks
                  </Text>
                </View>
                <View style={[styles.storageStatBadge, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.storageStatChip, { color: colors.text }]}>
                    🔄 <Text style={styles.boldNum}>{dbCounts.habits}</Text> Habits
                  </Text>
                </View>
                <View style={[styles.storageStatBadge, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.storageStatChip, { color: colors.text }]}>
                    📝 <Text style={styles.boldNum}>{dbCounts.notes}</Text> Notes
                  </Text>
                </View>
                <View style={[styles.storageStatBadge, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.storageStatChip, { color: colors.text }]}>
                    📅 <Text style={styles.boldNum}>{dbCounts.events}</Text> Events
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={handleExportBackup}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Export Backup"
            >
              <View style={styles.actionIconPillLavender}>
                <Text style={styles.actionIconText}>💾</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.primaryLight }]}>
                  Export SQLite Backup (Share JSON)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Exports all tasks, habits, calendar events, notes & settings
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: About & Privacy */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            ABOUT & PRIVACY
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  '100% Local-First Privacy',
                  'LifePlanner & Tasks stores 100% of your tasks, habits, notes, and alarms locally on your device in an encrypted SQLite database.\n\n• Zero Cloud Telemetry\n• No Third-Party Analytics Trackers\n• Full Offline Independence\n• You Own Your Data'
                );
              }}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Privacy Policy"
            >
              <View style={styles.actionIconPillBlue}>
                <Text style={styles.actionIconText}>🛡️</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.text }]}>
                  Privacy Architecture
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  100% on-device SQLite storage, zero cloud tracking
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'LifePlanner & Tasks v0.0.1',
                  'Built with React Native 0.87, React 19, and OP-Engineering OP-SQLite.\n\nOpen Source Software licensed under the MIT License.\n\nDesigned for extreme productivity, GTD task planning, and habit mastery.'
                );
              }}
              activeOpacity={0.7}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open About & Software Licenses"
            >
              <View style={styles.actionIconPillBlue}>
                <Text style={styles.actionIconText}>ℹ️</Text>
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.text }]}>
                  About & Software Licenses
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Version v0.0.1 • MIT Open Source License
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer App Info */}
        <View style={styles.footerInfo}>
          <Text style={[styles.footerText, typography.caption, { color: colors.textMuted }]}>
            LifePlanner & Tasks • v0.0.1 • Local-First SQLite Storage
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  header: {
    marginBottom: spacing.lg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backBtnText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 2,
    letterSpacing: 0.2,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: 0.8,
    fontSize: 11,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  dndRow: {
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: spacing.xs,
  },
  dndRowActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingHorizontal: 8,
  },
  labelWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutedBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  mutedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  storageStatsBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
    marginBottom: spacing.xs,
  },
  storageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  emeraldBeacon: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  storageStatsTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  storageStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  storageStatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  storageStatChip: {
    fontSize: 12,
  },
  boldNum: {
    fontWeight: '800',
  },
  snoozeSection: {
    paddingVertical: spacing.xs,
  },
  snoozeGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  snoozeColBtn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  snoozeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  snoozeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  settingLabel: {
    marginBottom: 2,
    fontWeight: '700',
  },
  settingDesc: {
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionIconPillPurple: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconPillGreen: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconPillAmber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconPillLavender: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconPillBlue: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIconText: {
    fontSize: 14,
  },
  actionLabel: {
    fontWeight: '700',
    marginBottom: 2,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
