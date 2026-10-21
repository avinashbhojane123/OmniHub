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
  isLoudAlarm INTEGER DEFAULT 0,
  eisenhowerQuadrant TEXT,
  accentColor TEXT,
  estimatedMinutes INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  ringAlarm INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS keep_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  color TEXT NOT NULL DEFAULT 'default',
  isPinned INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0,
  isTrashed INTEGER NOT NULL DEFAULT 0,
  trashedAt TEXT,
  reminderTime TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  checklistData TEXT NOT NULL DEFAULT '[]',
  drawingData TEXT,
  audioUri TEXT,
  imageUri TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(categoryId);
CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(seriesId);
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(status, date, startTime);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_habits_archived ON habits(archivedAt);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(triggerTime, status);
CREATE INDEX IF NOT EXISTS idx_notif_scheduled ON notification_schedules(scheduledAt, status);
CREATE INDEX IF NOT EXISTS idx_keep_notes_active ON keep_notes(isArchived, isTrashed, isPinned, updatedAt);
CREATE INDEX IF NOT EXISTS idx_keep_notes_reminder ON keep_notes(reminderTime);

CREATE TABLE IF NOT EXISTS sync_tombstones (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  deletedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tombstones_type ON sync_tombstones(entityType);

CREATE TABLE IF NOT EXISTS movie_bookmarks (
  id TEXT PRIMARY KEY,
  tmdbId INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  overview TEXT,
  posterPath TEXT,
  backdropPath TEXT,
  voteAverage REAL DEFAULT 0,
  releaseDate TEXT,
  genres TEXT,
  runtime INTEGER DEFAULT 0,
  isWatched INTEGER NOT NULL DEFAULT 0,
  savedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movie_bookmarks_watched ON movie_bookmarks(isWatched);
`;
