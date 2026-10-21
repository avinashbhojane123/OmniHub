import React, { useState } from 'react';
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
import { useAppTheme } from '../../hooks/useTheme';

interface KeepLabelModalProps {
  visible: boolean;
  selectedLabels: string[];
  allAvailableLabels: string[];
  onClose: () => void;
  onApplyLabels: (labels: string[]) => void;
  onDeleteLabel?: (label: string) => Promise<void>;
  onRenameLabel?: (oldLabel: string, newLabel: string) => Promise<void>;
}

export const KeepLabelModal: React.FC<KeepLabelModalProps> = ({
  visible,
  selectedLabels,
  allAvailableLabels,
  onClose,
  onApplyLabels,
  onDeleteLabel,
  onRenameLabel,
}) => {
  const { colors, isDark } = useAppTheme();
  const [currentSelected, setCurrentSelected] = useState<string[]>(selectedLabels);
  const [inputText, setInputText] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editNameText, setEditNameText] = useState('');

  // Sync state whenever modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentSelected(selectedLabels);
      setInputText('');
      setEditingLabel(null);
      setEditNameText('');
    }
  }, [visible, selectedLabels]);

  const toggleLabel = (label: string) => {
    if (currentSelected.includes(label)) {
      setCurrentSelected(currentSelected.filter((l) => l !== label));
    } else {
      setCurrentSelected([...currentSelected, label]);
    }
  };

  const handleAddNew = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (!currentSelected.includes(trimmed)) {
      setCurrentSelected([...currentSelected, trimmed]);
    }
    setInputText('');
  };

  const handleStartRename = (lbl: string) => {
    setEditingLabel(lbl);
    setEditNameText(lbl);
  };

  const handleConfirmRename = async (oldLabel: string) => {
    const trimmed = editNameText.trim();
    if (!trimmed || trimmed === oldLabel) {
      setEditingLabel(null);
      return;
    }
    // Update local selection
    setCurrentSelected((prev) => prev.map((l) => (l === oldLabel ? trimmed : l)));
    setEditingLabel(null);
    if (onRenameLabel) {
      await onRenameLabel(oldLabel, trimmed);
    }
  };

  const handleDelete = (lbl: string) => {
    Alert.alert(
      'Delete Label?',
      `Are you sure you want to delete "${lbl}"? This will remove it from all notes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setCurrentSelected((prev) => prev.filter((l) => l !== lbl));
            if (editingLabel === lbl) setEditingLabel(null);
            if (onDeleteLabel) {
              await onDeleteLabel(lbl);
            }
          },
        },
      ]
    );
  };

  const handleSave = () => {
    onApplyLabels(currentSelected);
    onClose();
  };

  const combinedLabels = Array.from(
    new Set([...allAvailableLabels, ...currentSelected])
  ).filter((l) =>
    inputText.trim() ? l.toLowerCase().includes(inputText.trim().toLowerCase()) : true
  );

  const canCreateNew =
    inputText.trim().length > 0 &&
    !combinedLabels.some((l) => l.toLowerCase() === inputText.trim().toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.outside} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Note Labels</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search or Create Input */}
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.inputPrefix, { color: colors.textMuted }]}>🏷️</Text>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter label name..."
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              returnKeyType="done"
              onSubmitEditing={handleAddNew}
            />
            {inputText.trim().length > 0 && (
              <TouchableOpacity onPress={handleAddNew} style={styles.addBtn}>
                <Text style={[styles.addBtnText, { color: colors.primary }]}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Create Option */}
          {canCreateNew && (
            <TouchableOpacity
              style={[styles.createPrompt, { borderColor: colors.borderSubtle }]}
              onPress={handleAddNew}
            >
              <Text style={[styles.createPromptText, { color: colors.primary }]}>
                + Create "{inputText.trim()}"
              </Text>
            </TouchableOpacity>
          )}

          {/* Labels List with Checkboxes & Rename/Delete Controls */}
          <ScrollView style={styles.labelList} showsVerticalScrollIndicator={false}>
            {combinedLabels.length === 0 && !canCreateNew ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No labels yet. Type above to create one.
              </Text>
            ) : (
              combinedLabels.map((lbl) => {
                const isChecked = currentSelected.includes(lbl);
                const isCurrentlyEditing = editingLabel === lbl;

                if (isCurrentlyEditing) {
                  return (
                    <View key={lbl} style={styles.editLabelRow}>
                      <TextInput
                        style={[
                          styles.editInput,
                          {
                            color: colors.text,
                            borderColor: colors.primary,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F8FAFC',
                          },
                        ]}
                        value={editNameText}
                        onChangeText={setEditNameText}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => handleConfirmRename(lbl)}
                      />
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleConfirmRename(lbl)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.confirmCheckIcon, { color: colors.primary }]}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => setEditingLabel(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.cancelEditIcon, { color: colors.textMuted }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <View key={lbl} style={styles.labelRowContainer}>
                    <TouchableOpacity
                      style={styles.labelCheckableArea}
                      onPress={() => toggleLabel(lbl)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: isChecked ? colors.primary : colors.textMuted,
                            backgroundColor: isChecked ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isChecked && <Text style={styles.checkIcon}>✓</Text>}
                      </View>
                      <Text style={[styles.labelText, { color: colors.text }]} numberOfLines={1}>
                        {lbl}
                      </Text>
                    </TouchableOpacity>

                    {/* Quick Rename & Delete actions */}
                    <View style={styles.labelRowActions}>
                      <TouchableOpacity
                        onPress={() => handleStartRename(lbl)}
                        style={styles.labelActionBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={`Rename label ${lbl}`}
                      >
                        <Text style={styles.labelActionIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(lbl)}
                        style={styles.labelActionBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={`Delete label ${lbl}`}
                      >
                        <Text style={styles.labelActionIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  outside: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  inputPrefix: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  addBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  createPrompt: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    marginBottom: 6,
  },
  createPromptText: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelList: {
    maxHeight: 220,
    marginVertical: 6,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  labelRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  labelCheckableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  labelRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  labelActionIcon: {
    fontSize: 14,
  },
  editLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  editInput: {
    flex: 1,
    height: 38,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  actionIconBtn: {
    padding: 6,
  },
  confirmCheckIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  cancelEditIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  labelText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
