import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { safeGuardStore } from '../../services/safeguard/SafeGuardStore';
import { ParentDashboardView } from './ParentDashboardView';
import { ChildAgentView } from './ChildAgentView';

export const SafeGuardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = safeGuardStore.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const role = safeGuardStore.getRole();
  const settings = safeGuardStore.getSettings();

  // PIN modal state for protecting Parent Mode and Hub Exit
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinAction, setPinAction] = useState<'SWITCH_TO_PARENT' | 'EXIT_TO_HUB'>('SWITCH_TO_PARENT');

  const handleRoleSwitchPress = () => {
    if (role === 'CHILD') {
      // Prompt for Parent PIN
      setPinAction('SWITCH_TO_PARENT');
      setEnteredPin('');
      setPinError(false);
      setPinModalVisible(true);
    } else {
      // Switching to Child mode
      Alert.alert(
        'Switch to Child Agent Mode',
        'This will lock the app into transparent Child Monitoring Mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch to Child',
            onPress: () => safeGuardStore.setRole('CHILD'),
          },
        ]
      );
    }
  };

  const handleHubPress = () => {
    if (role === 'CHILD') {
      setPinAction('EXIT_TO_HUB');
      setEnteredPin('');
      setPinError(false);
      setPinModalVisible(true);
    } else {
      navigation.navigate('WorkspaceSelect');
    }
  };

  const handlePinDigit = (digit: string) => {
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handlePinDelete = () => {
    if (enteredPin.length > 0) {
      setEnteredPin(enteredPin.slice(0, -1));
      setPinError(false);
    }
  };

  const verifyPin = (pinToTest: string) => {
    if (pinToTest === settings.parentPin) {
      const action = pinAction;
      setPinModalVisible(false);
      setEnteredPin('');
      if (action === 'EXIT_TO_HUB') {
        navigation.navigate('WorkspaceSelect', { parentUnlocked: true });
      } else {
        safeGuardStore.setRole('PARENT');
      }
    } else {
      setPinError(true);
      setTimeout(() => {
        setEnteredPin('');
      }, 600);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 16),
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      {/* Main Top Header */}
      <View style={styles.header}>
        {/* Left: Back to workspace */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleHubPress}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>‹ Hub</Text>
        </TouchableOpacity>

        {/* Center: App Logo */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandIcon}>🛡️</Text>
          <View>
            <Text style={styles.brandTitle}>SafeGuard Family</Text>
            <Text style={styles.brandSubtitle}>
              {role === 'PARENT' ? 'Parent Controller' : 'Child Safety Agent'}
            </Text>
          </View>
        </View>

        {/* Right: Role Switcher Pill */}
        <TouchableOpacity
          style={[
            styles.roleSwitcherBtn,
            role === 'PARENT' ? styles.roleParentBtn : styles.roleChildBtn,
          ]}
          onPress={handleRoleSwitchPress}
          activeOpacity={0.8}
        >
          <Text style={styles.roleSwitcherIcon}>{role === 'PARENT' ? '👨‍👩‍👧' : '🧒'}</Text>
          <Text style={styles.roleSwitcherText}>
            {role === 'PARENT' ? 'Parent' : 'Child'}
          </Text>
          <Text style={styles.switchChevron}>⇄</Text>
        </TouchableOpacity>
      </View>

      {/* Main View Render based on Unified Role */}
      <View style={styles.body}>
        {role === 'PARENT' ? <ParentDashboardView /> : <ChildAgentView />}
      </View>

      {/* Parental PIN Authentication Modal */}
      <Modal visible={pinModalVisible} transparent animationType="slide">
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <View style={styles.pinHeader}>
              <Text style={styles.pinIcon}>🔒</Text>
              <Text style={styles.pinTitle}>
                {pinAction === 'EXIT_TO_HUB'
                  ? 'Exit Child Agent Mode'
                  : 'Enter Parent Security PIN'}
              </Text>
              <Text style={styles.pinSubtitle}>
                {pinAction === 'EXIT_TO_HUB'
                  ? 'Enter Parent PIN to exit and open OmniHub workspace. (Default: 1234)'
                  : 'Protected mode prevents unauthorized access by children. (Default: 1234)'}
              </Text>
            </View>

            {/* 4-digit Dots */}
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((idx) => {
                const filled = enteredPin.length > idx;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinDot,
                      filled && styles.pinDotFilled,
                      pinError && styles.pinDotError,
                    ]}
                  />
                );
              })}
            </View>

            {pinError && (
              <Text style={styles.pinErrorText}>Incorrect PIN. Please try again.</Text>
            )}

            {/* Numeric Keypad */}
            <View style={styles.keypad}>
              {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']].map(
                (row, rowIdx) => (
                  <View key={rowIdx} style={styles.keypadRow}>
                    {row.map((digit, colIdx) => {
                      if (!digit) {
                        return <View key={colIdx} style={styles.keypadKeyEmpty} />;
                      }
                      const isDelete = digit === '⌫';
                      return (
                        <TouchableOpacity
                          key={colIdx}
                          style={styles.keypadKey}
                          onPress={() => (isDelete ? handlePinDelete() : handlePinDigit(digit))}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.keypadKeyText,
                              isDelete && styles.keypadDeleteText,
                            ]}
                          >
                            {digit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              )}
            </View>

            <TouchableOpacity
              style={styles.cancelPinBtn}
              onPress={() => setPinModalVisible(false)}
            >
              <Text style={styles.cancelPinText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070C18',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0D1424',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  roleSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  roleParentBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: '#8B5CF6',
  },
  roleChildBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  roleSwitcherIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  roleSwitcherText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  switchChevron: {
    color: '#A78BFA',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '900',
  },
  body: {
    flex: 1,
  },
  pinBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pinCard: {
    backgroundColor: '#131D31',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pinHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pinIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  pinTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },
  pinSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#475569',
  },
  pinDotFilled: {
    backgroundColor: '#8B5CF6',
    borderColor: '#A78BFA',
  },
  pinDotError: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  keypad: {
    width: '100%',
    gap: 12,
    marginTop: 10,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  keypadKey: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyEmpty: {
    width: 62,
    height: 62,
  },
  keypadKeyText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
  },
  keypadDeleteText: {
    fontSize: 18,
    color: '#94A3B8',
  },
  cancelPinBtn: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelPinText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
});
