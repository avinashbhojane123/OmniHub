export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  seriesId TEXT,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  startTime TEXT,
  endTime TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  categoryId TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  recurrenceRule TEXT,
  reminderMinutes INTEGER DEFAULT 0,
  snoozeUntil TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  externalId TEXT UNIQUE,
  calendarId TEXT,
  title TEXT NOT NULL,
  description TEXT,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  location TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  isAllDay INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  recurrenceRule TEXT NOT NULL,
  target INTEGER NOT NULL DEFAULT 1,
  reminderTime TEXT,
  createdAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habitId TEXT NOT NULL,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1,
  value REAL NOT NULL DEFAULT 1,
  notes TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (habitId) REFERENCES habits(id) ON DELETE CASCADE,
  UNIQUE(habitId, date)
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  deadline TEXT,
  progress REAL NOT NULL DEFAULT 0,
  color TEXT,
  category TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_tasks (
  id TEXT PRIMARY KEY,
  goalId TEXT NOT NULL,
  taskId TEXT NOT NULL,
  FOREIGN KEY (goalId) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(goalId, taskId)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT,
  title TEXT,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL,
  eventTime TEXT NOT NULL,
  triggerTime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  snoozeCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_schedules (
  id TEXT PRIMARY KEY,
  notificationId TEXT NOT NULL UNIQUE,
  entityId TEXT NOT NULL,
  type TEXT NOT NULL,
  scheduledAt TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channelId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(categoryId);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(startTime);
CREATE INDEX IF NOT EXISTS idx_events_external ON calendar_events(externalId);
CREATE INDEX IF NOT EXISTS idx_habits_archived ON habits(archivedAt);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(triggerTime, status);
CREATE INDEX IF NOT EXISTS idx_notif_scheduled ON notification_schedules(scheduledAt, status);
`;
