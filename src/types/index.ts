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

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // e.g. every 2 weeks
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  endDate?: string; // YYYY-MM-DD
}

export interface Task {
  id: string;
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
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  priority?: TaskPriority;
  categoryId?: string;
  status?: TaskStatus;
  recurrenceRule?: RecurrenceRule;
  reminderMinutes?: number;
  notes?: string;
  completedAt?: string;
  snoozeUntil?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export type CalendarSource = 'local' | 'android_calendar';

export interface CalendarEvent {
  id: string;
  externalId?: string;
  calendarId?: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  location?: string;
  source: CalendarSource;
  isAllDay: boolean;
  color?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
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

export interface Goal {
  id: string;
  title: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  progress: number; // 0 to 100
  color?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
  tasksCount?: number;
  completedTasksCount?: number;
}

export interface Note {
  id: string;
  entityType: 'task' | 'calendar_event' | 'habit' | 'goal' | 'general';
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
  type: 'task' | 'habit' | 'event';
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
  notificationVibration: boolean;
  defaultReminderMinutes: number;
  defaultSnoozeMinutes: number;
  calendarSyncEnabled: boolean;
  selectedCalendarIds: string[];
  lastCalendarSyncAt?: string;
  theme: 'system' | 'light' | 'dark';
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

export interface BackupData {
  version: number;
  createdAt: string;
  tasks: Task[];
  categories: Category[];
  calendarEvents: CalendarEvent[];
  habits: Habit[];
  habitLogs: HabitLog[];
  goals: Goal[];
  goalTasks?: { id?: string; goalId: string; taskId: string }[];
  notes: Note[];
  settings: Record<string, any>;
}

export type SnoozeDurationOption = 5 | 10 | 15 | 30 | 60;
