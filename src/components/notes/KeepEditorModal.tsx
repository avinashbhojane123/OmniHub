import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Share,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeepNote,
  KeepColorKey,
  KEEP_COLORS,
  ChecklistItem,
} from '../../types';
import { useAppTheme } from '../../hooks/useTheme';
import { keepNoteRepository } from '../../database/repositories/KeepNoteRepository';
import { notificationService } from '../../services/notifications/NotificationService';
import { KeepColorPicker } from './KeepColorPicker';
import { KeepLabelModal } from './KeepLabelModal';
import { KeepReminderModal } from './KeepReminderModal';
import { format, parseISO, isValid } from 'date-fns';

interface KeepEditorModalProps {
  visible: boolean;
  note: KeepNote | null; // null if creating a new note
  initialType?: 'text' | 'checklist';
  allAvailableLabels: string[];
  onClose: () => void;
  onNoteSaved: (savedNote: KeepNote) => void;
  onNoteDeleted?: (id: string) => void;
}

export const KeepEditorModal: React.FC<KeepEditorModalProps> = ({
  visible,
  note,
  initialType = 'text',
  allAvailableLabels,
  onClose,
  onNoteSaved,
  onNoteDeleted,
}) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  // Internal working note state
  const [noteId, setNoteId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [noteType, setNoteType] = useState<'text' | 'checklist'>('text');
  const [color, setColor] = useState<KeepColorKey>('default');
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isArchived, setIsArchived] = useState<boolean>(false);
  const [reminderTime, setReminderTime] = useState<string | undefined>(undefined);
  const [labels, setLabels] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [lastEditedTime, setLastEditedTime] = useState<string>('');

  // UI modal sheets
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showLabelModal, setShowLabelModal] = useState<boolean>(false);
  const [showReminderModal, setShowReminderModal] = useState<boolean>(false);
  const [showCompletedItems, setShowCompletedItems] = useState<boolean>(true);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [showImageModal, setShowImageModal] = useState<boolean>(false);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');

  const inputRefs = useRef<{ [key: string]: any }>({});
  const autoSaveTimerRef = useRef<any>(null);

  // Live refs to guarantee immediate, zero-lag access to latest note data on save
  const noteIdRef = useRef<string>(noteId);
  const titleRef = useRef<string>(title);
  const contentRef = useRef<string>(content);
  const checklistItemsRef = useRef<ChecklistItem[]>(checklistItems);
  const reminderTimeRef = useRef<string | undefined>(reminderTime);
  const imageUriRef = useRef<string | undefined>(imageUri);
  const colorRef = useRef<KeepColorKey>(color);
  const isPinnedRef = useRef<boolean>(isPinned);
  const isArchivedRef = useRef<boolean>(isArchived);
  const labelsRef = useRef<string[]>(labels);
  const noteTypeRef = useRef<'text' | 'checklist'>(noteType);

  // Initialize or reset state on open
  useEffect(() => {
    if (visible) {
      if (note) {
        setNoteId(note.id);
        noteIdRef.current = note.id;
        setTitle(note.title);
        titleRef.current = note.title;
        setContent(note.content);
        contentRef.current = note.content;
        const resType = note.type === 'checklist' ? 'checklist' : 'text';
        setNoteType(resType);
        noteTypeRef.current = resType;
        setColor(note.color);
        colorRef.current = note.color;
        setIsPinned(note.isPinned);
        isPinnedRef.current = note.isPinned;
        setIsArchived(note.isArchived);
        isArchivedRef.current = note.isArchived;
        setReminderTime(note.reminderTime);
        reminderTimeRef.current = note.reminderTime;
        setLabels(note.labels || []);
        labelsRef.current = note.labels || [];
        setChecklistItems(note.checklistData || []);
        checklistItemsRef.current = note.checklistData || [];
        setImageUri(note.imageUri);
        imageUriRef.current = note.imageUri;
        setLastEditedTime(note.updatedAt);
      } else {
        // Brand new note
        const newId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setNoteId(newId);
        noteIdRef.current = newId;
        setTitle('');
        titleRef.current = '';
        const initType = initialType === 'checklist' ? 'checklist' : 'text';
        setNoteType(initType);
        noteTypeRef.current = initType;
        setImageUri(undefined);
        imageUriRef.current = undefined;
        setContent('');
        contentRef.current = '';
        setColor('default');
        colorRef.current = 'default';
        setIsPinned(false);
        isPinnedRef.current = false;
        setIsArchived(false);
        isArchivedRef.current = false;
        setReminderTime(undefined);
        reminderTimeRef.current = undefined;
        setLabels([]);
        labelsRef.current = [];
        const initItems =
          initType === 'checklist'
            ? [{ id: `item_${Date.now()}_1`, text: '', completed: false }]
            : [];
        setChecklistItems(initItems);
        checklistItemsRef.current = initItems;
        setLastEditedTime(new Date().toISOString());
      }
      setShowColorPicker(false);
      setShowLabelModal(false);
      setShowReminderModal(false);
      setShowMoreMenu(false);
    }
  }, [visible, note, initialType]);

  // Save changes to database (debounced auto-save)
  const persistNote = useCallback(
    async (overrideFields: Partial<KeepNote> = {}): Promise<KeepNote | null> => {
      const activeId = overrideFields.id !== undefined ? overrideFields.id : (noteIdRef.current || noteId);
      if (!activeId) return null;

      const titleVal = overrideFields.title !== undefined ? overrideFields.title : (titleRef.current ?? title);
      const contentVal = overrideFields.content !== undefined ? overrideFields.content : (contentRef.current ?? content);
      const checklistVal =
        overrideFields.checklistData !== undefined
          ? overrideFields.checklistData
          : (checklistItemsRef.current ?? checklistItems);
      const reminderVal =
        overrideFields.reminderTime !== undefined
          ? overrideFields.reminderTime
          : (reminderTimeRef.current ?? reminderTime);
      const imageVal =
        overrideFields.imageUri !== undefined
          ? overrideFields.imageUri
          : (imageUriRef.current ?? imageUri);
      const typeVal =
        overrideFields.type !== undefined
          ? overrideFields.type
          : (noteTypeRef.current ?? noteType);
      const colorVal =
        overrideFields.color !== undefined ? overrideFields.color : (colorRef.current ?? color);
      const pinnedVal =
        overrideFields.isPinned !== undefined ? overrideFields.isPinned : (isPinnedRef.current ?? isPinned);
      const archivedVal =
        overrideFields.isArchived !== undefined ? overrideFields.isArchived : (isArchivedRef.current ?? isArchived);
      const labelsVal =
        overrideFields.labels !== undefined ? overrideFields.labels : (labelsRef.current ?? labels);

      // Don't save empty notes that have never had any content
      const hasContent =
        titleVal.trim().length > 0 ||
        contentVal.trim().length > 0 ||
        checklistVal.some((i) => i.text.trim().length > 0) ||
        Boolean(reminderVal) ||
        Boolean(imageVal);

      if (!hasContent && !note) {
        return null;
      }

      const noteToSave: Partial<KeepNote> = {
        id: activeId,
        title: titleVal,
        content: contentVal,
        type:
          overrideFields.type !== undefined
            ? overrideFields.type
            : typeVal === 'checklist'
              ? 'checklist'
              : 'text',
        color: colorVal,
        isPinned: pinnedVal,
        isArchived: archivedVal,
        reminderTime: reminderVal,
        labels: labelsVal,
        checklistData: checklistVal,
        imageUri: imageVal,
      };

      try {
        let saved: KeepNote | null = null;
        const exists = await keepNoteRepository.findById(activeId);
        if (exists) {
          saved = await keepNoteRepository.update(activeId, noteToSave);
        } else {
          saved = await keepNoteRepository.create(noteToSave);
        }
        if (saved) {
          setLastEditedTime(saved.updatedAt);
          if (saved.reminderTime) {
            await notificationService.scheduleNoteReminder(saved);
          } else {
            await notificationService.cancelNoteReminder(saved.id);
          }
          onNoteSaved(saved);
          return saved;
        }
        return null;
      } catch (err: any) {
        console.error('Failed to auto-save note:', err);
        return null;
      }
    },
    [
      noteId,
      title,
      content,
      noteType,
      color,
      isPinned,
      isArchived,
      reminderTime,
      labels,
      checklistItems,
      imageUri,
      note,
      onNoteSaved,
    ]
  );

  const triggerDebouncedAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      persistNote();
    }, 400);
  }, [persistNote]);

  // Clean exit with auto-save
  const handleExitAndSave = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await persistNote();
    onClose();
  };

  // Toggle Checkboxes Mode
  const handleToggleCheckboxes = () => {
    if (noteType === 'checklist') {
      // Convert checklists back to plain text
      const convertedText = checklistItems
        .map((i) => (i.text.trim() ? (i.completed ? `✓ ${i.text}` : `• ${i.text}`) : ''))
        .filter(Boolean)
        .join('\n');
      contentRef.current = convertedText;
      noteTypeRef.current = 'text';
      setNoteType('text');
      setContent(convertedText);
      persistNote({ type: 'text', content: convertedText });
    } else {
      // Convert text to checklist items
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const items: ChecklistItem[] =
        lines.length > 0
          ? lines.map((line, idx) => ({
              id: `item_${Date.now()}_${idx}`,
              text: line.replace(/^[•\-*✓]\s*/, '').trim(),
              completed: line.startsWith('✓'),
            }))
          : [{ id: `item_${Date.now()}_1`, text: '', completed: false }];
      checklistItemsRef.current = items;
      noteTypeRef.current = 'checklist';
      setNoteType('checklist');
      setChecklistItems(items);
      persistNote({ type: 'checklist', checklistData: items });
    }
  };

  // Checklist item interactions
  const handleUpdateCheckItem = (id: string, text: string) => {
    const updated = checklistItems.map((item) => (item.id === id ? { ...item, text } : item));
    checklistItemsRef.current = updated;
    setChecklistItems(updated);
    triggerDebouncedAutoSave();
  };

  const handleToggleItemComplete = (id: string) => {
    const updated = checklistItems.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    checklistItemsRef.current = updated;
    setChecklistItems(updated);
    persistNote({ checklistData: updated });
  };

  const handleAddCheckItemAfter = (currentId: string) => {
    const newId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const idx = checklistItems.findIndex((i) => i.id === currentId);
    const updated = [...checklistItems];
    updated.splice(idx + 1, 0, { id: newId, text: '', completed: false });
    setChecklistItems(updated);
    setTimeout(() => {
      inputRefs.current[newId]?.focus();
    }, 50);
  };

  const handleDeleteCheckItem = (id: string) => {
    const updated = checklistItems.filter((item) => item.id !== id);
    setChecklistItems(updated);
    persistNote({ checklistData: updated });
  };

  // Reorder checklist item up or down
  const handleMoveCheckItem = (id: string, direction: 'up' | 'down') => {
    const uncompleted = checklistItems.filter((i) => !i.completed);
    const uncompletedIdx = uncompleted.findIndex((i) => i.id === id);
    if (uncompletedIdx === -1) return;
    const targetIdx = direction === 'up' ? uncompletedIdx - 1 : uncompletedIdx + 1;
    if (targetIdx < 0 || targetIdx >= uncompleted.length) return;

    const targetItem = uncompleted[targetIdx];
    const fromIndex = checklistItems.findIndex((i) => i.id === id);
    const toIndex = checklistItems.findIndex((i) => i.id === targetItem.id);

    const updated = [...checklistItems];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setChecklistItems(updated);
    persistNote({ checklistData: updated });
  };


  // Add / Remove Image Attachment
  const handlePromptAddImage = () => {
    setCustomImageUrl(imageUri || '');
    setShowImageModal(true);
  };

  const handleAttachCustomImage = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('Image URL Required', 'Please enter a valid image URL.');
      return;
    }
    setImageUri(trimmed);
    persistNote({ imageUri: trimmed });
    setShowImageModal(false);
  };

  const handleDeleteImage = () => {
    setImageUri(undefined);
    persistNote({ imageUri: undefined });
  };

  // Pin toggle
  const handleTogglePin = () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    persistNote({ isPinned: nextPinned });
  };

  // Archive toggle
  const handleToggleArchive = () => {
    const nextArchived = !isArchived;
    setIsArchived(nextArchived);
    persistNote({ isArchived: nextArchived, isPinned: false });
    onClose();
  };

  // Delete note
  const handleDelete = async () => {
    Alert.alert('Move to Trash?', 'This note will be moved to the trash.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash',
        style: 'destructive',
        onPress: async () => {
          if (noteId) {
            await notificationService.cancelNoteReminder(noteId);
            await keepNoteRepository.moveToTrash(noteId);
            if (onNoteDeleted) onNoteDeleted(noteId);
          }
          onClose();
        },
      },
    ]);
  };

  // Duplicate note
  const handleDuplicate = async () => {
    if (noteId) {
      const dup = await keepNoteRepository.duplicate(noteId);
      if (dup) {
        onNoteSaved(dup);
        Alert.alert('Note Duplicated', 'A copy of this note has been created.');
      }
    }
    setShowMoreMenu(false);
  };

  // Share note
  const handleShare = async () => {
    let shareText = title ? `${title}\n\n` : '';
    if (noteType === 'checklist') {
      shareText += checklistItems.map((i) => (i.completed ? `[x] ${i.text}` : `[ ] ${i.text}`)).join('\n');
    } else {
      shareText += content;
    }
    try {
      await Share.share({ message: shareText });
    } catch {}
    setShowMoreMenu(false);
  };

  const colorDef = KEEP_COLORS[color] || KEEP_COLORS.default;
  const editorBg = isDark ? colorDef.darkBg : colorDef.lightBg;

  const uncheckedItems = checklistItems.filter((i) => !i.completed);
  const completedItems = checklistItems.filter((i) => i.completed);

  const formattedEditedTime =
    lastEditedTime && isValid(parseISO(lastEditedTime))
      ? format(parseISO(lastEditedTime), 'MMM d, h:mm a')
      : 'Just now';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleExitAndSave}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: editorBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Keep Navigation Bar */}
        <View
          style={[
            styles.topBar,
            {
              paddingTop: insets.top + 8,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            },
          ]}
        >
          <View style={{ width: 1 }} />

          <View style={styles.topRightActions}>
            {/* Explicit Save & Exit Button */}
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: `${colors.primary}25`, borderColor: colors.primary, borderWidth: 1 }]}
              onPress={handleExitAndSave}
              accessibilityRole="button"
              accessibilityLabel="Save and close note"
            >
              <Text style={[styles.topIconText, { color: colors.primary, fontWeight: '700' }]}>✓</Text>
            </TouchableOpacity>

            {/* Pin Toggle */}
            <TouchableOpacity
              style={[styles.iconBtn, isPinned && styles.activeIconBtn]}
              onPress={handleTogglePin}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Unpin note' : 'Pin note'}
            >
              <Text style={styles.topIconText}>{isPinned ? '📌' : '📍'}</Text>
            </TouchableOpacity>

            {/* Reminder Toggle */}
            <TouchableOpacity
              style={[styles.iconBtn, Boolean(reminderTime) && styles.activeIconBtn]}
              onPress={() => setShowReminderModal(true)}
              accessibilityRole="button"
              accessibilityLabel={reminderTime ? 'Edit reminder' : 'Set reminder'}
            >
              <Text style={styles.topIconText}>⏰</Text>
            </TouchableOpacity>

            {/* Archive Toggle */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleToggleArchive}
              accessibilityRole="button"
              accessibilityLabel={isArchived ? 'Unarchive note' : 'Archive note'}
            >
              <Text style={styles.topIconText}>{isArchived ? '📤' : '📥'}</Text>
            </TouchableOpacity>

            {/* More Menu */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setShowMoreMenu(!showMoreMenu)}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Text style={[styles.topIconText, { color: colors.text }]}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dropdown More Menu */}
        {showMoreMenu && (
          <View style={[styles.dropdownMenu, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleDuplicate}
              accessibilityRole="button"
              accessibilityLabel="Make a copy"
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>📄 Make a copy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share note"
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>↗️ Send / Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>🗑️ Delete note</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Note Editor Body Scroll */}
        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Active Reminder Badge */}
          {reminderTime && isValid(parseISO(reminderTime)) && (
            <View style={styles.reminderBadgeRow}>
              <TouchableOpacity
                style={[
                  styles.reminderBadge,
                  {
                    backgroundColor: isDark ? 'rgba(255, 107, 0, 0.2)' : '#FFF7ED',
                    borderColor: isDark ? 'rgba(255, 107, 0, 0.4)' : '#FED7AA',
                  },
                ]}
                onPress={() => setShowReminderModal(true)}
                accessibilityRole="button"
                accessibilityLabel={`Reminder set for ${format(
                  parseISO(reminderTime),
                  'MMM d, h:mm a'
                )}. Tap to edit.`}
              >
                <Text style={styles.reminderBadgeIcon}>⏰</Text>
                <Text style={[styles.reminderBadgeText, { color: colors.primary }]}>
                  {format(parseISO(reminderTime), 'MMM d, h:mm a')}
                </Text>
                <TouchableOpacity
                  style={styles.clearReminderBtn}
                  onPress={() => {
                    setReminderTime(undefined);
                    persistNote({ reminderTime: undefined });
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove reminder"
                >
                  <Text style={[styles.clearReminderIcon, { color: colors.primary }]}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          )}

          {/* Labels Chips */}
          {labels.length > 0 && (
            <View style={styles.labelChipsRow}>
              {labels.map((lbl) => (
                <TouchableOpacity
                  key={lbl}
                  style={[
                    styles.labelChip,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                    },
                  ]}
                  onPress={() => setShowLabelModal(true)}
                >
                  <Text style={[styles.labelChipText, { color: colors.textSecondary }]}>
                    #{lbl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Image Attachment Banner (if present) */}
          {Boolean(imageUri) && (
            <View style={styles.imageAttachmentCard}>
              <Image source={{ uri: imageUri }} style={styles.attachedImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.deleteAttachmentBtn}
                onPress={handleDeleteImage}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Remove image attachment"
              >
                <Text style={styles.deleteAttachmentText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}


          {/* Title Input */}
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={(txt) => {
              titleRef.current = txt;
              setTitle(txt);
              triggerDebouncedAutoSave();
            }}
            multiline
          />

          {/* Checklist Mode */}
          {noteType === 'checklist' ? (
            <View style={styles.checklistSection}>
              {/* Uncompleted Items */}
              {uncheckedItems.map((item, idx) => (
                <View key={item.id} style={styles.checklistRow}>
                  {/* Up / Down Reorder Controls */}
                  <View style={styles.reorderControls}>
                    <TouchableOpacity
                      disabled={idx === 0}
                      onPress={() => handleMoveCheckItem(item.id, 'up')}
                      style={[styles.reorderBtn, idx === 0 && { opacity: 0.2 }]}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.reorderIcon, { color: colors.textMuted }]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={idx === uncheckedItems.length - 1}
                      onPress={() => handleMoveCheckItem(item.id, 'down')}
                      style={[styles.reorderBtn, idx === uncheckedItems.length - 1 && { opacity: 0.2 }]}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={[styles.reorderIcon, { color: colors.textMuted }]}>▼</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.checkToggle,
                      { borderColor: colors.textMuted },
                    ]}
                    onPress={() => handleToggleItemComplete(item.id)}
                  >
                    <View />
                  </TouchableOpacity>
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[item.id] = ref;
                    }}
                    style={[styles.checkTextInput, { color: colors.text }]}
                    placeholder="List item"
                    placeholderTextColor={colors.textMuted}
                    value={item.text}
                    onChangeText={(txt) => handleUpdateCheckItem(item.id, txt)}
                    returnKeyType="next"
                    onSubmitEditing={() => handleAddCheckItemAfter(item.id)}
                  />
                  <TouchableOpacity
                    style={styles.deleteItemBtn}
                    onPress={() => handleDeleteCheckItem(item.id)}
                  >
                    <Text style={[styles.deleteItemIcon, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add New Item Button */}
              <TouchableOpacity
                style={styles.addCheckItemRow}
                onPress={() => {
                  const newId = `item_${Date.now()}`;
                  const updated = [
                    ...checklistItems,
                    { id: newId, text: '', completed: false },
                  ];
                  setChecklistItems(updated);
                  setTimeout(() => inputRefs.current[newId]?.focus(), 50);
                }}
              >
                <Text style={[styles.addPlus, { color: colors.textMuted }]}>+</Text>
                <Text style={[styles.addText, { color: colors.textMuted }]}>List item</Text>
              </TouchableOpacity>

              {/* Completed Items Drawer */}
              {completedItems.length > 0 && (
                <View style={styles.completedDrawer}>
                  <TouchableOpacity
                    style={styles.completedHeader}
                    onPress={() => setShowCompletedItems(!showCompletedItems)}
                  >
                    <Text style={[styles.drawerChevron, { color: colors.textMuted }]}>
                      {showCompletedItems ? '▼' : '▶'}
                    </Text>
                    <Text style={[styles.completedHeaderTitle, { color: colors.textMuted }]}>
                      {completedItems.length} completed items
                    </Text>
                  </TouchableOpacity>

                  {showCompletedItems &&
                    completedItems.map((item) => (
                      <View key={item.id} style={styles.checklistRow}>
                        <TouchableOpacity
                          style={[
                            styles.checkToggle,
                            {
                              borderColor: colors.primary,
                              backgroundColor: colors.primary,
                            },
                          ]}
                          onPress={() => handleToggleItemComplete(item.id)}
                        >
                          <Text style={styles.checkedMark}>✓</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={[
                            styles.checkTextInput,
                            {
                              color: colors.textMuted,
                              textDecorationLine: 'line-through',
                            },
                          ]}
                          value={item.text}
                          onChangeText={(txt) => handleUpdateCheckItem(item.id, txt)}
                        />
                        <TouchableOpacity
                          style={styles.deleteItemBtn}
                          onPress={() => handleDeleteCheckItem(item.id)}
                        >
                          <Text style={[styles.deleteItemIcon, { color: colors.textMuted }]}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                </View>
              )}
            </View>
          ) : (
            /* Plain Text Mode */
            <TextInput
              style={[styles.contentInput, { color: colors.text }]}
              placeholder="Note"
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={(txt) => {
                contentRef.current = txt;
                setContent(txt);
                triggerDebouncedAutoSave();
              }}
              multiline
              textAlignVertical="top"
            />
          )}
        </ScrollView>

        {/* Color Palette Bottom Sheet (if toggled) */}
        {showColorPicker && (
          <View
            style={[
              styles.colorPickerContainer,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderTopColor: colors.borderSubtle,
              },
            ]}
          >
            <KeepColorPicker
              selectedColor={color}
              onSelectColor={(col) => {
                setColor(col);
                persistNote({ color: col });
              }}
            />
          </View>
        )}

        {/* Bottom Keep Action Bar */}
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: Math.max(insets.bottom, 10),
              borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            },
          ]}
        >
          <View style={styles.bottomIconGroup}>
            {/* Toggle Checkboxes */}
            <TouchableOpacity
              style={[styles.bottomIconBtn, noteType === 'checklist' && styles.bottomIconBtnActive]}
              onPress={handleToggleCheckboxes}
              accessibilityRole="button"
              accessibilityLabel="Toggle checklists"
            >
              <Text style={styles.bottomIconText}>☑️</Text>
            </TouchableOpacity>

            {/* Toggle Color Palette */}
            <TouchableOpacity
              style={[styles.bottomIconBtn, showColorPicker && styles.bottomIconBtnActive]}
              onPress={() => setShowColorPicker(!showColorPicker)}
              accessibilityRole="button"
              accessibilityLabel="Change note background color"
            >
              <Text style={styles.bottomIconText}>🎨</Text>
            </TouchableOpacity>


            {/* Add Image Button */}
            <TouchableOpacity
              style={[styles.bottomIconBtn, Boolean(imageUri) && styles.bottomIconBtnActive]}
              onPress={handlePromptAddImage}
              accessibilityRole="button"
              accessibilityLabel="Attach image"
            >
              <Text style={styles.bottomIconText}>🖼️</Text>
            </TouchableOpacity>

            {/* Add Label */}
            <TouchableOpacity
              style={styles.bottomIconBtn}
              onPress={() => setShowLabelModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Add labels"
            >
              <Text style={styles.bottomIconText}>🏷️</Text>
            </TouchableOpacity>
          </View>

          {/* Edited Timestamp */}
          <Text style={[styles.editedTimeText, { color: colors.textMuted }]}>
            Edited {formattedEditedTime}
          </Text>
        </View>

        {/* Modals */}
        <KeepLabelModal
          visible={showLabelModal}
          selectedLabels={labels}
          allAvailableLabels={allAvailableLabels}
          onClose={() => setShowLabelModal(false)}
          onApplyLabels={(newLabels) => {
            setLabels(newLabels);
            persistNote({ labels: newLabels });
          }}
          onDeleteLabel={async (lbl) => {
            await keepNoteRepository.deleteLabel(lbl);
          }}
          onRenameLabel={async (oldLbl, newLbl) => {
            await keepNoteRepository.renameLabel(oldLbl, newLbl);
          }}
        />

        <KeepReminderModal
          visible={showReminderModal}
          currentReminderTime={reminderTime}
          onClose={() => setShowReminderModal(false)}
          onSetReminder={(newIso) => {
            setReminderTime(newIso);
            persistNote({ reminderTime: newIso });
          }}
        />


        {/* Custom Image Attachment Modal */}
        <Modal
          visible={showImageModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowImageModal(false)}
        >
          <View style={styles.imageModalBackdrop}>
            <View style={[styles.imageModalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.imageModalTitle, { color: colors.text }]}>Attach Note Image</Text>
              <Text style={[styles.imageModalSubtitle, { color: colors.textSecondary }]}>
                Enter an image URL or choose a visual wallpaper:
              </Text>
              <TextInput
                style={[
                  styles.imageModalInput,
                  {
                    color: colors.text,
                    borderColor: colors.borderSubtle,
                    backgroundColor: colors.surfaceElevated,
                  },
                ]}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor={colors.textMuted}
                value={customImageUrl}
                onChangeText={setCustomImageUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.presetButtonsRow}>
                <TouchableOpacity
                  style={[styles.presetBtn, { borderColor: colors.borderSubtle }]}
                  onPress={() =>
                    setCustomImageUrl(
                      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80'
                    )
                  }
                >
                  <Text style={[styles.presetBtnText, { color: colors.text }]}>Gradient</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.presetBtn, { borderColor: colors.borderSubtle }]}
                  onPress={() =>
                    setCustomImageUrl(
                      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80'
                    )
                  }
                >
                  <Text style={[styles.presetBtnText, { color: colors.text }]}>Landscape</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.presetBtn, { borderColor: colors.borderSubtle }]}
                  onPress={() =>
                    setCustomImageUrl(
                      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80'
                    )
                  }
                >
                  <Text style={[styles.presetBtnText, { color: colors.text }]}>Workspace</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.imageModalActionsRow}>
                <TouchableOpacity
                  style={[styles.imageModalActionBtn, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => setShowImageModal(false)}
                >
                  <Text style={[styles.imageModalActionBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.imageModalActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleAttachCustomImage(customImageUrl)}
                >
                  <Text style={[styles.imageModalActionBtnText, { color: '#FFF' }]}>Attach Image</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 8,
  },
  backArrow: {
    fontSize: 22,
    fontWeight: '700',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  activeIconBtn: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  topIconText: {
    fontSize: 18,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 50,
    right: 16,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
    minWidth: 160,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
  },
  labelChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  labelChip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  titleInput: {
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 14,
    padding: 0,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 180,
    padding: 0,
  },
  checklistSection: {
    marginTop: 4,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  checkToggle: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  checkTextInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  deleteItemBtn: {
    padding: 6,
  },
  deleteItemIcon: {
    fontSize: 14,
  },
  addCheckItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  addPlus: {
    fontSize: 20,
    marginLeft: 3,
  },
  addText: {
    fontSize: 15,
    marginLeft: 3,
  },
  completedDrawer: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.25)',
    paddingTop: 12,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  drawerChevron: {
    fontSize: 12,
  },
  completedHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  colorPickerContainer: {
    borderTopWidth: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bottomIconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  bottomIconBtnActive: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  bottomIconText: {
    fontSize: 18,
  },
  editedTimeText: {
    fontSize: 11,
    fontWeight: '500',
    paddingRight: 6,
  },
  reminderBadgeRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  reminderBadgeIcon: {
    fontSize: 12,
  },
  reminderBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  clearReminderBtn: {
    paddingLeft: 4,
  },
  clearReminderIcon: {
    fontSize: 11,
    fontWeight: '800',
  },
  imageAttachmentCard: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },
  attachedImage: {
    width: '100%',
    height: '100%',
  },
  deleteAttachmentBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAttachmentText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  reorderControls: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    gap: 2,
  },
  reorderBtn: {
    padding: 2,
  },
  reorderIcon: {
    fontSize: 9,
    fontWeight: '800',
  },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  imageModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  imageModalSubtitle: {
    fontSize: 13,
    marginBottom: 14,
  },
  imageModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  presetBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  imageModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  imageModalActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  imageModalActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
