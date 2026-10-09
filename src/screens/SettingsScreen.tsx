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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { backupService } from '../services/backup/BackupService';
import { radius, spacing, typography } from '../theme';
import { alarmService } from '../services/alarm/AlarmService';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, themeMode, changeTheme } = useAppTheme();

  // Notification Settings State
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [_snoozeMinutes, setSnoozeMinutes] = useState('10');

  // Backup Import State
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const notifs = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
    const sound = (await settingsRepository.get('notificationSound', 'true')) === 'true';
    const vib = (await settingsRepository.get('notificationVibration', 'true')) === 'true';
    const snooze = await settingsRepository.get('defaultSnoozeMinutes', '10');

    setNotificationsEnabled(notifs);
    setSoundEnabled(sound);
    setVibrationEnabled(vib);
    setSnoozeMinutes(snooze);
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

  const handleExportBackup = async () => {
    try {
      const json = await backupService.exportBackup();
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
    try {
      const res = await backupService.importBackup(importJsonText.trim());
      setImportModalVisible(false);
      setImportJsonText('');
      Alert.alert('Restore Success', res.message || 'All records restored successfully!');
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message || 'Invalid backup format.');
    }
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
              onPress={() => Linking.openSettings()}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Open System Battery & App Settings"
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingLabel, typography.title, { color: colors.text }]}>
                  ⚡ Background & Battery Saver
                </Text>
                <Text style={[styles.settingDesc, typography.caption, { color: colors.textSecondary }]}>
                  Set "No restrictions" & enable "Autostart" for 100% reliable alarms on MIUI/HyperOS
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
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
              Life Planner does not send your tasks, notes, or schedules to any remote cloud servers.
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
});
