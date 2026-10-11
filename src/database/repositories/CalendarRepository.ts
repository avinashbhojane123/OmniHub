import { CalendarEvent } from '../../types';
import { getDatabase } from '../connection';

export class CalendarRepository {
  async findAll(): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM calendar_events ORDER BY startTime ASC');
    return result.rows.map((r) => this.mapRow(r));
  }

  async findByDateRange(startIso: string, endIso: string): Promise<CalendarEvent[]> {
    const db = await getDatabase();
    const result = await db.execute(
      `SELECT * FROM calendar_events 
       WHERE startTime <= ? AND endTime >= ?
       ORDER BY startTime ASC`,
      [endIso, startIso]
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async findByExternalId(externalId: string): Promise<CalendarEvent | null> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM calendar_events WHERE externalId = ?', [externalId]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async create(event: CalendarEvent): Promise<CalendarEvent> {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO calendar_events (
        id, externalId, calendarId, title, description,
        startTime, endTime, location, source, isAllDay,
        createdAt, updatedAt, syncedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.externalId ?? null,
        event.calendarId ?? null,
        event.title,
        event.description ?? null,
        event.startTime,
        event.endTime,
        event.location ?? null,
        event.source,
        event.isAllDay ? 1 : 0,
        event.createdAt,
        event.updatedAt,
        event.syncedAt ?? null,
      ]
    );
    return event;
  }

  async upsertByExternalId(event: CalendarEvent): Promise<CalendarEvent> {
    const existing = event.externalId ? await this.findByExternalId(event.externalId) : null;
    if (existing) {
      await this.update(existing.id, {
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isAllDay: event.isAllDay,
        syncedAt: event.syncedAt,
        updatedAt: new Date().toISOString(),
      });
      return { ...existing, ...event, id: existing.id };
    } else {
      return this.create(event);
    }
  }

  async update(id: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.startTime !== undefined) {
      fields.push('startTime = ?');
      values.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      fields.push('endTime = ?');
      values.push(updates.endTime);
    }
    if (updates.location !== undefined) {
      fields.push('location = ?');
      values.push(updates.location);
    }
    if (updates.isAllDay !== undefined) {
      fields.push('isAllDay = ?');
      values.push(updates.isAllDay ? 1 : 0);
    }
    if (updates.syncedAt !== undefined) {
      fields.push('syncedAt = ?');
      values.push(updates.syncedAt);
    }

    const updatedAt = new Date().toISOString();
    fields.push('updatedAt = ?');
    values.push(updatedAt);

    values.push(id);

    await db.execute(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`, values);
    const result = await db.execute('SELECT * FROM calendar_events WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.execute('DELETE FROM calendar_events WHERE id = ?', [id]);
    return result.rowsAffected > 0;
  }

  async deleteDeviceEventsNotInList(startIso: string, endIso: string, keepExternalIds: string[]): Promise<number> {
    const db = await getDatabase();
    if (keepExternalIds.length === 0) {
      const res = await db.execute(
        `DELETE FROM calendar_events 
         WHERE source = 'device' AND startTime >= ? AND startTime <= ?`,
        [startIso, endIso]
      );
      return res.rowsAffected;
    }
    const placeholders = keepExternalIds.map(() => '?').join(',');
    const res = await db.execute(
      `DELETE FROM calendar_events 
       WHERE source = 'device' AND startTime >= ? AND startTime <= ? 
       AND externalId NOT IN (${placeholders})`,
      [startIso, endIso, ...keepExternalIds]
    );
    return res.rowsAffected;
  }

  private mapRow(row: any): CalendarEvent {
    return {
      id: row.id,
      externalId: row.externalId ?? undefined,
      calendarId: row.calendarId ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location ?? undefined,
      source: row.source,
      isAllDay: Boolean(row.isAllDay),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      syncedAt: row.syncedAt ?? undefined,
    };
  }
}

export const calendarRepository = new CalendarRepository();
