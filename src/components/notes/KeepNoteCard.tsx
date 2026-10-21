import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { format, parseISO, isValid } from 'date-fns';
import { KeepNote, KEEP_COLORS } from '../../types';
import { useAppTheme } from '../../hooks/useTheme';

interface KeepNoteCardProps {
  note: KeepNote;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onPress: (note: KeepNote) => void;
  onLongPress: (note: KeepNote) => void;
  onTogglePin?: (id: string) => void;
  onToggleCheckItem?: (noteId: string, itemId: string) => void;
}

const KeepNoteCardComponent: React.FC<KeepNoteCardProps> = ({
  note,
  isSelectionMode = false,
  isSelected = false,
  onPress,
  onLongPress,
  onTogglePin,
  onToggleCheckItem,
}) => {
  const { colors, isDark } = useAppTheme();

  const colorDef = KEEP_COLORS[note.color] || KEEP_COLORS.default;
  const cardBg = isDark ? colorDef.darkBg : colorDef.lightBg;
  const cardBorder = isSelected
    ? colors.primary
    : isDark
      ? colorDef.darkBorder
      : colorDef.lightBorder;

  const formattedReminder =
    note.reminderTime && isValid(parseISO(note.reminderTime))
      ? format(parseISO(note.reminderTime), 'MMM d, h:mm a')
      : null;

  return (
    <TouchableOpacity
      style={[
        styles.cardContainer,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
      onPress={() => onPress(note)}
      onLongPress={() => onLongPress(note)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${note.title ? note.title + ', ' : ''}${
        note.type === 'checklist' ? 'Checklist note' : 'Note'
      }${note.isPinned ? ', pinned' : ''}${isSelected ? ', selected' : ''}`}
    >
      {/* Optional Top Image Banner */}
      {Boolean(note.imageUri) && (
        <View style={styles.imageBannerWrapper}>
          <Image
            source={{ uri: note.imageUri }}
            style={styles.cardImageBanner}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Selection Checkmark Indicator */}
      {isSelectionMode && (
        <View
          style={[
            styles.selectionCircle,
            {
              backgroundColor: isSelected ? colors.primary : 'transparent',
              borderColor: isSelected ? colors.primary : colors.textMuted,
            },
          ]}
        >
          {isSelected && <Text style={styles.selectionCheck}>✓</Text>}
        </View>
      )}

      {/* Pin Icon Top Right */}
      {note.isPinned && (
        <TouchableOpacity
          style={styles.pinBtn}
          onPress={() => onTogglePin && onTogglePin(note.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={isSelectionMode || note.isTrashed}
          accessibilityRole="button"
          accessibilityLabel="Toggle pin"
        >
          <Text style={styles.pinIcon}>📌</Text>
        </TouchableOpacity>
      )}

      {/* Title */}
      {note.title.trim().length > 0 && (
        <Text
          style={[styles.titleText, { color: colors.text }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {note.title}
        </Text>
      )}


      {/* Checklist Preview */}
      {note.type === 'checklist' && note.checklistData && note.checklistData.length > 0 ? (
        <View style={styles.checklistList}>
          {note.checklistData.slice(0, 4).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.checkItemRow}
              onPress={() => onToggleCheckItem && onToggleCheckItem(note.id, item.id)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.completed }}
              accessibilityLabel={`${item.text || 'Item'}, ${
                item.completed ? 'completed' : 'not completed'
              }`}
            >
              <View
                style={[
                  styles.miniCheckbox,
                  {
                    borderColor: item.completed ? colors.primary : colors.textMuted,
                    backgroundColor: item.completed ? colors.primary : 'transparent',
                  },
                ]}
              >
                {item.completed && <Text style={styles.miniCheckmark}>✓</Text>}
              </View>
              <Text
                style={[
                  styles.checkItemText,
                  {
                    color: item.completed ? colors.textMuted : colors.text,
                    textDecorationLine: item.completed ? 'line-through' : 'none',
                  },
                ]}
                numberOfLines={1}
              >
                {item.text || 'Item'}
              </Text>
            </TouchableOpacity>
          ))}
          {note.checklistData.length > 4 && (
            <Text style={[styles.moreItemsText, { color: colors.textMuted }]}>
              +{note.checklistData.length - 4} more items
            </Text>
          )}
        </View>
      ) : (
        /* Regular Content Preview with URL highlighting */
        note.content.trim().length > 0 && (
          <Text
            style={[styles.contentText, { color: colors.textSecondary }]}
            numberOfLines={8}
            ellipsizeMode="tail"
          >
            {note.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
              /(https?:\/\/[^\s]+)/.test(part) ? (
                <Text key={i} style={{ color: colors.primary, textDecorationLine: 'underline' }}>
                  {part}
                </Text>
              ) : (
                part
              )
            )}
          </Text>
        )
      )}

      {/* Bottom Metadata: Reminders & Labels */}
      {((note.labels && note.labels.length > 0) || formattedReminder) && (
        <View style={styles.metaChipsContainer}>
          {/* Reminder Chip */}
          {formattedReminder && (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 107, 0, 0.15)'
                    : '#FFF7ED',
                  borderColor: isDark
                    ? 'rgba(255, 107, 0, 0.3)'
                    : '#FED7AA',
                },
              ]}
            >
              <Text style={styles.chipBell}>⏰</Text>
              <Text style={[styles.chipText, { color: colors.primary }]}>
                {formattedReminder}
              </Text>
            </View>
          )}

          {/* Label Chips */}
          {note.labels &&
            note.labels.map((lbl) => (
              <View
                key={lbl}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isDark
                      ? 'rgba(255, 255, 255, 0.15)'
                      : 'rgba(0, 0, 0, 0.1)',
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                  #{lbl}
                </Text>
              </View>
            ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  selectionCircle: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  selectionCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  pinBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
  },
  pinIcon: {
    fontSize: 13,
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6,
    paddingRight: 20,
  },
  contentText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  checklistList: {
    marginTop: 2,
    gap: 6,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 3.5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniCheckmark: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  checkItemText: {
    fontSize: 13,
    flex: 1,
  },
  moreItemsText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  metaChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipBell: {
    fontSize: 10,
    marginRight: 4,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  imageBannerWrapper: {
    marginHorizontal: -13,
    marginTop: -13,
    marginBottom: 10,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    overflow: 'hidden',
  },
  cardImageBanner: {
    width: '100%',
    height: 120,
  },
});

export const KeepNoteCard = memo(KeepNoteCardComponent);
