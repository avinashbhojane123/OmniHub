import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useAppTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';
import {
  BulletItem,
  parseBulletNotes,
  serializeBulletNotes,
} from '../utils/bulletNotes';

interface GoogleKeepNotesEditorProps {
  notes: string;
  onChangeNotes: (formattedNotes: string) => void;
  label?: string;
}

type EditorMode = 'bullets' | 'checklist' | 'text';

export const GoogleKeepNotesEditor: React.FC<GoogleKeepNotesEditorProps> = ({
  notes,
  onChangeNotes,
  label = 'NOTES & BULLETS',
}) => {
  const { colors } = useAppTheme();

  // Detect initial mode based on content
  const initialMode: EditorMode = notes.includes('[ ]') || notes.includes('[x]')
    ? 'checklist'
    : notes.trim().startsWith('•') || notes.includes('\n•')
    ? 'bullets'
    : 'bullets';

  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [items, setItems] = useState<BulletItem[]>(() => {
    const parsed = parseBulletNotes(notes);
    if (parsed.length > 0) return parsed;
    return [{ id: 'item_1', text: '', completed: false }];
  });
  const [rawText, setRawText] = useState(notes);

  // References to input fields to allow focusing next on Enter
  const inputRefs = useRef<{ [key: string]: any }>({});
  const lastSerializedRef = useRef<string>(notes);

  // Sync when notes prop changes externally (e.g. loading existing task)
  useEffect(() => {
    if (notes === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = notes;

    if (notes && notes.trim().length > 0) {
      const parsed = parseBulletNotes(notes);
      if (parsed.length > 0) {
        setItems(parsed);
      }
      setRawText(notes);
      if (notes.includes('[ ]') || notes.includes('[x]')) {
        setMode('checklist');
      } else if (notes.includes('•')) {
        setMode('bullets');
      }
    } else {
      setItems([{ id: 'item_1', text: '', completed: false }]);
      setRawText('');
    }
  }, [notes]);

  // Sync internal items back to parent when items change
  const notifyParent = (newItems: BulletItem[], newMode: EditorMode) => {
    if (newMode === 'text') {
      lastSerializedRef.current = rawText;
      onChangeNotes(rawText);
    } else {
      const serialized = serializeBulletNotes(newItems, newMode);
      lastSerializedRef.current = serialized;
      onChangeNotes(serialized);
    }
  };

  const handleTextChange = (id: string, text: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, text } : item
    );
    setItems(updated);
    notifyParent(updated, mode);
  };

  const handleToggleComplete = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    setItems(updated);
    notifyParent(updated, mode);
  };

  const handleAddItem = (afterId?: string) => {
    const newItem: BulletItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: '',
      completed: false,
    };

    let updated: BulletItem[];
    if (afterId) {
      const idx = items.findIndex((i) => i.id === afterId);
      if (idx !== -1) {
        updated = [...items.slice(0, idx + 1), newItem, ...items.slice(idx + 1)];
      } else {
        updated = [...items, newItem];
      }
    } else {
      updated = [...items, newItem];
    }

    setItems(updated);
    notifyParent(updated, mode);

    // Focus newly created item
    setTimeout(() => {
      inputRefs.current[newItem.id]?.focus();
    }, 60);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      // Clear instead of removing last item
      const reset = [{ id: 'item_1', text: '', completed: false }];
      setItems(reset);
      notifyParent(reset, mode);
      return;
    }
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    notifyParent(updated, mode);
  };

  const handleSwitchMode = (newMode: EditorMode) => {
    setMode(newMode);
    if (newMode === 'text') {
      const textVal = serializeBulletNotes(items, 'text');
      setRawText(textVal);
      onChangeNotes(textVal);
    } else {
      let currentItems = items;
      if (rawText.trim() && items.every((i) => !i.text.trim())) {
        currentItems = parseBulletNotes(rawText);
        if (currentItems.length === 0) {
          currentItems = [{ id: 'item_1', text: rawText, completed: false }];
        }
        setItems(currentItems);
      }
      notifyParent(currentItems, newMode);
    }
  };

  const handleRawTextChange = (txt: string) => {
    setRawText(txt);
    onChangeNotes(txt);
  };

  const handleConvertTextToBullets = () => {
    const parsed = parseBulletNotes(rawText);
    const result =
      parsed.length > 0
        ? parsed
        : [{ id: 'item_1', text: rawText, completed: false }];
    setItems(result);
    setMode('bullets');
    notifyParent(result, 'bullets');
  };

  return (
    <View style={styles.container}>
      {/* Header with Google Keep Style Label & Mode Toggles */}
      <View style={styles.headerBlock}>
        <View style={styles.labelRow}>
          <Text style={[styles.sectionLabel, typography.caption, { color: colors.textSecondary }]}>
            {label}
          </Text>
          <View style={styles.keepBadge}>
            <Text style={styles.keepBadgeEmoji}>📌</Text>
            <Text style={styles.keepBadgeText}>Google Keep style</Text>
          </View>
        </View>

        {/* Mode Selector Tabs */}
        <View style={[styles.modeTabsRow, { backgroundColor: colors.surfaceElevated }]}>
          <TouchableOpacity
            style={[
              styles.modeTab,
              mode === 'bullets' && [styles.modeTabActive, { backgroundColor: colors.primary }],
            ]}
            onPress={() => handleSwitchMode('bullets')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="Bullet points mode"
          >
            <Text
              style={[
                styles.modeTabText,
                mode === 'bullets' ? styles.modeTabTextActive : { color: colors.textSecondary },
              ]}
            >
              • Bullets
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeTab,
              mode === 'checklist' && [styles.modeTabActive, { backgroundColor: colors.primary }],
            ]}
            onPress={() => handleSwitchMode('checklist')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="Checklist mode"
          >
            <Text
              style={[
                styles.modeTabText,
                mode === 'checklist' ? styles.modeTabTextActive : { color: colors.textSecondary },
              ]}
            >
              ☑ Checklist
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeTab,
              mode === 'text' && [styles.modeTabActive, { backgroundColor: colors.primary }],
            ]}
            onPress={() => handleSwitchMode('text')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="Text mode"
          >
            <Text
              style={[
                styles.modeTabText,
                mode === 'text' ? styles.modeTabTextActive : { color: colors.textSecondary },
              ]}
            >
              📝 Freeform Note
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Editor Content Area */}
      {mode === 'text' ? (
        <View style={[styles.textInputBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <TextInput
            style={[styles.multilineInput, typography.body, { color: colors.text }]}
            placeholder="Write notes here... Each line can be turned into a bullet point!"
            placeholderTextColor={colors.textMuted}
            value={rawText}
            onChangeText={handleRawTextChange}
            multiline
            numberOfLines={4}
          />
          {rawText.trim().length > 0 && (
            <TouchableOpacity
              onPress={handleConvertTextToBullets}
              style={[styles.convertBtn, { backgroundColor: colors.primaryMuted, borderColor: colors.primary }]}
            >
              <Text style={[styles.convertBtnText, { color: colors.primaryLight }]}>
                ⚡ Convert lines to bullet points
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.bulletCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          {/* List of Bullet Items */}
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <View key={item.id} style={styles.bulletItemRow}>
                {/* Left Indicator: Bullet mark or Checkbox */}
                {mode === 'checklist' ? (
                  <TouchableOpacity
                    onPress={() => handleToggleComplete(item.id)}
                    style={styles.checkboxTouch}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!item.completed }}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        item.completed
                          ? styles.checkboxBoxDone
                          : { borderColor: colors.border },
                      ]}
                    >
                      {item.completed && <Text style={styles.checkmarkIcon}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.bulletMarkWrapper}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
                  </View>
                )}

                {/* Input for this bullet note */}
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[item.id] = ref;
                  }}
                  value={item.text}
                  onChangeText={(txt) => handleTextChange(item.id, txt)}
                  placeholder={
                    index === 0
                      ? 'e.g. Chapter 1 notes, ingredients, steps...'
                      : 'Add note item...'
                  }
                  placeholderTextColor={colors.textMuted}
                  returnKeyType={isLast ? 'next' : 'next'}
                  onSubmitEditing={() => handleAddItem(item.id)}
                  blurOnSubmit={false}
                  style={[
                    styles.bulletInput,
                    typography.body,
                    item.completed && mode === 'checklist' && styles.bulletInputCompleted,
                    {
                      color: colors.text,
                    },
                  ]}
                />

                {/* Delete button (✕) */}
                <TouchableOpacity
                  onPress={() => handleRemoveItem(item.id)}
                  style={styles.removeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove note item"
                >
                  <Text style={[styles.removeBtnTxt, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* "+ Add List Item" Button (like Google Keep) */}
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              onPress={() => handleAddItem()}
              style={[styles.addBulletBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Add bullet point"
            >
              <Text style={[styles.addBulletPlus, { color: colors.primary }]}>＋</Text>
              <Text style={[styles.addBulletText, { color: colors.primary }]}>
                {mode === 'checklist' ? 'Add checklist item' : 'Add bullet note'}
              </Text>
            </TouchableOpacity>

            {items.some((i) => i.text.trim()) && (
              <TouchableOpacity
                onPress={() => {
                  const reset = [{ id: 'item_1', text: '', completed: false }];
                  setItems(reset);
                  notifyParent(reset, mode);
                }}
                style={styles.clearBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>
                  Clear all
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  headerBlock: {
    marginBottom: spacing.xs + 4,
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  keepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE9D6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  keepBadgeEmoji: {
    fontSize: 11,
  },
  keepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  modeTabsRow: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    padding: 3,
    alignSelf: 'flex-start',
    gap: 2,
  },
  modeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm - 2,
  },
  modeTabActive: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bulletCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  bulletItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: 2,
  },
  bulletMarkWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  checkboxTouch: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmarkIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bulletInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    paddingHorizontal: 8,
  },
  bulletInputCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  removeBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  addBulletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 4,
  },
  addBulletPlus: {
    fontSize: 14,
    fontWeight: '700',
  },
  addBulletText: {
    fontSize: 12,
    fontWeight: '700',
  },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInputBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  multilineInput: {
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  convertBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  convertBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
