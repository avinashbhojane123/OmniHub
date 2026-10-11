import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import {
  chatSocketService,
  ChatMessage,
  RoomUser,
} from '../services/chat/chatSocketService';
import { settingsRepository } from '../database/repositories/SettingsRepository';

const QUICK_EMOJIS = ['❤️', '😂', '👍', '🔥', '🎉', '✨', '🚀', '💯', '🙏', '👀'];
const AVATAR_OPTIONS = ['🐯', '🚀', '🤖', '👑', '🦊', '⚡', '😎', '🦄', '🎮', '🌟'];

type ChatTheme = 'wa-doodle' | 'midnight' | 'cyber';

export const ChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // Session & Connection state
  const [inRoom, setInRoom] = useState(() => chatSocketService.wasInRoom);
  const [nickname, setNickname] = useState('Avinash');
  const [passcode, setPasscode] = useState('');
  const [serverUrl, setServerUrl] = useState('https://backend-9i6w.onrender.com');
  const [selectedAvatar, setSelectedAvatar] = useState('🐯');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(() => chatSocketService.isConnected);
  const [latency, setLatency] = useState<number | null>(null);

  // Chat Data State
  const [messages, setMessages] = useState<ChatMessage[]>(() => chatSocketService.getCachedMessages());
  const [users, setUsers] = useState<RoomUser[]>(() => chatSocketService.getCachedUsers());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);

  // Input & Composer State
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageForAction, setSelectedMessageForAction] = useState<ChatMessage | null>(null);

  // Modals
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ChatTheme>('midnight');

  const flatListRef = useRef<FlatList>(null);

  // Load saved credentials from settings
  useEffect(() => {
    settingsRepository.get('chat_nickname', 'Avinash').then((val) => {
      if (val) setNickname(val);
    });
    settingsRepository.get('chat_passcode', '').then((val) => {
      if (val) setPasscode(val);
    });
    settingsRepository.get('chat_server_url', 'https://backend-9i6w.onrender.com').then((val) => {
      if (val) setServerUrl(val);
    });
    settingsRepository.get('chat_avatar', '🐯').then((val) => {
      if (val) setSelectedAvatar(val);
    });
    settingsRepository.get('chat_theme', 'midnight').then((val) => {
      if (val === 'wa-doodle' || val === 'midnight' || val === 'cyber') {
        setCurrentTheme(val);
      }
    });
    // Note: Do not disconnect socket on unmount to keep room session active across workspaces
  }, []);

  // Connect & Join Room
  const handleJoinRoom = useCallback(() => {
    if (!nickname.trim()) {
      Alert.alert('Required', 'Please enter your nickname');
      return;
    }
    if (!passcode.trim()) {
      Alert.alert('Required', 'Please enter a room passcode');
      return;
    }

    setConnecting(true);

    // Save credentials
    settingsRepository.set('chat_nickname', nickname.trim());
    settingsRepository.set('chat_passcode', passcode.trim());
    settingsRepository.set('chat_server_url', serverUrl.trim());
    settingsRepository.set('chat_avatar', selectedAvatar);

    chatSocketService.connect(
      {
        nickname: nickname.trim(),
        passcode: passcode.trim(),
        serverUrl: serverUrl.trim(),
        avatarUrl: selectedAvatar,
      },
      {
        onConnect: () => {
          setIsConnected(true);
          setConnecting(false);
          setInRoom(true);
          chatSocketService.setInRoomState(true);
        },
        onDisconnect: (reason) => {
          setIsConnected(false);
          console.log('Socket disconnected:', reason);
        },
        onConnectError: (err) => {
          setConnecting(false);
          console.warn('Socket connection error:', err?.message || err);
          Alert.alert(
            'Connection Notice',
            `Could not reach server at ${serverUrl}. If Render is asleep, it may take 30-45 seconds to spin up, or check your internet.`
          );
        },
        onHistory: (history) => {
          setMessages(history);
        },
        onNewMessage: (msg) => {
          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
            return [...prev, msg];
          });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        },
        onTyping: (typing) => {
          setTypingUsers(typing);
        },
        onUsersList: (list) => {
          setUsers(list);
        },
        onPinnedMessage: (msg) => {
          setPinnedMessage(msg);
        },
        onReactionsUpdated: (msgId, reactions) => {
          setMessages((prev) =>
            prev.map((m) =>
              String(m.id) === String(msgId) ? { ...m, reactions } : m
            )
          );
        },
        onMessageDeleted: (msgId) => {
          setMessages((prev) => prev.filter((m) => String(m.id) !== String(msgId)));
        },
        onHistoryCleared: () => {
          setMessages([]);
          setPinnedMessage(null);
          Alert.alert('Notice', 'Chat history cleared.');
        },
        onLatencyUpdate: (ms) => {
          setLatency(ms);
        },
        onToast: (msg) => {
          console.log('[Chat Toast]:', msg);
        },
      }
    );
  }, [nickname, passcode, serverUrl, selectedAvatar]);

  const handleLeaveRoom = () => {
    chatSocketService.setInRoomState(false);
    chatSocketService.disconnect();
    setInRoom(false);
    setIsConnected(false);
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
    setPinnedMessage(null);
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    chatSocketService.sendMessage(
      inputText.trim(),
      replyingTo
        ? {
            id: replyingTo.id,
            nickname: replyingTo.nickname,
            message: replyingTo.message,
          }
        : null,
      { avatarUrl: selectedAvatar }
    );

    setInputText('');
    setReplyingTo(null);
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    chatSocketService.sendTyping(text.length > 0);
  };

  const handleReact = (messageId: string | number, emoji: string) => {
    chatSocketService.reactToMessage(messageId, emoji);
    setSelectedMessageForAction(null);
  };

  const handleConvertMessageToTask = (msg: ChatMessage) => {
    setSelectedMessageForAction(null);
    Alert.alert(
      'Add to Planner',
      `Create a task from this message?\n\n"${msg.message}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Task',
          style: 'default',
          onPress: () => {
            navigation.navigate('CreateEditTask', {
              initialTitle: msg.message.slice(0, 80),
              initialNotes: `From @${msg.nickname} in room #${passcode}`,
            });
          },
        },
      ]
    );
  };

  const themeColors = {
    'wa-doodle': {
      bg: '#0B141A',
      header: '#1F2C34',
      card: '#1F2C34',
      outgoing: '#005C4B',
      incoming: '#202C33',
      accent: '#00A884',
      text: '#E9EDEF',
      subtext: '#8696A0',
    },
    midnight: {
      bg: '#0F172A',
      header: '#1E293B',
      card: '#1E293B',
      outgoing: '#2563EB',
      incoming: '#1E293B',
      accent: '#06B6D4',
      text: '#F8FAFC',
      subtext: '#94A3B8',
    },
    cyber: {
      bg: '#130B24',
      header: '#24143D',
      card: '#24143D',
      outgoing: '#7C3AED',
      incoming: '#24143D',
      accent: '#EC4899',
      text: '#FAF5FF',
      subtext: '#C084FC',
    },
  }[currentTheme];

  // Render Portal / Join Screen
  if (!inRoom) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: themeColors.bg,
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <StatusBar barStyle="light-content" />

        {/* Portal Header */}
        <View style={styles.portalHeader}>
          <TouchableOpacity
            style={styles.backPlannerPill}
            onPress={() => navigation.navigate('MainTabs')}
            activeOpacity={0.8}
          >
            <Text style={styles.backPlannerIcon}>📋</Text>
            <Text style={styles.backPlannerText}>Planner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backPlannerPill}
            onPress={() => navigation.navigate('BatteryAlarm')}
            activeOpacity={0.8}
          >
            <Text style={styles.backPlannerIcon}>⚡</Text>
            <Text style={styles.backPlannerText}>Battery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.workspacePill}
            onPress={() => navigation.navigate('WorkspaceSelect')}
            activeOpacity={0.8}
          >
            <Text style={styles.workspacePillText}>⇄ Modes</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.portalScroll}
        >
          {/* Logo & Headline */}
          <View style={styles.portalLogoRow}>
            <View style={[styles.portalLogoBadge, { borderColor: themeColors.accent }]}>
              <Text style={styles.portalLogoIcon}>💬</Text>
            </View>
            <Text style={[styles.portalTitle, { color: themeColors.text }]}>
              Real Time Chat
            </Text>
            <Text style={[styles.portalSubtitle, { color: themeColors.subtext }]}>
              Passcode-protected rooms • Live presence • Instant messaging
            </Text>
          </View>

          {/* Avatar Selector */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: themeColors.subtext }]}>
              CHOOSE AVATAR
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarRow}>
              {AVATAR_OPTIONS.map((av) => (
                <TouchableOpacity
                  key={av}
                  style={[
                    styles.avatarChip,
                    selectedAvatar === av && {
                      borderColor: themeColors.accent,
                      backgroundColor: 'rgba(6, 182, 212, 0.2)',
                    },
                  ]}
                  onPress={() => setSelectedAvatar(av)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.avatarChipEmoji}>{av}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Form Fields */}
          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: themeColors.subtext }]}>
              YOUR NICKNAME
            </Text>
            <TextInput
              style={[
                styles.portalInput,
                {
                  backgroundColor: themeColors.card,
                  color: themeColors.text,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                },
              ]}
              placeholder="e.g. Avinash"
              placeholderTextColor={themeColors.subtext}
              value={nickname}
              onChangeText={setNickname}
            />
          </View>

          <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: themeColors.subtext }]}>
              ROOM PASSCODE (SECRET)
            </Text>
            <TextInput
              style={[
                styles.portalInput,
                {
                  backgroundColor: themeColors.card,
                  color: themeColors.text,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                },
              ]}
              placeholder="e.g. secret123"
              placeholderTextColor={themeColors.subtext}
              value={passcode}
              onChangeText={setPasscode}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Advanced Server Config Toggle */}
          <TouchableOpacity
            style={styles.serverToggleRow}
            onPress={() => setShowServerConfig(!showServerConfig)}
            activeOpacity={0.8}
          >
            <Text style={[styles.serverToggleText, { color: themeColors.accent }]}>
              {showServerConfig ? '▲ Hide Server Settings' : '▼ Server Settings (Socket Server)'}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: themeColors.subtext }]}>
                SOCKET SERVER URL
              </Text>
              <TextInput
                style={[
                  styles.portalInput,
                  {
                    backgroundColor: themeColors.card,
                    color: themeColors.text,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  },
                ]}
                placeholder="https://backend-9i6w.onrender.com"
                placeholderTextColor={themeColors.subtext}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
              />
              <View style={styles.presetButtonsRow}>
                <TouchableOpacity
                  style={styles.presetButton}
                  onPress={() => setServerUrl('https://backend-9i6w.onrender.com')}
                >
                  <Text style={styles.presetButtonText}>Render Cloud</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetButton}
                  onPress={() => setServerUrl('http://10.0.2.2:10000')}
                >
                  <Text style={styles.presetButtonText}>Local Emulator (10000)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Join Button */}
          <TouchableOpacity
            style={[
              styles.joinButton,
              { backgroundColor: themeColors.accent },
              connecting && { opacity: 0.7 },
            ]}
            onPress={handleJoinRoom}
            disabled={connecting}
            activeOpacity={0.85}
          >
            {connecting ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.joinButtonText}>Enter Secret Room →</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Render Active Chat Room
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      {/* Room Header */}
      <View
        style={[
          styles.chatHeader,
          {
            backgroundColor: themeColors.header,
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
      >
        <View style={styles.headerLeftCol}>
          <TouchableOpacity
            style={styles.roomBadge}
            onPress={() => setShowRosterModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.roomBadgeLock}>🔒</Text>
            <View>
              <Text style={[styles.roomTitle, { color: themeColors.text }]}>
                #{passcode}
              </Text>
              <View style={styles.connectionRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? '#10B981' : '#F59E0B' },
                  ]}
                />
                <Text style={[styles.statusText, { color: themeColors.subtext }]}>
                  {isConnected
                    ? `Live • ${users.filter((u) => u.isOnline).length} online`
                    : 'Connecting...'}
                  {latency ? ` (${latency}ms)` : ''}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRightCol}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowThemeModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.headerBtnIcon}>🎨</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('MainTabs')}
            activeOpacity={0.8}
          >
            <Text style={styles.headerBtnIcon}>📋</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerBtn, styles.headerLeaveBtn]}
            onPress={() => {
              Alert.alert('Leave Room', 'Exit this chat room?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: handleLeaveRoom },
              ]);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.headerBtnIcon}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <View style={[styles.pinnedBanner, { backgroundColor: themeColors.card }]}>
          <Text style={styles.pinnedIcon}>📌</Text>
          <View style={styles.pinnedTextCol}>
            <Text style={[styles.pinnedSender, { color: themeColors.accent }]}>
              {pinnedMessage.nickname}
            </Text>
            <Text
              style={[styles.pinnedSnippet, { color: themeColors.text }]}
              numberOfLines={1}
            >
              {pinnedMessage.message}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => chatSocketService.pinMessage(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.pinnedClose, { color: themeColors.subtext }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages Feed */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.messagesFeed, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMine = item.nickname.toLowerCase() === nickname.toLowerCase();

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onLongPress={() => setSelectedMessageForAction(item)}
              style={[
                styles.messageRow,
                isMine ? styles.messageRowMine : styles.messageRowOther,
              ]}
            >
              {/* Other User Avatar */}
              {!isMine && (
                <View style={styles.messageAvatarCircle}>
                  <Text style={styles.messageAvatarText}>
                    {item.avatarUrl || '👤'}
                  </Text>
                </View>
              )}

              {/* Bubble */}
              <View
                style={[
                  styles.messageBubble,
                  isMine
                    ? [styles.bubbleMine, { backgroundColor: themeColors.outgoing }]
                    : [styles.bubbleOther, { backgroundColor: themeColors.incoming }],
                ]}
              >
                {/* Sender Nickname */}
                {!isMine && (
                  <Text style={[styles.senderNickname, { color: themeColors.accent }]}>
                    {item.nickname}
                  </Text>
                )}

                {/* Quoted Reply Preview */}
                {item.replyTo && (
                  <View style={styles.quotedReplyBox}>
                    <Text style={styles.quotedSender}>
                      ↩ {item.replyTo.nickname}
                    </Text>
                    <Text style={styles.quotedText} numberOfLines={2}>
                      {item.replyTo.message}
                    </Text>
                  </View>
                )}

                {/* Message Text */}
                <Text style={[styles.messageText, { color: themeColors.text }]}>
                  {item.message}
                </Text>

                {/* Timestamp & Status */}
                <View style={styles.messageMetaRow}>
                  <Text style={[styles.timestampText, { color: themeColors.subtext }]}>
                    {item.createdAt ? format(new Date(item.createdAt), 'hh:mm a') : 'Now'}
                  </Text>
                  {isMine && <Text style={styles.readTicks}>✓✓</Text>}
                </View>

                {/* Reactions Pill Display */}
                {item.reactions &&
                  Object.entries(
                    Array.isArray(item.reactions)
                      ? item.reactions.reduce((acc: any, r: any) => {
                          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                          return acc;
                        }, {})
                      : Object.entries(item.reactions).reduce((acc: any, [emoji, userList]: any) => {
                          if (Array.isArray(userList) && userList.length > 0) acc[emoji] = userList.length;
                          return acc;
                        }, {})
                  ).length > 0 && (
                    <View style={styles.reactionsDisplayRow}>
                      {Object.entries(
                        Array.isArray(item.reactions)
                          ? item.reactions.reduce((acc: any, r: any) => {
                              acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                              return acc;
                            }, {})
                          : Object.entries(item.reactions).reduce((acc: any, [emoji, userList]: any) => {
                              if (Array.isArray(userList) && userList.length > 0) acc[emoji] = userList.length;
                              return acc;
                            }, {})
                      ).map(([emoji, count]: any) => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.reactionPill}
                          onPress={() => handleReact(item.id, emoji)}
                        >
                          <Text style={styles.reactionPillEmoji}>{emoji}</Text>
                          <Text style={styles.reactionPillCount}>{count}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={[styles.typingText, { color: themeColors.accent }]}>
            ✍️ {typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...
          </Text>
        </View>
      )}

      {/* Quoted Reply Bar in Composer */}
      {replyingTo && (
        <View style={[styles.replyBar, { backgroundColor: themeColors.card }]}>
          <View style={styles.replyBarCol}>
            <Text style={[styles.replyBarSender, { color: themeColors.accent }]}>
              Replying to @{replyingTo.nickname}
            </Text>
            <Text
              style={[styles.replyBarText, { color: themeColors.text }]}
              numberOfLines={1}
            >
              {replyingTo.message}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.replyBarClose, { color: themeColors.subtext }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Emoji Bar */}
      {showEmojiPicker && (
        <View style={[styles.quickEmojiBar, { backgroundColor: themeColors.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {QUICK_EMOJIS.map((em) => (
              <TouchableOpacity
                key={em}
                style={styles.quickEmojiBtn}
                onPress={() => setInputText((prev) => prev + em)}
              >
                <Text style={styles.quickEmojiText}>{em}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Composer Bottom Input */}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: themeColors.header,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.composerIconBtn}
          onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          activeOpacity={0.8}
        >
          <Text style={styles.composerIconText}>😊</Text>
        </TouchableOpacity>

        <TextInput
          style={[
            styles.inputField,
            {
              backgroundColor: themeColors.card,
              color: themeColors.text,
            },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={themeColors.subtext}
          value={inputText}
          onChangeText={handleInputChange}
          multiline
        />

        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor: themeColors.accent,
              opacity: inputText.trim() ? 1 : 0.6,
            },
          ]}
          onPress={handleSendMessage}
          disabled={!inputText.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Message Action Sheet Modal */}
      {selectedMessageForAction && (
        <Modal
          transparent
          animationType="fade"
          visible={!!selectedMessageForAction}
          onRequestClose={() => setSelectedMessageForAction(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedMessageForAction(null)}
          >
            <View
              style={[
                styles.actionSheetCard,
                { backgroundColor: themeColors.card },
              ]}
            >
              {/* Quick Reactions */}
              <View style={styles.sheetReactionsRow}>
                {['❤️', '😂', '👍', '🔥', '😮', '🙏'].map((em) => (
                  <TouchableOpacity
                    key={em}
                    style={styles.sheetReactionCircle}
                    onPress={() => handleReact(selectedMessageForAction.id, em)}
                  >
                    <Text style={styles.sheetReactionEmoji}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  setReplyingTo(selectedMessageForAction);
                  setSelectedMessageForAction(null);
                }}
              >
                <Text style={styles.sheetActionIcon}>↩</Text>
                <Text style={[styles.sheetActionText, { color: themeColors.text }]}>
                  Reply to message
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => handleConvertMessageToTask(selectedMessageForAction)}
              >
                <Text style={styles.sheetActionIcon}>📋</Text>
                <Text style={[styles.sheetActionText, { color: '#06B6D4' }]}>
                  Convert to Planner Task
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  chatSocketService.pinMessage(selectedMessageForAction.id);
                  setSelectedMessageForAction(null);
                }}
              >
                <Text style={styles.sheetActionIcon}>📌</Text>
                <Text style={[styles.sheetActionText, { color: themeColors.text }]}>
                  Pin message
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  chatSocketService.deleteMessage(selectedMessageForAction.id);
                  setSelectedMessageForAction(null);
                }}
              >
                <Text style={styles.sheetActionIcon}>🗑️</Text>
                <Text style={[styles.sheetActionText, { color: '#EF4444' }]}>
                  Delete message
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Online Users Roster Modal */}
      <Modal
        visible={showRosterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRosterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.rosterModalCard,
              { backgroundColor: themeColors.card, maxHeight: '70%' },
            ]}
          >
            <View style={styles.rosterHeader}>
              <Text style={[styles.rosterTitle, { color: themeColors.text }]}>
                Room Participants ({users.length})
              </Text>
              <TouchableOpacity onPress={() => setShowRosterModal(false)}>
                <Text style={[styles.rosterClose, { color: themeColors.subtext }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.rosterList}>
              {users.map((u) => (
                <View key={u.nickname} style={styles.rosterItem}>
                  <View style={styles.rosterAvatar}>
                    <Text style={styles.rosterAvatarText}>
                      {u.avatarUrl || '👤'}
                    </Text>
                    {u.isOnline && <View style={styles.rosterOnlineDot} />}
                  </View>
                  <View style={styles.rosterUserCol}>
                    <Text
                      style={[
                        styles.rosterNickname,
                        { color: themeColors.text },
                      ]}
                    >
                      {u.nickname}{' '}
                      {u.nickname.toLowerCase() === nickname.toLowerCase()
                        ? '(You)'
                        : ''}
                    </Text>
                    <Text style={[styles.rosterMeta, { color: themeColors.subtext }]}>
                      {u.isOnline ? 'Online now' : 'Offline'} • {u.deviceType || 'Device'}
                    </Text>
                  </View>
                  {u.role === 'host' && (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>👑 Host</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Theme Picker Modal */}
      <Modal
        visible={showThemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowThemeModal(false)}
        >
          <View style={[styles.themeModalCard, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.themeTitle, { color: themeColors.text }]}>
              Chat Wallpaper Theme
            </Text>
            {(
              [
                { id: 'midnight', name: 'Midnight Navy', icon: '🌌' },
                { id: 'wa-doodle', name: 'WhatsApp Dark', icon: '🟢' },
                { id: 'cyber', name: 'Cyber Neon', icon: '🟣' },
              ] as const
            ).map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.themeOptionRow,
                  currentTheme === t.id && {
                    borderColor: themeColors.accent,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  },
                ]}
                onPress={() => {
                  setCurrentTheme(t.id);
                  settingsRepository.set('chat_theme', t.id);
                  setShowThemeModal(false);
                }}
              >
                <Text style={styles.themeOptionIcon}>{t.icon}</Text>
                <Text style={[styles.themeOptionName, { color: themeColors.text }]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Portal styles
  portalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backPlannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  backPlannerIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  backPlannerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  workspacePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  workspacePillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  portalScroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  portalLogoRow: {
    alignItems: 'center',
    marginVertical: 20,
  },
  portalLogoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  portalLogoIcon: {
    fontSize: 34,
  },
  portalTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  portalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  fieldSection: {
    width: '100%',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  avatarRow: {
    flexDirection: 'row',
  },
  avatarChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarChipEmoji: {
    fontSize: 20,
  },
  portalInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
  },
  serverToggleRow: {
    paddingVertical: 8,
    marginBottom: 10,
  },
  serverToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  presetButtonsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  presetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  presetButtonText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  joinButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  joinButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
  },

  // Active Chat Room Styles
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeftCol: {
    flex: 1,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomBadgeLock: {
    fontSize: 20,
    marginRight: 10,
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeaveBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  headerBtnIcon: {
    fontSize: 16,
  },

  // Pinned Banner
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pinnedIcon: {
    fontSize: 14,
    marginRight: 10,
  },
  pinnedTextCol: {
    flex: 1,
  },
  pinnedSender: {
    fontSize: 11,
    fontWeight: '700',
  },
  pinnedSnippet: {
    fontSize: 12,
  },
  pinnedClose: {
    fontSize: 14,
    padding: 4,
  },

  // Messages Feed
  messagesFeed: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageAvatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  messageAvatarText: {
    fontSize: 15,
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  senderNickname: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  quotedReplyBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#06B6D4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  quotedSender: {
    color: '#06B6D4',
    fontSize: 10,
    fontWeight: '700',
  },
  quotedText: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestampText: {
    fontSize: 10,
    marginRight: 4,
  },
  readTicks: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
  },
  reactionsDisplayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionPillEmoji: {
    fontSize: 11,
    marginRight: 3,
  },
  reactionPillCount: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Typing Bar
  typingBar: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },

  // Reply Bar in Composer
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  replyBarCol: {
    flex: 1,
  },
  replyBarSender: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyBarText: {
    fontSize: 12,
  },
  replyBarClose: {
    fontSize: 16,
    padding: 4,
  },

  // Quick Emoji Bar
  quickEmojiBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickEmojiBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quickEmojiText: {
    fontSize: 20,
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  composerIconBtn: {
    padding: 8,
  },
  composerIconText: {
    fontSize: 22,
  },
  inputField: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    marginHorizontal: 6,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },

  // Action Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  sheetReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  sheetReactionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetReactionEmoji: {
    fontSize: 22,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetActionIcon: {
    fontSize: 18,
    width: 28,
  },
  sheetActionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Roster Modal
  rosterModalCard: {
    margin: 20,
    borderRadius: 24,
    padding: 20,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rosterTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  rosterClose: {
    fontSize: 18,
    padding: 4,
  },
  rosterList: {
    maxHeight: 300,
  },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  rosterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    position: 'relative',
  },
  rosterAvatarText: {
    fontSize: 18,
  },
  rosterOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#1E293B',
  },
  rosterUserCol: {
    flex: 1,
  },
  rosterNickname: {
    fontSize: 14,
    fontWeight: '700',
  },
  rosterMeta: {
    fontSize: 11,
  },
  hostBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hostBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },

  // Theme Modal
  themeModalCard: {
    margin: 24,
    borderRadius: 24,
    padding: 20,
  },
  themeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  themeOptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  themeOptionName: {
    fontSize: 14,
    fontWeight: '600',
  },
});
