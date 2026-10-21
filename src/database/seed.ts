import { Category } from '../types';
import { SETTINGS_KEYS } from '../constants/settingsKeys';
import { DEFAULT_GOOGLE_SHEET_WEBHOOK_URL } from '../services/backup/GoogleSheetsSyncService';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat-work',
    name: 'Work',
    color: '#3B82F6', // Blue
    icon: 'briefcase',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-study',
    name: 'Study',
    color: '#8B5CF6', // Purple
    icon: 'book-open',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-health',
    name: 'Health',
    color: '#10B981', // Emerald
    icon: 'heart-pulse',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-personal',
    name: 'Personal',
    color: '#F59E0B', // Amber
    icon: 'user',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-family',
    name: 'Family',
    color: '#EC4899', // Pink
    icon: 'users',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-finance',
    name: 'Finance',
    color: '#14B8A6', // Teal
    icon: 'wallet',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-goals',
    name: 'Goals',
    color: '#6366F1', // Indigo
    icon: 'target',
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  notificationsEnabled: 'true',
  notificationSound: 'true',
  notificationVibration: 'true',
  defaultReminderMinutes: '10',
  defaultSnoozeMinutes: '10',
  userName: '',
  birthDate: '',
  birthTime: '',
  [SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL]: DEFAULT_GOOGLE_SHEET_WEBHOOK_URL,
  [SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC]: 'true',
};


