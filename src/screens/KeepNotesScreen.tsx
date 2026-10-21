import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  BackHandler,
  RefreshControl,
  Keyboard,
  Modal,
  Vibration,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { KeepNote, KeepColorKey } from '../types';
import { useAppTheme } from '../hooks/useTheme';
import { keepNoteRepository } from '../database/repositories/KeepNoteRepository';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { KeepNoteCard } from '../components/notes/KeepNoteCard';
import { KeepEditorModal } from '../components/notes/KeepEditorModal';
import { KeepColorPicker } from '../components/notes/KeepColorPicker';
import { KeepLabelModal } from '../components/notes/KeepLabelModal';

type KeepFilterTab = 'all' | 'reminders' | 'checklists' | 'archived' | 'trash';

// Content-weighted height estimation for optimal Masonry waterfall balance
const estimateNoteHeight = (note: KeepNote): number => {
  if (!note) return 40;
  let h = 40;
  if (note.title) h += 26;
  if (note.type === 'checklist' && note.checklistData) {
    h += Math.min(note.checklistData.length, 5) * 24;
  } else if (note.content) {
    h += Math.min(note.content.split('\n').length * 20, 140);
  }
  if (note.labels && note.labels.length > 0) h += 26;
  if (note.reminderTime) h += 26;
  return h;
};

