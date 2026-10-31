import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useTheme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import {
  format,
  parseISO,
  differenceInYears,
  differenceInMonths,
  differenceInWeeks,
  differenceInDays,
  addYears,
  addMonths,
  isValid,
  isAfter,
} from 'date-fns';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (data: { name: string; avatar: string; birthDate: string; birthTime?: string }) => void;
}

const AVATAR_OPTIONS = ['🐯', '🚀', '🤖', '👑', '🦊', '⚡', '😎', '🦄', '🎮', '🌟'];

export interface AgeCalculation {
  years: number;
  months: number;
  days: number;
  totalWeeks: number;
  totalDays: number;
  dayOfWeek: string;
  birthDateFormatted: string;
  nextBirthdayDays: number;
}

export function computeAgeStats(birthDateStr: string, referenceDate: Date = new Date()): AgeCalculation | null {
  try {
    const birthDate = parseISO(birthDateStr);
    const now = referenceDate;
    if (!isValid(birthDate) || isAfter(birthDate, now)) return null;

    const totalYears = differenceInYears(now, birthDate);
    const dateAfterYears = addYears(birthDate, totalYears);
    const months = differenceInMonths(now, dateAfterYears);
    const dateAfterMonths = addMonths(dateAfterYears, months);
    const days = differenceInDays(now, dateAfterMonths);

    const totalWeeks = differenceInWeeks(now, birthDate);
    const totalDays = differenceInDays(now, birthDate);
    const dayOfWeek = format(birthDate, 'EEEE');
    const birthDateFormatted = format(birthDate, 'd MMMM yyyy');

    // Next birthday calculation (normalize to midnight and handle leap-year Feb 29 birthdays)
    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const isFeb29 = birthDate.getMonth() === 1 && birthDate.getDate() === 29;
    const getBirthdayForYear = (y: number) => {
      if (isFeb29 && !isLeapYear(y)) {
        return new Date(y, 1, 28);
      }
      return new Date(y, birthDate.getMonth(), birthDate.getDate());
    };

    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let nextBday = getBirthdayForYear(now.getFullYear());
    if (nextBday < todayMidnight) {
      nextBday = getBirthdayForYear(now.getFullYear() + 1);
    }
    const nextBirthdayDays = Math.max(0, differenceInDays(nextBday, todayMidnight));

    return {
      years: Math.max(0, totalYears),
      months: Math.max(0, months),
      days: Math.max(0, days),
      totalWeeks: Math.max(0, totalWeeks),
      totalDays: Math.max(0, totalDays),
      dayOfWeek,
      birthDateFormatted,
      nextBirthdayDays,
    };
  } catch {
    return null;
  }
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  visible,
  onClose,
  onSaved,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🐯');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const savedName = await settingsRepository.get('userName', '');
      const savedAvatar = await settingsRepository.get('user_avatar', '🐯');
      const savedBirthDate = await settingsRepository.get('birthDate', '');
      setName(savedName);
      if (savedAvatar) setAvatar(savedAvatar);
      setBirthDate(savedBirthDate);
    }
    if (visible) {
      loadProfile();
    }
  }, [visible]);

  const stats = computeAgeStats(birthDate);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }

    const trimmedDate = birthDate.trim();
    const parsedDate = parseISO(trimmedDate);
    if (!isValid(parsedDate)) {
      Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format (e.g. 2002-08-15).');
      return;
    }

    if (isAfter(parsedDate, new Date())) {
      Alert.alert('Invalid Date', 'Birth date cannot be in the future.');
      return;
    }

    try {
      setSaving(true);
      await settingsRepository.set('userName', trimmedName);
      await settingsRepository.set('user_avatar', avatar);
      await settingsRepository.set('birthDate', trimmedDate);

      onSaved({
        name: trimmedName,
        avatar,
        birthDate: trimmedDate,
        birthTime: '',
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Save Error', e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 24) }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Top Bar */}
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Profile & Milestones</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={[styles.closeIcon, { color: colors.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 30 },
            ]}
          >
            {/* Hero Avatar Badge & Selector */}
            <View style={[styles.avatarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.avatarGlowWrapper}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarTiger}>{avatar}</Text>
                </View>
              </View>
              <Text style={[styles.profileName, { color: colors.text }]}>{name}</Text>
              {stats && (
                <Text style={[styles.profileSub, { color: colors.textSecondary }]}>
                  Born on {stats.dayOfWeek}, {stats.birthDateFormatted}
                </Text>
              )}

              {/* Avatar Selector Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.avatarPickerRow}
                contentContainerStyle={styles.avatarPickerContent}
              >
                {AVATAR_OPTIONS.map((av) => (
                  <TouchableOpacity
                    key={av}
                    onPress={() => setAvatar(av)}
                    style={[
                      styles.avatarChip,
                      {
                        backgroundColor: avatar === av ? colors.primary + '25' : colors.surface,
                        borderColor: avatar === av ? colors.primary : colors.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose avatar ${av}`}
                  >
                    <Text style={styles.avatarChipText}>{av}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Live Age Stats Dashboard */}
            {stats && (
              <View style={styles.statsSection}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>LIFE AGE MILESTONES</Text>

                {/* Primary Age Banner */}
                <View style={[styles.ageHighlightCard, { backgroundColor: colors.brandDark, shadowColor: colors.brandDark }]}>
                  <Text style={styles.ageHighlightLabel}>EXACT AGE</Text>
                  <Text style={styles.ageHighlightValue}>
                    {stats.years}{' '}
                    <Text style={styles.unitText}>
                      {stats.years === 1 ? 'Year' : 'Years'}
                    </Text>{' '}
                    {stats.months}{' '}
                    <Text style={styles.unitText}>
                      {stats.months === 1 ? 'Month' : 'Months'}
                    </Text>{' '}
                    {stats.days}{' '}
                    <Text style={styles.unitText}>
                      {stats.days === 1 ? 'Day' : 'Days'}
                    </Text>
                  </Text>
                </View>

                {/* 2x2 Metric Grid */}
                <View style={styles.metricGrid}>
                  <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <Text style={styles.metricTileIcon}>📅</Text>
                    <Text style={[styles.metricTileNumber, { color: colors.text }]}>
                      {stats.totalDays.toLocaleString()}
                    </Text>
                    <Text style={[styles.metricTileLabel, { color: colors.textSecondary }]}>Total Days Lived</Text>
                  </View>

                  <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <Text style={styles.metricTileIcon}>🗓️</Text>
                    <Text style={[styles.metricTileNumber, { color: colors.text }]}>
                      {stats.totalWeeks.toLocaleString()}
                    </Text>
                    <Text style={[styles.metricTileLabel, { color: colors.textSecondary }]}>Total Weeks Lived</Text>
                  </View>

                  <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <Text style={styles.metricTileIcon}>🌟</Text>
                    <Text style={[styles.metricTileNumber, { color: colors.text }]}>{stats.dayOfWeek}</Text>
                    <Text style={[styles.metricTileLabel, { color: colors.textSecondary }]}>Day of Birth</Text>
                  </View>

                  <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <Text style={styles.metricTileIcon}>🎂</Text>
                    <Text style={[styles.metricTileNumber, { color: colors.text }]}>
                      {stats.nextBirthdayDays === 0
                        ? 'Today!'
                        : `${stats.nextBirthdayDays} Days`}
                    </Text>
                    <Text style={[styles.metricTileLabel, { color: colors.textSecondary }]}>Next Birthday</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Set Name & Birth Date Form */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>UPDATE DETAILS</Text>

              {/* Name Field */}
              <View style={styles.formGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NAME</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter name"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {/* Date of Birth Field */}
              <View style={styles.formGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DATE OF BIRTH (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={birthDate}
                  onChangeText={setBirthDate}
                  placeholder="2002-08-15"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Save Profile"
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF7F4', // Warm soft cream
  },
  keyboardView: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1E1F24',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E1F24',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  avatarCard: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarGlowWrapper: {
    padding: 6,
    borderRadius: 50,
    backgroundColor: '#FFE5D4',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF2E8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarTiger: {
    fontSize: 42,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E1F24',
    marginBottom: 4,
  },
  profileSub: {
    fontSize: 13,
    color: '#75757F',
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  avatarPickerRow: {
    marginTop: 14,
    width: '100%',
  },
  avatarPickerContent: {
    paddingHorizontal: 8,
    gap: 8,
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarChipText: {
    fontSize: 20,
  },
  statsSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A09FA6',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  ageHighlightCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  ageHighlightLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF8A3D',
    letterSpacing: 1,
    marginBottom: 6,
  },
  ageHighlightValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E0DDD8',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricTileIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  metricTileNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E1F24',
    marginBottom: 2,
  },
  metricTileLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#75757F',
  },
  formSection: {
    marginTop: 6,
  },
  formGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#75757F',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  inputField: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#1E1F24',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  saveButton: {
    backgroundColor: '#FF6B00',
    borderRadius: 26,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
