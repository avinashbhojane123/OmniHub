import { KeepNote } from './keepNote';
import { MovieBookmark } from './movie';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled';

export type RecurrenceType =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4';
export type GtdEnergyLevel = 'low' | 'medium' | 'high';
export type GtdContext =
  | '@computer'
  | '@phone'
  | '@errands'
  | '@home'
  | '@office'
  | '@review';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // e.g. every 2 weeks
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  endDate?: string; // YYYY-MM-DD
  startDate?: string; // GTD Deferred start date YYYY-MM-DD
  monthDay?: number; // Day of month (1 - 31) for monthly/yearly recurrence
  eisenhowerQuadrant?: EisenhowerQuadrant;
  gtdContext?: string;
  energyLevel?: GtdEnergyLevel;
  accentColor?: string;
  estimatedMinutes?: number;
  isOvernight?: boolean;
  isLoudAlarm?: boolean;
}

export interface Task {
  id: string;
  seriesId?: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD (e.g. '2026-10-30', or empty string for Backlog)
  startTime?: string; // HH:mm (24hr format)
  endTime?: string; // HH:mm (24hr format)
  priority: TaskPriority;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  status: TaskStatus;
  eisenhowerQuadrant?: EisenhowerQuadrant;
  accentColor?: string;
  estimatedMinutes?: number;
  isOvernight?: boolean;
  isLoudAlarm?: boolean;
  recurrenceRule?: RecurrenceRule;
  reminderMinutes?: number; // minutes before task time (0 = at time, 10 = 10m before, etc.)
  snoozeUntil?: string; // ISO string
  notes?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  completedAt?: string; // ISO string
}

export interface CreateTaskDTO {
  seriesId?: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  priority?: TaskPriority;
  categoryId?: string;
  eisenhowerQuadrant?: EisenhowerQuadrant;
  accentColor?: string;
  estimatedMinutes?: number;
  isOvernight?: boolean;
  isLoudAlarm?: boolean;
  recurrenceRule?: RecurrenceRule;
  reminderMinutes?: number;
  notes?: string;
}

export interface UpdateTaskDTO {
  seriesId?: string | null;
  title?: string;
  description?: string | null;
  date?: string | null; // Can be set to null for Backlog items
  startTime?: string | null;
  endTime?: string | null;
  priority?: TaskPriority;
  categoryId?: string | null;
  status?: TaskStatus;
  eisenhowerQuadrant?: EisenhowerQuadrant | null;
  accentColor?: string | null;
  estimatedMinutes?: number | null;
  isOvernight?: boolean | null;
  isLoudAlarm?: boolean | null;
  recurrenceRule?: RecurrenceRule | null;
  reminderMinutes?: number | null;
  notes?: string | null;
  completedAt?: string | null;
  snoozeUntil?: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24-hour)
  endTime?: string; // HH:mm (24-hour)
  ringAlarm: boolean;
  status: 'active' | 'dismissed' | 'completed';
  accentColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventDTO {
  title: string;
  description?: string;
  date: string;
  time: string;
  endTime?: string;
  ringAlarm?: boolean;
  status?: 'active' | 'dismissed' | 'completed';
  accentColor?: string;
}

export interface UpdateCalendarEventDTO {
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  endTime?: string | null;
  ringAlarm?: boolean;
  status?: 'active' | 'dismissed' | 'completed';
  accentColor?: string | null;
}

export interface Habit {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  category?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  recurrenceRule: RecurrenceRule;
  target: number; // e.g. 1 per day
  reminderTime?: string; // HH:mm
  createdAt: string;
  archivedAt?: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  value: number;
  notes?: string;
  createdAt: string;
}

export interface HabitWithStreak extends Habit {
  currentStreak: number;
  bestStreak: number;
  completedToday: boolean;
  weeklyLogs: { [date: string]: boolean };
}

export interface Note {
  id: string;
  entityType: 'task' | 'habit' | 'general' | 'movie' | 'calendarEvent' | string;
  entityId?: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  taskId: string;
  eventTime: string; // ISO string
  triggerTime: string; // ISO string
  status: 'scheduled' | 'triggered' | 'snoozed' | 'dismissed' | 'completed';
  snoozeCount: number;
  createdAt: string;
}

export interface NotificationSchedule {
  id: string;
  notificationId: string;
  entityId: string;
  type: 'task' | 'habit' | 'keepNote' | 'calendarEvent';
  scheduledAt: string; // ISO string
  title: string;
  body: string;
  channelId: string;
  status: 'active' | 'cancelled' | 'fired';
  createdAt: string;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationSoundTone?: 'standard' | 'loud' | 'gentle';
  notificationVibration: boolean;
  defaultReminderMinutes: number;
  defaultSnoozeMinutes: number;
  theme: 'system' | 'light' | 'dark';
  companionAutoSync?: boolean;
  companionServerUrl?: string;
  companionApiKey?: string;
  userName?: string;
  userAvatar?: string;
  birthDate?: string;
  batteryGuardActive?: boolean;
  googleSheetWebhookUrl?: string;
  googleSheetAutoSync?: boolean;
  [key: string]: any;
}

export interface ProductivityStats {
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
  completionPercentage: number;
  habitsCompletedToday: number;
  totalHabits: number;
  habitCompletionPercentage: number;
  currentStreak: number;
  bestStreak: number;
  weeklyCompleted: number;
  weeklyOverdue: number;
  weeklyCompletionRate: number;
}

export type SyncEntityType =
  | 'task'
  | 'habit'
  | 'habitLog'
  | 'keepNote'
  | 'calendarEvent'
  | 'category'
  | 'note'
  | 'movieBookmark'
  | 'batterySession';

export interface SyncTombstone {
  id: string;
  entityType: SyncEntityType;
  deletedAt: string;
}

