import { KeepNote } from './keepNote';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export type RecurrenceType =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4';
export type GtdEnergyLevel = 'low' | 'medium' | 'high';
export type GtdContext = '@computer' | '@phone' | '@errands' | '@home' | '@office' | '@review';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // e.g. every 2 weeks
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  endDate?: string; // YYYY-MM-DD
  startDate?: string; // GTD Deferred start date YYYY-MM-DD
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
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm (24hr format)
  endTime?: string; // HH:mm (24hr format)
  priority: TaskPriority;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  status: TaskStatus;
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
  recurrenceRule?: RecurrenceRule;
  reminderMinutes?: number;
  notes?: string;
}

export interface UpdateTaskDTO {
  seriesId?: string | null;
  title?: string;
  description?: string | null;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  priority?: TaskPriority;
  categoryId?: string | null;
  status?: TaskStatus;
  recurrenceRule?: RecurrenceRule | null;
  reminderMinutes?: number;
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
  ringAlarm: boolean;
  status: 'active' | 'dismissed' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventDTO {
  title: string;
  description?: string;
  date: string;
  time: string;
  ringAlarm?: boolean;
}

export interface UpdateCalendarEventDTO {
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  ringAlarm?: boolean;
  status?: 'active' | 'dismissed' | 'completed';
}

export interface Habit {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
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
  entityType: 'task' | 'habit' | 'general';
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
  type: 'task' | 'habit';
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

export interface SyncTombstone {
  id: string;
  entityType: 'task' | 'habit' | 'keepNote' | 'calendarEvent' | 'category' | 'note';
  deletedAt: string;
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
  settings: Record<string, any>;
  tombstones?: SyncTombstone[];
}

export type SnoozeDurationOption = 5 | 10 | 15 | 30 | 60;

export * from './keepNote';
export * from './chat';
export * from './movie';
