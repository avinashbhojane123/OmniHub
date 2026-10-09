import { CalendarEvent } from '../../types';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { PermissionsAndroid, Platform } from 'react-native';

export class CalendarService {
  async getAllEvents(): Promise<CalendarEvent[]> {
    return await calendarRepository.findAll();
  }

  async getEventsForRange(startIso: string, endIso: string): Promise<CalendarEvent[]> {
    return await calendarRepository.findByDateRange(startIso, endIso);
  }

  async createEvent(event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<CalendarEvent> {
    const now = new Date().toISOString();
    const id = `cal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullEvent: CalendarEvent = {
      ...event,
      id,
      createdAt: now,
      updatedAt: now,
    };
    return await calendarRepository.create(fullEvent);
  }

  async deleteEvent(id: string): Promise<boolean> {
    return await calendarRepository.delete(id);
  }

  async requestCalendarPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
        {
          title: 'Device Calendar Permission',
          message: 'Life Planner needs access to your device calendar to display your scheduled events.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Calendar permission error:', err);
      return false;
    }
  }

  async syncDeviceCalendar(): Promise<{ imported: number; updated: number }> {
    const enabled = (await settingsRepository.get('calendarSyncEnabled', 'false')) === 'true';
    if (!enabled) {
      return { imported: 0, updated: 0 };
    }

    const hasPermission = await this.requestCalendarPermission();
    if (!hasPermission) {
      return { imported: 0, updated: 0 };
    }

    // In local-first mode, updates local SQLite calendar_events representation
    await settingsRepository.set('lastCalendarSyncAt', new Date().toISOString());
    return { imported: 0, updated: 0 };
  }
}

export const calendarService = new CalendarService();
