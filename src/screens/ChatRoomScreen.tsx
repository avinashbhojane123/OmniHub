import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  BackHandler,
  Keyboard,
  AppState,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  Image,
  ImageBackground,
  StyleSheet,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import { chatSocketService } from '../services/chat/ChatSocketService';
import {
  ChatMessage,
  RoomUser,
  ChatStatusStory,
} from '../types/chat';
import { CallOverlayModal } from '../components/chat/CallOverlayModal';
import { RosterModerationModal } from '../components/chat/RosterModerationModal';
import { StatusStoryModal } from '../components/chat/StatusStoryModal';
import { PollCreateModal } from '../components/chat/PollCreateModal';
import { WatchPartyModal } from '../components/chat/WatchPartyModal';
import { RoomWallpaperModal } from '../components/chat/RoomWallpaperModal';
import { ChatGatewayView } from '../components/chat/ChatGatewayView';
import { ChatMessageBubble, TypingIndicatorBubble } from '../components/chat/ChatMessageBubble';
import { styles } from '../components/chat/chatStyles';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { copyToClipboard } from '../utils/clipboard';

const DEFAULT_INTERNET_SERVER = 'https://backend-9i6w.onrender.com';
const HOTSPOT_SERVER = 'http://10.16.64.73:10000';
const SERVER_PRESETS = [
  { label: '🌐 Render Cloud (Live Internet)', url: 'https://backend-9i6w.onrender.com' },
  { label: '📡 Local Hotspot (10.16.64.73:10000)', url: 'http://10.16.64.73:10000' },
  { label: '📱 Android Hotspot (192.168.43.1:10000)', url: 'http://192.168.43.1:10000' },
  { label: '🏠 Local Wi-Fi (192.168.1.100:10000)', url: 'http://192.168.1.100:10000' },
  { label: '💻 Emulator Host (10.0.2.2:10000)', url: 'http://10.0.2.2:10000' },
];
const PRESET_ROOMS = ['Lounge', 'DevRoom', 'General', 'Gaming', 'Music'];
const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '🚀'];
const MORE_EMOJIS = ['😀', '😍', '👏', '🙌', '👀', '💯', '✨', '⚡', '💡', '😎', '🥳', '🤔', '🤝', '💪', '🎯'];

const formatDurationLabel = (secs?: number): string => {
  if (!secs) return '';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
};

const formatCallTimer = (secs?: number): string => {
  if (!secs) return '00:00';
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
};

