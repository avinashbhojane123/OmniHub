import { getDatabase } from '../connection';
import { CalendarEvent, CreateCalendarEventDTO, UpdateCalendarEventDTO } from '../../types';
import { parseISO, subDays, format } from 'date-fns';
import { tombstoneRepository } from './TombstoneRepository';
import { syncEventBus } from '../../services/backup/SyncEventBus';

export class CalendarRepository {
  async findAll(): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const result = await db.execute(
      'SELECT * FROM calendar_events ORDER BY date ASC, time ASC'
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByDate(date: string): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const result = await db.execute(
      'SELECT * FROM calendar_events WHERE date = ? ORDER BY time ASC',
      [date]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findRecentAndUpcoming(fromDate?: string, daysPast = 7): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const baseDate = fromDate ? parseISO(fromDate) : new Date();
    const pastLimit = format(subDays(baseDate, daysPast), 'yyyy-MM-dd');
    const result = await db.execute(
      'SELECT * FROM calendar_events WHERE date >= ? ORDER BY date ASC, time ASC',
      [pastLimit]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findUpcomingActive(fromDate?: string): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const now = new Date();
    const today = fromDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const result = await db.execute(
      "SELECT * FROM calendar_events WHERE date >= ? AND status = 'active' AND ringAlarm = 1 ORDER BY date ASC, time ASC",
      [today]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<CalendarEvent | null> {
    const db = await getDatabase();
    const result = await db.execute(
      'SELECT * FROM calendar_events WHERE id = ?',
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async create(dto: CreateCalendarEventDTO): Promise<CalendarEvent> {
    const db = await getDatabase();
    const id = `calev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const ringAlarmVal = dto.ringAlarm === undefined ? 1 : (dto.ringAlarm ? 1 : 0);
    const statusVal = 'active';

    await db.execute(
      `INSERT INTO calendar_events (
        id, title, description, date, time, ringAlarm, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.title.trim(),
        dto.description?.trim() || null,
        dto.date,
        dto.time,
        ringAlarmVal,
        statusVal,
        now,
        now,
      ]
    );

    const newEvent: CalendarEvent = {
      id,
      title: dto.title.trim(),
      description: dto.description?.trim() || undefined,
      date: dto.date,
      time: dto.time,
      ringAlarm: Boolean(ringAlarmVal),
      status: statusVal,
      createdAt: now,
      updatedAt: now,
    };

    syncEventBus.notifyDataChanged({
      entityType: 'calendarEvent',
      operation: 'upsert',
      id,
      item: newEvent,
    });

    return newEvent;
  }

  async update(id: string, updates: UpdateCalendarEventDTO): Promise<CalendarEvent | null> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title.trim());
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description?.trim() || null);
    }
    if (updates.date !== undefined) {
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.time !== undefined) {
      fields.push('time = ?');
      values.push(updates.time);
    }
    if (updates.ringAlarm !== undefined) {
      fields.push('ringAlarm = ?');
      values.push(updates.ringAlarm ? 1 : 0);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const now = new Date().toISOString();
    fields.push('updatedAt = ?');
    values.push(now);

    values.push(id);
    await db.execute(
      `UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const updatedEvent = await this.findById(id);
    if (updatedEvent) {
      syncEventBus.notifyDataChanged({
        entityType: 'calendarEvent',
        operation: 'upsert',
        id,
        item: updatedEvent,
      });
    }
    return updatedEvent;
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    await tombstoneRepository.recordDeleted(id, 'calendarEvent');
    try {
      const { alarmService } = await import('../../services/alarm/AlarmService');
      await alarmService.cancelEventAlarm(id);
    } catch { }
    const result = await db.execute(
      'DELETE FROM calendar_events WHERE id = ?',
      [id]
    );
    syncEventBus.notifyDataChanged({
      entityType: 'calendarEvent',
      operation: 'delete',
      id,
    });
    return result.rowsAffected > 0;
  }

  private mapRow(row: any): CalendarEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      date: row.date,
      time: row.time,
      ringAlarm: Boolean(row.ringAlarm),
      status: row.status || 'active',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const calendarRepository = new CalendarRepository();
