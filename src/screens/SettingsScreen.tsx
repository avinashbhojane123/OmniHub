import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  StatusBar,
  Alert,
  Share,
  Modal,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import notifee from '@notifee/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { backupService } from '../services/backup/BackupService';
import { radius, spacing, typography } from '../theme';
import { alarmService } from '../services/alarm/AlarmService';
import { notificationService } from '../services/notifications/NotificationService';
import { calendarService } from '../services/calendar/CalendarService';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, themeMode, changeTheme } = useAppTheme();

  // Notification Settings State
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [_snoozeMinutes, setSnoozeMinutes] = useState('10');

  // Backup Import State
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  // Companion Server State
  const [serverUrl, setServerUrl] = useState('http://10.0.2.2:3030');
  const [apiKey, setApiKey] = useState('');
  const [syncingServer, setSyncingServer] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Calendar Sync State
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [lastCalendarSync, setLastCalendarSync] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const notifs = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
    const sound = (await settingsRepository.get('notificationSound', 'true')) === 'true';
    const vib = (await settingsRepository.get('notificationVibration', 'true')) === 'true';
    const snooze = await settingsRepository.get('defaultSnoozeMinutes', '10');
    const savedServerUrl = await settingsRepository.get('companionServerUrl', 'http://10.0.2.2:3030');
    const savedApiKey = await settingsRepository.get('companionApiKey', '');
    const lastSyncAt = await settingsRepository.get('lastCalendarSyncAt', '');

    setNotificationsEnabled(notifs);
    setSoundEnabled(sound);
    setVibrationEnabled(vib);
    setSnoozeMinutes(snooze);
    setServerUrl(savedServerUrl);
    setApiKey(savedApiKey);
    if (lastSyncAt) {
      try {
        setLastCalendarSync(new Date(lastSyncAt).toLocaleTimeString());
      } catch {}
    }
  };

  const toggleNotifs = async (val: boolean) => {
    setNotificationsEnabled(val);
    await settingsRepository.set('notificationsEnabled', String(val));
  };

  const toggleSound = async (val: boolean) => {
    setSoundEnabled(val);
    await settingsRepository.set('notificationSound', String(val));
  };

  const toggleVib = async (val: boolean) => {
    setVibrationEnabled(val);
    await settingsRepository.set('notificationVibration', String(val));
  };

  const handleOpenBatterySettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await notifee.openBatteryOptimizationSettings();
      } catch {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  };

  const handleOpenExactAlarmSettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await alarmService.openExactAlarmSettings();
      } catch {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  };

  const handleOpenPowerManager = async () => {
    if (Platform.OS === 'android') {
      try {
        await notifee.openPowerManagerSettings();
      } catch {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  };

  const handleSyncToServer = async () => {
    const trimmedUrl = serverUrl.trim();
    const trimmedKey = apiKey.trim();
    if (!trimmedUrl) {
      Alert.alert('Server URL Required', 'Please enter a valid companion server address.');
      return;
    }
    try {
      setSyncingServer(true);
      await settingsRepository.set('companionServerUrl', trimmedUrl);
      await settingsRepository.set('companionApiKey', trimmedKey);
      const res = await backupService.syncToCompanionServer(trimmedUrl, trimmedKey);
      if (res.success) {
        Alert.alert('Sync Successful', res.message);
      } else {
        Alert.alert('Sync Failed', res.message);
      }
    } catch (e: any) {
      Alert.alert('Sync Error', e.message || 'Could not reach companion server.');
    } finally {
      setSyncingServer(false);
    }
  };

  const handleTestConnection = async () => {
    const trimmedUrl = serverUrl.trim();
    const trimmedKey = apiKey.trim();
    if (!trimmedUrl) {
      Alert.alert('Server URL Required', 'Please enter a valid companion server address.');
      return;
    }
    try {
      setTestingConnection(true);
      const res = await backupService.pingCompanionServer(trimmedUrl, trimmedKey);
      if (res.success) {
        Alert.alert('Connection Successful 🟢', res.message);
      } else {
        Alert.alert('Connection Issue ⚠️', res.message);
      }
    } catch (e: any) {
      Alert.alert('Connection Failed 🔴', e.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSyncDeviceCalendar = async () => {
    try {
      setSyncingCalendar(true);
      const res = await calendarService.syncDeviceCalendar();
      const updatedTime = new Date().toLocaleTimeString();
      setLastCalendarSync(updatedTime);
      Alert.alert(
        'Calendar Sync Complete',
        `Successfully synced device events (${res.imported} imported, ${res.updated} updated).`
      );
    } catch (e: any) {
      Alert.alert('Calendar Sync Failed', e.message || 'Could not sync device calendar.');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleRestoreFromServer = async () => {
    const trimmedUrl = serverUrl.trim();
    const trimmedKey = apiKey.trim();
    if (!trimmedUrl) {
      Alert.alert('Server URL Required', 'Please enter a valid companion server address.');
      return;
    }

    Alert.alert(
      'Restore From Server',
      'Choose restore mode:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge (Keep New Local Data)',
          onPress: async () => {
            try {
              setSyncingServer(true);
              await settingsRepository.set('companionServerUrl', trimmedUrl);
              await settingsRepository.set('companionApiKey', trimmedKey);
              const res = await backupService.restoreFromCompanionServer(trimmedUrl, trimmedKey, 'merge');
              if (res.success) {
                await notificationService.restoreAllReminders();
                await alarmService.restoreAllHabitAlarms();
                Alert.alert('Merge Successful', res.message);
              } else {
                Alert.alert('Restore Failed', res.message);
              }
            } catch (e: any) {
              Alert.alert('Restore Error', e.message || 'Could not restore from companion server.');
            } finally {
              setSyncingServer(false);
            }
          },
        },
        {
          text: 'Replace All (Clean Restore)',
          style: 'destructive',
          onPress: async () => {
            try {
              setSyncingServer(true);
              await settingsRepository.set('companionServerUrl', trimmedUrl);
              await settingsRepository.set('companionApiKey', trimmedKey);
              const res = await backupService.restoreFromCompanionServer(trimmedUrl, trimmedKey, 'replace');
              if (res.success) {
                await notificationService.restoreAllReminders();
                await alarmService.restoreAllHabitAlarms();
                Alert.alert('Restore Successful', res.message);
              } else {
                Alert.alert('Restore Failed', res.message);
              }
            } catch (e: any) {
              Alert.alert('Restore Error', e.message || 'Could not restore from companion server.');
            } finally {
              setSyncingServer(false);
            }
          },
        },
      ]
    );
  };

  const handleExportBackup = async () => {
    try {
      const json = await backupService.exportBackup();
      const kbSize = (json.length / 1024).toFixed(1);
      if (json.length > 300000) {
        Alert.alert(
          'Large Backup Detected',
          `Your backup data is ${kbSize} KB. Sharing large text directly via Android system intents may exceed the Android Binder IPC transaction limit. You can load it into the Restore text box below to inspect/copy it, or attempt system sharing.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Load into Box',
              onPress: () => {
                setImportJsonText(json);
                Alert.alert('Loaded', 'Backup JSON has been populated in the Restore box below.');
              },
            },
            {
              text: 'Share Anyway',
              onPress: async () => {
                try {
                  await Share.share({
                    title: 'OmniHub SQLite Backup',
                    message: json,
                  });
                } catch (err: any) {
                  Alert.alert('Share Failed', err.message || 'System intent too large to share text.');
                }
              },
            },
          ]
        );
        return;
      }
      await Share.share({
        title: 'Life Planner SQLite Backup',
        message: json,
      });
    } catch (e: any) {
      Alert.alert('Backup Error', e.message);
    }
  };

  const handleRestoreBackup = async () => {
    if (!importJsonText.trim()) {
      Alert.alert('Empty Input', 'Please paste valid backup JSON data.');
      return;
    }

    Alert.alert(
      'Import Backup',
      'Choose how to restore your data:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge with Existing',
          onPress: async () => {
            try {
              const res = await backupService.importBackup(importJsonText.trim(), 'merge');
              setImportModalVisible(false);
              setImportJsonText('');
              if (res.success) {
                await notificationService.restoreAllReminders();
                await alarmService.restoreAllHabitAlarms();
                Alert.alert('Merge Success', res.message);
              } else {
                Alert.alert('Restore Failed', res.message);
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Invalid backup format.');
            }
          },
        },
        {
          text: 'Replace All',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await backupService.importBackup(importJsonText.trim(), 'replace');
              setImportModalVisible(false);
              setImportJsonText('');
              if (res.success) {
                await notificationService.restoreAllReminders();
                await alarmService.restoreAllHabitAlarms();
                Alert.alert('Restore Success', res.message);
              } else {
                Alert.alert('Restore Failed', res.message);
              }
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Invalid backup format.');
            }
          },
        },
      ]
    );
  };

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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, typography.headerLarge, { color: colors.text }]}>
            Settings
          </Text>
          <Text style={[styles.sub, typography.caption, { color: colors.textSecondary }]}>
            Personalization & Local Data Storage
          </Text>
        </View>

        {/* Section: Workspace Switcher */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            OMNIHUB WORKSPACE SWITCHER
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('SafeGuard')}
              activeOpacity={0.7}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  🛡️ SafeGuard Family Platform
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Parental Control Dashboard & Child Safety Agent
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: '#EC4899', fontWeight: '800' }}>Open ➔</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('WorkspaceSelect')}
              activeOpacity={0.7}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  💎 Choose Workspace
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Switch between Planner, Chat, Battery Guard & SafeGuard
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '800' }}>Hub ➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            APPEARANCE & THEME
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.themeRow}>
              {(['dark', 'light', 'system'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => changeTheme(m)}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor: themeMode === m ? colors.primary : colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.themeBtnText,
                      typography.caption,
                      themeMode === m ? styles.themeBtnTextActive : { color: colors.textSecondary },
                    ]}
                  >
                    {m.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Section: Notifications */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            ANDROID NOTIFICATIONS
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

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Notification Sound
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Play audio on reminder trigger
                </Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={toggleSound}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Vibration
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Vibrate on reminder trigger
                </Text>
              </View>
              <Switch
                value={vibrationEnabled}
                onValueChange={toggleVib}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  Default Snooze
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Alarm snooze duration
                </Text>
              </View>
              <View style={styles.snoozeRow}>
                {['5', '10', '15'].map((mins) => {
                  const isSnoozeSelected = _snoozeMinutes === mins;
                  return (
                    <TouchableOpacity
                      key={mins}
                      onPress={async () => {
                        setSnoozeMinutes(mins);
                        await settingsRepository.set('defaultSnoozeMinutes', mins);
                      }}
                      style={[
                        styles.snoozeBtn,
                        {
                          backgroundColor: isSnoozeSelected ? colors.primary : colors.surfaceElevated,
                          borderColor: isSnoozeSelected ? colors.primary : colors.borderSubtle,
                        },
                      ]}
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

            <TouchableOpacity
              onPress={() => alarmService.startRinging('Test Routine Alarm', undefined, 'Test')}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Test Alarm Sound and Vibration"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.warning }]}>
                  🔔 Test Alarm & Vibration
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Plays system alarm ringtone & hardware vibration for 60s
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={() => navigation.navigate('BatteryAlarm')}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open Battery Charge Alarm App"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: '#10B981' }]}>
                  ⚡ Battery Charge Alarm & Health
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Configure 80% full charge alarms, anti-overcharge guard, and temperature alerts
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={handleOpenBatterySettings}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open System Battery Optimization Settings"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  🔋 Battery Optimization Whitelist
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Set "No restrictions" for 100% reliable alarms and notifications
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            {Platform.OS === 'android' && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                <TouchableOpacity
                  onPress={handleOpenExactAlarmSettings}
                  style={styles.actionRow}
                  accessibilityRole="button"
                  accessibilityLabel="Open Alarms and Reminders Permission Settings"
                >
                  <View style={styles.settingTextCol}>
                    <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                      ⏰ Exact Alarms & Reminders (Android 12+)
                    </Text>
                    <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                      Grant exact alarm scheduling to ensure daily alarms ring precisely on time
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                <TouchableOpacity
                  onPress={handleOpenPowerManager}
                  style={styles.actionRow}
                  accessibilityRole="button"
                  accessibilityLabel="Open Device Power Manager and Autostart Settings"
                >
                  <View style={styles.settingTextCol}>
                    <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                      🚀 Autostart & Power Manager
                    </Text>
                    <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                      Enable autostart for MIUI/HyperOS, ColorOS, EMUI & OneUI
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Section: Local Data & Backup */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            DATA & LOCAL BACKUP
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              onPress={handleExportBackup}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Export Backup"
            >
              <Text style={[styles.actionLabel, typography.title, { color: colors.primaryLight }]}>
                💾 Export SQLite Backup (Share JSON)
              </Text>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              onPress={() => setImportModalVisible(true)}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Import Backup"
            >
              <Text style={[styles.actionLabel, typography.title, { color: colors.primary }]}>
                📥 Import / Restore Backup (JSON)
              </Text>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Device Calendar Integration */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            DEVICE CALENDAR INTEGRATION
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.actionRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  📅 Device Calendar Sync
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  {lastCalendarSync
                    ? `Last synced at ${lastCalendarSync} • Read-only import`
                    : 'Import events from Android calendar provider into your daily timeline'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleSyncDeviceCalendar}
                disabled={syncingCalendar}
                style={[
                  styles.snoozeBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    paddingHorizontal: spacing.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sync Device Calendar Now"
              >
                {syncingCalendar ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.snoozeBtnText, styles.snoozeBtnTextActive]}>Sync Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Section: Companion Server Sync */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            LOCAL COMPANION SYNC (NESTJS SERVER)
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.serverCardContent}>
              <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                Companion Server Endpoint
              </Text>
              <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                NestJS server address (e.g. 10.0.2.2:3030 on Android Emulator or LAN IP)
              </Text>
              <TextInput
                style={[
                  styles.serverInput,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                placeholder="http://10.0.2.2:3030"
                placeholderTextColor={colors.textMuted}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View
                style={[
                  styles.lanTipBox,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={styles.lanTipIcon}>💡</Text>
                <Text style={[styles.lanTipText, typography.caption, { color: colors.textSecondary }]}>
                  Physical device: use your PC's LAN IP (e.g. http://192.168.1.X:3030). Emulator: http://10.0.2.2:3030.
                </Text>
              </View>
              <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                API Secret Key (Optional)
              </Text>
              <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                Authorization token matching BACKUP_API_KEY on your companion server
              </Text>
              <TextInput
                style={[
                  styles.serverInput,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                placeholder="X-API-Key token"
                placeholderTextColor={colors.textMuted}
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Test Connection Button */}
              <TouchableOpacity
                onPress={handleTestConnection}
                disabled={testingConnection}
                style={[
                  styles.serverBtn,
                  styles.serverBtnOutline,
                  styles.serverBtnFullWidth,
                  {
                    borderColor: colors.warning,
                    backgroundColor: colors.surfaceElevated,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Test Server Connection"
              >
                {testingConnection ? (
                  <ActivityIndicator size="small" color={colors.warning} />
                ) : (
                  <Text style={[styles.serverBtnText, { color: colors.warning }]}>
                    ⚡ Test Server Connection / Ping
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.serverBtnRow}>
                <TouchableOpacity
                  onPress={handleSyncToServer}
                  disabled={syncingServer}
                  style={[styles.serverBtn, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Sync To Companion Server"
                >
                  {syncingServer ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.serverBtnText}>☁️ Sync To Server</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleRestoreFromServer}
                  disabled={syncingServer}
                  style={[
                    styles.serverBtn,
                    styles.serverBtnOutline,
                    { borderColor: colors.primary, backgroundColor: colors.surfaceElevated },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Restore From Companion Server"
                >
                  <Text style={[styles.serverBtnText, { color: colors.primary }]}>📥 Restore From Server</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Section: Privacy Guarantee */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, typography.caption, { color: colors.textSecondary }]}>
            PRIVACY & LOCAL-FIRST ARCHITECTURE
          </Text>
          <View
            style={[
              styles.privacyCard,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
            ]}
          >
            <Text style={styles.lockIcon}>🛡️</Text>
            <Text style={[styles.privacyTitle, typography.title, { color: colors.text }]}>
              100% Private & Offline
            </Text>
            <Text style={[styles.privacyDesc, typography.body, { color: colors.textSecondary }]}>
              OmniHub does not send your tasks, notes, or schedules to any remote cloud servers.
              All data lives strictly inside your device's persistent SQLite database. It remains fully
              operational even in airplane mode.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Import / Restore Modal */}
      <Modal
        visible={importModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, typography.headerSmall, { color: colors.text }]}>
              Restore SQLite Backup
            </Text>
            <Text style={[styles.modalSubtitle, typography.caption, { color: colors.textSecondary }]}>
              Paste your exported JSON backup data below to restore all tasks, habits, and settings.
            </Text>

            <TextInput
              style={[
                styles.importTextInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="Paste JSON backup content here..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
              value={importJsonText}
              onChangeText={setImportJsonText}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setImportModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRestoreBackup}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.restoreBtnText}>Restore Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  themeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  themeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  themeBtnText: {
    fontWeight: '700',
  },
  themeBtnTextActive: {
    color: '#FFF',
  },
  snoozeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  snoozeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  snoozeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  snoozeBtnTextActive: {
    color: '#FFFFFF',
  },
  cancelBtnText: {
    fontWeight: '700',
  },
  restoreBtnText: {
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
  },
  settingDesc: {},
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
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  privacyCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  privacyTitle: {
    marginBottom: spacing.xs,
  },
  privacyDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  modalTitle: {
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  importTextInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  serverCardContent: {
    padding: spacing.md,
  },
  serverInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  lanTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  lanTipIcon: {
    fontSize: 14,
  },
  lanTipText: {
    flex: 1,
    lineHeight: 16,
  },
  serverBtnRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  serverBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverBtnOutline: {
    borderWidth: 1,
  },
  serverBtnFullWidth: {
    width: '100%',
    marginBottom: spacing.xs,
  },
  serverBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
