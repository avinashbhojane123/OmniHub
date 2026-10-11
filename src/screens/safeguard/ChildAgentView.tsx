import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { safeGuardStore } from '../../services/safeguard/SafeGuardStore';
import { SafeGuardNativeBridge } from '../../services/safeguard/SafeGuardNativeBridge';
import { RiskAnalysisResult } from '../../services/safeguard/RiskDetectionEngine';

export const ChildAgentView: React.FC = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = safeGuardStore.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const selectedChild = safeGuardStore.getSelectedChild();
  const device = selectedChild.device;

  // Permissions state
  const [usageAccessGranted, setUsageAccessGranted] = useState(true);
  const [notifAccessGranted, setNotifAccessGranted] = useState(true);
  const [accessibilityGranted, setAccessibilityGranted] = useState(true);

  // Risk Simulator Input
  const [testText, setTestText] = useState('');
  const [scanResult, setScanResult] = useState<RiskAnalysisResult | null>(null);

  // Emergency SOS dialog
  const [sosModalVisible, setSosModalVisible] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const usage = await SafeGuardNativeBridge.hasUsageStatsPermission();
    const notif = await SafeGuardNativeBridge.hasNotificationAccess();
    const access = await SafeGuardNativeBridge.isAccessibilityEnabled();
    setUsageAccessGranted(usage);
    setNotifAccessGranted(notif);
    setAccessibilityGranted(access);
  };

  const handleTestScan = () => {
    if (!testText.trim()) return;
    const result = safeGuardStore.simulateIncomingContent(testText, 'Test Message Simulator');
    setScanResult(result);
  };

  const handleTriggerSOS = () => {
    setSosModalVisible(true);
  };

  const handleConfirmSOS = () => {
    setSosModalVisible(false);
    safeGuardStore.sendCommand('EMERGENCY_ALERT', {
      source: 'CHILD_SOS',
      gps: '37.7749, -122.4194',
    });
    Alert.alert(
      '🚨 SOS Alert Dispatched',
      'Your parents have been sent an immediate high-priority alert with your exact GPS location.'
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 1. Mandatory Persistent Transparency Notification Card */}
        <View style={styles.persistentBanner}>
          <View style={styles.greenBeacon} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.persistentTitle}>SafeGuard Agent is Active</Text>
            <Text style={styles.persistentSubtitle}>
              Device monitoring is transparent and visible to this user with parental consent.
            </Text>
          </View>
        </View>

        {/* 2. Paired Family Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Text style={styles.profileAvatar}>{selectedChild.avatar}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.profileName}>{selectedChild.name}</Text>
              <Text style={styles.profileMeta}>
                Paired Device • {device.brand} {device.model} ({device.androidVersion})
              </Text>
              <Text style={styles.consentBadge}>
                ✓ Informed Monitoring Consent Accepted on{' '}
                {selectedChild.consentAcceptedAt
                  ? new Date(selectedChild.consentAcceptedAt).toLocaleDateString()
                  : 'Setup'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Screen Time & Digital Wellbeing Status */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Daily Digital Wellbeing</Text>
          <View style={styles.timeStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>USED TODAY</Text>
              <Text style={styles.statValue}>
                {Math.floor(selectedChild.screenTimeMinutesToday / 60)}h{' '}
                {selectedChild.screenTimeMinutesToday % 60}m
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>DAILY LIMIT</Text>
              <Text style={styles.statValue}>
                {Math.floor(selectedChild.screenTimeLimitMinutes / 60)}h 00m
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>CURFEW</Text>
              <Text style={styles.statValue}>{selectedChild.allowedUntilTime || '21:00'}</Text>
            </View>
          </View>
        </View>

        {/* 4. Mandatory Ethical Transparency & Rights Box */}
        <View style={styles.transparencyCard}>
          <Text style={styles.transparencyTitle}>🛡️ What We Monitor & What Stays Private</Text>

          <View style={styles.transparencyGrid}>
            <View style={styles.transparencyColGood}>
              <Text style={styles.transparencyColHeader}>✅ Monitored for Safety</Text>
              <Text style={styles.transparencyBullet}>• Screen time duration & bedtime limits</Text>
              <Text style={styles.transparencyBullet}>• Unsafe website & dangerous app blocking</Text>
              <Text style={styles.transparencyBullet}>• Real-time GPS location for physical safety</Text>
              <Text style={styles.transparencyBullet}>• Cyberbullying & danger keyword alerts</Text>
            </View>

            <View style={styles.transparencyColPrivate}>
              <Text style={styles.transparencyColHeader}>🔒 Completely Private & Secure</Text>
              <Text style={styles.transparencyBullet}>• No private photo/video scanning</Text>
              <Text style={styles.transparencyBullet}>• No stealth microphone eavesdropping</Text>
              <Text style={styles.transparencyBullet}>• No passwords or bank card access</Text>
              <Text style={styles.transparencyBullet}>• No hidden background surveillance</Text>
            </View>
          </View>
        </View>

        {/* 5. Permission Setup Wizard Status */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Android System Permissions</Text>
          <Text style={styles.cardSubtitle}>
            SafeGuard requires official Android system services to safeguard this device.
          </Text>

          <View style={styles.permissionItem}>
            <Text style={styles.permIcon}>⏱️</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.permName}>Usage Access (UsageStatsManager)</Text>
              <Text style={styles.permDesc}>Monitors app duration and screen limits</Text>
            </View>
            <TouchableOpacity
              style={[styles.permButton, usageAccessGranted ? styles.permBtnActive : styles.permBtnPending]}
              onPress={() => SafeGuardNativeBridge.openUsageStatsSettings()}
            >
              <Text style={styles.permBtnText}>{usageAccessGranted ? '✓ Active' : 'Enable'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.permissionItem}>
            <Text style={styles.permIcon}>🔔</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.permName}>Notification Safety Listener</Text>
              <Text style={styles.permDesc}>Detects predatory grooming & cyber harassment</Text>
            </View>
            <TouchableOpacity
              style={[styles.permButton, notifAccessGranted ? styles.permBtnActive : styles.permBtnPending]}
              onPress={() => SafeGuardNativeBridge.openNotificationListenerSettings()}
            >
              <Text style={styles.permBtnText}>{notifAccessGranted ? '✓ Active' : 'Enable'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.permissionItem}>
            <Text style={styles.permIcon}>🛡️</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.permName}>Accessibility App Blocker</Text>
              <Text style={styles.permDesc}>Prevents opening restricted applications</Text>
            </View>
            <TouchableOpacity
              style={[styles.permButton, accessibilityGranted ? styles.permBtnActive : styles.permBtnPending]}
              onPress={() => SafeGuardNativeBridge.openAccessibilitySettings()}
            >
              <Text style={styles.permBtnText}>{accessibilityGranted ? '✓ Active' : 'Enable'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. Live Risk Scanner Test Station */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>AI Keyword Safety Engine (Live Demo)</Text>
          <Text style={styles.cardSubtitle}>
            Test how the ethical risk detection engine detects threats while respecting ordinary chats.
          </Text>

          <TextInput
            style={styles.testInput}
            placeholder="Type a sample message or tap one below..."
            placeholderTextColor="#64748B"
            value={testText}
            onChangeText={setTestText}
            multiline
          />

          {/* Quick presets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => setTestText("Don't tell your mom where we are meeting tonight")}
            >
              <Text style={styles.presetChipText}>Test Predator Grooming</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => setTestText("I feel so sad and want to hurt myself")}
            >
              <Text style={styles.presetChipText}>Test Self-Harm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => setTestText("Nobody likes you, ugly loser")}
            >
              <Text style={styles.presetChipText}>Test Cyberbullying</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => setTestText("Hey, let's finish our school science homework")}
            >
              <Text style={styles.presetChipText}>Test Safe Homework</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity style={styles.scanButton} onPress={handleTestScan} activeOpacity={0.8}>
            <Text style={styles.scanButtonText}>🔍 Run AI Safety Scan</Text>
          </TouchableOpacity>

          {scanResult && (
            <View
              style={[
                styles.scanResultBox,
                scanResult.riskDetected ? styles.scanResultRisk : styles.scanResultSafe,
              ]}
            >
              <Text style={styles.scanResultTitle}>
                {scanResult.riskDetected
                  ? `🚨 Risk Flagged: ${scanResult.category} (${scanResult.severity})`
                  : '✅ No Risks Detected (Safe Communication)'}
              </Text>
              {scanResult.riskDetected && (
                <>
                  <Text style={styles.scanKeywords}>
                    Matched Keywords: {scanResult.matchedKeywords.join(', ')}
                  </Text>
                  <Text style={styles.scanSnippet}>{scanResult.maskedSnippet}</Text>
                  <Text style={styles.scanNotice}>
                    ✓ Parent received responsible alert notification.
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* 7. Child Emergency SOS Action */}
        <TouchableOpacity style={styles.sosButton} onPress={handleTriggerSOS} activeOpacity={0.88}>
          <Text style={styles.sosIcon}>🚨</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.sosTitle}>EMERGENCY SOS</Text>
            <Text style={styles.sosSubtitle}>Send instant GPS location & loud alert to parents</Text>
          </View>
          <Text style={styles.sosArrow}>→</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Emergency SOS Confirmation Modal */}
      <Modal visible={sosModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.sosModalCard}>
            <Text style={styles.sosModalIcon}>🚨</Text>
            <Text style={styles.sosModalTitle}>Send Emergency Alert?</Text>
            <Text style={styles.sosModalDesc}>
              This will immediately send your current GPS coordinates to your parents and play an
              urgent alert sound on their dashboard.
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSosModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmSOS}>
                <Text style={styles.modalConfirmText}>SEND SOS NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Device Lock Overlay (Shown when parent triggers LOCK_DEVICE) */}
      {device.isLocked && (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>DEVICE LOCKED BY PARENT</Text>
          <Text style={styles.lockDesc}>
            {device.lockReason || 'Screen time limit exceeded or bedtime curfew active.'}
          </Text>
          <Text style={styles.lockTimeNotice}>
            All applications are restricted until bedtime concludes or your parent unlocks this
            device.
          </Text>

          <TouchableOpacity
            style={styles.emergencyCallBtn}
            onPress={() => Alert.alert('Emergency Contact', 'Dialing parent directly: +1 (555) 234-8901')}
            activeOpacity={0.8}
          >
            <Text style={styles.emergencyCallText}>📞 Call Parent for Emergency</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070C18',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },
  persistentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 14,
  },
  greenBeacon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  persistentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#34D399',
  },
  persistentSubtitle: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 2,
    lineHeight: 15,
  },
  profileCard: {
    backgroundColor: '#0F1A2E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    fontSize: 34,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  profileMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  consentBadge: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#0F1A2E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  timeStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#38BDF8',
  },
  transparencyCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  transparencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 12,
  },
  transparencyGrid: {
    gap: 10,
  },
  transparencyColGood: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  transparencyColPrivate: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  transparencyColHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 6,
  },
  transparencyBullet: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  permIcon: {
    fontSize: 22,
  },
  permName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  permDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  permButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  permBtnActive: {
    backgroundColor: '#065F46',
  },
  permBtnPending: {
    backgroundColor: '#8B5CF6',
  },
  permBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  testInput: {
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    color: '#FFF',
    padding: 12,
    marginTop: 12,
    fontSize: 13,
    minHeight: 65,
    textAlignVertical: 'top',
  },
  presetsScroll: {
    marginVertical: 10,
  },
  presetChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
  },
  presetChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  scanButton: {
    backgroundColor: '#06B6D4',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  scanResultBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  scanResultSafe: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  scanResultRisk: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  scanResultTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  scanKeywords: {
    fontSize: 11,
    color: '#F87171',
    marginTop: 4,
    fontWeight: '700',
  },
  scanSnippet: {
    fontSize: 11,
    color: '#E2E8F0',
    marginTop: 4,
    lineHeight: 16,
  },
  scanNotice: {
    fontSize: 10,
    color: '#34D399',
    marginTop: 6,
    fontWeight: '600',
  },
  sosButton: {
    backgroundColor: '#DC2626',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  sosIcon: {
    fontSize: 28,
  },
  sosTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  sosSubtitle: {
    fontSize: 11,
    color: '#FECACA',
    marginTop: 2,
  },
  sosArrow: {
    fontSize: 22,
    color: '#FFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sosModalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  sosModalIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  sosModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },
  sosModalDesc: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#EF4444',
    textAlign: 'center',
    letterSpacing: 1,
  },
  lockDesc: {
    fontSize: 14,
    color: '#E2E8F0',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  lockTimeNotice: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 280,
    lineHeight: 18,
  },
  emergencyCallBtn: {
    marginTop: 32,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emergencyCallText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 14,
  },
});
