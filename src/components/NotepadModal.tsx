import React, { useState, useEffect, useCallback } from 'react';
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
import { useAppTheme } from '../hooks/useTheme';
import { noteRepository } from '../database/repositories/NoteRepository';
import { Note } from '../types';
import { radius, spacing, typography } from '../theme';
import { format, isValid } from 'date-fns';

interface NotepadModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NotepadModal: React.FC<NotepadModalProps> = ({ visible, onClose }) => {
  const { colors } = useAppTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      const all = await noteRepository.findByEntity('general');
      setNotes(all);
    } catch (err) {
      console.warn('Failed to load notes:', err);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadNotes();
      setIsEditing(false);
      setSelectedNote(null);
      setSearchQuery('');
    }
  }, [visible, loadNotes]);

  const filteredNotes = notes.filter((n) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const t = (n.title || '').toLowerCase();
    const c = (n.content || '').toLowerCase();
    return t.includes(q) || c.includes(q);
  });

  const handleStartCreate = () => {
    setSelectedNote(null);
    setNoteTitle('');
    setNoteContent('');
    setIsEditing(true);
  };

  const handleStartEdit = (note: Note) => {
    setSelectedNote(note);
    setNoteTitle(note.title || '');
    setNoteContent(note.content);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!noteContent.trim() && !noteTitle.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      if (selectedNote) {
        await noteRepository.update(selectedNote.id, noteContent.trim(), noteTitle.trim() || undefined);
      } else {
        const now = new Date().toISOString();
        await noteRepository.create({
          id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          entityType: 'general',
          title: noteTitle.trim() || undefined,
          content: noteContent.trim(),
          createdAt: now,
          updatedAt: now,
        });
      }
      await loadNotes();
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not save note.');
    }
  };

  const handleDelete = (note: Note) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await noteRepository.delete(note.id);
          if (selectedNote?.id === note.id) {
            setIsEditing(false);
          }
          await loadNotes();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, typography.title, { color: colors.text }]}>
                📝 Standalone Notes & Journal
              </Text>
              <Text style={[styles.subtitle, typography.caption, { color: colors.textSecondary }]}>
                Quick thoughts, ideas, and offline notes
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            /* Note Editor Mode */
            <View style={styles.editorContainer}>
              <TextInput
                style={[
                  styles.titleInput,
                  typography.title,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                placeholder="Note Title (Optional)"
                placeholderTextColor={colors.textMuted}
                value={noteTitle}
                onChangeText={setNoteTitle}
              />
              <TextInput
                style={[
                  styles.contentInput,
                  typography.body,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    color: colors.text,
                  },
                ]}
                placeholder="Write your note, idea, or draft here..."
                placeholderTextColor={colors.textMuted}
                value={noteContent}
                onChangeText={setNoteContent}
                multiline
              />
              <View style={styles.editorBtnRow}>
                <TouchableOpacity
                  onPress={() => setIsEditing(false)}
                  style={[styles.cancelBtn, { borderColor: colors.borderSubtle }]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.saveBtnText}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Notes List Mode */
            <View style={styles.listContainer}>
              <TouchableOpacity
                onPress={handleStartCreate}
                style={[styles.newNoteBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.newNoteBtnText}>+ Write New Note</Text>
              </TouchableOpacity>

              {notes.length > 0 && (
                <View
                  style={[
                    styles.searchBar,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={[styles.searchInput, typography.body, { color: colors.text }]}
                    placeholder="Search notes..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      style={styles.clearSearchBtn}
                      accessibilityLabel="Clear Search"
                    >
                      <Text style={[styles.clearSearchText, { color: colors.textMuted }]}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
                {notes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📓</Text>
                    <Text style={[styles.emptyText, typography.body, { color: colors.textMuted }]}>
                      No notes yet. Tap "+ Write New Note" to capture your ideas.
                    </Text>
                  </View>
                ) : filteredNotes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🔍</Text>
                    <Text style={[styles.emptyText, typography.body, { color: colors.textMuted }]}>
                      No notes found matching "{searchQuery}".
                    </Text>
                  </View>
                ) : (
                  filteredNotes.map((n) => (
                    <TouchableOpacity
                      key={n.id}
                      onPress={() => handleStartEdit(n)}
                      style={[
                        styles.noteCard,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <View style={styles.noteCardContent}>
                        {n.title ? (
                          <Text style={[styles.noteCardTitle, typography.title, { color: colors.text }]}>
                            {n.title}
                          </Text>
                        ) : null}
                        <Text
                          style={[styles.noteCardText, typography.body, { color: colors.textSecondary }]}
                          numberOfLines={2}
                        >
                          {n.content}
                        </Text>
                        <Text style={[styles.noteCardDate, typography.caption, { color: colors.textMuted }]}>
                          Updated {(() => {
                            const d = new Date(n.updatedAt);
                            return isValid(d) ? format(d, 'MMM d, h:mm a') : 'Recently';
                          })()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(n)}
                        style={styles.deleteNoteBtn}
                        accessibilityLabel="Delete Note"
                      >
                        <Text style={[styles.deleteNoteIcon, { color: colors.danger }]}>🗑</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
  },
  newNoteBtn: {
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  newNoteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    height: 38,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: spacing.xs,
  },
  clearSearchText: {
    fontSize: 13,
    fontWeight: '600',
  },
  notesScroll: {
    maxHeight: 380,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
  },
  noteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  noteCardContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  noteCardTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  noteCardText: {
    lineHeight: 18,
  },
  noteCardDate: {
    marginTop: 6,
  },
  deleteNoteBtn: {
    padding: 6,
  },
  deleteNoteIcon: {
    fontSize: 16,
  },
  editorContainer: {
    gap: spacing.sm,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  contentInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 160,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  editorBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: {
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
