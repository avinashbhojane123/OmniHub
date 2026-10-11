import { CalendarEvent } from '../../types';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { PermissionsAndroid, Platform, NativeModules } from 'react-native';
import { subDays, addDays } from 'date-fns';

const { DeviceCalendar } = NativeModules;

export class CalendarService {
  async getAllEvents(): Promise<CalendarEvent[]> {
    return await calendarRepository.findAll();
  }

  async getTodayEvents(): Promise<CalendarEvent[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
    return await calendarRepository.findByDateRange(startOfDay, endOfDay);
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
    const hasPermission = await this.requestCalendarPermission();
    if (!hasPermission) {
      throw new Error('Device calendar permission denied. Please enable it in device settings.');
    }

    let imported = 0;
    let updated = 0;

    if (DeviceCalendar && typeof DeviceCalendar.getEvents === 'function') {
      try {
        const now = new Date();
        const startRange = subDays(now, 30).getTime();
        const endRange = addDays(now, 30).getTime();

        const rawEvents = await DeviceCalendar.getEvents(startRange, endRange);
        if (Array.isArray(rawEvents)) {
          const activeExternalIds: string[] = [];
          for (const ev of rawEvents) {
            const externalId = ev.id || `dev_${ev.startTimeMs}_${ev.title}`;
            activeExternalIds.push(externalId);
            const existing = await calendarRepository.findByExternalId(externalId);

            const startIso = new Date(ev.startTimeMs).toISOString();
            const endIso = new Date(ev.endTimeMs).toISOString();
            const nowIso = new Date().toISOString();

            const calIdentifier = ev.calendarName || ev.calendarId || undefined;

            if (existing) {
              await calendarRepository.update(existing.id, {
                title: ev.title || 'Untitled Event',
                description: ev.description || undefined,
                startTime: startIso,
                endTime: endIso,
                location: ev.location || undefined,
                isAllDay: Boolean(ev.allDay),
                calendarId: calIdentifier,
                syncedAt: nowIso,
              });
              updated++;
            } else {
              const newEventId = `calev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              await calendarRepository.create({
                id: newEventId,
                externalId,
                calendarId: calIdentifier,
                title: ev.title || 'Untitled Event',
                description: ev.description || undefined,
                startTime: startIso,
                endTime: endIso,
                location: ev.location || undefined,
                source: 'device',
                isAllDay: Boolean(ev.allDay),
                createdAt: nowIso,
                updatedAt: nowIso,
                syncedAt: nowIso,
              });
              imported++;
            }
          }

          // Purge deleted events that no longer exist in the device calendar within this range
          const startIsoRange = new Date(startRange).toISOString();
          const endIsoRange = new Date(endRange).toISOString();
          await calendarRepository.deleteDeviceEventsNotInList(startIsoRange, endIsoRange, activeExternalIds);
        }
      } catch (err) {
        console.warn('Native DeviceCalendar error during sync:', err);
        throw err;
      }
    }

    await settingsRepository.set('lastCalendarSyncAt', new Date().toISOString());
    await settingsRepository.set('calendarSyncEnabled', 'true');
    return { imported, updated };
  }
}

export const calendarService = new CalendarService();
