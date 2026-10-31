import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ChatMessage } from '../../types/chat';
import { styles } from './chatStyles';
import { copyToClipboard } from '../../utils/clipboard';
import { chatSocketService } from '../../services/chat/ChatSocketService';
import { chatAudioPlayerService } from '../../services/chat/ChatAudioPlayerService';

// In-memory format caches to eliminate repeated new Date() allocations in feed
const timeFormatCache = new Map<string, string>();
const dateFormatCache = new Map<string, string>();

export const formatSafeTime = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '';
  const key = typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
  const cached = timeFormatCache.get(key);
  if (cached) return cached;

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const formatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (timeFormatCache.size > 200) timeFormatCache.clear();
  timeFormatCache.set(key, formatted);
  return formatted;
};

export const renderDateSeparator = (dateStr?: string | Date | null) => {
  if (!dateStr) return null;
  const key = typeof dateStr === 'string' ? dateStr.substring(0, 10) : dateStr.toISOString().substring(0, 10);
  let label = dateFormatCache.get(key);
  if (!label) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    label = isToday
      ? 'Today'
      : isYesterday
      ? 'Yesterday'
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    if (dateFormatCache.size > 100) dateFormatCache.clear();
    dateFormatCache.set(key, label);
  }

  return (
    <View style={styles.dateSeparatorRow}>
      <View style={styles.dateBadge}>
        <Text style={styles.dateBadgeText}>{label}</Text>
      </View>
    </View>
  );
};

export const ChatImageCard: React.FC<{ uri: string; onPress: () => void }> = React.memo(({ uri, onPress }) => {
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setHasError(false);
  }, [uri]);

  return (
    <TouchableOpacity
      style={styles.imageCardContainer}
      activeOpacity={0.9}
      onPress={hasError ? () => { setHasError(false); setReloadKey((k) => k + 1); } : onPress}
    >
      {hasError ? (
        <View style={[styles.bubbleImage, styles.imageErrorBox]}>
          <Text style={styles.imageErrorIcon}>🖼️</Text>
          <Text style={styles.imageErrorText}>Image unavailable</Text>
          <Text style={styles.imageRetryText}>🔄 Tap to retry</Text>
        </View>
      ) : (
        <Image
          key={`${uri}_${reloadKey}`}
          source={{ uri }}
          style={styles.bubbleImage}
          resizeMode="cover"
          onError={() => setHasError(true)}
        />
      )}
    </TouchableOpacity>
  );
});

// Static waveform bar heights to avoid array allocation on every animation tick
const STATIC_WAVE_BARS = [12, 20, 8, 24, 16, 28, 14, 22, 10, 18, 14, 22, 12, 26, 16] as const;

