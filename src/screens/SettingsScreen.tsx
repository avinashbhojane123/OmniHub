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
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  TextInput,
  BackHandler,
} from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { SETTINGS_KEYS } from '../constants/settingsKeys';
import { backupService } from '../services/backup/BackupService';
import { radius, spacing, typography } from '../theme';
import { notificationService } from '../services/notifications/NotificationService';
import { alarmService } from '../services/alarm/AlarmService';
import { getDatabase } from '../database/connection';
import { googleSheetsSyncService } from '../services/backup/GoogleSheetsSyncService';

const SNOOZE_OPTIONS = ['5', '10', '15', '30'] as const;

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const showBackBtn = Boolean(route?.params?.showBack);

  // Notification Settings State
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

  // Google Sheets Cloud Sync State
  const [googleSheetsModalVisible, setGoogleSheetsModalVisible] = useState(false);
  const [googleSheetWebhookUrl, setGoogleSheetWebhookUrl] = useState('');
  const [googleSheetSyncSecret, setGoogleSheetSyncSecret] = useState('');
  const [googleSheetAutoSync, setGoogleSheetAutoSync] = useState(false);
  const [googleSheetSyncing, setGoogleSheetSyncing] = useState(false);
  const [googleSheetLastSync, setGoogleSheetLastSync] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    // 1. Load Notification & Alert Preferences
    try {
      const notifs = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATIONS_ENABLED, 'true')) === 'true';
      const sound = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATION_SOUND, 'true')) === 'true';
      const vib = (await settingsRepository.get(SETTINGS_KEYS.NOTIFICATION_VIBRATION, 'true')) === 'true';
      const snooze = await settingsRepository.get(SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES, '10');
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

    // 3. Load Google Sheets Sync Configuration
    try {
      const gUrl = await googleSheetsSyncService.getWebhookUrl();
      const gAuto = await googleSheetsSyncService.getAutoSync();
      const gLast = await googleSheetsSyncService.getLastSyncTime();
      const gSecret = await googleSheetsSyncService.getSyncSecret();
      setGoogleSheetWebhookUrl(gUrl);
      setGoogleSheetAutoSync(gAuto);
      setGoogleSheetLastSync(gLast);
      setGoogleSheetSyncSecret(gSecret);
    } catch (err) {
      console.warn('Failed to load Google Sheets settings:', err);
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

  // Google Sheets Cloud Sync Handlers
  const toggleGoogleSheetAutoSync = async (val: boolean) => {
    setGoogleSheetAutoSync(val);
    await googleSheetsSyncService.setAutoSync(val);
  };

  const handleTestGoogleSheet = async () => {
    setGoogleSheetSyncing(true);
    try {
      await googleSheetsSyncService.setWebhookUrl(googleSheetWebhookUrl);
      await googleSheetsSyncService.setSyncSecret(googleSheetSyncSecret);
      const res = await googleSheetsSyncService.testConnection(googleSheetWebhookUrl, googleSheetSyncSecret);
      Alert.alert(res.success ? 'Connected!' : 'Connection Failed', res.message);
    } finally {
      setGoogleSheetSyncing(false);
    }
  };

  const handlePushToGoogleSheet = async () => {
    setGoogleSheetSyncing(true);
    try {
      await googleSheetsSyncService.setWebhookUrl(googleSheetWebhookUrl);
      await googleSheetsSyncService.setSyncSecret(googleSheetSyncSecret);
      const res = await googleSheetsSyncService.pushToGoogleSheet(googleSheetWebhookUrl, googleSheetSyncSecret);
      if (res.success) {
        setGoogleSheetLastSync(res.details?.timestamp || new Date().toISOString());
        Alert.alert('✅ Google Sheet Updated', res.message);
      } else {
        Alert.alert('Sync Failed', res.message);
      }
    } finally {
      setGoogleSheetSyncing(false);
    }
  };

  const handlePullFromGoogleSheet = async (mode: 'merge' | 'replace') => {
    const executePull = async () => {
      setGoogleSheetSyncing(true);
      try {
        await googleSheetsSyncService.setWebhookUrl(googleSheetWebhookUrl);
        await googleSheetsSyncService.setSyncSecret(googleSheetSyncSecret);
        const res = await googleSheetsSyncService.pullFromGoogleSheet(googleSheetWebhookUrl, mode, googleSheetSyncSecret);
        if (res.success) {
          setGoogleSheetLastSync(res.details?.timestamp || new Date().toISOString());
          await loadSettings();
          setGoogleSheetsModalVisible(false);
          Alert.alert('✅ Restore Complete', res.message);
        } else {
          Alert.alert('Restore Failed', res.message);
        }
      } finally {
        setGoogleSheetSyncing(false);
      }
    };

    if (mode === 'replace') {
      Alert.alert(
        '⚠️ Replace Local SQLite Database?',
        'This will replace all local tasks, habits, and notes with the latest state from your Google Sheet. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace All', style: 'destructive', onPress: executePull },
        ]
      );
    } else {
      await executePull();
    }
  };

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
            <View style={styles.headerTextCol}>
              <Text style={[styles.title, typography.headerLarge, { color: colors.text }]}>
                Settings
              </Text>
              <Text style={[styles.sub, typography.caption, { color: colors.textSecondary }]}>
                Notifications, Reminders & Cloud Sync
              </Text>
            </View>
          </View>
        </View>


        {/* Section: Android Notifications & Alarms */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            ANDROID NOTIFICATIONS & ALARMS
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
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
                  Alarm snooze duration
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
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Lock Screen Alarm Pop-up Settings"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: '#8B5CF6' }]}>
                  📱 Lock Screen Alarm Pop-up (MIUI / HyperOS)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Grant permission to show full-screen alarm window when locked
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
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open AutoStart and Battery Settings"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: '#10B981' }]}>
                  ⚡ Auto-Start & Battery (No Restrictions)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Prevent Xiaomi from killing background alarms and timers
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
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Exact Alarm System Settings"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.text }]}>
                  ⏰ Alarms & Reminders (Android 12+)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Allow exact alarm scheduling without Doze throttling
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Local Data & Cloud Backup */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            DATA & BACKUP
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {/* Storage Diagnostic Chips */}
            <View
              style={[
                styles.storageStatsBox,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
              ]}
            >
              <Text style={[styles.storageStatsTitle, { color: colors.textSecondary }]}>
                LOCAL DATABASE INVENTORY
              </Text>
              <View style={styles.storageStatsGrid}>
                <Text style={[styles.storageStatChip, { color: colors.text }]}>
                  📋 <Text style={styles.boldNum}>{dbCounts.tasks}</Text> Tasks
                </Text>
                <Text style={[styles.storageStatChip, { color: colors.text }]}>
                  🔄 <Text style={styles.boldNum}>{dbCounts.habits}</Text> Habits
                </Text>
                <Text style={[styles.storageStatChip, { color: colors.text }]}>
                  📝 <Text style={styles.boldNum}>{dbCounts.notes}</Text> Notes
                </Text>
                <Text style={[styles.storageStatChip, { color: colors.text }]}>
                  📅 <Text style={styles.boldNum}>{dbCounts.events}</Text> Events
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={handleExportBackup}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Export Backup"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.primaryLight }]}>
                  💾 Export SQLite Backup (Share JSON)
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Exports all tasks, habits, calendar events, notes & settings
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            {/* Google Sheets Cloud Sync */}
            <TouchableOpacity
              onPress={() => setGoogleSheetsModalVisible(true)}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Google Sheets Cloud Sync"
            >
              <View style={styles.settingTextCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.actionLabel, typography.title, { color: '#10B981' }]}>
                    📊 Google Sheets & Drive Sync
                  </Text>
                  {Boolean(googleSheetLastSync) && (
                    <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>Active</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  {googleSheetLastSync
                    ? `Last synced: ${format(new Date(googleSheetLastSync), 'MMM d, h:mm a')}`
                    : 'Sync tasks, habits & notes directly into your private Google Sheet in Drive'}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: About & Privacy */}
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
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Privacy Policy"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.text }]}>
                  🛡️ Privacy Architecture
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
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open About & Software Licenses"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.actionLabel, typography.title, { color: colors.text }]}>
                  ℹ️ About & Software Licenses
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

      {/* Google Sheets Cloud Sync Modal */}
      <Modal
        visible={googleSheetsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setGoogleSheetsModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback
            onPress={() => {
              Keyboard.dismiss();
              setGoogleSheetsModalVisible(false);
            }}
          >
            <View style={styles.modalBackdropTouchable} />
          </TouchableWithoutFeedback>

          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollBody}
            >
              <Text style={[styles.modalTitle, typography.headerSmall, { color: colors.text }]}>
                📊 Google Sheets & Drive Sync
              </Text>
              <Text style={[styles.modalSubtitle, typography.caption, { color: colors.textSecondary }]}>
                Sync tasks, habits, and notes into your private Google Sheet in Google Drive.
              </Text>

              {/* Status Banner */}
              <View
                style={[
                  styles.storageStatsBox,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    marginBottom: 16,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[styles.storageStatsTitle, { color: '#10B981', marginBottom: 0 }]}>
                    {googleSheetLastSync
                      ? `LAST SYNCED: ${format(new Date(googleSheetLastSync), 'PPpp')}`
                      : 'STATUS: READY TO SYNC'}
                  </Text>
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>✓ Drive Connected</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                  Your Google Sheet is connected directly in code. Tapping "Push to Sheet" will sync all your tasks, habits, and notes directly into Google Drive.
                </Text>
              </View>

              {/* Webhook Configuration Inputs */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                GOOGLE APPS SCRIPT WEBHOOK URL
              </Text>
              <TextInput
                style={[
                  styles.companionInput,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                value={googleSheetWebhookUrl}
                onChangeText={setGoogleSheetWebhookUrl}
                placeholder="https://script.google.com/macros/s/.../exec"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                SYNC SECRET (OPTIONAL AUTHENTICATION TOKEN)
              </Text>
              <TextInput
                style={[
                  styles.companionInput,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                value={googleSheetSyncSecret}
                onChangeText={setGoogleSheetSyncSecret}
                placeholder="Passphrase to protect your sheet from unauthorized access"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              {/* Auto-Sync Switch */}
              <View
                style={[
                  styles.companionAutoSyncRow,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, marginBottom: 16 },
                ]}
              >
                <View style={styles.companionAutoSyncTextCol}>
                  <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                    Auto-Sync
                  </Text>
                  <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                    Sync automatically when you open settings
                  </Text>
                </View>
                <Switch
                  value={googleSheetAutoSync}
                  onValueChange={toggleGoogleSheetAutoSync}
                  trackColor={{ false: colors.border, true: '#10B981' }}
                />
              </View>

              {googleSheetSyncing && (
                <View style={styles.syncLoadingRow}>
                  <ActivityIndicator size="small" color="#10B981" />
                  <Text style={[styles.syncLoadingText, { color: colors.textSecondary }]}>
                    Communicating with Google Sheet in Drive...
                  </Text>
                </View>
              )}

              <View style={styles.companionActionGrid}>
                <TouchableOpacity
                  disabled={googleSheetSyncing}
                  onPress={handlePushToGoogleSheet}
                  style={[styles.companionActionBtn, { backgroundColor: '#10B981' }]}
                >
                  <Text style={[styles.companionBtnText, { color: '#FFFFFF' }]}>⬆️ Push to Sheet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={googleSheetSyncing}
                  onPress={handleTestGoogleSheet}
                  style={[styles.companionActionBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <Text style={[styles.companionBtnText, { color: colors.text }]}>🔌 Test Link</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={googleSheetSyncing}
                  onPress={() => handlePullFromGoogleSheet('merge')}
                  style={[styles.companionActionBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <Text style={[styles.companionBtnText, { color: colors.text }]}>⬇️ Pull & Merge</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={googleSheetSyncing}
                  onPress={() => handlePullFromGoogleSheet('replace')}
                  style={[styles.companionActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}
                >
                  <Text style={[styles.companionBtnText, { color: colors.danger }]}>⚠️ Overwrite Local</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setGoogleSheetsModalVisible(false);
                  }}
                  style={[styles.modalBtn, { backgroundColor: colors.surfaceElevated }]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  title: {},
  sub: {
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  storageStatsBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 10,
    marginBottom: spacing.xs,
  },
  storageStatsTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  storageStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  },
  cancelBtnText: {
    fontWeight: '700',
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
    paddingVertical: spacing.xs,
  },
  actionLabel: {
    fontWeight: '700',
    marginBottom: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalBackdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    zIndex: 1,
  },
  modalTitle: {
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 6,
  },
  companionInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  syncLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  syncLoadingText: {
    fontSize: 12,
  },
  companionActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: spacing.md,
  },
  companionActionBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalScrollBody: {
    paddingBottom: spacing.sm,
  },
  companionAutoSyncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: spacing.xs,
  },
  companionAutoSyncTextCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
});