export type RestoreMode = 'replace' | 'merge';

export interface BatterySessionRecord {
  id: string;
  startTime: string;
  endTime?: string | null;
  startLevel: number;
  endLevel?: number | null;
  gained: number;
  durationMinutes: number;
  chargingType: string;
  peakTemperature: number;
  peakWattage: number;
  avgSpeedPerHour: number;
  completed: number; // 0 = active, 1 = completed
}

export interface BatteryStatus {
  level: number; // 0 - 100
  isCharging: boolean;
  chargingType: 'AC' | 'USB' | 'Wireless' | 'Plugged' | 'Unplugged';
  status: 'Charging' | 'Discharging' | 'Full' | 'Not Charging' | 'Unknown';
  health: string;
  temperature: number; // in Celsius
  voltage: number; // in mV
  currentNow?: number; // in mA
  wattage?: number; // in W
  technology: string;
  present: boolean;
  chargeTimeRemainingMs?: number;
  cycleCount?: number;
  capacityMah?: number;
}

export interface BatteryAlarmSettings {
  batteryGuardActive: boolean;
  fullChargeAlarmEnabled: boolean;
  fullChargeTarget: number;
  overchargeFailsafeEnabled: boolean;
  lowBatteryAlarmEnabled: boolean;
  lowBatteryTarget: number;
  criticalLowAlarmEnabled: boolean;
  tempAlarmEnabled: boolean;
  tempTarget: number;
  pluggedAlertEnabled: boolean;
  unpluggedAlertEnabled: boolean;
  continuousRingtone: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  autoRepeatAlarm: boolean;
}

export interface BackupData {
  version: number;
  createdAt: string;
  tasks: Task[];
  categories: Category[];
  calendarEvents?: CalendarEvent[];
  habits: Habit[];
  habitLogs: HabitLog[];
  notes: Note[];
  keepNotes?: KeepNote[];
  movieBookmarks?: MovieBookmark[];
  batterySessions?: BatterySessionRecord[];
  settings: Record<string, any>;
  tombstones?: SyncTombstone[];
}

export type SnoozeDurationOption = 5 | 10 | 15 | 30 | 60;

export type NextUpItemType = 'task' | 'calendar_event' | 'habit';

export interface UnifiedNextUpItem {
  id: string;
  type: NextUpItemType;
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  streakCount?: number;
  isSnoozed?: boolean;
  snoozeFormatted?: string;
  rawTask?: Task;
  rawEvent?: CalendarEvent;
  rawHabit?: HabitWithStreak;
}

// Runtime Type Guards
export function isTask(val: unknown): val is Task {
  if (!val || typeof val !== 'object') return false;
  const t = val as Partial<Task>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.status === 'string' &&
    typeof t.priority === 'string' &&
    typeof t.date === 'string' &&
    typeof t.createdAt === 'string' &&
    typeof t.updatedAt === 'string'
  );
}

export function isHabit(val: unknown): val is Habit {
  if (!val || typeof val !== 'object') return false;
  const h = val as Partial<Habit>;
  return (
    typeof h.id === 'string' &&
    typeof h.name === 'string' &&
    typeof h.icon === 'string' &&
    typeof h.color === 'string' &&
    typeof h.target === 'number' &&
    typeof h.createdAt === 'string' &&
    isRecurrenceRule(h.recurrenceRule)
  );
}

export function isRecurrenceRule(val: unknown): val is RecurrenceRule {
  if (!val || typeof val !== 'object') return false;
  const r = val as Partial<RecurrenceRule>;
  return (
    typeof r.type === 'string' &&
    [
      'none',
      'daily',
      'weekdays',
      'weekends',
      'weekly',
      'monthly',
      'yearly',
      'custom',
    ].includes(r.type)
  );
}

export function isCalendarEvent(val: unknown): val is CalendarEvent {
  if (!val || typeof val !== 'object') return false;
  const e = val as Partial<CalendarEvent>;
  return (
    typeof e.id === 'string' &&
    typeof e.title === 'string' &&
    typeof e.date === 'string' &&
    typeof e.time === 'string' &&
    typeof e.ringAlarm === 'boolean' &&
    typeof e.status === 'string' &&
    typeof e.createdAt === 'string' &&
    typeof e.updatedAt === 'string'
  );
}

export function isCategory(val: unknown): val is Category {
  if (!val || typeof val !== 'object') return false;
  const c = val as Partial<Category>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.color === 'string' &&
    typeof c.icon === 'string' &&
    typeof c.createdAt === 'string'
  );
}

export function isBackupData(val: unknown): val is BackupData {
  if (!val || typeof val !== 'object') return false;
  const b = val as Partial<BackupData>;
  return (
    typeof b.version === 'number' &&
    typeof b.createdAt === 'string' &&
    Array.isArray(b.tasks) &&
    Array.isArray(b.categories) &&
    Array.isArray(b.habits) &&
    Array.isArray(b.habitLogs) &&
    Array.isArray(b.notes) &&
    typeof b.settings === 'object' &&
    b.settings !== null
  );
}

// Utility Helpers
export function getPriorityWeight(priority?: TaskPriority): number {
  switch (priority) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

export function isTaskCompleted(status?: TaskStatus): boolean {
  return status === 'completed';
}

export function isTaskOverdue(
  task: Partial<Task>,
  todayIso?: string,
  currentTime24H?: string
): boolean {
  if (!task.date || task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  const now = new Date();
  const today =
    todayIso ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (task.date < today) {
    return true;
  }
  if (task.date === today && task.startTime) {
    const curTime =
      currentTime24H ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return task.startTime < curTime;
  }
  return false;
}

export * from './keepNote';
export * from './chat';
export * from './movie';