export const VoiceNoteBubbleCard: React.FC<{
  messageId: string | number;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}> = React.memo(({ messageId, fileUrl, fileName, fileSize }) => {
  const [playerState, setPlayerState] = useState(() => chatAudioPlayerService.getState);

  useEffect(() => {
    return chatAudioPlayerService.subscribe((st) => {
      setPlayerState(st);
    });
  }, []);

  const isCurrent = playerState.activeId === messageId;
  const isPlaying = isCurrent && playerState.isPlaying;
  const resolvedUrl = chatSocketService.resolveFileUrl(fileUrl);

  const handleToggle = () => {
    if (!resolvedUrl) {
      Alert.alert('Audio Unavailable', 'This voice note does not have a valid audio URL.');
      return;
    }
    chatAudioPlayerService.play(resolvedUrl, messageId);
  };

  const parsedDurationFromFilename = (() => {
    if (!fileName) return 0;
    const match = fileName.match(/_(\d+)s\.[a-z0-9]+$/i);
    return match ? parseInt(match[1], 10) : 0;
  })();

  const durationSec =
    isCurrent && playerState.duration > 0
      ? Math.round(playerState.duration)
      : parsedDurationFromFilename > 0
      ? parsedDurationFromFilename
      : fileSize && fileSize > 0
      ? Math.round(fileSize / 16000)
      : 0;
  const currentSec = isCurrent ? Math.round(playerState.currentTime) : 0;

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const progressFraction = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;
  const activeBarCount = Math.round(progressFraction * STATIC_WAVE_BARS.length);

  return (
    <TouchableOpacity
      style={styles.voiceNoteCard}
      activeOpacity={0.8}
      onPress={handleToggle}
    >
      <View style={[styles.voicePlayBtn, isPlaying && styles.voicePlayBtnActive]}>
        {playerState.isLoading && isCurrent ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.voicePlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        )}
      </View>
      <View style={styles.voiceWaveCol}>
        <View style={styles.voiceHeaderRow}>
          <Text style={styles.voiceWaveTitle}>{fileName || 'Voice Note'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isCurrent && (
              <TouchableOpacity
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  backgroundColor: 'rgba(56, 189, 248, 0.18)',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(56, 189, 248, 0.35)',
                }}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  const nextRate = playerState.playbackRate === 1 ? 1.5 : playerState.playbackRate === 1.5 ? 2 : 1;
                  chatAudioPlayerService.setPlaybackRate(nextRate);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 10, color: '#38BDF8', fontWeight: '800' }}>
                  {playerState.playbackRate || 1}x
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.voiceDurationText}>
              {isPlaying || currentSec > 0
                ? `${formatSec(currentSec)} / ${formatSec(durationSec || 15)}`
                : durationSec > 0
                ? formatSec(durationSec)
                : '0:15'}
            </Text>
          </View>
        </View>
        <View style={styles.voiceWaveBarsRow}>
          {STATIC_WAVE_BARS.map((h, i) => {
            const activeBar = isPlaying ? i <= activeBarCount : false;
            return (
              <View
                key={i}
                style={[
                  styles.voiceWaveBar,
                  {
                    height:
                      isPlaying && i % 2 === Math.floor(playerState.currentTime * 2) % 2
                        ? Math.min(28, h + 6)
                        : h,
                  },
                  activeBar && styles.voiceWaveBarPlaying,
                ]}
              />
            );
          })}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const ExpiringCountdownBadge: React.FC<{ expiresAt: string | Date }> = React.memo(({ expiresAt }) => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!expiresAt) return 0;
    const target = new Date(expiresAt).getTime();
    if (isNaN(target)) return 0;
    return Math.max(0, Math.floor((target - chatSocketService.getAdjustedServerNow()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const target = new Date(expiresAt).getTime();
    if (isNaN(target)) {
      setSecondsLeft(0);
      return;
    }
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((target - chatSocketService.getAdjustedServerNow()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const label =
    secondsLeft < 60
      ? `${secondsLeft}s`
      : secondsLeft < 3600
      ? `${Math.floor(secondsLeft / 60)}m`
      : `${Math.floor(secondsLeft / 3600)}h`;

  return (
    <Text style={styles.expiringIcon}>
      ⏳ {label}
    </Text>
  );
});

export interface ChatMessageBubbleProps {
  item: ChatMessage;
  index: number;
  isDifferentDay: boolean;
  currentNickname: string;
  onlineCount: number;
  isSearching: boolean;
  searchQuery: string;
  isPlayingVoice: boolean;
  onToggleVoicePlay: (id: string) => void;
  onLongPress: (msg: ChatMessage) => void;
  onOpenImage: (uri: string) => void;
  onScrollToMessageId: (id: string | number) => void;
  onVotePoll: (msgId: string | number, optId: number | string) => void;
  onReact: (msgId: string | number, emoji: string) => void;
  onDirectMessage: (nick: string) => void;
  onInitiateCall: (nick?: string, isVoice?: boolean) => void;
  onRetryPendingMessage: (msg: ChatMessage) => void;
  isHighlighted?: boolean;
}

const renderWithSearchHighlight = (
  plainText: string | undefined | null,
  keyPrefix: string | number,
  isSearching: boolean,
  searchQuery: string
) => {
  const safeText = plainText || '';
  const searchTrim = isSearching ? searchQuery.trim() : '';
  if (!searchTrim) {
    return <Text key={keyPrefix}>{safeText}</Text>;
  }
  const escaped = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const qRegex = new RegExp(`(${escaped})`, 'gi');
  const tokens = safeText.split(qRegex);
  return (
    <Text key={keyPrefix}>
      {tokens.map((token, idx) => {
        if (token.toLowerCase() === searchTrim.toLowerCase()) {
          return (
            <Text key={idx} style={styles.searchHighlight}>
              {token}
            </Text>
          );
        }
        return token;
      })}
    </Text>
  );
};

const renderFormattedSpan = (
  rawSpan: string,
  keyPrefix: string | number,
  isSearching: boolean,
  searchQuery: string
) => {
  if (rawSpan.startsWith('**') && rawSpan.endsWith('**') && rawSpan.length >= 4) {
    return (
      <Text key={keyPrefix} style={{ fontWeight: '800' }}>
        {renderWithSearchHighlight(rawSpan.slice(2, -2), keyPrefix, isSearching, searchQuery)}
      </Text>
    );
  }
  if (
    ((rawSpan.startsWith('*') && rawSpan.endsWith('*')) ||
      (rawSpan.startsWith('_') && rawSpan.endsWith('_'))) &&
    rawSpan.length >= 2
  ) {
    return (
      <Text key={keyPrefix} style={{ fontStyle: 'italic' }}>
        {renderWithSearchHighlight(rawSpan.slice(1, -1), keyPrefix, isSearching, searchQuery)}
      </Text>
    );
  }
  if (rawSpan.startsWith('`') && rawSpan.endsWith('`') && rawSpan.length >= 2) {
    return (
      <Text
        key={keyPrefix}
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          color: '#38BDF8',
          paddingHorizontal: 4,
          borderRadius: 4,
        }}
      >
        {renderWithSearchHighlight(rawSpan.slice(1, -1), `${keyPrefix}_code`, isSearching, searchQuery)}
      </Text>
    );
  }
  if (rawSpan.startsWith('~') && rawSpan.endsWith('~') && rawSpan.length >= 2) {
    return (
      <Text key={keyPrefix} style={{ textDecorationLine: 'line-through' }}>
        {renderWithSearchHighlight(rawSpan.slice(1, -1), keyPrefix, isSearching, searchQuery)}
      </Text>
    );
  }

  return renderWithSearchHighlight(rawSpan, keyPrefix, isSearching, searchQuery);
};

const renderMessageTextWithLinks = (
  text: string | undefined,
  isDeleted: boolean | undefined,
  isSearching: boolean,
  searchQuery: string
) => {
  const safeText = text || '';
  if (isDeleted) {
    return (
      <Text style={[styles.messageText, styles.deletedMessageText]}>
        {safeText || 'This message was deleted'}
      </Text>
    );
  }
  if (!safeText.trim()) return null;

  // Code Block detection ```lang ... ```
  if (safeText.includes('```')) {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(safeText)) !== null) {
      if (match.index > lastIndex) {
        segments.push(
          <Text key={`txt_${lastIndex}`} style={styles.messageText}>
            {safeText.substring(lastIndex, match.index)}
          </Text>
        );
      }
      const lang = match[1] || 'code';
      const codeContent = match[2];
      segments.push(
        <View
          key={`code_${match.index}`}
          style={{
            backgroundColor: '#0B0F19',
            borderRadius: 8,
            padding: 10,
            marginVertical: 4,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>
              {lang}
            </Text>
            <TouchableOpacity
              onPress={() => {
                copyToClipboard(codeContent);
                Alert.alert('Copied', 'Code block copied to clipboard.');
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: '#38BDF8', fontWeight: '700' }}>📋 Copy</Text>
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              fontSize: 12,
              color: '#38BDF8',
              lineHeight: 18,
            }}
          >
            {codeContent}
          </Text>
        </View>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < safeText.length) {
      segments.push(
        <Text key={`txt_${lastIndex}`} style={styles.messageText}>
          {safeText.substring(lastIndex)}
        </Text>
      );
    }
    return <View>{segments}</View>;
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = safeText.split(urlRegex);

  return (
    <Text style={styles.messageText}>
      {parts.map((part, pIdx) => {
        if (part.match(urlRegex)) {
          return (
            <Text
              key={pIdx}
              style={styles.linkText}
              onPress={() => Linking.openURL(part).catch((err) => console.warn('Cannot open url', err))}
            >
              {part}
            </Text>
          );
        }

        // Inline markdown token parser
        const mdRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|~[^~]+~)/g;
        const subParts = part.split(mdRegex);

        return (
          <Text key={pIdx}>
            {subParts.map((sub, sIdx) =>
              renderFormattedSpan(sub, `${pIdx}_${sIdx}`, isSearching, searchQuery)
            )}
          </Text>
        );
      })}
    </Text>
  );
};

