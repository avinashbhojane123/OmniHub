import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { safeGuardStore } from '../../services/safeguard/SafeGuardStore';
import {
  ChildProfile,
  AppUsageRecord,
  RiskAlertItem,
  ControlLevel,
} from '../../types/safeguard';
import { RiskDetectionEngine } from '../../services/safeguard/RiskDetectionEngine';

type ParentTab = 'overview' | 'apps' | 'location' | 'activity' | 'alerts' | 'settings';

export const ParentDashboardView: React.FC = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = safeGuardStore.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const children = safeGuardStore.getChildren();
  const selectedChild = safeGuardStore.getSelectedChild();
  const appList = safeGuardStore.getAppUsage(selectedChild.id);
  const alerts = safeGuardStore.getAlerts();
  const geofences = safeGuardStore.getGeofences();
  const calls = safeGuardStore.getCalls();
  const notifications = safeGuardStore.getNotifications();
  const settings = safeGuardStore.getSettings();

  const [activeTab, setActiveTab] = useState<ParentTab>('overview');

  const handleToggleLock = () => {
    if (selectedChild.device.isLocked) {
      safeGuardStore.sendCommand('UNLOCK_DEVICE');
      Alert.alert('Device Unlocked', `${selectedChild.name}'s device has been unlocked.`);
    } else {
      Alert.alert(
        'Lock Device',
        `Are you sure you want to lock ${selectedChild.name}'s device?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Lock Now',
            style: 'destructive',
            onPress: () => {
              safeGuardStore.sendCommand('LOCK_DEVICE', {
                reason: 'Parent initiated remote lock',
              });
            },
          },
        ]
      );
    }
  };

  const handleTriggerSiren = () => {
    Alert.alert(
      'Send Safety Alert',
      `Emit a high-priority loud siren chime on ${selectedChild.name}'s device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Siren',
          onPress: () => {
            safeGuardStore.sendCommand('EMERGENCY_ALERT');
            Alert.alert('Alert Sent', 'Emergency chime sent to child device.');
          },
        },
      ]
    );
  };

  const renderTabButton = (tab: ParentTab, label: string, icon: string) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tabButton, isActive && styles.tabButtonActive]}
        onPress={() => setActiveTab(tab)}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. Multi-Child Selector Bar */}
      <View style={styles.childBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childScroll}>
          {children.map((child: ChildProfile) => {
            const isSelected = child.id === selectedChild.id;
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.childChip, isSelected && styles.childChipSelected]}
                onPress={() => safeGuardStore.setSelectedChildId(child.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.childAvatar}>{child.avatar}</Text>
                <View>
                  <Text style={[styles.childName, isSelected && styles.childNameSelected]}>
                    {child.name}
                  </Text>
                  <View style={styles.childSubRow}>
                    <View
                      style={[
                        styles.onlineDot,
                        { backgroundColor: child.device.isOnline ? '#10B981' : '#64748B' },
                      ]}
                    />
                    <Text style={styles.childAge}>
                      {child.age}y • {child.controlLevel}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Device Quick Telemetry Banner */}
      <View style={styles.telemetryCard}>
        <View style={styles.telemetryLeft}>
          <Text style={styles.deviceName}>
            {selectedChild.device.deviceName} ({selectedChild.device.model})
          </Text>
          <View style={styles.telemetryBadges}>
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>⚡ {selectedChild.device.batteryLevel}%</Text>
            </View>
            <View
              style={[
                styles.badgePill,
                { backgroundColor: selectedChild.device.isLocked ? '#DC2626' : '#059669' },
              ]}
            >
              <Text style={[styles.badgeText, { color: '#FFF' }]}>
                {selectedChild.device.isLocked ? '🔒 LOCKED' : '🟢 ACTIVE'}
              </Text>
            </View>
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>Last seen: {selectedChild.device.lastSeenAt}</Text>
            </View>
          </View>
        </View>

        {/* Quick Action Controls */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              selectedChild.device.isLocked ? styles.actionUnlock : styles.actionLock,
            ]}
            onPress={handleToggleLock}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              {selectedChild.device.isLocked ? '🔓 UNLOCK' : '🔒 LOCK'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionSiren]}
            onPress={handleTriggerSiren}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>🚨 SIREN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Horizontal Navigation Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {renderTabButton('overview', 'Overview', '📊')}
          {renderTabButton('apps', 'App Limits', '📱')}
          {renderTabButton('location', 'GPS & Zones', '📍')}
          {renderTabButton('activity', 'Activity Feed', '💬')}
          {renderTabButton('alerts', `Risk Alerts (${alerts.filter((a) => !a.isRead).length})`, '⚠️')}
          {renderTabButton('settings', 'Rules & Safety', '⚙️')}
        </ScrollView>
      </View>

      {/* 4. Tab Body Content */}
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollBodyContent}>
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Screen Time Progress Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Today's Screen Time</Text>
                <Text style={styles.cardHighlight}>
                  {Math.floor(selectedChild.screenTimeMinutesToday / 60)}h{' '}
                  {selectedChild.screenTimeMinutesToday % 60}m /{' '}
                  {Math.floor(selectedChild.screenTimeLimitMinutes / 60)}h Limit
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(
                        100,
                        (selectedChild.screenTimeMinutesToday / selectedChild.screenTimeLimitMinutes) *
                          100
                      )}%`,
                      backgroundColor:
                        selectedChild.screenTimeMinutesToday > selectedChild.screenTimeLimitMinutes
                          ? '#EF4444'
                          : '#8B5CF6',
                    },
                  ]}
                />
              </View>

              <Text style={styles.cardSubtext}>
                Bedtime curfew starts at {selectedChild.allowedUntilTime || '21:00'}. Device locks
                automatically unless extended.
              </Text>
            </View>

            {/* Quick Risk Alerts Warning */}
            {alerts.some((a) => a.severity === 'CRITICAL' && !a.acknowledgedByParent) && (
              <TouchableOpacity
                style={styles.criticalAlertCard}
                onPress={() => setActiveTab('alerts')}
                activeOpacity={0.85}
              >
                <Text style={styles.criticalAlertIcon}>🚨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.criticalAlertTitle}>Critical Risk Detection Alert</Text>
                  <Text style={styles.criticalAlertDesc}>
                    Potentially unsafe content flagged on {selectedChild.name}'s device. Tap to inspect.
                  </Text>
                </View>
                <Text style={styles.criticalAlertArrow}>→</Text>
              </TouchableOpacity>
            )}

            {/* Top Apps Summary */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Most Used Apps Today</Text>
              {appList.slice(0, 3).map((app: AppUsageRecord) => (
                <View key={app.id} style={styles.appRow}>
                  <View style={styles.appIconCircle}>
                    <Text style={{ fontSize: 18 }}>📱</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.appNameText}>{app.appName}</Text>
                    <Text style={styles.appCategoryText}>
                      {app.category} • {app.openCount} opens
                    </Text>
                  </View>
                  <Text style={styles.appDurationText}>{app.durationMinutes}m</Text>
                </View>
              ))}
            </View>

            {/* Live GPS Snapshot */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Current GPS Location</Text>
                <Text style={styles.liveTag}>LIVE</Text>
              </View>
              <Text style={styles.locationAddressText}>📍 Market St & 4th, San Francisco, CA</Text>
              <Text style={styles.locationAccuracyText}>Accurate to 8 meters • Last updated 1 min ago</Text>
              <TouchableOpacity
                style={styles.mapPreviewBtn}
                onPress={() => setActiveTab('location')}
                activeOpacity={0.8}
              >
                <Text style={styles.mapPreviewBtnText}>View Full Live Map & Geofences →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 2. Apps Tab */}
        {activeTab === 'apps' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Installed Applications & Remote Blocklist</Text>
              <Text style={styles.cardSubtext}>
                Blocked applications trigger an immediate accessibility overlay screen on the child's
                device.
              </Text>

              {appList.map((app: AppUsageRecord) => (
                <View key={app.id} style={styles.appBlockRow}>
                  <View style={styles.appIconCircle}>
                    <Text style={{ fontSize: 18 }}>📱</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.appNameText}>{app.appName}</Text>
                    <Text style={styles.appSubline}>
                      {app.durationMinutes}m used • {app.isBlocked ? '⛔ Blocked' : '✅ Allowed'}
                    </Text>
                  </View>
                  <Switch
                    value={!app.isBlocked}
                    onValueChange={() => safeGuardStore.toggleAppBlocked(selectedChild.id, app.id)}
                    trackColor={{ false: '#EF4444', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 3. Location & Geofencing Tab */}
        {activeTab === 'location' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Live GPS Location & Geofence Boundaries</Text>
              <View style={styles.mockMapContainer}>
                <Text style={styles.mapWatermark}>🗺️ Interactive SafeGuard Map</Text>
                <View style={styles.mapPin}>
                  <Text style={styles.mapPinEmoji}>👧</Text>
                  <Text style={styles.mapPinLabel}>{selectedChild.name}</Text>
                </View>
                <Text style={styles.mapCoords}>Lat: 37.7749 • Lon: -122.4194</Text>
              </View>

              <Text style={[styles.cardTitle, { marginTop: 20 }]}>Safe & Unsafe Zones</Text>
              {geofences.map((zone) => (
                <View key={zone.id} style={styles.geofenceRow}>
                  <View
                    style={[
                      styles.zonePill,
                      { backgroundColor: zone.type === 'SAFE' ? '#064E3B' : '#7F1D1D' },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>{zone.type === 'SAFE' ? '🛡️' : '⛔'}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <Text style={styles.zoneDetails}>
                      Radius: {zone.radiusMeters}m • {zone.type} ZONE
                      {zone.lastEvent && ` • ${zone.lastEvent.type} at ${zone.lastEvent.timestamp}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 4. Activity Logs Tab */}
        {activeTab === 'activity' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Notification Stream</Text>
              <Text style={styles.cardSubtext}>
                Captured through transparent Android NotificationListenerService with child disclosure.
              </Text>
              {notifications.map((notif) => (
                <View key={notif.id} style={styles.activityItem}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityAppBadge}>{notif.appName}</Text>
                    <Text style={styles.activityTime}>{notif.receivedAt}</Text>
                  </View>
                  <Text style={styles.activityTitle}>{notif.title}</Text>
                  <Text style={styles.activityContent}>{notif.content}</Text>
                </View>
              ))}

              <Text style={[styles.cardTitle, { marginTop: 20 }]}>Call History Logs</Text>
              {calls.map((call) => (
                <View key={call.id} style={styles.callRow}>
                  <Text style={styles.callTypeIcon}>
                    {call.type === 'INCOMING' ? '📞' : call.type === 'OUTGOING' ? '↗️' : '📵'}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.callName}>{call.contactName || call.phoneNumber}</Text>
                    <Text style={styles.callMeta}>
                      {call.type} • {call.durationSeconds}s • {call.timestamp}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 5. Alerts Tab */}
        {activeTab === 'alerts' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>AI Keyword Risk Alerts</Text>
              <Text style={styles.cardSubtext}>
                Proprietary safety scanner analyzing captured communications against cyberbullying,
                self-harm, predatory grooming, and substance threats.
              </Text>

              {alerts.length === 0 ? (
                <Text style={styles.emptyText}>No safety risk alerts detected. Everything is safe!</Text>
              ) : (
                alerts.map((alert: RiskAlertItem) => {
                  const guidance = RiskDetectionEngine.getParentGuidance(alert.category);
                  return (
                    <View
                      key={alert.id}
                      style={[
                        styles.alertCard,
                        alert.severity === 'CRITICAL' && styles.alertCardCritical,
                      ]}
                    >
                      <View style={styles.alertHeaderRow}>
                        <View
                          style={[
                            styles.severityBadge,
                            alert.severity === 'CRITICAL'
                              ? styles.badgeCritical
                              : alert.severity === 'HIGH'
                              ? styles.badgeHigh
                              : styles.badgeMedium,
                          ]}
                        >
                          <Text style={styles.severityText}>{alert.severity} SEVERITY</Text>
                        </View>
                        <Text style={styles.alertTimeText}>{alert.alertedAt}</Text>
                      </View>

                      <Text style={styles.alertCategoryTitle}>
                        Category: {alert.category.replace('_', ' ')}
                      </Text>
                      <Text style={styles.alertSourceText}>App: {alert.appName}</Text>

                      <View style={styles.snippetBox}>
                        <Text style={styles.snippetText}>{alert.snippet}</Text>
                      </View>

                      <View style={styles.guidanceBox}>
                        <Text style={styles.guidanceTitle}>💡 Parent Guidance:</Text>
                        <Text style={styles.guidanceDesc}>{guidance.advice}</Text>
                        {guidance.helpline && (
                          <Text style={styles.guidanceHelpline}>📞 {guidance.helpline}</Text>
                        )}
                      </View>

                      <View style={styles.alertFooterRow}>
                        <TouchableOpacity
                          style={styles.reviewButton}
                          onPress={() => {
                            safeGuardStore.markAlertRead(alert.id);
                            Alert.alert('Alert Resolved', 'Incident marked as reviewed.');
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.reviewButtonText}>
                            {alert.acknowledgedByParent ? '✓ Acknowledged' : 'Mark Acknowledged'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* 6. Settings & Parental Levels Tab */}
        {activeTab === 'settings' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Adaptive Parental Control Level</Text>
              <Text style={styles.cardSubtext}>
                Configure automated safety strictness tailored to {selectedChild.name}’s age group.
              </Text>

              <View style={styles.levelsRow}>
                {(['LIGHT', 'BALANCED', 'STRICT'] as ControlLevel[]).map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.levelOption,
                      selectedChild.controlLevel === lvl && styles.levelOptionActive,
                    ]}
                    onPress={() => safeGuardStore.setControlLevel(selectedChild.id, lvl)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.levelOptionText,
                        selectedChild.controlLevel === lvl && styles.levelOptionTextActive,
                      ]}
                    >
                      {lvl === 'LIGHT' ? '🟢 Level 1\nLight (15-17y)' : lvl === 'BALANCED' ? '🟡 Level 2\nBalanced (10-14y)' : '🔴 Level 3\nStrict (5-9y)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardTitle, { marginTop: 24 }]}>Hardware & System Controls</Text>
              <View style={styles.settingToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Restrict Device Camera</Text>
                  <Text style={styles.settingDesc}>Enforces Device Policy camera disabling</Text>
                </View>
                <Switch
                  value={settings.cameraRestricted}
                  onValueChange={(val) => safeGuardStore.updateSettings({ cameraRestricted: val })}
                  trackColor={{ false: '#334155', true: '#8B5CF6' }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.settingToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Sound & Siren Alert Chimes</Text>
                  <Text style={styles.settingDesc}>Allows emergency locate alerts to bypass silent mode</Text>
                </View>
                <Switch
                  value={settings.soundAlertsEnabled}
                  onValueChange={(val) => safeGuardStore.updateSettings({ soundAlertsEnabled: val })}
                  trackColor={{ false: '#334155', true: '#8B5CF6' }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.familyCodeBox}>
                <Text style={styles.familyCodeTitle}>Family Pairing Code</Text>
                <Text style={styles.familyCodeValue}>{safeGuardStore.getFamilyCode()}</Text>
                <Text style={styles.familyCodeHelp}>
                  Enter this code on the child device to link another phone.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  childBar: {
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  childScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  childChipSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
  },
  childAvatar: {
    fontSize: 22,
    marginRight: 8,
  },
  childName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  childNameSelected: {
    color: '#FFFFFF',
  },
  childSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  childAge: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  telemetryCard: {
    backgroundColor: '#131D31',
    marginHorizontal: 14,
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  telemetryLeft: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  telemetryBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  actionRow: {
    flexDirection: 'column',
    gap: 6,
    marginLeft: 10,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLock: {
    backgroundColor: '#EF4444',
  },
  actionUnlock: {
    backgroundColor: '#10B981',
  },
  actionSiren: {
    backgroundColor: '#F59E0B',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },
  tabsContainer: {
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabsScroll: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#1E293B',
  },
  tabButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  tabIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  scrollBody: {
    flex: 1,
  },
  scrollBodyContent: {
    padding: 14,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 14,
  },
  card: {
    backgroundColor: '#131D31',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A78BFA',
  },
  cardSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginTop: 6,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 5,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  criticalAlertCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  criticalAlertIcon: {
    fontSize: 26,
    marginRight: 12,
  },
  criticalAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FCA5A5',
  },
  criticalAlertDesc: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 2,
  },
  criticalAlertArrow: {
    fontSize: 20,
    color: '#FCA5A5',
    marginLeft: 8,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  appIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  appCategoryText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  appDurationText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  liveTag: {
    backgroundColor: '#059669',
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  locationAddressText: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '600',
    marginTop: 4,
  },
  locationAccuracyText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  mapPreviewBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  mapPreviewBtnText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '800',
  },
  appBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  appSubline: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  mockMapContainer: {
    height: 180,
    backgroundColor: '#0F2942',
    borderRadius: 16,
    marginTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    position: 'relative',
  },
  mapWatermark: {
    position: 'absolute',
    top: 10,
    left: 12,
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  mapPin: {
    alignItems: 'center',
  },
  mapPinEmoji: {
    fontSize: 34,
  },
  mapPinLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  mapCoords: {
    position: 'absolute',
    bottom: 8,
    fontSize: 10,
    color: '#94A3B8',
  },
  geofenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  zonePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  zoneDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  activityItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activityAppBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#06B6D4',
  },
  activityTime: {
    fontSize: 10,
    color: '#64748B',
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  activityContent: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  callTypeIcon: {
    fontSize: 18,
  },
  callName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  callMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#10B981',
    textAlign: 'center',
    marginVertical: 20,
    fontWeight: '700',
  },
  alertCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  alertCardCritical: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeCritical: {
    backgroundColor: '#EF4444',
  },
  badgeHigh: {
    backgroundColor: '#F97316',
  },
  badgeMedium: {
    backgroundColor: '#EAB308',
  },
  severityText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertTimeText: {
    fontSize: 10,
    color: '#64748B',
  },
  alertCategoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 4,
  },
  alertSourceText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 8,
  },
  snippetBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  snippetText: {
    fontSize: 12,
    color: '#F87171',
    lineHeight: 18,
    fontWeight: '500',
  },
  guidanceBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8B5CF6',
  },
  guidanceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A78BFA',
    marginBottom: 3,
  },
  guidanceDesc: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 16,
  },
  guidanceHelpline: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
    marginTop: 4,
  },
  alertFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  reviewButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  reviewButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  levelsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  levelOption: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  levelOptionActive: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  levelOptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 14,
  },
  levelOptionTextActive: {
    color: '#FFF',
    fontWeight: '900',
  },
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  settingDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  familyCodeBox: {
    backgroundColor: '#1E1B4B',
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  familyCodeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A78BFA',
    letterSpacing: 1,
  },
  familyCodeValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 4,
    marginVertical: 6,
  },
  familyCodeHelp: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
