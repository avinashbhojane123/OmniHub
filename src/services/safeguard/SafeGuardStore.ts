import {
  SafeGuardRole,
  ChildProfile,
  AppUsageRecord,
  GeofenceZone,
  RiskAlertItem,
  CallRecord,
  NotificationRecord,
  DeviceCommandItem,
  SafeGuardSettings,
  CommandType,
  ControlLevel,
} from '../../types/safeguard';
import { RiskDetectionEngine } from './RiskDetectionEngine';

// Realistic initial seeded mock data
const INITIAL_CHILDREN: ChildProfile[] = [
  {
    id: 'child-emma',
    name: 'Emma Jenkins',
    age: 14,
    avatar: '👧',
    controlLevel: 'BALANCED',
    consentAccepted: true,
    consentAcceptedAt: '2026-10-01T10:00:00Z',
    screenTimeMinutesToday: 195,
    screenTimeLimitMinutes: 240,
    allowedUntilTime: '21:00',
    device: {
      id: 'dev-emma-01',
      deviceName: "Emma's Phone",
      brand: 'Samsung',
      model: 'Galaxy A54',
      androidVersion: 'Android 14',
      batteryLevel: 78,
      isOnline: true,
      isCharging: false,
      isLocked: false,
      lastSeenAt: 'Just now',
    },
  },
  {
    id: 'child-liam',
    name: 'Liam Jenkins',
    age: 9,
    avatar: '👦',
    controlLevel: 'STRICT',
    consentAccepted: true,
    consentAcceptedAt: '2026-10-02T14:30:00Z',
    screenTimeMinutesToday: 95,
    screenTimeLimitMinutes: 120,
    allowedUntilTime: '19:30',
    device: {
      id: 'dev-liam-02',
      deviceName: "Liam's Tablet",
      brand: 'Lenovo',
      model: 'Tab M10 Plus',
      androidVersion: 'Android 13',
      batteryLevel: 42,
      isOnline: true,
      isCharging: true,
      isLocked: false,
      lastSeenAt: '2 mins ago',
    },
  },
];

const INITIAL_APPS: Record<string, AppUsageRecord[]> = {
  'child-emma': [
    {
      id: 'app-yt',
      packageName: 'com.google.android.youtube',
      appName: 'YouTube',
      category: 'Entertainment',
      durationMinutes: 72,
      openCount: 6,
      isBlocked: false,
      lastUsedAt: '15m ago',
    },
    {
      id: 'app-ig',
      packageName: 'com.instagram.android',
      appName: 'Instagram',
      category: 'Social',
      durationMinutes: 58,
      openCount: 14,
      isBlocked: false,
      lastUsedAt: '25m ago',
    },
    {
      id: 'app-tt',
      packageName: 'com.zhiliaoapp.musically',
      appName: 'TikTok',
      category: 'Social',
      durationMinutes: 40,
      openCount: 12,
      isBlocked: true,
      lastUsedAt: 'Blocked by parent',
    },
    {
      id: 'app-roblox',
      packageName: 'com.roblox.client',
      appName: 'Roblox',
      category: 'Gaming',
      durationMinutes: 25,
      openCount: 2,
      isBlocked: false,
      lastUsedAt: '2h ago',
    },
  ],
  'child-liam': [
    {
      id: 'app-roblox-2',
      packageName: 'com.roblox.client',
      appName: 'Roblox',
      category: 'Gaming',
      durationMinutes: 55,
      openCount: 3,
      isBlocked: false,
      lastUsedAt: '30m ago',
    },
    {
      id: 'app-yt-kids',
      packageName: 'com.google.android.apps.youtube.kids',
      appName: 'YouTube Kids',
      category: 'Education',
      durationMinutes: 40,
      openCount: 2,
      isBlocked: false,
      lastUsedAt: '1h ago',
    },
  ],
};

const INITIAL_GEOFENCES: GeofenceZone[] = [
  {
    id: 'geo-home',
    name: 'Home Sanctuary',
    latitude: 37.7749,
    longitude: -122.4194,
    radiusMeters: 150,
    type: 'SAFE',
    isActive: true,
    lastEvent: { type: 'ENTER', timestamp: 'Today, 3:45 PM' },
  },
  {
    id: 'geo-school',
    name: 'Lincoln High School',
    latitude: 37.7812,
    longitude: -122.4287,
    radiusMeters: 300,
    type: 'SAFE',
    isActive: true,
    lastEvent: { type: 'EXIT', timestamp: 'Today, 3:15 PM' },
  },
  {
    id: 'geo-restricted',
    name: 'Industrial Train Yard',
    latitude: 37.7654,
    longitude: -122.4012,
    radiusMeters: 250,
    type: 'UNSAFE',
    isActive: true,
  },
];