export const TypingIndicatorBubble: React.FC<{ typingUsers: string[] }> = React.memo(({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;
  return (
    <View style={styles.messageRow}>
      <View style={[styles.bubble, styles.bubbleOther, { paddingVertical: 8, paddingHorizontal: 14 }]}>
        <Text style={styles.senderNickname}>@{typingUsers.join(', ')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={{ fontSize: 13, color: '#94A3B8' }}>typing </Text>
          <Text style={{ fontSize: 16, color: '#38BDF8', fontWeight: '900', letterSpacing: 2 }}>•••</Text>
        </View>
      </View>
    </View>
  );
});

const ChatMessageBubbleComponent: React.FC<ChatMessageBubbleProps> = ({
  item,
  isDifferentDay,
  currentNickname,
  onlineCount,
  isSearching,
  searchQuery,
  isPlayingVoice,
  onToggleVoicePlay,
  onLongPress,
  onOpenImage,
  onScrollToMessageId,
  onVotePoll,
  onReact,
  onDirectMessage,
  onInitiateCall,
  onRetryPendingMessage,
  isHighlighted,
}) => {
  const isMe = (item.nickname || '').trim().toLowerCase() === (currentNickname || '').trim().toLowerCase();
  const isDirectWhisper = Boolean(item.isDirect || item.targetNickname);
  const hasReactions = Boolean(item.reactions && Object.keys(item.reactions).length > 0);

  return (
    <View key={item.id}>
      {isDifferentDay && item.createdAt && renderDateSeparator(item.createdAt)}
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        <TouchableOpacity
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            isDirectWhisper && styles.bubbleWhisper,
            isHighlighted && styles.bubbleHighlighted,
          ]}
          onLongPress={() => onLongPress(item)}
          activeOpacity={0.92}
        >
          {/* Sender Nickname with Quick Whisper/Call Option for others, and Whisper indication for sender */}
          {!isMe ? (
            <TouchableOpacity
              style={styles.senderHeader}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(`@${item.nickname}`, 'Choose member action:', [
                  { text: 'Whisper Privately', onPress: () => onDirectMessage(item.nickname) },
                  { text: 'Voice Call', onPress: () => onInitiateCall(item.nickname, true) },
                  { text: 'Video Call', onPress: () => onInitiateCall(item.nickname, false) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
            >
              <Text style={styles.senderNickname}>
                @{renderWithSearchHighlight(item.nickname, `nick_${item.id}`, isSearching, searchQuery)}
              </Text>
              {isDirectWhisper && (
                <Text style={styles.whisperBadge}>🔒 Private Whisper</Text>
              )}
            </TouchableOpacity>
          ) : isDirectWhisper ? (
            <View style={styles.senderHeader}>
              <Text style={styles.whisperBadgeMe}>
                🔒 Whispered to @{renderWithSearchHighlight(item.targetNickname || 'Member', `target_${item.id}`, isSearching, searchQuery)}
              </Text>
            </View>
          ) : null}

          {/* Quoted Reply Reference with Quick Tap Jump */}
          {item.replyTo && (
            <TouchableOpacity
              style={styles.replyPreviewCard}
              activeOpacity={0.8}
              onPress={() => {
                if (item.replyTo?.id !== undefined) {
                  onScrollToMessageId(item.replyTo.id);
                }
              }}
            >
              <Text style={styles.replySender}>@{item.replyTo.nickname}</Text>
              <Text style={styles.replySnippet} numberOfLines={1}>
                {renderWithSearchHighlight(item.replyTo.message, 'reply_snip', isSearching, searchQuery)}
              </Text>
            </TouchableOpacity>
          )}

          {/* Image / File Attachment Card */}
          {Boolean(item.fileUrl) && !item.isVoiceNote && !item.fileType?.startsWith('audio/') && (() => {
            const resolvedFileUrl = chatSocketService.resolveFileUrl(item.fileUrl);
            return item.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(item.fileUrl!) ? (
              <ChatImageCard
                uri={resolvedFileUrl}
                onPress={() => onOpenImage(resolvedFileUrl)}
              />
            ) : (
              <TouchableOpacity
                style={styles.fileAttachmentCard}
                onPress={() => {
                  if (resolvedFileUrl) {
                    Linking.openURL(resolvedFileUrl).catch(() => {});
                  }
                }}
              >
                <Text style={styles.fileAttachmentIcon}>📄</Text>
                <View style={styles.fileAttachmentInfo}>
                  <Text style={styles.fileAttachmentName} numberOfLines={1}>
                    {renderWithSearchHighlight(item.fileName || 'Attachment', `file_${item.id}`, isSearching, searchQuery)}
                  </Text>
                  <Text style={styles.fileAttachmentType}>
                    {item.fileType || 'Download File'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* Voice Audio Note Preview Card with Coordinated Playback */}
          {item.isVoiceNote && (
            <VoiceNoteBubbleCard
              messageId={item.id}
              fileUrl={item.fileUrl}
              fileName={item.fileName}
              fileSize={item.fileSize}
            />
          )}

          {/* Location Sharing Card with Native Map Handlers */}
          {item.locationData && (
            <TouchableOpacity
              style={styles.locationCard}
              onPress={() => {
                const url = Platform.select({
                  ios: `maps:0,0?q=${item.locationData!.lat},${item.locationData!.lng}`,
                  android: `geo:0,0?q=${item.locationData!.lat},${item.locationData!.lng}`,
                  default: `https://maps.google.com/?q=${item.locationData!.lat},${item.locationData!.lng}`,
                });
                Linking.openURL(url!).catch(() => {
                  Linking.openURL(`https://maps.google.com/?q=${item.locationData!.lat},${item.locationData!.lng}`).catch(() => {});
                });
              }}
            >
              <Text style={styles.locationIcon}>📍</Text>
              <View style={styles.locationCol}>
                <Text style={styles.locationTitle}>
                  {item.locationData.address || 'Shared Location'}
                </Text>
                <Text style={styles.locationCoords}>
                  {item.locationData.lat.toFixed(4)}, {item.locationData.lng.toFixed(4)}
                </Text>
                <Text style={styles.locationLink}>Open in Maps ↗</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Interactive Poll Rendering */}
          {item.pollData && Array.isArray(item.pollData.options) ? (() => {
            const totalVotes = item.pollData.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
            const isExpired = Boolean(
              item.pollData.expiresAt && new Date(item.pollData.expiresAt).getTime() <= Date.now()
            );
            const isMulti = Boolean(item.pollData.allowMultiple);

            return (
              <View style={styles.pollCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isExpired ? '#EF4444' : '#38BDF8' }}>
                    {isExpired ? '🔒 Voting Closed' : isMulti ? '📊 Multi-Choice Poll' : '📊 Single-Choice Poll'}
                  </Text>
                  {isExpired && (
                    <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>Expired</Text>
                  )}
                </View>
                <Text style={styles.pollQuestion}>
                  {renderWithSearchHighlight(item.pollData.question, 'poll_q', isSearching, searchQuery)}
                </Text>
                {item.pollData.options.map((opt) => {
                  const voteCount = opt.votes?.length || 0;
                  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                  const hasVoted = Boolean(
                    opt.votes?.some(
                      (v) => (v || '').trim().toLowerCase() === (currentNickname || '').trim().toLowerCase()
                    )
                  );

                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.pollOptionBtn,
                        hasVoted && styles.pollOptionBtnVoted,
                        isExpired && { opacity: 0.75 },
                      ]}
                      disabled={isExpired}
                      onPress={() => onVotePoll(item.id, opt.id)}
                    >
                      <View style={[styles.pollProgressFill, { width: `${percentage}%` }]} />
                      <View style={styles.pollOptionContent}>
                        <Text style={styles.pollOptionText}>
                          {renderWithSearchHighlight(opt.text, `poll_opt_${opt.id}`, isSearching, searchQuery)} {hasVoted && '✓'}
                        </Text>
                        <Text style={styles.pollPercentText}>{percentage}%</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={styles.pollTotalVotesText}>
                  {totalVotes} total votes {isMulti ? '• Multiple answers allowed' : '• Select one'}
                </Text>
              </View>
            );
          })() : (
            /* Regular Message Text with Clickable Links */
            renderMessageTextWithLinks(item.message, item.isDeleted, isSearching, searchQuery)
          )}

          {/* Message Meta: Disappearing icon with countdown, edited tag, timestamp, read ticks */}
          <View style={styles.metaRow}>
            {item.expiresAt && (
              <ExpiringCountdownBadge expiresAt={item.expiresAt} />
            )}
            {item.isWithoutSound && (
              <Text style={styles.silentIcon}>🔕</Text>
            )}
            {item.isEdited && (
              <Text style={styles.editedTag}>edited</Text>
            )}
            <Text style={styles.timeText}>
              {formatSafeTime(item.createdAt)}
            </Text>
            {isMe && (
              typeof item.id === 'string' && item.id.startsWith('offline_') ? (
                <TouchableOpacity
                  onPress={() => onRetryPendingMessage(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.pendingTick}>🕒 Sending... (Tap to retry)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const readers = (item.readBy || []).filter(
                      (r) => (r || '').trim().toLowerCase() !== (currentNickname || '').trim().toLowerCase()
                    );
                    if (readers.length > 0) {
                      Alert.alert(
                        'Read Receipts',
                        `Read by:\n\n${readers.map((r) => `• @${r}`).join('\n')}`
                      );
                    } else if (onlineCount > 1) {
                      Alert.alert('Message Status', 'Delivered to room participants (Unread).');
                    } else {
                      Alert.alert('Message Status', 'Sent to server (Waiting for participants).');
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.readTicks,
                      onlineCount > 1 && styles.readTicksDelivered,
                      Boolean(
                        item.readBy &&
                        item.readBy.some(
                          (r) => (r || '').trim().toLowerCase() !== (currentNickname || '').trim().toLowerCase()
                        )
                      ) && { color: '#38BDF8' },
                    ]}
                  >
                    {onlineCount > 1 ? '✓✓' : '✓'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* Reactions Pill Display with Tap/Long-Press Author Inspector */}
          {hasReactions && item.reactions && (
            <View style={styles.reactionsContainer}>
              {Object.entries(item.reactions).map(([emoji, nicks]) => {
                if (!nicks || nicks.length === 0) return null;
                const hasMyReaction = Boolean(
                  nicks.some(
                    (n) => (n || '').trim().toLowerCase() === (currentNickname || '').trim().toLowerCase()
                  )
                );
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionPill, hasMyReaction && styles.reactionPillActive]}
                    onPress={() => onReact(item.id, emoji)}
                    onLongPress={() => {
                      Alert.alert(
                        `Reactions ${emoji}`,
                        `Reacted by:\n\n${nicks
                          .map(
                            (n) =>
                              `• @${n}${
                                (n || '').trim().toLowerCase() === (currentNickname || '').trim().toLowerCase()
                                  ? ' (You)'
                                  : ''
                              }`
                          )
                          .join('\n')}`
                      );
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={[styles.reactionCount, hasMyReaction && styles.reactionCountActive]}>
                      {nicks.length}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const areBubblePropsEqual = (
  prevProps: ChatMessageBubbleProps,
  nextProps: ChatMessageBubbleProps
): boolean => {
  if (prevProps.item !== nextProps.item) return false;
  if (prevProps.currentNickname !== nextProps.currentNickname) return false;
  if (prevProps.isDifferentDay !== nextProps.isDifferentDay) return false;
  if (prevProps.isPlayingVoice !== nextProps.isPlayingVoice) return false;
  if (prevProps.isSearching !== nextProps.isSearching) return false;
  if (prevProps.isSearching && prevProps.searchQuery !== nextProps.searchQuery) return false;
  if (prevProps.isHighlighted !== nextProps.isHighlighted) return false;

  const isMe =
    (prevProps.item.nickname || '').trim().toLowerCase() ===
    (prevProps.currentNickname || '').trim().toLowerCase();
  if (isMe && (prevProps.onlineCount > 1) !== (nextProps.onlineCount > 1)) return false;

  return true;
};

export const ChatMessageBubble = React.memo(ChatMessageBubbleComponent, areBubblePropsEqual);
