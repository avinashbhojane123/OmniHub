import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { RoomUser } from '../../types/chat';

interface RosterModerationModalProps {
  visible: boolean;
  onClose: () => void;
  users: RoomUser[];
  currentNickname: string;
  isHost: boolean;
  isAdmin: boolean;
  onDirectMessage: (nickname: string) => void;
  onCallUser: (nickname: string) => void;
  onMuteUser: (nickname: string, isMuted: boolean, durationMinutes?: number) => void;
  onKickUser: (nickname: string) => void;
  onBanUser: (nickname: string) => void;
  onPromoteUser: (nickname: string, role: 'admin' | 'member') => void;
  onTransferHost: (nickname: string) => void;
  onClearInactive: () => void;
  onClearHistory?: () => void;
}

export const RosterModerationModal: React.FC<RosterModerationModalProps> = ({
  visible,
  onClose,
  users,
  currentNickname,
  isHost,
  isAdmin,
  onDirectMessage,
  onCallUser,
  onMuteUser,
  onKickUser,
  onBanUser,
  onPromoteUser,
  onTransferHost,
  onClearInactive,
  onClearHistory,
}) => {
  const [selectedUser, setSelectedUser] = useState<RoomUser | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const cleanCurrent = currentNickname.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.nickname.toLowerCase().includes(q) ||
        (u.role && u.role.toLowerCase().includes(q))
    );
  }, [users, filterQuery]);

  const handleMuteToggle = (user: RoomUser) => {
    if (user.isMuted) {
      onMuteUser(user.nickname, false);
      setSelectedUser(null);
    } else {
      Alert.alert(
        `Mute @${user.nickname}`,
        'Select mute duration:',
        [
          { text: '5 Minutes', onPress: () => onMuteUser(user.nickname, true, 5) },
          { text: '15 Minutes', onPress: () => onMuteUser(user.nickname, true, 15) },
          { text: '1 Hour', onPress: () => onMuteUser(user.nickname, true, 60) },
          { text: 'Indefinite', onPress: () => onMuteUser(user.nickname, true) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      setSelectedUser(null);
    }
  };

  const handleKick = (user: RoomUser) => {
    Alert.alert(
      'Kick User',
      `Remove @${user.nickname} from the room?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: () => {
            onKickUser(user.nickname);
            setSelectedUser(null);
          },
        },
      ]
    );
  };

  const handleBan = (user: RoomUser) => {
    Alert.alert(
      'Ban User Permanently',
      `Ban @${user.nickname} from this room? They will not be able to re-enter.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: () => {
            onBanUser(user.nickname);
            setSelectedUser(null);
          },
        },
      ]
    );
  };

  const handleTransfer = (user: RoomUser) => {
    Alert.alert(
      'Transfer Host Role',
      `Make @${user.nickname} the new Room Host? You will become an Admin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          onPress: () => {
            onTransferHost(user.nickname);
            setSelectedUser(null);
          },
        },
      ]
    );
  };

  const renderUserItem = ({ item }: { item: RoomUser }) => {
    const isMe = item.nickname.trim().toLowerCase() === cleanCurrent;
    const isTargetHost = item.role === 'host';
    const isTargetAdmin = item.role === 'admin';

    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => setSelectedUser(item)}
        activeOpacity={0.7}
      >
        {/* Avatar + Online Indicator */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarLetter}>
              {item.nickname.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: item.isOnline ? '#10B981' : '#64748B' },
            ]}
          />
        </View>

        {/* User Details */}
        <View style={styles.userDetailsCol}>
          <View style={styles.userNameRow}>
            <Text style={styles.userNameText}>
              @{item.nickname}
              {isMe && ' (You)'}
            </Text>

            {/* Role Badges */}
            {isTargetHost && (
              <View style={[styles.roleBadge, styles.hostBadge]}>
                <Text style={styles.hostBadgeText}>👑 Host</Text>
              </View>
            )}
            {isTargetAdmin && !isTargetHost && (
              <View style={[styles.roleBadge, styles.adminBadge]}>
                <Text style={styles.adminBadgeText}>⭐ Admin</Text>
              </View>
            )}
            {item.isMuted && (
              <View style={[styles.roleBadge, styles.mutedBadge]}>
                <Text style={styles.mutedBadgeText}>🔇 Muted</Text>
              </View>
            )}
          </View>

          {/* Telemetry metadata: Device, Battery */}
          <View style={styles.metaRow}>
            <Text style={styles.metaSubtext}>
              {item.isOnline ? 'Online' : 'Offline'}
              {item.deviceType ? ` • ${item.deviceType}` : ''}
              {item.batteryLabel
                ? ` • 🔋 ${item.batteryLabel}${item.batteryIsCharging ? '⚡' : ''}`
                : ''}
            </Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        {!isMe && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickIconBtn}
              onPress={() => {
                onCallUser(item.nickname);
                onClose();
              }}
            >
              <Text style={styles.quickIconText}>📞</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickIconBtn}
              onPress={() => {
                onDirectMessage(item.nickname);
                onClose();
              }}
            >
              <Text style={styles.quickIconText}>💬</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>Room Participants</Text>
              <Text style={styles.subtitleText}>
                {users.length} member{users.length !== 1 ? 's' : ''} in room
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Input for rooms with multiple members */}
          {users.length > 4 && (
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Filter members..."
                placeholderTextColor="#64748B"
                value={filterQuery}
                onChangeText={setFilterQuery}
                autoCapitalize="none"
              />
              {Boolean(filterQuery) && (
                <TouchableOpacity onPress={() => setFilterQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Member List */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => `${item.nickname}_${item.id || ''}`}
            renderItem={renderUserItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 13 }}>No members match "{filterQuery}"</Text>
              </View>
            }
          />

          {/* Admin Clean Action */}
          {isHost && (
            <TouchableOpacity
              style={styles.clearInactiveBtn}
              onPress={onClearInactive}
              activeOpacity={0.8}
            >
              <Text style={styles.clearInactiveText}>
                🧹 Prune Inactive Members (7+ days)
              </Text>
            </TouchableOpacity>
          )}

          {/* Admin Clear Room History */}
          {(isHost || isAdmin) && onClearHistory && (
            <TouchableOpacity
              style={[styles.clearInactiveBtn, styles.clearHistoryBtn]}
              onPress={() => {
                Alert.alert(
                  'Clear Room History',
                  'Are you sure you want to delete all messages in this room for everyone? This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear All Messages',
                      style: 'destructive',
                      onPress: () => {
                        onClearHistory();
                        onClose();
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.clearHistoryText}>
                🗑️ Clear Room History
              </Text>
            </TouchableOpacity>
          )}

          {/* User Moderation Sub-sheet Modal */}
          {selectedUser && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedUser(null)}
            >
              <TouchableOpacity
                style={styles.subModalBackdrop}
                activeOpacity={1}
                onPress={() => setSelectedUser(null)}
              >
                <View style={styles.subModalCard}>
                  <Text style={styles.subModalTitle}>
                    Manage @{selectedUser.nickname}
                  </Text>
                  <Text style={styles.subModalSubtitle}>
                    Role: {selectedUser.role.toUpperCase()}
                    {selectedUser.batteryLabel ? ` • Battery: ${selectedUser.batteryLabel}` : ''}
                  </Text>

                  <View style={styles.subModalActions}>
                    {/* Direct Chat & Call */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => {
                        onDirectMessage(selectedUser.nickname);
                        setSelectedUser(null);
                        onClose();
                      }}
                    >
                      <Text style={styles.menuItemText}>💬 Send Direct Whisper</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => {
                        onCallUser(selectedUser.nickname);
                        setSelectedUser(null);
                        onClose();
                      }}
                    >
                      <Text style={styles.menuItemText}>📞 Voice/Video Call</Text>
                    </TouchableOpacity>

                    {/* Moderation Controls (Host/Admin) */}
                    {(isHost || isAdmin) &&
                      selectedUser.nickname.toLowerCase() !== cleanCurrent &&
                      selectedUser.role !== 'host' && (
                        <>
                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleMuteToggle(selectedUser)}
                          >
                            <Text style={styles.menuItemText}>
                              {selectedUser.isMuted
                                ? '🔊 Unmute Participant'
                                : '🔇 Mute Participant'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleKick(selectedUser)}
                          >
                            <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>
                              🚪 Kick from Room
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleBan(selectedUser)}
                          >
                            <Text style={[styles.menuItemText, { color: '#EF4444' }]}>
                              🚫 Permanently Ban
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}

                    {/* Host Exclusive Controls */}
                    {isHost &&
                      selectedUser.nickname.toLowerCase() !== cleanCurrent && (
                        <>
                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                              const newRole =
                                selectedUser.role === 'admin' ? 'member' : 'admin';
                              onPromoteUser(selectedUser.nickname, newRole);
                              setSelectedUser(null);
                            }}
                          >
                            <Text style={styles.menuItemText}>
                              {selectedUser.role === 'admin'
                                ? '⭐ Demote to Member'
                                : '⭐ Promote to Admin'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleTransfer(selectedUser)}
                          >
                            <Text style={[styles.menuItemText, { color: '#FBBF24' }]}>
                              👑 Transfer Host Status
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}

                    <TouchableOpacity
                      style={[styles.menuItem, { borderBottomWidth: 0, marginTop: 4 }]}
                      onPress={() => setSelectedUser(null)}
                    >
                      <Text style={[styles.menuItemText, { color: '#94A3B8', textAlign: 'center' }]}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  subtitleText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: '#38BDF8',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  userDetailsCol: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
  },
  adminBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
  },
  mutedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  mutedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  metaRow: {
    marginTop: 4,
  },
  metaSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickIconText: {
    fontSize: 14,
  },
  clearInactiveBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  clearInactiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  clearHistoryBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  clearHistoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },

  // Sub-modal styles
  subModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  subModalCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  subModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subModalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  },
  subModalActions: {
    gap: 2,
  },
  menuItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: '#F8FAFC',
    fontSize: 13,
  },
  searchClear: {
    color: '#94A3B8',
    fontSize: 14,
    paddingHorizontal: 4,
  },
});