const INITIAL_ALERTS: RiskAlertItem[] = [
  {
    id: 'alt-01',
    childId: 'child-emma',
    category: 'GROOMING',
    severity: 'CRITICAL',
    source: 'NOTIFICATION',
    appName: 'Instagram Direct',
    matchedKeywords: ["don't tell your mom", 'meet me alone'],
    snippet:
      'Hey Emma, ⚠️ [FLAGGED: don\'t tell your mom] ⚠️ about this party. We can ⚠️ [FLAGGED: meet me alone] ⚠️ behind the mall.',
    alertedAt: 'Today, 4:12 PM',
    isRead: false,
    acknowledgedByParent: false,
  },
  {
    id: 'alt-02',
    childId: 'child-emma',
    category: 'CYBERBULLYING',
    severity: 'HIGH',
    source: 'NOTIFICATION',
    appName: 'Discord',
    matchedKeywords: ['nobody likes you', 'ugly loser'],
    snippet: 'Why are you even talking? ⚠️ [FLAGGED: nobody likes you] ⚠️, you ⚠️ [FLAGGED: ugly loser] ⚠️.',
    alertedAt: 'Yesterday, 8:40 PM',
    isRead: true,
    acknowledgedByParent: true,
  },
  {
    id: 'alt-03',
    childId: 'child-liam',
    category: 'ABUSIVE_LANGUAGE',
    severity: 'MEDIUM',
    source: 'NOTIFICATION',
    appName: 'Roblox Chat',
    matchedKeywords: ['shut up idiot'],
    snippet: 'Hey get off my server and ⚠️ [FLAGGED: shut up idiot] ⚠️.',
    alertedAt: '2 days ago',
    isRead: true,
    acknowledgedByParent: true,
  },
];

const INITIAL_CALLS: CallRecord[] = [
  {
    id: 'call-1',
    phoneNumber: '+1 (555) 234-8901',
    contactName: 'Grandma Jenkins',
    type: 'INCOMING',
    durationSeconds: 340,
    timestamp: 'Today, 2:10 PM',
  },
  {
    id: 'call-2',
    phoneNumber: '+1 (555) 918-2234',
    contactName: 'Lucas (Classmate)',
    type: 'OUTGOING',
    durationSeconds: 120,
    timestamp: 'Today, 11:30 AM',
  },
  {
    id: 'call-3',
    phoneNumber: '+1 (800) 442-9900',
    contactName: 'Unknown Caller',
    type: 'MISSED',
    durationSeconds: 0,
    timestamp: 'Yesterday, 6:05 PM',
  },
];

const INITIAL_NOTIFICATIONS: NotificationRecord[] = [
  {
    id: 'notif-1',
    packageName: 'com.instagram.android',
    appName: 'Instagram',
    title: 'New Message from user_99',
    content: 'Are you coming over tonight? Don\'t tell your parents...',
    receivedAt: '4:12 PM',
    riskFlagged: true,
  },
  {
    id: 'notif-2',
    packageName: 'com.whatsapp',
    appName: 'WhatsApp',
    title: 'Family Group',
    content: 'Mom: Dinner will be ready at 7:00 PM tonight everyone!',
    receivedAt: '3:50 PM',
    riskFlagged: false,
  },
  {
    id: 'notif-3',
    packageName: 'com.google.android.youtube',
    appName: 'YouTube',
    title: 'MrBeast uploaded',
    content: 'I Built 100 Wells in Africa',
    receivedAt: '1:15 PM',
    riskFlagged: false,
  },
];

class SafeGuardStoreState {
  private role: SafeGuardRole = 'PARENT';
  private familyCode: string = 'SAFE-8492';
  private children: ChildProfile[] = INITIAL_CHILDREN;
  private selectedChildId: string = 'child-emma';
  private appUsage: Record<string, AppUsageRecord[]> = INITIAL_APPS;
  private geofences: GeofenceZone[] = INITIAL_GEOFENCES;
  private alerts: RiskAlertItem[] = INITIAL_ALERTS;
  private calls: CallRecord[] = INITIAL_CALLS;
  private notifications: NotificationRecord[] = INITIAL_NOTIFICATIONS;
  private commands: DeviceCommandItem[] = [];
  private settings: SafeGuardSettings = {
    parentPin: '1234',
    requirePinForChildSwitch: true,
    biometricsEnabled: false,
    soundAlertsEnabled: true,
    cameraRestricted: false,
    bluetoothRestricted: false,
    uninstallProtection: true,
    dataRetentionDays: 30,
  };
  private listeners: Array<() => void> = [];

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // Role management
  public getRole(): SafeGuardRole {
    return this.role;
  }

