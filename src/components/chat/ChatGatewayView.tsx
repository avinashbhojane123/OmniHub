import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { styles } from './chatStyles';

export interface ChatGatewayViewProps {
  passcode: string;
  setPasscode: (v: string) => void;
  nickname: string;
  setNickname: (v: string) => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  onJoin: () => void;
  onGoBack: () => void;
  topInset: number;
  bottomInset: number;
  serverUrl?: string;
  setServerUrl?: (v: string) => void;
  showServerCustom?: boolean;
  setShowServerCustom?: (v: boolean) => void;
  presetRooms?: string[];
  recentRooms?: string[];
  onClearRecentRooms?: () => void;
  defaultInternetServer?: string;
  hotspotServer?: string;
  serverPresets?: Array<{ label: string; url: string }>;
}

export const ChatGatewayView: React.FC<ChatGatewayViewProps> = React.memo(({
  passcode,
  setPasscode,
  nickname,
  setNickname,
  connectionStatus,
  onJoin,
  onGoBack,
  topInset,
  bottomInset,
  serverUrl,
  setServerUrl,
  showServerCustom,
  setShowServerCustom,
  presetRooms = [],
  recentRooms = [],
  onClearRecentRooms,
  serverPresets = [],
}) => {
  const nicknameInputRef = useRef<any>(null);
  const passcodeInputRef = useRef<any>(null);
  const [hidePasscode, setHidePasscode] = useState(true);

  return (
    <View style={[styles.gatewayContainer, { paddingTop: Math.max(topInset, 14) }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.gatewayFlex}
      >
        {/* Header */}
        <View style={styles.gatewayHeader}>
          {Boolean(onGoBack) ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onGoBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <View style={styles.gatewayBadgePill}>
            <Text style={styles.gatewayBadge}>CHATROOM</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.gatewayScrollContent,
            { paddingBottom: Math.max(bottomInset, 20) + 24 },
          ]}
        >
          {/* Hero Banner */}
          <View style={styles.gatewayHero}>
            <View style={styles.gatewayIconBox}>
              <Text style={styles.gatewayIcon}>💬</Text>
            </View>
            <Text style={styles.gatewayTitle}>Join Real-Time Room</Text>
            <Text style={styles.gatewaySubtitle}>
              Encrypted real-time rooms, calling, watch party & 24h stories.
            </Text>
          </View>

          {/* Main Full-Width Setup Card */}
          <View style={styles.gatewayFullCard}>
            {/* Nickname */}
            <View style={styles.fieldSection}>
              <Text style={styles.label}>Your Nickname</Text>
              <TextInput
                ref={nicknameInputRef}
                style={styles.gatewayInput}
                placeholder="Enter your nickname..."
                placeholderTextColor="#64748B"
                value={nickname}
                onChangeText={setNickname}
                returnKeyType="next"
                onSubmitEditing={() => passcodeInputRef.current?.focus()}
                blurOnSubmit={false}
                autoCorrect={false}
              />
            </View>

            {/* Room Passcode */}
            <View style={styles.fieldSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.label}>Room Passcode / Name</Text>
                <TouchableOpacity
                  onPress={() => setHidePasscode(!hidePasscode)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 12, color: '#38BDF8', fontWeight: '600' }}>
                    {hidePasscode ? '👁️ Show' : '🙈 Hide'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                ref={passcodeInputRef}
                style={styles.gatewayInput}
                placeholder="Enter room passcode or name..."
                placeholderTextColor="#64748B"
                value={passcode}
                onChangeText={setPasscode}
                autoCapitalize="none"
                secureTextEntry={hidePasscode}
                returnKeyType="go"
                onSubmitEditing={onJoin}
                autoCorrect={false}
              />

              {/* Preset Room Quick Chips */}
              {presetRooms.length > 0 && (
                <View style={styles.presetRoomsRow}>
                  {presetRooms.map((room) => {
                    const isSelected = passcode.trim().toLowerCase() === room.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={room}
                        style={[styles.presetChip, isSelected && styles.presetChipActive]}
                        onPress={() => setPasscode(room)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                          #{room}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Recent Rooms */}
              {recentRooms.length > 0 && (
                <View style={styles.recentRoomsSection}>
                  <View style={styles.recentRoomsHeader}>
                    <Text style={styles.recentRoomsTitle}>Recent Rooms</Text>
                    {Boolean(onClearRecentRooms) && (
                      <TouchableOpacity onPress={onClearRecentRooms}>
                        <Text style={styles.recentClearBtnText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.presetRoomsRow}>
                    {recentRooms.map((room) => {
                      const isSelected = passcode.trim().toLowerCase() === room.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={room}
                          style={[styles.recentChip, isSelected && styles.recentChipActive]}
                          onPress={() => setPasscode(room)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.recentChipText, isSelected && styles.recentChipTextActive]}>
                            🕒 #{room}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Server Connection Settings */}
            <View style={styles.fieldSection}>
              <View style={styles.serverRowHeader}>
                <Text style={styles.label}>Server Target</Text>
                {setShowServerCustom && (
                  <TouchableOpacity
                    onPress={() => setShowServerCustom(!showServerCustom)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.toggleCustomText}>
                      {showServerCustom ? 'Hide Custom' : 'Custom Server'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Server Presets */}
              {serverPresets.length > 0 && (
                <View style={styles.serverPresetsRow}>
                  {serverPresets.map((preset) => {
                    const isSelected = (serverUrl || '').trim() === preset.url.trim();
                    return (
                      <TouchableOpacity
                        key={preset.url}
                        style={[styles.serverChip, isSelected && styles.serverChipActive]}
                        onPress={() => {
                          setServerUrl?.(preset.url);
                          setShowServerCustom?.(false);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.serverChipText, isSelected && styles.serverChipTextActive]}>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Custom Server URL Input */}
              {showServerCustom && (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.gatewayInput}
                    placeholder="https://your-server.com or http://IP:10000"
                    placeholderTextColor="#64748B"
                    value={serverUrl}
                    onChangeText={(val) => setServerUrl?.(val)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}
            </View>

            {/* Enter Room Button with Loading Indicator */}
            <TouchableOpacity
              style={[styles.joinBtn, connectionStatus === 'connecting' && styles.joinBtnConnecting]}
              onPress={onJoin}
              disabled={connectionStatus === 'connecting'}
              activeOpacity={0.85}
            >
              {connectionStatus === 'connecting' ? (
                <View style={styles.connectingRow}>
                  <ActivityIndicator size="small" color="#0F172A" />
                  <Text style={styles.joinBtnText}>Connecting to room...</Text>
                </View>
              ) : (
                <Text style={styles.joinBtnText}>Enter Room 🚀</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
});
