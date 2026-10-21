import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface RoomWallpaperModalProps {
  visible: boolean;
  onClose: () => void;
  currentTheme: string;
  onSelectTheme: (theme: string, customWallpaper?: string | null) => void;
}

const THEME_OPTIONS = [
  { id: 'wa-doodle', name: 'WhatsApp Classic Doodle', color: '#0B141A' },
  { id: 'dark-slate', name: 'Dark Slate Premium', color: '#0F172A' },
  { id: 'deep-purple', name: 'Cosmic Purple Glow', color: '#1E1B4B' },
  { id: 'emerald-night', name: 'Emerald Forest Night', color: '#062E25' },
  { id: 'ocean-blue', name: 'Deep Ocean Blue', color: '#0C4A6E' },
  { id: 'custom', name: 'Custom Wallpaper Image URL', color: '#1E293B' },
];

export const RoomWallpaperModal: React.FC<RoomWallpaperModalProps> = ({
  visible,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  const [customUrl, setCustomUrl] = useState('');

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Room Theme & Wallpaper 🎨</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
            {THEME_OPTIONS.map((theme) => {
              const isSelected = currentTheme === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.themeOptionRow,
                    { backgroundColor: theme.color },
                    isSelected && styles.themeOptionSelected,
                  ]}
                  onPress={() => {
                    if (theme.id !== 'custom') {
                      onSelectTheme(theme.id, null);
                      onClose();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.themeInfoCol}>
                    <Text style={styles.themeName}>{theme.name}</Text>
                    {isSelected && (
                      <Text style={styles.activeLabel}>✓ Active</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Custom URL Input */}
            <View style={styles.customSection}>
              <Text style={styles.customLabel}>Or Enter Direct Image URL</Text>
              <TextInput
                style={styles.customInput}
                placeholder="https://... (.jpg, .png, .webp)"
                placeholderTextColor="#64748B"
                value={customUrl}
                onChangeText={setCustomUrl}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[
                  styles.applyCustomBtn,
                  { opacity: customUrl.trim() ? 1 : 0.5 },
                ]}
                disabled={!customUrl.trim()}
                onPress={() => {
                  if (customUrl.trim()) {
                    onSelectTheme('custom', customUrl.trim());
                    setCustomUrl('');
                    onClose();
                  }
                }}
              >
                <Text style={styles.applyCustomText}>Apply Custom Wallpaper</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  optionsList: {
    marginBottom: 16,
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeOptionSelected: {
    borderColor: '#38BDF8',
  },
  themeInfoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  themeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },
  customSection: {
    marginTop: 12,
  },
  customLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  customInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  applyCustomBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyCustomText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
});
