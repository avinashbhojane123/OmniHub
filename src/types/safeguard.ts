export type SafeGuardRole = 'PARENT' | 'CHILD';

export type ControlLevel = 'LIGHT' | 'BALANCED' | 'STRICT';

export type RiskCategory =
  | 'CYBERBULLYING'
  | 'SELF_HARM'
  | 'GROOMING'
  | 'SEXTORTION'
  | 'DRUGS'
  | 'ABUSIVE_LANGUAGE';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type CommandType =
  | 'LOCK_DEVICE'
  | 'UNLOCK_DEVICE'
  | 'BLOCK_APP'
  | 'UNBLOCK_APP'
  | 'EMERGENCY_ALERT'
  | 'REFRESH_RULES';

export type CommandStatus = 'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED';

export type GeofenceType = 'SAFE' | 'UNSAFE';

export interface DeviceStatus {
  id: string;
  deviceName: string;
  brand: string;
  model: string;
  androidVersion: string;
  batteryLevel: number;
  isOnline: boolean;
  isCharging?: boolean;
  isLocked: boolean;
  lockReason?: string;
  lastSeenAt: string;
}

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  avatar: string;
  controlLevel: ControlLevel;
  consentAccepted: boolean;
  consentAcceptedAt?: string;
  device: DeviceStatus;
  screenTimeMinutesToday: number;
  screenTimeLimitMinutes: number;
  allowedUntilTime?: string;
}

export interface AppUsageRecord {
  id: string;
  packageName: string;
  appName: string;
  icon?: string;
  category: 'Social' | 'Entertainment' | 'Gaming' | 'Education' | 'System';
  durationMinutes: number;
  openCount: number;
  isBlocked: boolean;
  lastUsedAt: string;
}

export interface LocationPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address: string;
  timestamp: string;
}

export interface GeofenceZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  type: GeofenceType;
  isActive: boolean;
  lastEvent?: {
    type: 'ENTER' | 'EXIT';
    timestamp: string;
  };
}

export interface RiskAlertItem {
  id: string;
  childId: string;
  category: RiskCategory;
  severity: RiskSeverity;
  source: 'NOTIFICATION' | 'SMS' | 'BROWSING' | 'USER_TEST';
  appName: string;
  matchedKeywords: string[];
  snippet: string;
  alertedAt: string;
  isRead: boolean;
  acknowledgedByParent: boolean;
}

export interface CallRecord {
  id: string;
  phoneNumber: string;
  contactName?: string;
  type: 'INCOMING' | 'OUTGOING' | 'MISSED';
  durationSeconds: number;
  timestamp: string;
}

export interface NotificationRecord {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  content: string;
  receivedAt: string;
  riskFlagged?: boolean;
}

export interface DeviceCommandItem {
  id: string;
  childId: string;
  commandType: CommandType;
  payload?: Record<string, any>;
  status: CommandStatus;
  sentAt: string;
  executedAt?: string;
}

export interface SafeGuardSettings {
  parentPin: string;
  requirePinForChildSwitch: boolean;
  biometricsEnabled: boolean;
  soundAlertsEnabled: boolean;
  cameraRestricted: boolean;
  bluetoothRestricted: boolean;
  uninstallProtection: boolean;
  dataRetentionDays: number;
}
