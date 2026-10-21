import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { traktService } from '../../services/movies/TraktService';
import { TraktUserProfile, TraktSyncResult } from '../../types';
import { settingsRepository } from '../../database/repositories';

interface TraktSyncModalProps {
  visible: boolean;
  insets: EdgeInsets;
  onClose: () => void;
  onSyncComplete?: (result: TraktSyncResult) => void;
}

export const TraktSyncModal: React.FC<TraktSyncModalProps> = ({
  visible,
  insets,
  onClose,
  onSyncComplete,
}) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [profile, setProfile] = useState<TraktUserProfile | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [showAdvancedKey, setShowAdvancedKey] = useState(false);

  // Load stored credentials and profile on open
  useEffect(() => {
    if (!visible) return;

    const loadData = async () => {
      setIsLoadingProfile(true);
      try {
        const storedUser = await traktService.getConnectedUsername();
        const storedKey = await traktService.getClientId();
        const lastSync = await settingsRepository.get('trakt_last_sync', '');

        setUsernameInput(storedUser || '');
        setClientIdInput(storedKey || '');
        setConnectedUsername(storedUser || null);
        setLastSyncTime(lastSync || null);

        if (storedUser) {
          const userProfile = await traktService.getUserProfile(storedUser);
          setProfile(userProfile);
        } else {
          setProfile(null);
        }
      } catch {
        // Fallback
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadData();
  }, [visible]);

  // Connect or switch Trakt Account
  const handleConnectAccount = useCallback(async () => {
    const cleanUser = usernameInput.trim();
    if (!cleanUser) {
      Alert.alert('Required', 'Please enter your Trakt.tv username.');
      return;
    }

    setIsLoadingProfile(true);
    setSyncStatusMsg(null);
    try {
      if (clientIdInput.trim()) {
        await traktService.setClientId(clientIdInput.trim());
      }
      await traktService.setConnectedUsername(cleanUser);
      setConnectedUsername(cleanUser);

      const userProfile = await traktService.getUserProfile(cleanUser);
      setProfile(userProfile);
      Alert.alert('Connected', `Successfully connected to Trakt user: @${cleanUser}`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not connect to Trakt profile.');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [usernameInput, clientIdInput]);

  // Disconnect Trakt Account
  const handleDisconnect = useCallback(async () => {
    await traktService.setConnectedUsername('');
    setConnectedUsername(null);
    setUsernameInput('');
    setProfile(null);
    setSyncStatusMsg(null);
    Alert.alert('Disconnected', 'Disconnected your Trakt account.');
  }, []);

  // Use Demo / Sample Account for quick preview
  const handleUseDemoAccount = useCallback(async () => {
    const demoUser = 'cinemaphile';
    setUsernameInput(demoUser);
    setIsLoadingProfile(true);
    try {
      await traktService.setConnectedUsername(demoUser);
      setConnectedUsername(demoUser);
      const userProfile = await traktService.getUserProfile(demoUser);
      setProfile(userProfile);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  // Trigger full Watchlist & History Sync
  const handlePerformSync = useCallback(async () => {
    if (!connectedUsername) {
      Alert.alert('Not Connected', 'Please connect your Trakt account first.');
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg('Syncing watchlist and watch history with Trakt...');
    try {
      const result = await traktService.syncWatchlist(connectedUsername);
      setSyncStatusMsg(result.message);
      const now = new Date().toISOString();
      setLastSyncTime(now);

      if (onSyncComplete) {
        onSyncComplete(result);
      }
      Alert.alert('Sync Successful', result.message);
    } catch (err: any) {
      setSyncStatusMsg(`Sync error: ${err?.message || 'Failed'}`);
      Alert.alert('Sync Failed', err?.message || 'Could not complete Trakt sync.');
    } finally {
      setIsSyncing(false);
    }
  }, [connectedUsername, onSyncComplete]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderTitleRow}>
              <View style={styles.traktBadge}>
                <Text style={styles.traktBadgeText}>⚡ TRAKT.TV</Text>
              </View>
              <Text style={styles.sheetTitle}>Social & Watchlist Sync</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Feature Description Banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerTitle}>
                🚀 Media Center Watch Tracking & Social Sync
              </Text>
              <Text style={styles.infoBannerText}>
                Connect Trakt.tv (popular with Plex & Kodi) to automatically sync your watch
                history, check what the global community is watching right now, and import
                your custom watchlists.
              </Text>
            </View>

            {/* Profile Card if Connected */}
            {isLoadingProfile ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color="#E11D48" />
                <Text style={styles.loaderText}>Connecting to Trakt API v2...</Text>
              </View>
            ) : profile ? (
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <Image
                    source={{
                      uri:
                        profile.avatar ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&q=80',
                    }}
                    style={styles.profileAvatar}
                  />
                  <View style={styles.profileMeta}>
                    <View style={styles.profileNameRow}>
                      <Text style={styles.profileName}>{profile.name}</Text>
                      {profile.vip && (
                        <View style={styles.vipTag}>
                          <Text style={styles.vipTagText}>VIP</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.profileUsername}>@{profile.username}</Text>
                    {profile.location ? (
                      <Text style={styles.profileLocation}>📍 {profile.location}</Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={handleDisconnect}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.disconnectBtnText}>Unlink</Text>
                  </TouchableOpacity>
                </View>

                {/* Trakt Statistics Grid */}
                {profile.stats?.movies && (
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>
                        {profile.stats.movies.watched || 0}
                      </Text>
                      <Text style={styles.statBoxLabel}>Watched</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>
                        {profile.stats.movies.plays || 0}
                      </Text>
                      <Text style={styles.statBoxLabel}>Total Plays</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>
                        {Math.round((profile.stats.movies.minutes || 0) / 60)}h
                      </Text>
                      <Text style={styles.statBoxLabel}>Hours Logged</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statBoxValue}>
                        {profile.stats.movies.ratings || 0}
                      </Text>
                      <Text style={styles.statBoxLabel}>Ratings</Text>
                    </View>
                  </View>
                )}

                {/* Sync Action Buttons */}
                <View style={styles.syncActionWrap}>
                  <TouchableOpacity
                    style={[styles.syncPrimaryBtn, isSyncing && styles.syncPrimaryBtnDisabled]}
                    onPress={handlePerformSync}
                    disabled={isSyncing}
                    activeOpacity={0.85}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    ) : (
                      <Text style={styles.syncBtnIcon}>🔄</Text>
                    )}
                    <Text style={styles.syncPrimaryBtnText}>
                      {isSyncing ? 'Syncing with Trakt...' : 'Sync Watchlist & History'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {lastSyncTime && (
                  <Text style={styles.lastSyncText}>
                    Last synced:{' '}
                    {new Date(lastSyncTime).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                )}
              </View>
            ) : (
              /* Connect Account Form */
              <View style={styles.connectCard}>
                <Text style={styles.connectCardTitle}>Connect Your Trakt Account</Text>
                <Text style={styles.connectCardSub}>
                  Enter your Trakt.tv username to sync watch history and watchlists.
                </Text>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Trakt.tv Username</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. sean or your_username"
                    placeholderTextColor="#6B7280"
                    value={usernameInput}
                    onChangeText={setUsernameInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Optional Advanced API Key */}
                <TouchableOpacity
                  style={styles.advancedToggle}
                  onPress={() => setShowAdvancedKey((prev) => !prev)}
                >
                  <Text style={styles.advancedToggleText}>
                    {showAdvancedKey ? '▼ Custom Trakt API Key' : '▶ Advanced: Custom Trakt Client ID'}
                  </Text>
                </TouchableOpacity>

                {showAdvancedKey && (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Trakt Client ID (Optional)</Text>
                    <TextInput
                      style={[styles.textInput, { fontSize: 11 }]}
                      placeholder="Enter custom Trakt app Client ID"
                      placeholderTextColor="#6B7280"
                      value={clientIdInput}
                      onChangeText={setClientIdInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={styles.helperText}>
                      Pre-configured with free developer credentials. You can also paste your own
                      from trakt.tv/oauth/applications.
                    </Text>
                  </View>
                )}

                <View style={styles.connectButtonsRow}>
                  <TouchableOpacity
                    style={styles.connectBtn}
                    onPress={handleConnectAccount}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.connectBtnText}>⚡ Link Account</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.demoBtn}
                    onPress={handleUseDemoAccount}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.demoBtnText}>Try Demo Profile</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {syncStatusMsg && (
              <View style={styles.statusToast}>
                <Text style={styles.statusToastText}>{syncStatusMsg}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0E121A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: '#1E2536',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202E',
  },
  sheetHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  traktBadge: {
    backgroundColor: '#ED1C24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  traktBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sheetTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  infoBanner: {
    backgroundColor: '#161C28',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ED1C24',
  },
  infoBannerTitle: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoBannerText: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  loaderWrap: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 8,
  },
  profileCard: {
    backgroundColor: '#141924',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242C3D',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E2536',
    marginRight: 12,
  },
  profileMeta: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  vipTag: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  vipTagText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  profileUsername: {
    color: '#ED1C24',
    fontSize: 12,
    fontWeight: '600',
  },
  profileLocation: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  disconnectBtn: {
    backgroundColor: '#232A3B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  disconnectBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0E121A',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statBoxValue: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
  },
  statBoxLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  syncActionWrap: {
    marginTop: 16,
  },
  syncPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ED1C24',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  syncPrimaryBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  syncPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lastSyncText: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
  connectCard: {
    backgroundColor: '#141924',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242C3D',
  },
  connectCardTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
  },
  connectCardSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  inputWrap: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#0E121A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242C3D',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F9FAFB',
    fontSize: 13,
  },
  helperText: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 4,
  },
  advancedToggle: {
    paddingVertical: 6,
    marginBottom: 8,
  },
  advancedToggleText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  connectButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  connectBtn: {
    flex: 1,
    backgroundColor: '#ED1C24',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  demoBtn: {
    backgroundColor: '#1E2536',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  demoBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  statusToast: {
    backgroundColor: '#1B2433',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  statusToastText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
});
