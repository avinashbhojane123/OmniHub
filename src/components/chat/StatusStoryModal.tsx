import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ChatStatusStory } from '../../types/chat';

interface StatusStoryModalProps {
  visible: boolean;
  onClose: () => void;
  activeStory: ChatStatusStory | null;
  stories?: ChatStatusStory[];
  onViewStory: (statusId: number) => void;
  onDeleteStory: (statusId: number) => void;
  currentNickname: string;
  isCreateMode?: boolean;
  onCreateStory: (data: {
    type: 'text' | 'image' | 'video';
    content?: string;
    mediaUrl?: string;
    bgColor?: string;
    fontStyle?: string;
  }) => void;
}

const BG_PRESETS = [
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#1E293B', // Slate
];

export const StatusStoryModal: React.FC<StatusStoryModalProps> = ({
  visible,
  onClose,
  activeStory,
  stories,
  onViewStory,
  onDeleteStory,
  currentNickname,
  isCreateMode = false,
  onCreateStory,
}) => {
  const [newText, setNewText] = useState('');
  const [selectedBg, setSelectedBg] = useState(BG_PRESETS[0]);

  const storyList = stories && stories.length > 0 ? stories : (activeStory ? [activeStory] : []);
  const initialIndex = Math.max(0, storyList.findIndex((s) => s.id === activeStory?.id));
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  React.useEffect(() => {
    if (activeStory) {
      const idx = storyList.findIndex((s) => s.id === activeStory.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
  }, [activeStory, stories]);

  // Auto-advance story slide every 5 seconds (standard WhatsApp/Instagram story progression)
  React.useEffect(() => {
    if (!visible || isCreateMode) return;
    const timer = setTimeout(() => {
      handleNextStory();
    }, 5000);
    return () => clearTimeout(timer);
  }, [visible, isCreateMode, currentIndex, storyList.length]);

  if (!visible) return null;

  const currentStory = storyList[currentIndex] || activeStory;

  const handleNextStory = () => {
    if (currentIndex < storyList.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (storyList[nextIdx]?.id) {
        onViewStory(storyList[nextIdx].id);
      }
    } else {
      onClose();
    }
  };

  const handlePrevStory = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      if (storyList[prevIdx]?.id) {
        onViewStory(storyList[prevIdx].id);
      }
    }
  };

  const handlePost = () => {
    if (!newText.trim()) return;
    onCreateStory({
      type: 'text',
      content: newText.trim(),
      bgColor: selectedBg,
      fontStyle: 'normal',
    });
    setNewText('');
    onClose();
  };

  const isMyStory = Boolean(
    currentStory?.nickname &&
    currentStory.nickname.trim().toLowerCase() ===
      (currentNickname || '').trim().toLowerCase()
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[
          styles.container,
          {
            backgroundColor: isCreateMode
              ? selectedBg
              : currentStory?.bgColor || '#0F172A',
          },
        ]}
      >
        {/* Top Story Progress Segments */}
        {!isCreateMode && storyList.length > 1 && (
          <View style={styles.progressBarRow}>
            {storyList.map((s, idx) => (
              <View
                key={s.id}
                style={[
                  styles.progressBarSegment,
                  idx <= currentIndex && styles.progressBarSegmentActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <View style={styles.authorCol}>
            <Text style={styles.authorNickname}>
              {isCreateMode
                ? 'Create New Story'
                : `@${currentStory?.nickname || 'Story'}`}
            </Text>
            {!isCreateMode && (
              <Text style={styles.storyTime}>
                {storyList.length > 1
                  ? `${currentIndex + 1} of ${storyList.length} • 24h Story`
                  : '24h Story'}
              </Text>
            )}
          </View>

          <View style={styles.topRightActions}>
            {isMyStory && !isCreateMode && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  if (currentStory) onDeleteStory(currentStory.id);
                  if (storyList.length <= 1) {
                    onClose();
                  } else {
                    handleNextStory();
                  }
                }}
              >
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content Body */}
        {isCreateMode ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.composerBody}
          >
            <TextInput
              style={styles.composerInput}
              placeholder="What's on your mind?..."
              placeholderTextColor="rgba(255, 255, 255, 0.6)"
              multiline
              maxLength={280}
              value={newText}
              onChangeText={setNewText}
              autoFocus
            />

            {/* Background Color Picker */}
            <View style={styles.paletteRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {BG_PRESETS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color },
                      selectedBg === color && styles.colorCircleActive,
                    ]}
                    onPress={() => setSelectedBg(color)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Post Action */}
            <TouchableOpacity
              style={[
                styles.publishBtn,
                { opacity: newText.trim() ? 1 : 0.5 },
              ]}
              onPress={handlePost}
              disabled={!newText.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.publishBtnText}>Share to Room Story 🚀</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.storyViewBody}>
            {/* Tap left/right to navigate between stories */}
            <TouchableOpacity
              style={styles.navTouchLeft}
              activeOpacity={1}
              onPress={handlePrevStory}
            />
            <TouchableOpacity
              style={styles.navTouchRight}
              activeOpacity={1}
              onPress={handleNextStory}
            />

            <Text style={styles.storyContentText}>
              {currentStory?.content || ''}
            </Text>

            {/* Viewers footer */}
            <View style={styles.viewersFooter}>
              <Text style={styles.viewersCount}>
                👁️ {currentStory?.viewers?.length || 0} View
                {(currentStory?.viewers?.length || 0) !== 1 ? 's' : ''}
              </Text>
              {isMyStory && (
                <Text style={styles.viewersList}>
                  {currentStory?.viewers?.length
                    ? `Seen by: @${currentStory.viewers.join(', @')}`
                    : 'No views yet'}
                </Text>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  authorCol: {
    flex: 1,
  },
  authorNickname: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  storyTime: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  composerBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  composerInput: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    minHeight: 180,
  },
  paletteRow: {
    marginTop: 24,
    marginBottom: 28,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  colorCircleActive: {
    transform: [{ scale: 1.2 }],
    borderColor: '#FDE047',
    borderWidth: 3,
  },
  publishBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  publishBtnText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  storyViewBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  storyContentText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  viewersFooter: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  viewersCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewersList: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  progressBarRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
  progressBarSegment: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  progressBarSegmentActive: {
    backgroundColor: '#FFFFFF',
  },
  navTouchLeft: {
    position: 'absolute',
    top: 0,
    bottom: 80,
    left: 0,
    width: '40%',
    zIndex: 10,
  },
  navTouchRight: {
    position: 'absolute',
    top: 0,
    bottom: 80,
    right: 0,
    width: '60%',
    zIndex: 10,
  },
});
