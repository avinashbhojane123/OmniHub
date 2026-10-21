import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import { categoryRepository } from '../database/repositories/CategoryRepository';
import { Category } from '../types';

interface CreateCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onCategoryCreated: (category: Category) => void;
  accentColor?: string;
}

const CATEGORY_ICONS = ['⭐', '💼', '💪', '📚', '🎯', '🌿', '💡', '🚀', '🛒', '🎨', '✈️', '🏠'];
const CATEGORY_COLORS = ['#FF6B00', '#3B82F6', '#10B981', '#EC4899', '#8B5CF6', '#F59E0B', '#06B6D4', '#EF4444'];

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  visible,
  onClose,
  onCategoryCreated,
  accentColor,
}) => {
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('⭐');
  const [color, setColor] = useState('#FF6B00');
  const [loading, setLoading] = useState(false);

  const activeColor = accentColor || colors.primary;

  const handleClose = () => {
    setName('');
    setIcon('⭐');
    setColor('#FF6B00');
    onClose();
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Validation Error', 'Please enter a category name.');
      return;
    }

    try {
      setLoading(true);
      const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const created = await categoryRepository.create({
        id,
        name: trimmed,
        color,
        icon,
        createdAt: new Date().toISOString(),
      });
      handleClose();
      onCategoryCreated(created);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.modalTitle, typography.title, { color: colors.text }]}>
            Create New Category
          </Text>

          <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
            CATEGORY NAME *
          </Text>
          <TextInput
            style={[
              styles.modalTextInput,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="e.g. Health, Study, Work"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
            ICON
          </Text>
          <View style={styles.iconPickerRow}>
            {CATEGORY_ICONS.map((emoji) => {
              const isSelected = icon === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => setIcon(emoji)}
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: isSelected ? `${activeColor}25` : colors.surfaceElevated,
                      borderColor: isSelected ? activeColor : colors.borderSubtle,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select icon ${emoji}`}
                >
                  <Text style={styles.iconEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.inputLabel, typography.caption, { color: colors.textSecondary }]}>
            COLOR
          </Text>
          <View style={styles.colorPalette}>
            {CATEGORY_COLORS.map((col) => {
              const isSelected = color === col;
              return (
                <TouchableOpacity
                  key={col}
                  onPress={() => setColor(col)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: col },
                    isSelected && styles.colorCircleActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select color ${col}`}
                />
              );
            })}
          </View>

          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.modalCancelBtn, { borderColor: colors.borderSubtle, opacity: loading ? 0.6 : 1 }]}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Cancel category creation"
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, { backgroundColor: activeColor, opacity: loading ? 0.7 : 1 }]}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Save new category"
            >
              <Text style={styles.modalSaveText}>
                {loading ? 'Creating...' : 'Save Category'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: {
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  modalTextInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  iconPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 18,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  modalCancelText: {
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
