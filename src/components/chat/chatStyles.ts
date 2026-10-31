import { StyleSheet, Platform } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Full-Screen Gateway Screen Styles
  gatewayContainer: {
    flex: 1,
  },
  gatewayFlex: {
    flex: 1,
  },
  gatewayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  gatewayBadgePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  gatewayBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1.5,
  },
  gatewayScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  gatewayHero: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  gatewayIconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  gatewayIcon: {
    fontSize: 32,
  },
  gatewayTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  gatewaySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
  },
  gatewayFullCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  fieldSection: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  gatewayInput: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetRoomsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  presetChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  presetChipTextActive: {
    color: '#0F172A',
  },
  recentRoomsSection: {
    marginTop: 12,
  },
  recentRoomsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recentRoomsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recentClearBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  recentChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  recentChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  recentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
  },
  recentChipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  serverRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleCustomText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  serverPresetsRow: {
    flexDirection: 'column',
    gap: 8,
  },
  serverChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  serverChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  serverChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  serverChipTextActive: {
    color: '#38BDF8',
  },
  joinBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  joinBtnText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Active Room Header Styles
  activeRoomContainer: {
    flex: 1,
  },
  activeRoomBody: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackText: {
    fontSize: 22,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  roomNameText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  latencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  latencyText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 15,
  },

  // 24h Stories Bar
  storiesBar: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  addStoryRing: {
    alignItems: 'center',
    marginRight: 14,
  },
  addStoryPlusCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
    borderStyle: 'dashed',
    marginBottom: 4,
  },
  addStoryPlusText: {
    fontSize: 22,
    color: '#38BDF8',
    fontWeight: '700',
  },
  storyRingItem: {
    alignItems: 'center',
    marginRight: 14,
  },
  storyRingGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 2,
    backgroundColor: '#EC4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  storyRingGradientViewed: {
    backgroundColor: '#475569',
  },
  storyAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  storyRingName: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    maxWidth: 58,
  },

  // Pinned Banner
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 189, 248, 0.2)',
  },
  pinnedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  pinnedTextCol: {
    flex: 1,
  },
  pinnedAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  pinnedSnippet: {
    fontSize: 12,
    color: '#E2E8F0',
  },
  unpinBtn: {
    padding: 6,
    marginLeft: 6,
  },
  unpinText: {
    fontSize: 14,
    color: '#94A3B8',
    padding: 4,
  },

  // Feed & Bubbles
  feedContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyFeedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyFeedIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyFeedIcon: {
    fontSize: 28,
  },
  emptyFeedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyFeedSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    marginBottom: 18,
  },
  emptyFeedPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  emptyFeedStarterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyFeedStarterText: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
  },
  messageRow: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: '#0284C7',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4,
  },
  bubbleWhisper: {
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  bubbleHighlighted: {
    borderWidth: 2,
    borderColor: '#38BDF8',
    backgroundColor: '#0F2942',
  },
  senderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  senderNickname: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },
  whisperBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
  },
  replyPreviewCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  replySender: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
  },
  replySnippet: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
  },
  linkText: {
    color: '#38BDF8',
    textDecorationLine: 'underline',
  },
  deletedMessageText: {
    fontStyle: 'italic',
    color: '#94A3B8',
  },
  dateSeparatorRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  expiringIcon: {
    fontSize: 11,
  },
  silentIcon: {
    fontSize: 11,
  },
  editedTag: {
    fontSize: 10,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  timeText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  readTicks: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  readTicksDelivered: {
    color: '#FDE047',
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderColor: '#38BDF8',
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reactionCountActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },

  // Interactive Poll Card
  pollCard: {
    width: 220,
  },
  pollQuestion: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  pollOptionBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  pollOptionBtnVoted: {
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  pollProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(56, 189, 248, 0.3)',
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pollOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pollPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },

  // Typing bar
  typingIndicatorRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#94A3B8',
  },

  // Whisper notice
  whisperNoticeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  whisperNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },

  // Reply bar
  replyBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  replyBarCol: {
    flex: 1,
  },
  replyBarAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  replyBarSnippet: {
    fontSize: 12,
    color: '#E2E8F0',
  },
  replyBarDismiss: {
    fontSize: 16,
    color: '#94A3B8',
    padding: 4,
  },

  // Modes bar
  composerModesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },

  // Quick Emoji Bar
  quickEmojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  quickEmojiBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  quickEmojiText: {
    fontSize: 20,
  },

  // Composer
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBtnIcon: {
    fontSize: 22,
    color: '#38BDF8',
    fontWeight: '700',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnIcon: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },

  // Attach Popup & Backdrop
  attachBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  attachPopup: {
    position: 'absolute',
    bottom: 80,
    left: 14,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 100,
    gap: 4,
  },
  attachPopupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 10,
  },
  attachItemIcon: {
    fontSize: 16,
  },
  attachItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Action Sheet
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionSheetReactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  reactionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionCircleActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  reactionCircleText: {
    fontSize: 22,
  },
  moreReactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    marginBottom: 12,
    gap: 8,
  },
  moreReactionBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  moreReactionText: {
    fontSize: 20,
  },
  sheetItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
  },

  // In-Chat Search Bar Styles
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: '#FFFFFF',
    fontSize: 13,
  },
  searchNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    paddingHorizontal: 2,
  },
  searchNavArrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchNavArrowText: {
    fontSize: 10,
    color: '#38BDF8',
    fontWeight: '800',
  },
  searchCloseBtn: {
    padding: 4,
  },
  searchCloseText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderColor: '#38BDF8',
    borderWidth: 1,
  },

  // Edit Message Preview Bar Styles
  editBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(56, 189, 248, 0.2)',
  },
  editBarCol: {
    flex: 1,
  },
  editBarTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  editBarSnippet: {
    fontSize: 12,
    color: '#E2E8F0',
  },
  editBarDismiss: {
    fontSize: 16,
    color: '#94A3B8',
    padding: 4,
  },

  // Gateway Connecting State
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  joinBtnConnecting: {
    opacity: 0.85,
  },

  // Connection Indicator & Banner Styles
  dotConnecting: {
    backgroundColor: '#F59E0B',
  },
  dotDisconnected: {
    backgroundColor: '#EF4444',
  },
  dotConnected: {
    backgroundColor: '#10B981',
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectionBannerConnecting: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.3)',
  },
  connectionBannerDisconnected: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.3)',
    justifyContent: 'space-between',
  },
  connectionBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Search Highlighting & Pending Indicators
  searchHighlight: {
    backgroundColor: '#FDE047',
    color: '#0F172A',
    borderRadius: 2,
    paddingHorizontal: 2,
  },
  pendingTick: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
  },

  // Image Card in Message Bubble
  imageCardContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bubbleImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  imageErrorBox: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  imageErrorIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  imageErrorText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // Scroll to Bottom FAB
  scrollBottomFab: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 50,
  },
  scrollBottomFabIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  scrollBottomBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  scrollBottomBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // Photo Sharing Modal Styles
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  imageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  imageModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  imageModalClose: {
    fontSize: 18,
    color: '#94A3B8',
    padding: 4,
  },
  imageInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  imageInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  imagePresetLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
  },
  presetPhotoChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  presetPhotoChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetPhotoChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  presetPhotoChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  presetPhotoChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  imagePreviewBox: {
    alignItems: 'center',
    marginBottom: 14,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  imagePreviewThumb: {
    width: '100%',
    height: 140,
    borderRadius: 10,
  },
  previewErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewErrorText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '700',
  },
  sendImageBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  sendImageBtnDisabled: {
    opacity: 0.4,
  },
  sendImageBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },

  // Fullscreen Lightbox Preview Styles
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  lightboxCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },

  // Voice Note Card Styles
  voiceNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voicePlayBtnActive: {
    backgroundColor: '#F59E0B',
  },
  voicePlayIcon: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '800',
  },
  voiceWaveCol: {
    flex: 1,
  },
  voiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceWaveTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  voiceDurationText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  voiceWaveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  voiceWaveBar: {
    width: 3,
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },
  voiceWaveBarPlaying: {
    backgroundColor: '#F59E0B',
  },

  // Location Sharing Card Styles
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  locationIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  locationCol: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  locationCoords: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  locationLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
    marginTop: 4,
  },

  // Story Ring Count Badge Styles
  storyCountBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#38BDF8',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  storyCountBadgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '900',
  },

  // Outgoing Whisper Indicator Style
  whisperBadgeMe: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 4,
  },

  // Poll Total Votes Counter
  pollTotalVotesText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'right',
  },

  // Search Mode Footer Notice
  searchFooterNotice: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  searchFooterText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Compact Story Bar for Empty State
  storiesBarCompact: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  addStoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    gap: 8,
  },
  addStoryPlusCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addStoryPlusTextCompact: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: Platform.OS === 'android' ? -2 : -1,
  },
  imageRetryText: {
    fontSize: 10,
    color: '#38BDF8',
    fontWeight: '700',
    marginTop: 4,
  },
  fileAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 6,
    gap: 10,
  },
  fileAttachmentIcon: {
    fontSize: 24,
  },
  fileAttachmentInfo: {
    flex: 1,
  },
  fileAttachmentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fileAttachmentType: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  emojiToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiToggleIcon: {
    fontSize: 20,
  },
  whisperNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whisperLockIcon: {
    fontSize: 12,
  },
  whisperExitBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  whisperExitBtnText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '700',
  },
  minimizedCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#064E3B',
    borderBottomWidth: 1,
    borderBottomColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 100,
  },
  minimizedCallLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  minimizedCallPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  minimizedCallTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 160,
  },
  minimizedCallTimer: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34D399',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  minimizedCallRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimizedCallActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  minimizedCallActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  renderNoticeBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  renderNoticeText: {
    fontSize: 12,
    color: '#F59E0B',
    lineHeight: 16,
    fontWeight: '600',
  },
  watchPartyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1B4B',
    borderBottomWidth: 1,
    borderBottomColor: '#4338CA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 99,
  },
  watchPartyBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  watchPartyBannerIcon: {
    fontSize: 22,
  },
  watchPartyBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  watchPartyBannerSub: {
    fontSize: 11,
    color: '#A5B4FC',
    marginTop: 2,
  },
  watchPartyJoinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    marginLeft: 8,
  },
  watchPartyJoinText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