  public setRole(newRole: SafeGuardRole) {
    this.role = newRole;
    this.notify();
  }

  public getFamilyCode(): string {
    return this.familyCode;
  }

  public getChildren(): ChildProfile[] {
    return this.children;
  }

  public getSelectedChild(): ChildProfile {
    return (
      this.children.find((c) => c.id === this.selectedChildId) || this.children[0]
    );
  }

  public setSelectedChildId(id: string) {
    this.selectedChildId = id;
    this.notify();
  }

  public getAppUsage(childId: string): AppUsageRecord[] {
    return this.appUsage[childId] || [];
  }

  public toggleAppBlocked(childId: string, appId: string) {
    if (!this.appUsage[childId]) return;
    this.appUsage[childId] = this.appUsage[childId].map((a) =>
      a.id === appId ? { ...a, isBlocked: !a.isBlocked } : a
    );
    this.notify();
  }

  public getGeofences(): GeofenceZone[] {
    return this.geofences;
  }

  public getAlerts(): RiskAlertItem[] {
    return this.alerts;
  }

  public markAlertRead(alertId: string) {
    this.alerts = this.alerts.map((a) =>
      a.id === alertId ? { ...a, isRead: true, acknowledgedByParent: true } : a
    );
    this.notify();
  }

  public getCalls(): CallRecord[] {
    return this.calls;
  }

  public getNotifications(): NotificationRecord[] {
    return this.notifications;
  }

  public getSettings(): SafeGuardSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<SafeGuardSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.notify();
  }

  // Device Remote Control
  public sendCommand(commandType: CommandType, payload?: Record<string, any>) {
    const child = this.getSelectedChild();
    const newCmd: DeviceCommandItem = {
      id: `cmd-${Date.now()}`,
      childId: child.id,
      commandType,
      payload,
      status: 'EXECUTED',
      sentAt: new Date().toLocaleTimeString(),
      executedAt: new Date().toLocaleTimeString(),
    };
    this.commands.unshift(newCmd);

    // Apply immediate state mutation on child's device
    if (commandType === 'LOCK_DEVICE') {
      this.children = this.children.map((c) =>
        c.id === child.id
          ? {
              ...c,
              device: {
                ...c.device,
                isLocked: true,
                lockReason: payload?.reason || 'Parent remote lock active',
              },
            }
          : c
      );
    } else if (commandType === 'UNLOCK_DEVICE') {
      this.children = this.children.map((c) =>
        c.id === child.id
          ? {
              ...c,
              device: {
                ...c.device,
                isLocked: false,
                lockReason: undefined,
              },
            }
          : c
      );
    }

    this.notify();
  }

  // Set Control Level
  public setControlLevel(childId: string, level: ControlLevel) {
    this.children = this.children.map((c) =>
      c.id === childId ? { ...c, controlLevel: level } : c
    );
    this.notify();
  }

  // Simulation: Test typing / incoming message risk detection from child
  public simulateIncomingContent(text: string, appName: string = 'Test Chat') {
    const child = this.getSelectedChild();
    const result = RiskDetectionEngine.analyzeText(text, appName);

    const newNotif: NotificationRecord = {
      id: `notif-${Date.now()}`,
      packageName: 'com.example.chat',
      appName,
      title: `Message on ${appName}`,
      content: text,
      receivedAt: 'Just now',
      riskFlagged: result.riskDetected,
    };
    this.notifications.unshift(newNotif);

    if (result.riskDetected && result.category && result.severity) {
      const newAlert: RiskAlertItem = {
        id: `alt-${Date.now()}`,
        childId: child.id,
        category: result.category,
        severity: result.severity,
        source: 'NOTIFICATION',
        appName,
        matchedKeywords: result.matchedKeywords,
        snippet: result.maskedSnippet,
        alertedAt: 'Just now',
        isRead: false,
        acknowledgedByParent: false,
      };
      this.alerts.unshift(newAlert);
    }

    this.notify();
    return result;
  }
}

export const safeGuardStore = new SafeGuardStoreState();
