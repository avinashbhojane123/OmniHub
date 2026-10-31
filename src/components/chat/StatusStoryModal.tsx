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
  Image,
} from 'react-native';
import { ChatStatusStory } from '../../types/chat';
import { chatSocketService } from '../../services/chat/ChatSocketService';
import { WebView } from 'react-native-webview';

const WebViewComponent: any = WebView;

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
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [storyType, setStoryType] = useState<'text' | 'image'>('text');
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

  const currentStory = storyList[currentIndex] || activeStory;
  const isCurrentVideo = Boolean(
    currentStory?.type === 'video' ||
    (currentStory?.mediaUrl && /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(currentStory.mediaUrl))
  );

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

  // Auto-advance photo/text stories every 5 seconds. Video stories auto-advance on ended event or a 30s safety timeout!
  React.useEffect(() => {
    if (!visible || isCreateMode) return;
    const duration = isCurrentVideo ? 30000 : 5000;
    const timer = setTimeout(() => {
      handleNextStory();
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, isCreateMode, currentIndex, storyList.length, isCurrentVideo]);

  if (!visible) return null;

  const handlePost = () => {
    if (storyType === 'text') {
      if (!newText.trim()) return;
      onCreateStory({
        type: 'text',
        content: newText.trim(),
        bgColor: selectedBg,
        fontStyle: 'normal',
      });
    } else {
      if (!mediaUrlInput.trim()) return;
      const url = mediaUrlInput.trim();
      const isVideo = /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url);
      onCreateStory({
        type: isVideo ? 'video' : 'image',
        mediaUrl: url,
        content: newText.trim() || undefined,
        bgColor: '#000000',
        fontStyle: 'normal',
      });
    }
    setNewText('');
    setMediaUrlInput('');
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
            {/* Story Type Toggle */}
            <View style={styles.storyTypeToggleRow}>
              <TouchableOpacity
                style={[styles.storyTypeBtn, storyType === 'text' && styles.storyTypeBtnActive]}
                onPress={() => setStoryType('text')}
              >
                <Text style={[styles.storyTypeBtnText, storyType === 'text' && styles.storyTypeBtnTextActive]}>
                  📝 Text Story
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.storyTypeBtn, storyType === 'image' && styles.storyTypeBtnActive]}
                onPress={() => setStoryType('image')}
              >
                <Text style={[styles.storyTypeBtnText, storyType === 'image' && styles.storyTypeBtnTextActive]}>
                  🖼️ Photo Story
                </Text>
              </TouchableOpacity>
            </View>

            {storyType === 'image' && (
              <TextInput
                style={styles.mediaUrlInput}
                placeholder="Paste Image URL (https://...)..."
                placeholderTextColor="rgba(255, 255, 255, 0.6)"
                value={mediaUrlInput}
                onChangeText={setMediaUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            <TextInput
              style={styles.composerInput}
              placeholder={storyType === 'image' ? "Add a caption (optional)..." : "What's on your mind?..."}
              placeholderTextColor="rgba(255, 255, 255, 0.6)"
              multiline
              maxLength={280}
              value={newText}
              onChangeText={setNewText}
              autoFocus={storyType === 'text'}
            />

            {/* Background Color Picker (Text Stories Only) */}
            {storyType === 'text' && (
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
            )}

            {/* Post Action */}
            <TouchableOpacity
              style={[
                styles.publishBtn,
                { opacity: (storyType === 'text' ? newText.trim() : mediaUrlInput.trim()) ? 1 : 0.5 },
              ]}
              onPress={handlePost}
              disabled={storyType === 'text' ? !newText.trim() : !mediaUrlInput.trim()}
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

            {currentStory?.mediaUrl ? (
              <View style={styles.storyMediaWrapper}>
                {currentStory.type === 'video' || /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(currentStory.mediaUrl) ? (
                  <View style={styles.storyVideoWrapper}>
                    <WebViewComponent
                      source={{
                        html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}video{width:100%;height:100%;object-fit:contain;}</style></head><body><video id="storyVid" src="${chatSocketService.resolveFileUrl(currentStory.mediaUrl)}" controls autoplay playsinline></video><script>var v=document.getElementById('storyVid');if(v){v.addEventListener('ended',function(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'video_ended'}));}});}</script></body></html>`,
                      }}
                      style={styles.storyVideoPlayer}
                      allowsInlineMediaPlayback
                      mediaPlaybackRequiresUserAction={false}
                      javaScriptEnabled
                      onMessage={(e: any) => {
                        try {
                          const data = JSON.parse(e.nativeEvent.data);
                          if (data.type === 'video_ended') {
                            handleNextStory();
                          }
                        } catch {}
                      }}
                    />
                  </View>
                ) : (
                  <Image
                    source={{ uri: chatSocketService.resolveFileUrl(currentStory.mediaUrl) }}
                    style={styles.storyMediaImage}
                    resizeMode="contain"
                  />
                )}
                {Boolean(currentStory.content) && (
                  <View style={styles.storyCaptionBox}>
                    <Text style={styles.storyCaptionText}>{currentStory.content}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.storyContentText}>
                {currentStory?.content || ''}
              </Text>
            )}

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
  storyMediaWrapper: {
    width: '100%',
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyMediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  storyVideoWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  storyVideoPlayer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  storyCaptionBox: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: '90%',
  },
  storyCaptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  storyTypeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  storyTypeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  storyTypeBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  storyTypeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  storyTypeBtnTextActive: {
    color: '#0F172A',
  },
  mediaUrlInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
});
