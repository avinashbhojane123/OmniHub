import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export interface DanmakuCommentItem {
  id: string;
  text: string;
  from?: string;
  topPercent: number;
}

export interface FloatingReactionItem {
  id: string;
  emoji: string;
  rightOffset: number;
}

interface DanmakuOverlayProps {
  visible: boolean;
  comments: DanmakuCommentItem[];
  reactions: FloatingReactionItem[];
  onRemoveComment: (id: string) => void;
  onRemoveReaction: (id: string) => void;
}

export const DanmakuCommentView: React.FC<{
  item: DanmakuCommentItem;
  onFinished: (id: string) => void;
}> = React.memo(({ item, onFinished }) => {
  const animX = useRef(new Animated.Value(340)).current;

  useEffect(() => {
    Animated.timing(animX, {
      toValue: -360,
      duration: 5000,
      useNativeDriver: true,
    }).start(() => onFinished(item.id));
  }, [animX, item.id, onFinished]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.danmakuBubble,
        {
          top: `${item.topPercent}%`,
          transform: [{ translateX: animX }],
        },
      ]}
    >
      {item.from ? <Text style={styles.danmakuUser}>@{item.from}: </Text> : null}
      <Text style={styles.danmakuText}>{item.text}</Text>
    </Animated.View>
  );
});

export const FloatingReactionView: React.FC<{
  item: FloatingReactionItem;
  onFinished: (id: string) => void;
}> = React.memo(({ item, onFinished }) => {
  const animY = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(1)).current;
  const animScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animY, {
        toValue: -150,
        duration: 2400,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.spring(animScale, {
          toValue: 1.4,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(animScale, {
          toValue: 1.0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(animOpacity, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => onFinished(item.id));
  }, [animY, animOpacity, animScale, item.id, onFinished]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingReactionBubble,
        {
          right: item.rightOffset,
          transform: [{ translateY: animY }, { scale: animScale }],
          opacity: animOpacity,
        },
      ]}
    >
      <Text style={styles.floatingReactionEmoji}>{item.emoji}</Text>
    </Animated.View>
  );
});

export const DanmakuOverlay: React.FC<DanmakuOverlayProps> = React.memo(
  ({ visible, comments, reactions, onRemoveComment, onRemoveReaction }) => {
    if (!visible) return null;

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {comments.map((c) => (
          <DanmakuCommentView key={c.id} item={c} onFinished={onRemoveComment} />
        ))}
        {reactions.map((r) => (
          <FloatingReactionView key={r.id} item={r} onFinished={onRemoveReaction} />
        ))}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  danmakuBubble: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
    maxWidth: 240,
  },
  danmakuUser: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  danmakuText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  floatingReactionBubble: {
    position: 'absolute',
    bottom: 20,
    padding: 6,
  },
  floatingReactionEmoji: {
    fontSize: 34,
  },
});