export const ChatRoomScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<any>>();

  // 1. Connection / Gateway State (Inputs start blank for manual entry)
  const [passcode, setPasscode] = useState('');
  const [nickname, setNickname] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_INTERNET_SERVER);
  const [showServerCustom, setShowServerCustom] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  // 2. Consolidated Live Socket State (Single state updates avoid cascading re-renders)
  const [roomState, setRoomState] = useState(() => ({
    isConnected: chatSocketService.isConnected,
    connectionStatus: chatSocketService.connectionState,
    messages: chatSocketService.getMessages,
    users: chatSocketService.getUsers,
    statuses: chatSocketService.getStatuses,
    typingUsers: chatSocketService.getTypingUsers,
    pinnedMsg: chatSocketService.getPinnedMessage,
    wallpaper: chatSocketService.getWallpaper,
    activeCall: chatSocketService.getActiveCall,
    watchParty: chatSocketService.getWatchParty,
    latency: chatSocketService.latency,
  }));

  // 3. Consolidated Modals State
  const [modals, setModals] = useState({
    roster: false,
    poll: false,
    watchParty: false,
    wallpaper: false,
    story: false,
    image: false,
    attach: false,
    moreReactions: false,
    quickEmojis: false,
  });

  // Modal active payloads
  const [actionSheetMsg, setActionSheetMsg] = useState<ChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeStoryToView, setActiveStoryToView] = useState<ChatStatusStory | null>(null);
  const [activeStoryList, setActiveStoryList] = useState<ChatStatusStory[]>([]);
  const [isCreateStoryMode, setIsCreateStoryMode] = useState(false);

  // 4. In-Chat Search State
  const [searchState, setSearchState] = useState({
    isSearching: false,
    searchQuery: '',
    currentMatchIdx: 0,
  });

  // 5. Composer & Editing State
  const [inputText, setInputText] = useState('');
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [directTarget, setDirectTarget] = useState<string | null>(null);
  const [disappearingSecs, setDisappearingSecs] = useState<number | undefined>(undefined);

  // 6. Scroll & Unread Badge State
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [newMessagesWhileScrolled, setNewMessagesWhileScrolled] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | number | null>(null);

  // 8. Explicit Room Session State (Accurately synchronized with active connection)
  const [isInRoom, setIsInRoom] = useState(
    chatSocketService.isConnected && Boolean(chatSocketService.passcode)
  );

  // 9. Coordinated voice note playback (ensures only 1 plays at a time)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);

  useEffect(() => {
    if (!roomState.activeCall || roomState.activeCall.state === 'ended') {
      setIsCallMinimized(false);
    }
  }, [roomState.activeCall]);

  // 10. Message History Pagination
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const handleToggleVoicePlay = useCallback((id: string) => {
    setPlayingVoiceId((prev) => (prev === id ? null : id));
  }, []);

  // 10. Debounced search query to prevent linear search freeze on keystrokes
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearchQuery(searchState.searchQuery);
    }, 150);
    return () => clearTimeout(t);
  }, [searchState.searchQuery]);

  // 11. Soft keyboard visibility state for bottom inset compensation on Android
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        if (isAtBottomRef.current) {
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 80);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(roomState.messages.length);
  const prevLastMsgIdRef = useRef<string | number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftBeforeEditRef = useRef<string>('');
  const isTypingActiveRef = useRef(false);
  const hasAlertedErrorRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const markedMessageIdsRef = useRef<Set<string | number>>(new Set());
  const composerInputRef = useRef<any>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable Hardware Back Handler ref to prevent event listener churn
  const backHandlerRef = useRef<() => boolean>(() => false);

  // Helper to update individual modal flags
  const setModalVisible = useCallback((key: keyof typeof modals, visible: boolean) => {
    setModals((prev) => ({ ...prev, [key]: visible }));
  }, []);

  // Purge legacy saved credentials so inputs remain blank and manual
  useEffect(() => {
    const loadSavedGateway = async () => {
      try {
        settingsRepository.set('chat_saved_passcode', '').catch(() => {});
        settingsRepository.set('chat_saved_nickname', '').catch(() => {});
        settingsRepository.set('chat_recent_rooms', '[]').catch(() => {});

        const savedServerUrl = await settingsRepository.get('chat_saved_server_url');
        if (savedServerUrl) {
          setServerUrl(savedServerUrl);
          const isKnownPreset = SERVER_PRESETS.some((p) => p.url === savedServerUrl);
          if (!isKnownPreset) {
            setShowServerCustom(true);
          }
        }
      } catch {
        // non-critical
      }
    };
    loadSavedGateway();
  }, []);

  const handleClearRecentRooms = useCallback(() => {
    setRecentRooms([]);
    settingsRepository.set('chat_recent_rooms', '[]').catch(() => {});
  }, []);

  // Automatically mark incoming unread messages from other members as read with deduplication protection
  useEffect(() => {
    if (!isInRoom || !roomState.isConnected) return;
    const currentNick = chatSocketService.nickname.trim().toLowerCase();
    if (!currentNick) return;

    const unreadIds = roomState.messages
      .filter((m) => {
        if (!m.id || (typeof m.id === 'string' && m.id.startsWith('offline_'))) return false;
        if (markedMessageIdsRef.current.has(m.id)) return false;
        const isFromMe = (m.nickname || '').trim().toLowerCase() === currentNick;
        if (isFromMe) return false;
        const readByList = Array.isArray(m.readBy) ? m.readBy : [];
        const isAlreadyRead = readByList.some((r) => (r || '').trim().toLowerCase() === currentNick);
        return !isAlreadyRead;
      })
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => markedMessageIdsRef.current.add(id));
      chatSocketService.markMessagesRead(unreadIds);
    }
  }, [isInRoom, roomState.messages, roomState.isConnected]);

  // Draft Message Persistence (restores un-sent text per room)
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const roomKey = (chatSocketService.passcode || passcode).trim().toLowerCase();
        const draft = await settingsRepository.get(`chat_draft_${roomKey}`);
        if (draft) setInputText(draft);
      } catch {
        // non-critical
      }
    };
    if (isInRoom) {
      loadDraft();
    }
  }, [isInRoom, passcode]);

  useEffect(() => {
    if (!isInRoom || editingMessage) return;
    const activePasscode = (chatSocketService.passcode || passcode).trim().toLowerCase();
    if (!activePasscode) return;

    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    draftTimeoutRef.current = setTimeout(() => {
      const currentKey = (chatSocketService.passcode || passcode).trim().toLowerCase();
      if (currentKey !== activePasscode) return;

      if (inputText.trim()) {
        settingsRepository.set(`chat_draft_${activePasscode}`, inputText).catch(() => {});
      } else {
        settingsRepository.set(`chat_draft_${activePasscode}`, '').catch(() => {});
      }
    }, 400);
    return () => {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    };
  }, [inputText, isInRoom, passcode, editingMessage]);

  // Matching indices when in-chat search is active (debounced)
  const matchingIndices = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const indices: number[] = [];
    roomState.messages.forEach((m, idx) => {
      const textMatch = m.message?.toLowerCase().includes(q);
      const nickMatch = m.nickname?.toLowerCase().includes(q);
      const targetMatch = m.targetNickname?.toLowerCase().includes(q);
      const fileMatch = m.fileName?.toLowerCase().includes(q);
      const pollQMatch = m.pollData?.question?.toLowerCase().includes(q);
      const pollOptMatch = m.pollData?.options?.some((o) => o.text?.toLowerCase().includes(q));
      if (textMatch || nickMatch || targetMatch || fileMatch || pollQMatch || pollOptMatch) {
        indices.push(idx);
      }
    });
    return indices;
  }, [roomState.messages, debouncedSearchQuery]);

  // Scroll to a specific message by ID safely with visual pulse highlight
  const scrollToMessageId = useCallback((targetId: string | number) => {
    const targetIdx = roomState.messages.findIndex((m) => String(m.id) === String(targetId));
    if (targetIdx !== -1) {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      setHighlightedMessageId(targetId);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimeoutRef.current = null;
      }, 1500);

      try {
        flatListRef.current?.scrollToIndex({
          index: targetIdx,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        flatListRef.current?.scrollToOffset({
          offset: Math.max(0, targetIdx * 75),
          animated: true,
        });
      }
    } else {
      Alert.alert(
        'Message Not Visible',
        'The referenced message could not be found or has expired.'
      );
    }
  }, [roomState.messages]);

  // Jump to first match when search query changes or search is enabled
  useEffect(() => {
    if (searchState.isSearching && debouncedSearchQuery.trim()) {
      setSearchState((prev) => ({ ...prev, currentMatchIdx: 0 }));
      if (matchingIndices.length > 0) {
        const targetMsg = roomState.messages[matchingIndices[0]];
        if (targetMsg?.id !== undefined) {
          scrollToMessageId(targetMsg.id);
        }
      }
    }
  }, [debouncedSearchQuery, searchState.isSearching, scrollToMessageId]);

  // Ensure current match index never exceeds matching indices length
  useEffect(() => {
    if (matchingIndices.length > 0 && searchState.currentMatchIdx >= matchingIndices.length) {
      setSearchState((prev) => ({ ...prev, currentMatchIdx: Math.max(0, matchingIndices.length - 1) }));
    }
  }, [matchingIndices.length, searchState.currentMatchIdx]);

  const handleNextMatch = useCallback(() => {
    if (matchingIndices.length === 0) return;
    const nextIdx = (searchState.currentMatchIdx + 1) % matchingIndices.length;
    setSearchState((s) => ({ ...s, currentMatchIdx: nextIdx }));
    const targetMsg = roomState.messages[matchingIndices[nextIdx]];
    if (targetMsg?.id !== undefined) {
      scrollToMessageId(targetMsg.id);
    }
  }, [matchingIndices, searchState.currentMatchIdx, roomState.messages, scrollToMessageId]);

  const handlePrevMatch = useCallback(() => {
    if (matchingIndices.length === 0) return;
    const prevIdx = (searchState.currentMatchIdx - 1 + matchingIndices.length) % matchingIndices.length;
    setSearchState((s) => ({ ...s, currentMatchIdx: prevIdx }));
    const targetMsg = roomState.messages[matchingIndices[prevIdx]];
    if (targetMsg?.id !== undefined) {
      scrollToMessageId(targetMsg.id);
    }
  }, [matchingIndices, searchState.currentMatchIdx, roomState.messages, scrollToMessageId]);

  // Handle loading older messages
  const handleLoadOlder = useCallback(async () => {
    if (isLoadingOlder || !hasMoreOlder) return;
    const anchorMsgId = roomState.messages[0]?.id;
    setIsLoadingOlder(true);
    try {
      const res = await chatSocketService.loadOlderMessages(30);
      if (res.loaded === 0 || !res.hasMore) {
        setHasMoreOlder(false);
      } else if (anchorMsgId) {
        // Anchor viewport on the previous topmost message so history expands upwards
        setTimeout(() => {
          const newIdx = chatSocketService.getMessages.findIndex(
            (m) => String(m.id) === String(anchorMsgId)
          );
          if (newIdx !== -1) {
            try {
              flatListRef.current?.scrollToIndex({
                index: newIdx,
                animated: false,
                viewPosition: 0,
              });
            } catch {
              // fallback
            }
          }
        }, 50);
      }
    } catch {
      setHasMoreOlder(false);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, hasMoreOlder, roomState.messages]);

  // Handle Return from Room to Gateway cleanly
  const handleExitRoomToGateway = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      chatSocketService.sendTyping(false);
    }
    chatSocketService.leaveRoom();
    setIsInRoom(false);
    setPasscode('');
    setNickname('');
    initialScrollDoneRef.current = false;
    setInputText('');
    setDisappearingSecs(undefined);
    setDirectTarget(null);
    setReplyingTo(null);
    setEditingMessage(null);
    setPlayingVoiceId(null);
    setSearchState({ isSearching: false, searchQuery: '', currentMatchIdx: 0 });
    setHighlightedMessageId(null);
    setShowScrollBottomBtn(false);
    setNewMessagesWhileScrolled(0);
    setIsCallMinimized(false);
    setModals((prev) => ({
      ...prev,
      attach: false,
      quickEmojis: false,
      moreReactions: false,
    }));
    draftBeforeEditRef.current = '';
    markedMessageIdsRef.current.clear();
    prevLastMsgIdRef.current = null;
    prevMessagesLengthRef.current = 0;
  }, []);

  // Return to Gateway
  const handleLeaveRoom = useCallback(() => {
    handleExitRoomToGateway();
  }, [handleExitRoomToGateway]);

  // Room Options Overflow Menu
  const handleOpenRoomMenu = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert('Room Options', undefined, [
      {
        text: '👥 Room Participants',
        onPress: () => setModalVisible('roster', true),
      },
      {
        text: '🍿 Watch Party',
        onPress: () => setModalVisible('watchParty', true),
      },
      {
        text: '🎨 Room Wallpaper',
        onPress: () => setModalVisible('wallpaper', true),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [setModalVisible]);

  // Master Back Handler
  const handleGoBack = useCallback(() => {
    if (lightboxImage) {
      setLightboxImage(null);
      return true;
    }
    if (isCallMinimized) {
      setIsCallMinimized(false);
      return true;
    }
    if (roomState.activeCall) {
      Alert.alert('Ongoing Call', 'Do you want to disconnect the active call?', [
        { text: 'Keep in Call', style: 'cancel' },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: () => chatSocketService.endCall(),
        },
      ]);
      return true;
    }
    if (searchState.isSearching) {
      setSearchState({ isSearching: false, searchQuery: '', currentMatchIdx: 0 });
      return true;
    }
    if (editingMessage) {
      setEditingMessage(null);
      setInputText(draftBeforeEditRef.current || '');
      draftBeforeEditRef.current = '';
      return true;
    }
    if (replyingTo) {
      setReplyingTo(null);
      return true;
    }
    if (modals.roster) { setModalVisible('roster', false); return true; }
    if (modals.poll) { setModalVisible('poll', false); return true; }
    if (modals.watchParty) { setModalVisible('watchParty', false); return true; }
    if (modals.wallpaper) { setModalVisible('wallpaper', false); return true; }
    if (modals.story) { setModalVisible('story', false); return true; }
    if (modals.attach) { setModalVisible('attach', false); return true; }
    if (modals.moreReactions) { setModalVisible('moreReactions', false); return true; }
    if (modals.quickEmojis) { setModalVisible('quickEmojis', false); return true; }
    if (actionSheetMsg) {
      setActionSheetMsg(null);
      setModalVisible('moreReactions', false);
      return true;
    }
    if (isInRoom) {
      handleLeaveRoom();
      return true;
    }
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('WorkspaceSelect');
    }
    return true;
  }, [
    lightboxImage,
    roomState.activeCall,
    searchState.isSearching,
    editingMessage,
    replyingTo,
    modals,
    actionSheetMsg,
    isInRoom,
    navigation,
    setModalVisible,
    handleLeaveRoom,
  ]);

  // Keep backHandlerRef updated without triggering useFocusEffect re-registration
  useEffect(() => {
    backHandlerRef.current = handleGoBack;
  }, [handleGoBack]);

  // Register hardware back listener once per screen focus (zero listener churn)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => backHandlerRef.current();
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [])
  );

  // Subscribe to ChatSocketService updates (Single unified state updater)
  useEffect(() => {
    const unsubscribe = chatSocketService.subscribe(() => {
      setRoomState({
        isConnected: chatSocketService.isConnected,
        connectionStatus: chatSocketService.connectionState,
        messages: chatSocketService.getMessages,
        users: chatSocketService.getUsers,
        statuses: chatSocketService.getStatuses,
        typingUsers: chatSocketService.getTypingUsers,
        pinnedMsg: chatSocketService.getPinnedMessage,
        wallpaper: chatSocketService.getWallpaper,
        activeCall: chatSocketService.getActiveCall,
        watchParty: chatSocketService.getWatchParty,
        latency: chatSocketService.latency,
      });

      // Synchronize session state if disconnected or kicked by server
      if (!chatSocketService.passcode && !chatSocketService.isConnected) {
        setIsInRoom(false);
      }

      // Reset connection error guard when successfully connected
      if (chatSocketService.isConnected) {
        hasAlertedErrorRef.current = false;
      }

      // Handle connection error notification
      if (chatSocketService.lastConnectionError && !hasAlertedErrorRef.current) {
        hasAlertedErrorRef.current = true;
        Alert.alert(
          'Connection Issue',
          `Could not connect to ${chatSocketService.activeServerUrl}.\n\nReason: ${chatSocketService.lastConnectionError}\n\nPlease check server and network settings.`
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (isTypingActiveRef.current) {
        chatSocketService.sendTyping(false);
      }
    };
  }, []);

  // Listen for app foregrounding to refresh zombie socket connection and sync roster
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isInRoom) {
        chatSocketService.syncOnForeground();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isInRoom]);

  // Smooth auto-scroll: scroll directly to new message whenever a new message is appended
  useEffect(() => {
    if (roomState.messages.length > prevMessagesLengthRef.current) {
      const lastMsg = roomState.messages[roomState.messages.length - 1];
      const isPrependedHistory =
        Boolean(prevLastMsgIdRef.current) &&
        Boolean(lastMsg?.id) &&
        String(lastMsg?.id) === String(prevLastMsgIdRef.current);

      if (!isPrependedHistory) {
        // A new message was appended to the bottom -> scroll directly to new message
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        flatListRef.current?.scrollToEnd({ animated: true });
        scrollTimeoutRef.current = setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 40);

        setNewMessagesWhileScrolled(0);
        setShowScrollBottomBtn(false);
      }
    }
    const currentLast = roomState.messages[roomState.messages.length - 1];
    prevLastMsgIdRef.current = currentLast?.id ?? null;
    prevMessagesLengthRef.current = roomState.messages.length;
  }, [roomState.messages]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 120;
    const isNearBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isAtBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);
    if (isNearBottom) {
      setNewMessagesWhileScrolled(0);
    }
  };

  // Handle Connect
  const handleJoinRoom = () => {
    if (roomState.connectionStatus === 'connecting') return;
    Keyboard.dismiss();
    hasAlertedErrorRef.current = false;
    if (!nickname.trim()) {
      Alert.alert('Nickname Required', 'Please enter your nickname.');
      return;
    }
    if (!passcode.trim()) {
      Alert.alert('Passcode Required', 'Please enter a room passcode.');
      return;
    }

    // Save custom server URL preference only (credentials/passcode are not saved per user request)
    settingsRepository.set('chat_saved_server_url', serverUrl.trim()).catch(() => {});

    initialScrollDoneRef.current = false;
    markedMessageIdsRef.current.clear();
    prevLastMsgIdRef.current = null;
    prevMessagesLengthRef.current = 0;
    setHasMoreOlder(true);
    setInputText('');
    setDisappearingSecs(undefined);
    setDirectTarget(null);
    setReplyingTo(null);
    setEditingMessage(null);
    setSearchState({ isSearching: false, searchQuery: '', currentMatchIdx: 0 });
    setHighlightedMessageId(null);
    setShowScrollBottomBtn(false);
    setNewMessagesWhileScrolled(0);
    setIsInRoom(true);
    chatSocketService.connect({
      serverUrl: serverUrl.trim(),
      nickname: nickname.trim(),
      passcode: passcode.trim(),
    });
  };

  // Send Message
  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      chatSocketService.sendTyping(false);
    }

    if (editingMessage) {
      chatSocketService.editMessage(editingMessage.id, inputText.trim());
      setEditingMessage(null);
      setInputText(draftBeforeEditRef.current || '');
      draftBeforeEditRef.current = '';
      return;
    }

    if (directTarget) {
      chatSocketService.sendDirectMessage(directTarget, inputText.trim(), {
        replyTo: replyingTo ? {
          id: replyingTo.id,
          nickname: replyingTo.nickname,
          message: replyingTo.message,
        } : undefined,
        expiresIn: disappearingSecs,
      });
    } else {
      chatSocketService.sendMessage(inputText.trim(), replyingTo ? {
        id: replyingTo.id,
        nickname: replyingTo.nickname,
        message: replyingTo.message,
      } : undefined, {
        expiresIn: disappearingSecs,
      });
    }

    setInputText('');
    setReplyingTo(null);
    settingsRepository.set(`chat_draft_${(chatSocketService.passcode || passcode).trim().toLowerCase()}`, '').catch(() => {});
    setNewMessagesWhileScrolled(0);
    setShowScrollBottomBtn(false);
    flatListRef.current?.scrollToEnd({ animated: true });
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 40);
  };

  // Typing emitter with idle timeout
  const handleTextChange = (text: string) => {
    setInputText(text);

    if (text.trim().length > 0) {
      if (!isTypingActiveRef.current) {
        isTypingActiveRef.current = true;
        chatSocketService.sendTyping(true);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        chatSocketService.sendTyping(false);
      }, 2500);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isTypingActiveRef.current) {
        isTypingActiveRef.current = false;
        chatSocketService.sendTyping(false);
      }
    }
  };


  // Story click
  const openStory = (story: ChatStatusStory, allStories?: ChatStatusStory[]) => {
    Keyboard.dismiss();
    setActiveStoryToView(story);
    setActiveStoryList(allStories || [story]);
    setIsCreateStoryMode(false);
    setModalVisible('story', true);
    chatSocketService.viewStatus(story.id);
  };

  const openCreateStory = () => {
    Keyboard.dismiss();
    setActiveStoryToView(null);
    setActiveStoryList([]);
    setIsCreateStoryMode(true);
    setModalVisible('story', true);
  };

  // Message Reaction
  const handleReact = useCallback((messageId: number | string, emoji: string) => {
    chatSocketService.reactToMessage(messageId, emoji);
    setActionSheetMsg(null);
  }, []);

  // Separate current user's active story from other members' stories
  const { myStories, otherMemberStories } = useMemo(() => {
    const currentNick = (chatSocketService.nickname || nickname).trim().toLowerCase();
    const my: ChatStatusStory[] = [];
    const map: Record<string, ChatStatusStory[]> = {};

    roomState.statuses.forEach((s) => {
      const key = (s.nickname || '').trim().toLowerCase();
      if (key === currentNick) {
        my.push(s);
      } else {
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });

    const others = Object.values(map).map((arr) => ({
      stories: arr,
      latestStory: arr[arr.length - 1],
      totalCount: arr.length,
    }));

    return { myStories: my, otherMemberStories: others };
  }, [roomState.statuses, nickname]);

  // Render Story Ring Item with count badge
  const renderStoryItem = (story: ChatStatusStory, allStories?: ChatStatusStory[], totalCount = 1) => {
    return (
      <TouchableOpacity
        key={story.id}
        style={styles.storyRingItem}
        onPress={() => openStory(story, allStories)}
      >
        <View style={styles.storyRingGradient}>
          <View style={styles.storyAvatarCircle}>
            <Text style={styles.storyAvatarLetter}>
              {(story.nickname || '').trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          {totalCount > 1 && (
            <View style={styles.storyCountBadge}>
              <Text style={styles.storyCountBadgeText}>{totalCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.storyRingName} numberOfLines={1}>
          {story.nickname}
        </Text>
      </TouchableOpacity>
    );
  };

  // Dynamic FAB bottom offset accounting for reply, edit, whisper, and disappearing
  const fabBottomOffset = useMemo(() => {
    if (searchState.isSearching) return 56;
    let b = 75;
    if (replyingTo) b += 44;
    if (editingMessage) b += 44;
    if (directTarget) b += 32;
    if (disappearingSecs !== undefined) b += 34;
    return b;
  }, [searchState.isSearching, replyingTo, editingMessage, directTarget, disappearingSecs]);

  // Dynamic attachment popup offset
  const attachBottomOffset = useMemo(() => {
    let b = 70;
    if (replyingTo) b += 44;
    if (editingMessage) b += 44;
    if (directTarget) b += 32;
    if (disappearingSecs !== undefined) b += 34;
    const bottomPadding = isKeyboardVisible && Platform.OS === 'android' ? 8 : Math.max(insets.bottom, 12);
    return b + bottomPadding;
  }, [replyingTo, editingMessage, directTarget, disappearingSecs, isKeyboardVisible, insets.bottom]);

  // Dynamic iOS Keyboard Vertical Offset
  const keyboardVerticalOffset = useMemo(() => {
    if (Platform.OS !== 'ios') return 0;
    let offset = Math.max(insets.top, 8) + 54;
    if (roomState.connectionStatus !== 'connected') offset += 38;
    if (searchState.isSearching) offset += 52;
    if (roomState.pinnedMsg) offset += 44;
    return offset;
  }, [insets.top, roomState.connectionStatus, searchState.isSearching, roomState.pinnedMsg]);

  // Message item handlers for memoized ChatMessageBubble
  const handleMessageLongPress = useCallback((msg: ChatMessage) => {
    Keyboard.dismiss();
    setActionSheetMsg(msg);
  }, []);

  const handleOpenLightbox = useCallback((uri: string) => {
    Keyboard.dismiss();
    setLightboxImage(uri);
  }, []);

  const handleVotePoll = useCallback((msgId: string | number, optId: string | number) => {
    chatSocketService.votePoll(msgId, Number(optId));
  }, []);

  const handleDirectMessage = useCallback((targetNick: string) => {
    setDirectTarget(targetNick);
    composerInputRef.current?.focus();
  }, []);

  const isTargetOnline = useMemo(() => {
    if (!directTarget) return true;
    const target = roomState.users.find(
      (u) => (u.nickname || '').trim().toLowerCase() === directTarget.trim().toLowerCase()
    );
    return Boolean(target && target.isOnline);
  }, [directTarget, roomState.users]);

  const handleInitiateCall = useCallback((targetNick?: string, isVoice: boolean = true) => {
    if (roomState.activeCall && roomState.activeCall.state === 'active') {
      Alert.alert('Call in Progress', 'You are already in an active call. Please end it before starting a new one.');
      return;
    }
    chatSocketService.initiateCall(targetNick, isVoice);
  }, [roomState.activeCall]);

  const handleRetryPendingMessage = useCallback((item: ChatMessage) => {
    Alert.alert('Pending Message', 'Message is queued. Choose an action:', [
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          chatSocketService.removePendingMessage(item.id);
        },
      },
      {
        text: 'Retry Send',
        onPress: () => {
          chatSocketService.removePendingMessage(item.id);
          const payload = {
            replyTo: item.replyTo || undefined,
            fileUrl: item.fileUrl || undefined,
            fileName: item.fileName || undefined,
            fileType: item.fileType || undefined,
            fileSize: item.fileSize || undefined,
            isVoiceNote: item.isVoiceNote,
            isVideoNote: item.isVideoNote,
            isWithoutSound: item.isWithoutSound,
            expiresIn: item.expiresAt
              ? Math.max(1, Math.floor((new Date(item.expiresAt).getTime() - Date.now()) / 1000))
              : undefined,
            locationData: item.locationData || undefined,
            pollData: item.pollData || undefined,
          };
          if (item.isDirect && item.targetNickname) {
            chatSocketService.sendDirectMessage(item.targetNickname, item.message, payload);
          } else {
            chatSocketService.sendMessage(item.message, item.replyTo || undefined, payload);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  // Memoized Item Renderer using ChatMessageBubble with debounced search query
  const renderMessageItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const prevItem = roomState.messages[index - 1];
    const isDifferentDay =
      index === 0 ||
      Boolean(
        prevItem?.createdAt &&
        item?.createdAt &&
        new Date(item.createdAt).toDateString() !== new Date(prevItem.createdAt).toDateString()
      );

    return (
      <ChatMessageBubble
        item={item}
        index={index}
        isDifferentDay={isDifferentDay}
        currentNickname={chatSocketService.nickname}
        onlineCount={roomState.users.length}
        isSearching={searchState.isSearching}
        searchQuery={debouncedSearchQuery}
        isPlayingVoice={playingVoiceId === String(item.id)}
        onToggleVoicePlay={handleToggleVoicePlay}
        onLongPress={handleMessageLongPress}
        onOpenImage={handleOpenLightbox}
        onScrollToMessageId={scrollToMessageId}
        onVotePoll={handleVotePoll}
        onReact={handleReact}
        onDirectMessage={handleDirectMessage}
        onInitiateCall={handleInitiateCall}
        onRetryPendingMessage={handleRetryPendingMessage}
        isHighlighted={highlightedMessageId !== null && String(highlightedMessageId) === String(item.id)}
      />
    );
  }, [
    roomState.messages,
    roomState.users.length,
    searchState.isSearching,
    debouncedSearchQuery,
    playingVoiceId,
    highlightedMessageId,
    handleToggleVoicePlay,
    handleMessageLongPress,
    handleOpenLightbox,
    scrollToMessageId,
    handleVotePoll,
    handleReact,
    handleDirectMessage,
    handleInitiateCall,
    handleRetryPendingMessage,
  ]);

  // Empty Feed Presentation
  const renderEmptyFeed = () => (
    <View style={styles.emptyFeedContainer}>
      <View style={styles.emptyFeedIconBox}>
        <Text style={styles.emptyFeedIcon}>💬</Text>
      </View>
      <Text style={styles.emptyFeedTitle}>Welcome!</Text>
      <Text style={styles.emptyFeedSubtitle}>
        No messages yet in this room. Break the ice and say hello to everyone! 👋
      </Text>
      <View style={styles.emptyFeedPillRow}>
        {['👋 Hello everyone!', '🚀 Ready to collaborate', '🍿 Anyone for watch party?'].map(
          (starter) => (
            <TouchableOpacity
              key={starter}
              style={styles.emptyFeedStarterChip}
              onPress={() => {
                setInputText(starter);
                composerInputRef.current?.focus();
              }}
            >
              <Text style={styles.emptyFeedStarterText}>{starter}</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );

  // Background Theme Palette mapping
  const getThemeBackground = () => {
    switch (roomState.wallpaper?.theme) {
      case 'emerald-night':
        return '#062E25';
      case 'deep-purple':
        return '#1E1B4B';
      case 'ocean-blue':
        return '#0C4A6E';
      case 'dark-slate':
        return '#0F172A';
      default:
        return '#0B141A';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: getThemeBackground() }]}>
      <StatusBar barStyle="light-content" />

      {/* Not In Room: Modular Gateway View */}
      {!isInRoom ? (
        <ChatGatewayView
          passcode={passcode}
          setPasscode={setPasscode}
          nickname={nickname}
          setNickname={setNickname}
          connectionStatus={roomState.connectionStatus}
          onJoin={handleJoinRoom}
          onGoBack={handleGoBack}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      ) : (
        /* Joined Room: Active Room Experience */
        <View style={[styles.activeRoomContainer, { paddingTop: Math.max(insets.top, 0) }]}>
          {/* Custom Image Wallpaper Support with Legibility Scrim */}
          {roomState.wallpaper?.theme === 'custom' && Boolean(roomState.wallpaper?.customWallpaper) && (
            <View style={StyleSheet.absoluteFill}>
              <ImageBackground
                source={{ uri: roomState.wallpaper.customWallpaper! }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11, 20, 26, 0.72)' }]} />
            </View>
          )}

          {/* Room Header */}
          <View style={styles.chatHeader}>
            <View style={styles.headerLeftCol}>
              <View style={styles.latencyRow}>
                <View
                  style={[
                    styles.onlineDot,
                    roomState.connectionStatus === 'connecting'
                      ? styles.dotConnecting
                      : roomState.connectionStatus === 'disconnected'
                      ? styles.dotDisconnected
                      : styles.dotConnected,
                  ]}
                />
                <Text style={styles.latencyText}>
                  {roomState.connectionStatus === 'connected'
                    ? `Connected • ${roomState.latency}ms`
                    : roomState.connectionStatus === 'connecting'
                    ? 'Reconnecting...'
                    : 'Offline'}
                </Text>
              </View>
            </View>

            {/* Right Col: Quick action buttons */}
            <View style={styles.headerRightCol}>
              <TouchableOpacity
                style={[styles.iconBtn, searchState.isSearching && styles.iconBtnActive]}
                onPress={() => {
                  setSearchState((prev) => ({
                    ...prev,
                    isSearching: !prev.isSearching,
                    searchQuery: prev.isSearching ? '' : prev.searchQuery,
                  }));
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Search messages"
              >
                <Text style={styles.iconBtnText}>🔍</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleInitiateCall(undefined, true)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Voice Call"
              >
                <Text style={styles.iconBtnText}>📞</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleInitiateCall(undefined, false)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Video Call"
              >
                <Text style={styles.iconBtnText}>📹</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={handleOpenRoomMenu}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Room options"
              >
                <Text style={styles.iconBtnText}>⋮</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Minimized Floating Call Banner */}
          {Boolean(roomState.activeCall) && isCallMinimized && roomState.activeCall?.state === 'active' && (
            <TouchableOpacity
              style={styles.minimizedCallBanner}
              activeOpacity={0.9}
              onPress={() => setIsCallMinimized(false)}
            >
              <View style={styles.minimizedCallLeft}>
                <View style={styles.minimizedCallPulseDot} />
                <Text style={styles.minimizedCallTitle} numberOfLines={1}>
                  {roomState.activeCall.isVoiceOnly ? '🎙️' : '📹'} @{roomState.activeCall.calleeNickname || roomState.activeCall.callerNickname || 'Call'}
                </Text>
                <Text style={styles.minimizedCallTimer}>
                  {formatCallTimer(roomState.activeCall.durationSeconds)}
                </Text>
              </View>
              <View style={styles.minimizedCallRight}>
                <TouchableOpacity
                  style={styles.minimizedCallActionBtn}
                  onPress={() => setIsCallMinimized(false)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.minimizedCallActionText}>Expand ↗</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.minimizedCallActionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => chatSocketService.endCall()}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.minimizedCallActionText}>End</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* Dynamic Reconnecting / Offline Banner */}
          {roomState.connectionStatus !== 'connected' && (
            <View
              style={[
                styles.connectionBanner,
                roomState.connectionStatus === 'connecting'
                  ? styles.connectionBannerConnecting
                  : styles.connectionBannerDisconnected,
              ]}
            >
              {roomState.connectionStatus === 'connecting' ? (
                <>
                  <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={styles.connectionBannerText}>
                    Reconnecting to room... Outbox will sync.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.connectionBannerText}>
                    ⚠️ Disconnected from room.
                  </Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => {
                      hasAlertedErrorRef.current = false;
                      chatSocketService.connect({
                        serverUrl: chatSocketService.activeServerUrl || serverUrl,
                        nickname: chatSocketService.nickname || nickname,
                        passcode: chatSocketService.passcode || passcode,
                      });
                    }}
                  >
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* In-Chat Message Search Bar with Stepper Controls */}
          {searchState.isSearching && (
            <View style={styles.searchBarContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search messages, members, files..."
                placeholderTextColor="#64748B"
                value={searchState.searchQuery}
                onChangeText={(text) => setSearchState((prev) => ({ ...prev, searchQuery: text }))}
                returnKeyType="search"
                onSubmitEditing={handleNextMatch}
                autoFocus
              />
              {searchState.searchQuery.trim().length > 0 && (
                <View style={styles.searchNavRow}>
                  <Text style={styles.searchCountText}>
                    {matchingIndices.length > 0
                      ? `${Math.min(searchState.currentMatchIdx + 1, matchingIndices.length)}/${matchingIndices.length}`
                      : '0'}
                  </Text>
                  <TouchableOpacity
                    style={styles.searchNavArrowBtn}
                    onPress={handlePrevMatch}
                    disabled={matchingIndices.length === 0}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.searchNavArrowText}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.searchNavArrowBtn}
                    onPress={handleNextMatch}
                    disabled={matchingIndices.length === 0}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.searchNavArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={styles.searchCloseBtn}
                onPress={() => {
                  setSearchState({ isSearching: false, searchQuery: '', currentMatchIdx: 0 });
                }}
              >
                <Text style={styles.searchCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 24h Stories Bar */}
          <View style={otherMemberStories.length === 0 && myStories.length === 0 ? styles.storiesBarCompact : styles.storiesBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {/* Add / View Your Story Button */}
              <TouchableOpacity
                style={otherMemberStories.length === 0 && myStories.length === 0 ? styles.addStoryPill : styles.addStoryRing}
                onPress={() => {
                  if (myStories.length > 0) {
                    openStory(myStories[myStories.length - 1], myStories);
                  } else {
                    openCreateStory();
                  }
                }}
              >
                <View
                  style={[
                    otherMemberStories.length === 0 && myStories.length === 0
                      ? styles.addStoryPlusCompact
                      : styles.addStoryPlusCircle,
                    myStories.length > 0 && { borderColor: '#10B981', backgroundColor: '#064E3B' },
                  ]}
                >
                  <Text
                    style={
                      otherMemberStories.length === 0 && myStories.length === 0
                        ? styles.addStoryPlusTextCompact
                        : styles.addStoryPlusText
                    }
                  >
                    {myStories.length > 0 ? '▶' : '+'}
                  </Text>
                </View>
                <Text style={styles.storyRingName}>
                  {myStories.length > 0 ? `Your Story (${myStories.length})` : 'Your Story'}
                </Text>
              </TouchableOpacity>

              {/* Other Members' Grouped Stories */}
              {otherMemberStories.map(({ stories, latestStory, totalCount }) =>
                renderStoryItem(latestStory, stories, totalCount)
              )}
            </ScrollView>
          </View>

          {/* Pinned Message Banner */}
          {roomState.pinnedMsg && (
            <View style={styles.pinnedBanner}>
              <TouchableOpacity
                style={styles.pinnedContent}
                activeOpacity={0.8}
                onPress={() => scrollToMessageId(roomState.pinnedMsg!.id)}
              >
                <Text style={styles.pinnedIcon}>📌</Text>
                <View style={styles.pinnedTextCol}>
                  <Text style={styles.pinnedAuthor}>@{roomState.pinnedMsg.nickname}:</Text>
                  <Text style={styles.pinnedSnippet} numberOfLines={1}>
                    {roomState.pinnedMsg.message}
                  </Text>
                </View>
              </TouchableOpacity>
              {chatSocketService.isAdmin && (
                <TouchableOpacity
                  style={styles.unpinBtn}
                  onPress={() => chatSocketService.pinMessage(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.unpinText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Active Room Body wrapped in KeyboardAvoidingView */}
          <KeyboardAvoidingView
            style={styles.activeRoomBody}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={keyboardVerticalOffset}
          >
            {/* Virtualized Message Feed */}
            <FlatList
              ref={flatListRef}
              data={roomState.messages}
              keyExtractor={(item, idx) => (item?.id !== undefined ? String(item.id) : `msg_${idx}`)}
              renderItem={renderMessageItem}
              contentContainerStyle={[
                styles.feedContent,
                roomState.messages.length === 0 && styles.feedContentEmpty,
              ]}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={5}
              updateCellsBatchingPeriod={40}
              removeClippedSubviews={Platform.OS === 'android'}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={renderEmptyFeed}
              ListHeaderComponent={
                roomState.messages.length > 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    {hasMoreOlder ? (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 16,
                          paddingVertical: 7,
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: 'rgba(56, 189, 248, 0.25)',
                        }}
                        onPress={handleLoadOlder}
                        disabled={isLoadingOlder}
                        activeOpacity={0.75}
                      >
                        {isLoadingOlder ? (
                          <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 6 }} />
                        ) : (
                          <Text style={{ fontSize: 12, color: '#38BDF8', fontWeight: '700', marginRight: 4 }}>⬆️</Text>
                        )}
                        <Text style={{ fontSize: 12, color: '#38BDF8', fontWeight: '700' }}>
                          {isLoadingOlder ? 'Loading earlier history...' : `Load earlier messages (${roomState.messages.length} loaded)`}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                          ✨ Beginning of conversation ({roomState.messages.length} messages)
                        </Text>
                      </View>
                    )}
                  </View>
                ) : undefined
              }
              ListFooterComponent={
                roomState.typingUsers.length > 0 ? (
                  <TypingIndicatorBubble typingUsers={roomState.typingUsers} />
                ) : undefined
              }
              onContentSizeChange={() => {
                if (!initialScrollDoneRef.current && roomState.messages.length > 0) {
                  initialScrollDoneRef.current = true;
                  flatListRef.current?.scrollToEnd({ animated: false });
                } else if (roomState.messages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
              onScrollToIndexFailed={(info) => {
                try {
                  flatListRef.current?.scrollToOffset({
                    offset: Math.max(0, info.index * (info.averageItemLength || 75)),
                    animated: true,
                  });
                  if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                  scrollTimeoutRef.current = setTimeout(() => {
                    try {
                      flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                    } catch {
                      // Safe fallback without uncaught crash
                    }
                  }, 120);
                } catch {
                  // Ignore
                }
              }}
            />

            {/* Scroll to Bottom Floating Action Button */}
            {showScrollBottomBtn && (
              <TouchableOpacity
                style={[styles.scrollBottomFab, { bottom: fabBottomOffset }]}
                onPress={() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                  setShowScrollBottomBtn(false);
                  setNewMessagesWhileScrolled(0);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.scrollBottomFabIcon}>↓</Text>
                {newMessagesWhileScrolled > 0 && (
                  <View style={styles.scrollBottomBadge}>
                    <Text style={styles.scrollBottomBadgeText}>
                      {newMessagesWhileScrolled > 99 ? '99+' : newMessagesWhileScrolled}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Typing Indicator */}
            {roomState.typingUsers.length > 0 && (
              <View style={styles.typingIndicatorRow}>
                <Text style={styles.typingText}>
                  ✍️ {roomState.typingUsers.join(', ')} {roomState.typingUsers.length === 1 ? 'is' : 'are'} typing...
                </Text>
              </View>
            )}

            {/* Direct Whisper Notice */}
            {directTarget && (
              <View style={styles.whisperNoticeBar}>
                <View style={styles.whisperNoticeLeft}>
                  <Text style={styles.whisperLockIcon}>🔒</Text>
                  <Text style={styles.whisperNoticeText}>
                    Private to @{directTarget}
                  </Text>
                  {!isTargetOnline && (
                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700', marginLeft: 6 }}>
                      (offline)
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.whisperExitBtn}
                  onPress={() => setDirectTarget(null)}
                >
                  <Text style={styles.whisperExitBtnText}>Return to Public Room ✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Replying-To Preview Bar */}
            {replyingTo && (
              <View style={styles.replyBar}>
                <View style={styles.replyBarCol}>
                  <Text style={styles.replyBarAuthor}>Replying to @{replyingTo.nickname}</Text>
                  <Text style={styles.replyBarSnippet} numberOfLines={1}>
                    {replyingTo.message}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={styles.replyBarDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Message Editing Preview Bar */}
            {editingMessage && (
              <View style={styles.editBar}>
                <View style={styles.editBarCol}>
                  <Text style={styles.editBarTitle}>✏️ Editing Message</Text>
                  <Text style={styles.editBarSnippet} numberOfLines={1}>
                    {editingMessage.message}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditingMessage(null);
                    setInputText(draftBeforeEditRef.current || '');
                    draftBeforeEditRef.current = '';
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.editBarDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Active Modes Indicator Bar */}
            {disappearingSecs !== undefined && (
              <View style={styles.composerModesBar}>
                <TouchableOpacity
                  style={styles.modeBadge}
                  onPress={() => setDisappearingSecs(undefined)}
                >
                  <Text style={styles.modeBadgeText}>
                    ⏳ Disappearing ({formatDurationLabel(disappearingSecs)}) ✕
                  </Text>
                </TouchableOpacity>
              </View>
            )}


            {/* Search Navigation Banner */}
            {searchState.isSearching && (
              <View style={[styles.searchFooterNotice, { paddingBottom: 6 }]}>
                <Text style={styles.searchFooterText}>
                  {matchingIndices.length > 0
                    ? `🔍 Showing match ${Math.min(searchState.currentMatchIdx + 1, matchingIndices.length)} of ${matchingIndices.length}. Use ▲ / ▼ to navigate.`
                    : '🔍 No matching messages found in loaded history.'}
                </Text>
                {matchingIndices.length === 0 && Boolean(debouncedSearchQuery.trim()) && (
                  <TouchableOpacity
                    style={{
                      marginTop: 4,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      borderRadius: 12,
                      alignSelf: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(56, 189, 248, 0.3)',
                    }}
                    onPress={async () => {
                      const res = await chatSocketService.searchRemoteMessages(debouncedSearchQuery);
                      if (res.loaded === 0) {
                        Alert.alert('Search Results', `No messages matching "${debouncedSearchQuery}" found on server.`);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#38BDF8', fontWeight: '700' }}>
                      🌐 Search server history for "{debouncedSearchQuery}"
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Bottom Composer Container */}
            <View
              style={[
                styles.composerContainer,
                {
                  paddingBottom:
                    isKeyboardVisible && Platform.OS === 'android'
                      ? 8
                      : Math.max(insets.bottom, 12),
                },
              ]}
            >
              {/* Attachment / Options Menu Button */}
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setModalVisible('attach', !modals.attach);
                }}
              >
                <Text style={styles.attachBtnIcon}>+</Text>
              </TouchableOpacity>

              {/* Text Input */}
              <TextInput
                ref={composerInputRef}
                style={styles.composerInput}
                placeholder={
                  editingMessage
                    ? 'Edit your message...'
                    : directTarget
                    ? `🔒 Whisper to @${directTarget}...`
                    : 'Message...'
                }
                placeholderTextColor="#64748B"
                value={inputText}
                onChangeText={handleTextChange}
                multiline
                maxLength={2000}
              />


              {/* Send Button */}
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { opacity: inputText.trim() ? 1 : 0.4 },
                ]}
                onPress={handleSendMessage}
                disabled={!inputText.trim()}
              >
                <Text style={styles.sendBtnIcon}>{editingMessage ? '✓' : '➤'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>

          {/* Attachment Popup Menu */}
          {modals.attach && (
            <>
              <TouchableOpacity
                style={styles.attachBackdrop}
                activeOpacity={1}
                onPress={() => setModalVisible('attach', false)}
              />
              <View style={[styles.attachPopup, { bottom: attachBottomOffset }]}>
                <TouchableOpacity
                  style={styles.attachPopupItem}
                  onPress={() => {
                    Keyboard.dismiss();
                    setModalVisible('attach', false);
                    if (editingMessage) {
                      setEditingMessage(null);
                      setInputText(draftBeforeEditRef.current || '');
                      draftBeforeEditRef.current = '';
                    }
                    setModalVisible('poll', true);
                  }}
                >
                  <Text style={styles.attachItemIcon}>📊</Text>
                  <Text style={styles.attachItemText}>Create Poll</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.attachPopupItem}
                  onPress={() => {
                    setModalVisible('attach', false);
                    Alert.alert(
                      'Disappearing Messages',
                      'Set auto-delete duration for messages:\n(Messages self-destruct after selected duration)',
                      [
                        { text: 'Off', onPress: () => setDisappearingSecs(undefined) },
                        { text: '30 Seconds', onPress: () => setDisappearingSecs(30) },
                        { text: '5 Minutes', onPress: () => setDisappearingSecs(300) },
                        { text: '1 Hour', onPress: () => setDisappearingSecs(3600) },
                        { text: '24 Hours', onPress: () => setDisappearingSecs(86400) },
                      ]
                    );
                  }}
                >
                  <Text style={styles.attachItemIcon}>⏳</Text>
                  <Text style={styles.attachItemText}>
                    {disappearingSecs ? `Timer: ${formatDurationLabel(disappearingSecs)}` : 'Disappearing'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Long-press Action Sheet */}
          {actionSheetMsg && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => {
                setActionSheetMsg(null);
                setModalVisible('moreReactions', false);
              }}
            >
              <TouchableOpacity
                style={styles.actionSheetBackdrop}
                activeOpacity={1}
                onPress={() => {
                  setActionSheetMsg(null);
                  setModalVisible('moreReactions', false);
                }}
              >
                {(() => {
                  const isPendingMsg = typeof actionSheetMsg.id === 'string' && actionSheetMsg.id.startsWith('offline_');
                  return (
                    <TouchableOpacity
                      style={[styles.actionSheetCard, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}
                      activeOpacity={1}
                      onPress={(e) => e.stopPropagation?.()}
                    >

                      {/* Actions */}
                      {!actionSheetMsg.isDeleted && (
                        <TouchableOpacity
                          style={styles.sheetItem}
                          onPress={() => {
                            setReplyingTo(actionSheetMsg);
                            setEditingMessage(null);
                            setActionSheetMsg(null);
                            setModalVisible('moreReactions', false);
                            setTimeout(() => {
                              composerInputRef.current?.focus();
                            }, 50);
                          }}
                        >
                          <Text style={styles.sheetItemText}>💬 Reply</Text>
                        </TouchableOpacity>
                      )}

                      {(actionSheetMsg.nickname || '').trim().toLowerCase() ===
                        (chatSocketService.nickname || '').trim().toLowerCase() &&
                        !actionSheetMsg.isDeleted &&
                        !actionSheetMsg.pollData &&
                        !actionSheetMsg.isVoiceNote &&
                        !isPendingMsg && (
                        <TouchableOpacity
                          style={styles.sheetItem}
                          onPress={() => {
                            draftBeforeEditRef.current = inputText;
                            setEditingMessage(actionSheetMsg);
                            setInputText(actionSheetMsg.message || '');
                            setReplyingTo(null);
                            setActionSheetMsg(null);
                            setModalVisible('moreReactions', false);
                            setTimeout(() => {
                              composerInputRef.current?.focus();
                            }, 50);
                          }}
                        >
                          <Text style={styles.sheetItemText}>✏️ Edit Message</Text>
                        </TouchableOpacity>
                      )}

                      {!actionSheetMsg.isDeleted && Boolean(actionSheetMsg.message) && (
                        <TouchableOpacity
                          style={styles.sheetItem}
                          onPress={() => {
                            const copied = copyToClipboard(actionSheetMsg.message || '');
                            if (copied) {
                              Alert.alert('Copied', 'Message copied to clipboard.');
                            }
                            setActionSheetMsg(null);
                          }}
                        >
                          <Text style={styles.sheetItemText}>📋 Copy Text</Text>
                        </TouchableOpacity>
                      )}

                      {chatSocketService.isAdmin && !actionSheetMsg.isDeleted && !isPendingMsg && (
                        <TouchableOpacity
                          style={styles.sheetItem}
                          onPress={() => {
                            const isPinned = roomState.pinnedMsg?.id === actionSheetMsg.id;
                            chatSocketService.pinMessage(isPinned ? null : actionSheetMsg.id);
                            setActionSheetMsg(null);
                          }}
                        >
                          <Text style={styles.sheetItemText}>
                            {roomState.pinnedMsg?.id === actionSheetMsg.id ? '📌 Unpin from Room' : '📌 Pin to Room'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {!actionSheetMsg.isDeleted &&
                        ((actionSheetMsg.nickname || '').trim().toLowerCase() ===
                          (chatSocketService.nickname || '').trim().toLowerCase() ||
                          chatSocketService.isAdmin) && (
                        <TouchableOpacity
                          style={styles.sheetItem}
                          onPress={() => {
                            chatSocketService.deleteMessage(actionSheetMsg.id);
                            setActionSheetMsg(null);
                          }}
                        >
                          <Text style={[styles.sheetItemText, { color: '#EF4444' }]}>
                            {isPendingMsg ? '🗑️ Discard Pending Message' : '🗑️ Delete Message'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </TouchableOpacity>
            </Modal>
          )}

          {/* Integrated Modals */}
          {Boolean(roomState.activeCall) && (
            <CallOverlayModal
              call={roomState.activeCall!}
              onAccept={() => chatSocketService.acceptCall()}
              onDecline={() => chatSocketService.declineCall()}
              onEndCall={() => chatSocketService.endCall()}
              isMinimized={isCallMinimized}
              onToggleMinimize={setIsCallMinimized}
            />
          )}

          {modals.roster && (
            <RosterModerationModal
              visible={modals.roster}
              onClose={() => setModalVisible('roster', false)}
              users={roomState.users}
              currentNickname={chatSocketService.nickname}
              isHost={chatSocketService.isHost}
              isAdmin={chatSocketService.isAdmin}
              onDirectMessage={handleDirectMessage}
              onCallUser={(nick) => handleInitiateCall(nick, false)}
              onMuteUser={(nick, muted, dur) => chatSocketService.muteUser(nick, muted, dur)}
              onKickUser={(nick) => chatSocketService.kickUser(nick)}
              onBanUser={(nick) => chatSocketService.banUser(nick)}
              onPromoteUser={(nick, role) => chatSocketService.promoteUser(nick, role)}
              onTransferHost={(nick) => chatSocketService.transferHost(nick)}
              onClearInactive={() => chatSocketService.clearInactiveUsers(7)}
              onClearHistory={() => chatSocketService.clearHistory()}
            />
          )}

          {modals.story && (
            <StatusStoryModal
              visible={modals.story}
              onClose={() => setModalVisible('story', false)}
              activeStory={activeStoryToView}
              stories={activeStoryList}
              isCreateMode={isCreateStoryMode}
              currentNickname={chatSocketService.nickname}
              onViewStory={(id) => chatSocketService.viewStatus(id)}
              onDeleteStory={(id) => chatSocketService.deleteStatus(id)}
              onCreateStory={(data) => chatSocketService.createStatus(data)}
            />
          )}

          {modals.poll && (
            <PollCreateModal
              visible={modals.poll}
              onClose={() => setModalVisible('poll', false)}
              onSubmitPoll={(pollData) => {
                const replyRef = replyingTo ? {
                  id: replyingTo.id,
                  nickname: replyingTo.nickname,
                  message: replyingTo.message,
                } : undefined;
                const payload = {
                  pollData,
                  expiresIn: disappearingSecs,
                  isWithoutSound: false,
                  replyTo: replyRef,
                };
                if (directTarget) {
                  chatSocketService.sendDirectMessage(directTarget, `📊 Poll: ${pollData.question}`, payload);
                } else {
                  chatSocketService.sendMessage(pollData.question, replyRef, payload);
                }
                if (replyingTo) {
                  setReplyingTo(null);
                }
              }}
            />
          )}

          {modals.watchParty && (
            <WatchPartyModal
              visible={modals.watchParty}
              onClose={() => setModalVisible('watchParty', false)}
              state={roomState.watchParty}
              isHost={chatSocketService.isHost}
              onAction={(action, payload) => chatSocketService.watchPartyAction(action, payload)}
              onSendReaction={(emoji) => chatSocketService.watchPartyReaction(emoji)}
              onSendComment={(comment) => chatSocketService.watchPartyComment(comment)}
            />
          )}

          {modals.wallpaper && (
            <RoomWallpaperModal
              visible={modals.wallpaper}
              onClose={() => setModalVisible('wallpaper', false)}
              currentTheme={roomState.wallpaper?.theme || 'wa-doodle'}
              onSelectTheme={(theme, customUrl) => chatSocketService.updateRoomWallpaper(theme, customUrl)}
            />
          )}



          {/* Fullscreen Image Lightbox Preview Modal */}
          {Boolean(lightboxImage) && (
            <Modal
              visible={Boolean(lightboxImage)}
              transparent
              animationType="fade"
              onRequestClose={() => setLightboxImage(null)}
            >
              <TouchableOpacity
                style={styles.lightboxOverlay}
                activeOpacity={1}
                onPress={() => setLightboxImage(null)}
              >
                <View style={{ flexDirection: 'row', position: 'absolute', top: Math.max(insets.top + 10, 50), right: 20, gap: 10, zIndex: 99 }}>
                  <TouchableOpacity
                    style={styles.lightboxCloseBtn}
                    onPress={() => {
                      copyToClipboard(lightboxImage!);
                      Alert.alert('Copied', 'Image link copied to clipboard.');
                    }}
                  >
                    <Text style={styles.lightboxCloseText}>📋 Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lightboxCloseBtn}
                    onPress={() => {
                      Linking.openURL(lightboxImage!).catch(() => {});
                    }}
                  >
                    <Text style={styles.lightboxCloseText}>↗️ Open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lightboxCloseBtn}
                    onPress={() => setLightboxImage(null)}
                  >
                    <Text style={styles.lightboxCloseText}>✕ Close</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                >
                  <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
                    <Image
                      source={{ uri: lightboxImage! }}
                      style={styles.lightboxImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </ScrollView>
              </TouchableOpacity>
            </Modal>
          )}
        </View>
      )}
    </View>
  );
};