// Split cards into 2 columns for balanced Masonry layout
const buildMasonryColumns = (items: KeepNote[]): { left: KeepNote[]; right: KeepNote[] } => {
  if (!items || !Array.isArray(items)) return { left: [], right: [] };
  const left: KeepNote[] = [];
  const right: KeepNote[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  items.forEach((item) => {
    const h = estimateNoteHeight(item);
    if (leftHeight <= rightHeight) {
      left.push(item);
      leftHeight += h;
    } else {
      right.push(item);
      rightHeight += h;
    }
  });
  return { left, right };
};

export const KeepNotesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const scrollViewRef = useRef<any>(null);

  // Notes data states
  const [notes, setNotes] = useState<KeepNote[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<KeepFilterTab>('all');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<KeepColorKey | null>(null);
  const [showColorFilterPicker, setShowColorFilterPicker] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState<boolean>(false);

  // Layout & View Mode (Grid vs List) - Persisted in settings
  const [isGridView, setIsGridView] = useState<boolean>(true);

  // Multi-Selection State
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [showBatchColorPicker, setShowBatchColorPicker] = useState<boolean>(false);
  const [showBatchLabelModal, setShowBatchLabelModal] = useState<boolean>(false);
  const [showManageLabelsModal, setShowManageLabelsModal] = useState<boolean>(false);

  // Transient Undo Snackbar
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    onUndo: () => Promise<void>;
  } | null>(null);
  const snackbarTimerRef = useRef<any>(null);

  // Note Editor Modal State
  const [editingNote, setEditingNote] = useState<KeepNote | null>(null);
  const [editorInitialType, setEditorInitialType] = useState<'text' | 'checklist'>('text');
  const [isEditorVisible, setIsEditorVisible] = useState<boolean>(false);

  // Load persisted view mode from SQLite settings
  useEffect(() => {
    settingsRepository.get('keep_notes_view_mode', 'grid').then((mode) => {
      setIsGridView(mode !== 'list');
    });
  }, []);

  // Debounce search query changes to prevent query flooding
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Instantly clear search bypassing debounce delay
  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  // Reset scroll to top when changing category tabs or filters
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeTab, selectedLabel, selectedColor]);

  // Show transient bottom undo snackbar
  const showSnackbar = (message: string, onUndo: () => Promise<void>) => {
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }
    setSnackbar({ visible: true, message, onUndo });
    snackbarTimerRef.current = setTimeout(() => {
      setSnackbar(null);
    }, 4500);
  };

  // Keyboard visibility listener to tuck away bottom floating dock
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load notes from SQLite
  const loadNotes = useCallback(async () => {
    try {
      // Auto-prune old trash notes older than 30 days regularly
      await keepNoteRepository.cleanupOldTrash(30);

      let statusParam: 'active' | 'archived' | 'trash' | 'reminders' = 'active';
      if (activeTab === 'archived') statusParam = 'archived';
      else if (activeTab === 'trash') statusParam = 'trash';
      else if (activeTab === 'reminders') statusParam = 'reminders';

      const data = await keepNoteRepository.findAll({
        status: statusParam,
        search: debouncedSearchQuery,
        label: selectedLabel || undefined,
        color: selectedColor || undefined,
      });

      // Filter by type if checklist selected (consistent with both type and data)
      let filtered = data;
      if (activeTab === 'checklists') {
        filtered = data.filter(
          (n) => n.type === 'checklist' || (n.checklistData && n.checklistData.length > 0)
        );
      }

      setNotes(filtered);

      const allLabels = await keepNoteRepository.getAllLabels();
      setLabels(allLabels);
    } catch (err) {
      console.warn('Failed to load Google Keep notes:', err);
    }
  }, [activeTab, debouncedSearchQuery, selectedLabel, selectedColor]);

  // Reload when screen regains focus or tab/search changes
  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [loadNotes])
  );

  // Handle pull to refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNotes();
    setIsRefreshing(false);
  };

  // Handle Android hardware back press when in multi-selection mode
  useEffect(() => {
    if (!isSelectionMode) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitSelection();
      return true;
    });
    return () => backHandler.remove();
  }, [isSelectionMode]);

  // Card interaction: Tap opens editor (or read-only details if in Trash)
  const handleCardPress = (note: KeepNote) => {
    if (isSelectionMode) {
      toggleSelectNote(note.id);
    } else if (activeTab === 'trash' || note.isTrashed) {
      const preview = note.content
        ? `\n\n"${note.content.slice(0, 150)}${note.content.length > 150 ? '...' : ''}"`
        : '';
      Alert.alert(
        note.title || 'Trashed Note',
        `Notes in Trash are deleted after 30 days.${preview}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Forever',
            style: 'destructive',
            onPress: async () => {
              await keepNoteRepository.deletePermanently(note.id);
              loadNotes();
            },
          },
          {
            text: 'Restore',
            onPress: async () => {
              await keepNoteRepository.restoreFromTrash(note.id);
              loadNotes();
              showSnackbar('Note restored', async () => {
                await keepNoteRepository.moveToTrash(note.id);
                loadNotes();
              });
            },
          },
        ]
      );
    } else {
      setEditingNote(note);
      setEditorInitialType(note.type === 'checklist' ? 'checklist' : 'text');
      setIsEditorVisible(true);
    }
  };

  // Card interaction: Toggle checklist item directly from feed without jump glitch
  const handleToggleCheckItem = async (noteId: string, itemId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note || !note.checklistData) return;
    const updatedChecklist = note.checklistData.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    // Optimistic in-place update prevents card from re-sorting and jumping to top
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, checklistData: updatedChecklist } : n))
    );
    await keepNoteRepository.update(noteId, { checklistData: updatedChecklist });
  };

  // Card interaction: Long press triggers multi-select with haptic vibration
  const handleCardLongPress = (note: KeepNote) => {
    Vibration.vibrate(35);
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedNoteIds([note.id]);
    } else {
      toggleSelectNote(note.id);
    }
  };

  const toggleSelectNote = (id: string) => {
    if (selectedNoteIds.includes(id)) {
      const remaining = selectedNoteIds.filter((item) => item !== id);
      if (remaining.length === 0) {
        setIsSelectionMode(false);
      }
      setSelectedNoteIds(remaining);
    } else {
      setSelectedNoteIds([...selectedNoteIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedNoteIds.length === notes.length) {
      setSelectedNoteIds([]);
      setIsSelectionMode(false);
    } else {
      setSelectedNoteIds(notes.map((n) => n.id));
    }
  };

  const handleExitSelection = () => {
    setIsSelectionMode(false);
    setSelectedNoteIds([]);
    setShowBatchColorPicker(false);
    setShowBatchLabelModal(false);
  };

  // Tab switching safely cleans up selection mode and clears stale label/color filters
  const handleSelectTab = (tabKey: KeepFilterTab) => {
    if (isSelectionMode) {
      handleExitSelection();
    }
    if (tabKey !== activeTab) {
      setSelectedLabel(null);
      setSelectedColor(null);
    }
    setActiveTab(tabKey);
  };

  // Batch Share selected notes
  const handleBatchShare = async () => {
    const selected = notes.filter((n) => selectedNoteIds.includes(n.id));
    if (selected.length === 0) return;
    const shareText = selected
      .map((n) => {
        let text = n.title ? `📌 ${n.title}\n` : '';
        if (n.type === 'checklist' && n.checklistData) {
          text += n.checklistData
            .map((i) => (i.completed ? `✓ ${i.text}` : `• ${i.text}`))
            .join('\n');
        } else {
          text += n.content;
        }
        return text;
      })
      .join('\n\n---\n\n');
    try {
      await Share.share({ message: shareText });
    } catch {}
  };

  // Batch Duplicate with Undo
  const handleBatchDuplicate = async () => {
    const targetIds = [...selectedNoteIds];
    const createdNotes: KeepNote[] = [];
    for (const id of targetIds) {
      const dup = await keepNoteRepository.duplicate(id);
      if (dup) createdNotes.push(dup);
    }
    handleExitSelection();
    loadNotes();
    showSnackbar(
      `${createdNotes.length} note${createdNotes.length > 1 ? 's' : ''} duplicated`,
      async () => {
        await Promise.all(createdNotes.map((n) => keepNoteRepository.deletePermanently(n.id)));
        loadNotes();
      }
    );
  };

  // Card toggle pin
  const handleTogglePin = async (id: string) => {
    await keepNoteRepository.togglePin(id);
    loadNotes();
  };

  // Batch Pin
  const handleBatchPin = async () => {
    const hasUnpinned = notes.some(
      (n) => selectedNoteIds.includes(n.id) && !n.isPinned
    );
    await keepNoteRepository.batchPin(selectedNoteIds, hasUnpinned);
    handleExitSelection();
    loadNotes();
  };

  // Batch Archive with Undo
  const handleBatchArchive = async () => {
    const isCurrentlyArchived = activeTab === 'archived';
    const targetIds = [...selectedNoteIds];
    await keepNoteRepository.batchArchive(targetIds, !isCurrentlyArchived);
    handleExitSelection();
    loadNotes();
    showSnackbar(
      `${targetIds.length} note${targetIds.length > 1 ? 's' : ''} ${isCurrentlyArchived ? 'unarchived' : 'archived'}`,
      async () => {
        await keepNoteRepository.batchArchive(targetIds, isCurrentlyArchived);
        loadNotes();
      }
    );
  };

  // Batch Restore from Trash with Undo
  const handleBatchRestore = async () => {
    const targetIds = [...selectedNoteIds];
    await Promise.all(targetIds.map((id) => keepNoteRepository.restoreFromTrash(id)));
    handleExitSelection();
    loadNotes();
    showSnackbar(
      `${targetIds.length} note${targetIds.length > 1 ? 's' : ''} restored`,
      async () => {
        await keepNoteRepository.batchTrash(targetIds);
        loadNotes();
      }
    );
  };

  // Batch Trash with Undo
  const handleBatchTrash = async () => {
    const targetIds = [...selectedNoteIds];
    if (activeTab === 'trash') {
      Alert.alert(
        'Delete forever?',
        `Permanently delete ${targetIds.length} notes? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Forever',
            style: 'destructive',
            onPress: async () => {
              await Promise.all(
                targetIds.map((id) => keepNoteRepository.deletePermanently(id))
              );
              handleExitSelection();
              loadNotes();
            },
          },
        ]
      );
    } else {
      await keepNoteRepository.batchTrash(targetIds);
      handleExitSelection();
      loadNotes();
      showSnackbar(
        `${targetIds.length} note${targetIds.length > 1 ? 's' : ''} moved to trash`,
        async () => {
          await Promise.all(targetIds.map((id) => keepNoteRepository.restoreFromTrash(id)));
          loadNotes();
        }
      );
    }
  };

  // Batch Color
  const handleBatchColor = async (color: KeepColorKey) => {
    await keepNoteRepository.batchColor(selectedNoteIds, color);
    setShowBatchColorPicker(false);
    handleExitSelection();
    loadNotes();
  };

  // Common labels among selected notes for batch label editing
  const batchSelectedLabels = useMemo(() => {
    if (selectedNoteIds.length === 0) return [];
    const selectedNotes = notes.filter((n) => selectedNoteIds.includes(n.id));
    return Array.from(new Set(selectedNotes.flatMap((n) => n.labels || [])));
  }, [selectedNoteIds, notes]);

  // Safe Empty Trash action (deletes only matching notes if search is applied)
  const handleEmptyTrash = () => {
    if (debouncedSearchQuery.trim()) {
      const matchingIds = notes.map((n) => n.id);
      Alert.alert(
        'Delete Matching Notes?',
        `Permanently delete the ${matchingIds.length} matching note(s) from Trash? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Matching',
            style: 'destructive',
            onPress: async () => {
              await Promise.all(
                matchingIds.map((id) => keepNoteRepository.deletePermanently(id))
              );
              loadNotes();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Empty Trash?',
        `All ${notes.length} items in Trash will be permanently deleted. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Empty Trash',
            style: 'destructive',
            onPress: async () => {
              await keepNoteRepository.emptyTrash();
              loadNotes();
            },
          },
        ]
      );
    }
  };

  const handleGoBack = useCallback(() => {
    if (isSelectionMode) {
      handleExitSelection();
      return;
    }
    if (searchQuery) {
      setSearchQuery('');
      return;
    }
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('WorkspaceSelect');
    }
  }, [isSelectionMode, handleExitSelection, searchQuery, navigation]);

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

  // Quick Create actions from bottom dock
  const handleStartNewNote = (type: 'text' | 'checklist') => {
    setEditingNote(null);
    setEditorInitialType(type);
    setIsEditorVisible(true);
  };

  // Toggle View Mode with SQLite persistence
  const handleToggleViewMode = async () => {
    const next = !isGridView;
    setIsGridView(next);
    await settingsRepository.set('keep_notes_view_mode', next ? 'grid' : 'list');
  };

  // Divide notes into Pinned and Others
  const { pinnedNotes, otherNotes } = useMemo(() => {
    if (activeTab === 'trash' || activeTab === 'archived') {
      return { pinnedNotes: [], otherNotes: notes };
    }
    const pinned: KeepNote[] = [];
    const others: KeepNote[] = [];
    notes.forEach((n) => {
      if (n.isPinned) pinned.push(n);
      else others.push(n);
    });
    return { pinnedNotes: pinned, otherNotes: others };
  }, [notes, activeTab]);

  const pinnedMasonry = useMemo(() => buildMasonryColumns(pinnedNotes), [pinnedNotes]);
  const othersMasonry = useMemo(() => buildMasonryColumns(otherNotes), [otherNotes]);

  // Tab definitions
  const tabs: { key: KeepFilterTab; label: string; icon: string }[] = [
    { key: 'all', label: 'Notes', icon: '💡' },
    { key: 'reminders', label: 'Reminders', icon: '⏰' },
    { key: 'checklists', label: 'Lists', icon: '☑️' },
    { key: 'archived', label: 'Archive', icon: '📥' },
    { key: 'trash', label: 'Trash', icon: '🗑️' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={colors.statusBar} />

      {/* TOP BAR / SELECTION HEADER */}
      {isSelectionMode ? (
        <View
          style={[
            styles.selectionHeader,
            {
              backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
              borderBottomColor: colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleExitSelection}
            style={styles.selHeaderBtn}
            accessibilityRole="button"
            accessibilityLabel="Exit selection mode"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.selCloseIcon, { color: colors.text }]}>✕</Text>
          </TouchableOpacity>

          <Text style={[styles.selCountText, { color: colors.text }]}>
            {selectedNoteIds.length} of {notes.length} selected
          </Text>

          <View style={styles.selActionGroup}>
            {activeTab === 'trash' ? (
              <>
                {/* Batch Restore from Trash */}
                <TouchableOpacity
                  onPress={handleBatchRestore}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Restore selected notes from trash"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>♻️</Text>
                </TouchableOpacity>

                {/* Batch Delete Forever */}
                <TouchableOpacity
                  onPress={handleBatchTrash}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Delete selected notes permanently"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>🗑️</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Batch Pin */}
                <TouchableOpacity
                  onPress={handleBatchPin}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle pin for selected notes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>📌</Text>
                </TouchableOpacity>

                {/* Batch Color */}
                <TouchableOpacity
                  onPress={() => setShowBatchColorPicker(!showBatchColorPicker)}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Change color for selected notes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>🎨</Text>
                </TouchableOpacity>

                {/* Batch Duplicate */}
                <TouchableOpacity
                  onPress={handleBatchDuplicate}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Duplicate selected notes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>⎘</Text>
                </TouchableOpacity>

                {/* Batch Share */}
                <TouchableOpacity
                  onPress={handleBatchShare}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Share selected notes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>↗️</Text>
                </TouchableOpacity>

                {/* Batch Label */}
                <TouchableOpacity
                  onPress={() => setShowBatchLabelModal(true)}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Add or edit labels on selected notes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>🏷️</Text>
                </TouchableOpacity>

                {/* Batch Archive */}
                <TouchableOpacity
                  onPress={handleBatchArchive}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeTab === 'archived'
                      ? 'Unarchive selected notes'
                      : 'Archive selected notes'
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>
                    {activeTab === 'archived' ? '📤' : '📥'}
                  </Text>
                </TouchableOpacity>

                {/* Batch Trash */}
                <TouchableOpacity
                  onPress={handleBatchTrash}
                  style={styles.selHeaderBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Move selected notes to trash"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.selActionIcon}>🗑️</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Select All */}
            <TouchableOpacity
              onPress={handleSelectAll}
              style={styles.selHeaderBtn}
              accessibilityRole="button"
              accessibilityLabel={
                notes.length > 0 && selectedNoteIds.length === notes.length
                  ? 'Deselect all notes'
                  : 'Select all notes'
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                style={[
                  styles.selActionIcon,
                  notes.length > 0 &&
                    selectedNoteIds.length === notes.length && {
                      color: colors.primary,
                      fontWeight: '700',
                    },
                ]}
              >
                {notes.length > 0 && selectedNoteIds.length === notes.length ? '☑' : '✓✓'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* GOOGLE KEEP PILL SEARCH BAR */
        <View style={styles.searchBarWrapper}>
          <View
            style={[
              styles.searchBarPill,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search your notes"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={handleClearSearch}
                style={styles.clearSearchBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear search text"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.clearSearchIcon, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleToggleViewMode}
              style={styles.viewToggleBtn}
              accessibilityRole="button"
              accessibilityLabel={
                isGridView ? 'Switch to single-column list view' : 'Switch to two-column grid view'
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.viewToggleIcon, { color: colors.textSecondary }]}>
                {isGridView ? '⊞' : '☰'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* BATCH COLOR PICKER POPUP (Modal overlay to avoid layout shift) */}
      {showBatchColorPicker && isSelectionMode && (
        <Modal
          visible={showBatchColorPicker && isSelectionMode}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBatchColorPicker(false)}
        >
          <TouchableOpacity
            style={styles.batchColorOverlay}
            activeOpacity={1}
            onPress={() => setShowBatchColorPicker(false)}
          >
            <View
              style={[
                styles.batchColorSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <KeepColorPicker selectedColor="default" onSelectColor={handleBatchColor} />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* BATCH LABEL MODAL (Lazy Mounted) */}
      {showBatchLabelModal && (
        <KeepLabelModal
          visible={showBatchLabelModal}
          selectedLabels={batchSelectedLabels}
          allAvailableLabels={labels}
          onClose={() => setShowBatchLabelModal(false)}
          onApplyLabels={async (appliedLabels) => {
            setShowBatchLabelModal(false);
            const added = appliedLabels.filter((l) => !batchSelectedLabels.includes(l));
            const removed = batchSelectedLabels.filter((l) => !appliedLabels.includes(l));
            await keepNoteRepository.batchDiffLabels(selectedNoteIds, added, removed);
            handleExitSelection();
            loadNotes();
          }}
          onDeleteLabel={async (lbl) => {
            await keepNoteRepository.deleteLabel(lbl);
            if (selectedLabel === lbl) setSelectedLabel(null);
            loadNotes();
          }}
          onRenameLabel={async (oldLbl, newLbl) => {
            await keepNoteRepository.renameLabel(oldLbl, newLbl);
            if (selectedLabel === oldLbl) setSelectedLabel(newLbl);
            loadNotes();
          }}
        />
      )}

      {/* MANAGE LABELS MODAL (Lazy Mounted) */}
      {showManageLabelsModal && (
        <KeepLabelModal
          visible={showManageLabelsModal}
          selectedLabels={[]}
          allAvailableLabels={labels}
          onClose={() => setShowManageLabelsModal(false)}
          onApplyLabels={async (appliedLabels) => {
            setShowManageLabelsModal(false);
            if (appliedLabels.length > 0) {
              await keepNoteRepository.saveAllCustomLabels(appliedLabels);
            }
            loadNotes();
          }}
          onDeleteLabel={async (lbl) => {
            await keepNoteRepository.deleteLabel(lbl);
            if (selectedLabel === lbl) setSelectedLabel(null);
            loadNotes();
          }}
          onRenameLabel={async (oldLbl, newLbl) => {
            await keepNoteRepository.renameLabel(oldLbl, newLbl);
            if (selectedLabel === oldLbl) setSelectedLabel(newLbl);
            loadNotes();
          }}
        />
      )}

      {/* COLOR FILTER PICKER MODAL (Lazy Mounted) */}
      {showColorFilterPicker && !isSelectionMode && (
        <Modal
          visible={showColorFilterPicker && !isSelectionMode}
          transparent
          animationType="fade"
          onRequestClose={() => setShowColorFilterPicker(false)}
        >
          <TouchableOpacity
            style={styles.batchColorOverlay}
            activeOpacity={1}
            onPress={() => setShowColorFilterPicker(false)}
          >
            <View
              style={[
                styles.batchColorSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.colorPickerModalHeader}>
                <Text style={[styles.colorPickerModalTitle, { color: colors.text }]}>
                  Filter by Color
                </Text>
                {selectedColor && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedColor(null);
                      setShowColorFilterPicker(false);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.clearFilterModalText, { color: colors.primary }]}>
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <KeepColorPicker
                selectedColor={selectedColor || 'default'}
                onSelectColor={(col) => {
                  setSelectedColor(col === selectedColor ? null : col);
                  setShowColorFilterPicker(false);
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* FILTER TABS & LABELS SCROLLBAR (Hidden during selection mode to prevent cross-tab leaks) */}
      {!isSelectionMode && (
        <View style={styles.tabScrollContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: isActive
                        ? colors.primary
                        : isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#F1F5F9',
                      borderColor: isActive ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => handleSelectTab(tab.key)}
                >
                  <Text style={styles.tabIcon}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: isActive ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Color Filter Chip */}
            <TouchableOpacity
              style={[
                styles.tabChip,
                {
                  backgroundColor: selectedColor
                    ? colors.primary
                    : isDark
                      ? 'rgba(255,255,255,0.06)'
                      : '#F1F5F9',
                  borderColor: selectedColor ? colors.primary : colors.borderSubtle,
                },
              ]}
              onPress={() => setShowColorFilterPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Filter notes by background color"
            >
              <Text style={styles.tabIcon}>🎨</Text>
              <Text
                style={[
                  styles.tabLabel,
                  { color: selectedColor ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {selectedColor ? `Color: ${selectedColor}` : 'Color'}
              </Text>
            </TouchableOpacity>

            {/* Custom Labels Chips */}
            {labels.map((lbl) => {
              const isLabelActive = selectedLabel === lbl;
              return (
                <TouchableOpacity
                  key={lbl}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: isLabelActive
                        ? colors.primary
                        : isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#F1F5F9',
                      borderColor: isLabelActive ? colors.primary : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    setSelectedLabel(isLabelActive ? null : lbl);
                  }}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: isLabelActive ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    #{lbl} {isLabelActive ? '✕' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Create/Manage Labels Quick Chip */}
            <TouchableOpacity
              style={[
                styles.tabChip,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                  borderColor: colors.borderSubtle,
                },
              ]}
              onPress={() => setShowManageLabelsModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Manage and create labels"
            >
              <Text style={styles.tabIcon}>🏷️</Text>
              <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>
                + Label
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ACTIVE COLOR FILTER BANNER */}
      {selectedColor && !isSelectionMode && (
        <View
          style={[
            styles.activeFilterBanner,
            {
              backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF',
              borderColor: isDark ? 'rgba(139, 92, 246, 0.3)' : '#DDD6FE',
            },
          ]}
        >
          <Text style={[styles.activeFilterText, { color: colors.text }]}>
            Filtered by Color: {selectedColor}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedColor(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.clearFilterText, { color: colors.primary }]}>✕ Clear Filter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ACTIVE LABEL FILTER BANNER */}
      {selectedLabel && !isSelectionMode && (
        <View
          style={[
            styles.activeFilterBanner,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
            },
          ]}
        >
          <Text style={[styles.activeFilterText, { color: colors.text }]}>
            Filtered by #{selectedLabel}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedLabel(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.clearFilterText, { color: colors.primary }]}>✕ Clear Filter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TRASH BAR NOTICE (if in Trash tab) */}
      {activeTab === 'trash' && notes.length > 0 && (
        <View
          style={[
            styles.trashNoticeBar,
            { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' },
          ]}
        >
          <Text style={[styles.trashNoticeText, { color: '#EF4444' }]}>
            Notes in Trash are deleted after 30 days.
          </Text>
          <TouchableOpacity onPress={handleEmptyTrash}>
            <Text style={styles.emptyTrashBtnText}>
              {debouncedSearchQuery.trim() ? 'Delete Matching' : 'Empty Trash'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MAIN NOTES FEED */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.feedScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.feedContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* EMPTY STATE (Interactive with direct action CTA) */}
        {notes.length === 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={activeTab === 'archived' || activeTab === 'trash' || Boolean(searchQuery)}
            onPress={() => {
              if (activeTab === 'checklists') handleStartNewNote('checklist');
              else handleStartNewNote('text');
            }}
            style={styles.emptyContainer}
          >
            <Text style={styles.emptyIcon}>
              {activeTab === 'archived'
                ? '📥'
                : activeTab === 'trash'
                  ? '🗑️'
                  : activeTab === 'reminders'
                    ? '⏰'
                    : '💡'}
            </Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeTab === 'archived'
                ? 'Your archive is empty'
                : activeTab === 'trash'
                  ? 'Trash is empty'
                  : activeTab === 'reminders'
                    ? 'No reminders'
                    : searchQuery
                      ? 'No matching notes'
                      : 'Capture your thoughts'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              {activeTab === 'archived'
                ? 'Archived notes will show up here.'
                : activeTab === 'trash'
                  ? 'Notes you delete will appear here.'
                  : activeTab === 'reminders'
                    ? 'Notes with upcoming reminders will appear here.'
                    : searchQuery
                      ? 'Try a different keyword or label.'
                      : 'Tap here or "+ Take a note" below to create notes.'}
            </Text>

            {!searchQuery && activeTab !== 'archived' && activeTab !== 'trash' && (
              <View style={[styles.emptyCtaBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.emptyCtaText}>
                  {activeTab === 'checklists'
                    ? '+ New Checklist'
                    : activeTab === 'reminders'
                      ? '+ Note with Reminder'
                      : '+ Create Note'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* PINNED SECTION */}
        {pinnedNotes.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>PINNED</Text>

            {isGridView ? (
              /* 2-Column Masonry Waterfall */
              <View style={styles.masonryRow}>
                <View style={styles.masonryCol}>
                  {pinnedMasonry.left.map((item) => (
                    <KeepNoteCard
                      key={item.id}
                      note={item}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedNoteIds.includes(item.id)}
                      onPress={handleCardPress}
                      onLongPress={handleCardLongPress}
                      onTogglePin={handleTogglePin}
                      onToggleCheckItem={handleToggleCheckItem}
                    />
                  ))}
                </View>
                <View style={styles.masonryCol}>
                  {pinnedMasonry.right.map((item) => (
                    <KeepNoteCard
                      key={item.id}
                      note={item}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedNoteIds.includes(item.id)}
                      onPress={handleCardPress}
                      onLongPress={handleCardLongPress}
                      onTogglePin={handleTogglePin}
                      onToggleCheckItem={handleToggleCheckItem}
                    />
                  ))}
                </View>
              </View>
            ) : (
              /* Single-Column List View */
              <View style={styles.listCol}>
                {pinnedNotes.map((item) => (
                  <KeepNoteCard
                    key={item.id}
                    note={item}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedNoteIds.includes(item.id)}
                    onPress={handleCardPress}
                    onLongPress={handleCardLongPress}
                    onTogglePin={handleTogglePin}
                    onToggleCheckItem={handleToggleCheckItem}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* OTHERS SECTION */}
        {otherNotes.length > 0 && (
          <View style={styles.sectionContainer}>
            {pinnedNotes.length > 0 && (
              <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>OTHERS</Text>
            )}

            {isGridView ? (
              /* 2-Column Masonry Waterfall */
              <View style={styles.masonryRow}>
                <View style={styles.masonryCol}>
                  {othersMasonry.left.map((item) => (
                    <KeepNoteCard
                      key={item.id}
                      note={item}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedNoteIds.includes(item.id)}
                      onPress={handleCardPress}
                      onLongPress={handleCardLongPress}
                      onTogglePin={handleTogglePin}
                      onToggleCheckItem={handleToggleCheckItem}
                    />
                  ))}
                </View>
                <View style={styles.masonryCol}>
                  {othersMasonry.right.map((item) => (
                    <KeepNoteCard
                      key={item.id}
                      note={item}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedNoteIds.includes(item.id)}
                      onPress={handleCardPress}
                      onLongPress={handleCardLongPress}
                      onTogglePin={handleTogglePin}
                      onToggleCheckItem={handleToggleCheckItem}
                    />
                  ))}
                </View>
              </View>
            ) : (
              /* Single-Column List View */
              <View style={styles.listCol}>
                {otherNotes.map((item) => (
                  <KeepNoteCard
                    key={item.id}
                    note={item}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedNoteIds.includes(item.id)}
                    onPress={handleCardPress}
                    onLongPress={handleCardLongPress}
                    onTogglePin={handleTogglePin}
                    onToggleCheckItem={handleToggleCheckItem}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* FLOATING BOTTOM QUICK ACTION DOCK (Google Keep Mobile Style) */}
      {!isSelectionMode && activeTab !== 'trash' && !isKeyboardVisible && (
        <View
          style={[
            styles.bottomDockWrapper,
            { bottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <View
            style={[
              styles.bottomDock,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            {/* "Take a note..." pill action */}
            <TouchableOpacity
              style={styles.takeNotePill}
              onPress={() => handleStartNewNote('text')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Take a note"
            >
              <Text style={[styles.takeNoteText, { color: colors.textMuted }]}>
                Take a note...
              </Text>
            </TouchableOpacity>

            {/* Quick Action Icons */}
            <View style={styles.dockIcons}>
              {/* Checklist */}
              <TouchableOpacity
                style={styles.dockIconBtn}
                onPress={() => handleStartNewNote('checklist')}
                accessibilityRole="button"
                accessibilityLabel="New checklist note"
              >
                <Text style={styles.dockIconText}>☑️</Text>
              </TouchableOpacity>


            </View>
          </View>
        </View>
      )}

      {/* FULL-SCREEN GOOGLE KEEP EDITOR MODAL (Lazy Mounted) */}
      {isEditorVisible && (
        <KeepEditorModal
          visible={isEditorVisible}
          note={editingNote}
          initialType={editorInitialType}
          allAvailableLabels={labels}
          onClose={() => {
            setIsEditorVisible(false);
            loadNotes();
          }}
          onNoteSaved={() => {
            // Auto-saved in database; feed refreshes cleanly when modal is closed
          }}
          onNoteDeleted={() => {
            loadNotes();
          }}
        />
      )}

      {/* TRANSIENT UNDO SNACKBAR */}
      {snackbar && snackbar.visible && (
        <View
          style={[
            styles.snackbarWrapper,
            { bottom: Math.max(insets.bottom + 65, 80) },
          ]}
        >
          <View
            style={[
              styles.snackbarContainer,
              { backgroundColor: isDark ? '#334155' : '#1E293B' },
            ]}
          >
            <Text style={styles.snackbarText} numberOfLines={1}>
              {snackbar.message}
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const fn = snackbar.onUndo;
                setSnackbar(null);
                await fn();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.snackbarUndoText, { color: colors.primary }]}>UNDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 26,
    marginLeft: -2,
  },
  searchBarPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  viewToggleBtn: {
    padding: 6,
    marginLeft: 6,
  },
  viewToggleIcon: {
    fontSize: 18,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  selHeaderBtn: {
    padding: 6,
  },
  selCloseIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  selCountText: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginLeft: 12,
  },
  selActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selActionIcon: {
    fontSize: 18,
  },
  batchColorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  batchColorSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  colorPickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    marginBottom: 4,
  },
  colorPickerModalTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  clearFilterModalText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabScrollContainer: {
    paddingVertical: 8,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  tabIcon: {
    fontSize: 13,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  trashNoticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  trashNoticeText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  emptyTrashBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  feedScroll: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  masonryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  masonryCol: {
    flex: 1,
  },
  listCol: {
    gap: 10,
  },
  bottomDockWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99,
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 28,
    borderWidth: 1,
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  takeNotePill: {
    flex: 1,
    paddingVertical: 6,
  },
  takeNoteText: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  dockIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dockIconBtn: {
    padding: 8,
    borderRadius: 18,
  },
  dockIconText: {
    fontSize: 18,
  },
  emptyCtaBtn: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  snackbarWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 150,
  },
  snackbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  snackbarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  snackbarUndoText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  activeFilterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
