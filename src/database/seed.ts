import { Category } from '../types';

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

export const DEFAULT_HABITS = [
  {
    id: 'habit-water',
    name: 'Drink a glass of water',
    description: '5 min',
    icon: '🥛',
    color: '#FF922B',
    recurrenceRule: { type: 'daily' as const },
    target: 1,
    reminderTime: '08:00',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'habit-meditate',
    name: 'Meditate to relax',
    description: '15 min',
    icon: '🧘',
    color: '#51CF66',
    recurrenceRule: { type: 'daily' as const },
    target: 1,
    reminderTime: '08:30',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'habit-stretch',
    name: 'Stretch for 10 minutes',
    description: '10 min',
    icon: '🤸',
    color: '#F06595',
    recurrenceRule: { type: 'daily' as const },
    target: 1,
    reminderTime: '09:00',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'habit-walk',
    name: 'Go for a short walk',
    description: '15 min',
    icon: '👟',
    color: '#FF922B',
    recurrenceRule: { type: 'daily' as const },
    target: 1,
    reminderTime: '09:30',
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  notificationsEnabled: 'true',
  notificationSound: 'true',
  notificationVibration: 'true',
  defaultReminderMinutes: '10',
  defaultSnoozeMinutes: '10',
  calendarSyncEnabled: 'false',
  selectedCalendarIds: '[]',
  userName: 'Avinash',
  birthDate: '2002-08-15',
  birthTime: '08:30 AM',
};

import { format } from 'date-fns';

const todayDate = format(new Date(), 'yyyy-MM-dd');

export const DEFAULT_TASKS = [
  {
    id: 'task-keep-demo-1',
    title: 'Study React Native Architecture',
    description: 'Deep dive into New Architecture and SQLite',
    date: todayDate,
    startTime: '18:00',
    endTime: '19:30',
    priority: 'high' as const,
    categoryId: 'cat-study',
    status: 'pending' as const,
    reminderMinutes: 10,
    notes: '• Review TurboModules & JSI bridges\n• Benchmark OP-SQLite transactions\n• Test Hermes garbage collection\n• Configure offline synchronization queue',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-keep-demo-2',
    title: 'Weekly Grocery Shopping List',
    description: 'Fresh produce & organic staples',
    date: todayDate,
    startTime: '20:00',
    endTime: '21:00',
    priority: 'medium' as const,
    categoryId: 'cat-personal',
    status: 'pending' as const,
    reminderMinutes: 15,
    notes: '• 2L Almond milk (unsweetened)\n• Fresh avocados & ripe bananas\n• Whole grain sourdough bread\n• Organic baby spinach & broccoli',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

