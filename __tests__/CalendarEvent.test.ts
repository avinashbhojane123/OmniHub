import { calendarRepository } from '../src/database/repositories/CalendarRepository';
import { alarmService } from '../src/services/alarm/AlarmService';
import { backupService } from '../src/services/backup/BackupService';
import { getDatabase } from '../src/database/connection';
import { format, addDays } from 'date-fns';

describe('Calendar Events & Reminders with Alarm Test Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  it('should create a calendar event with title, description, selected date, perfect time, and ringAlarm=true', async () => {
    const targetDate = format(addDays(new Date(), 2), 'yyyy-MM-dd');
    const event = await calendarRepository.create({
      title: 'Doctor Appointment',
      description: 'Annual health checkup at City Clinic',
      date: targetDate,
      time: '14:30',
      ringAlarm: true,
    });

    expect(event).toBeDefined();
    expect(event.id).toBeDefined();
    expect(event.title).toBe('Doctor Appointment');
    expect(event.description).toBe('Annual health checkup at City Clinic');
    expect(event.date).toBe(targetDate);
    expect(event.time).toBe('14:30');
    expect(event.ringAlarm).toBe(true);
    expect(event.status).toBe('active');

    const found = await calendarRepository.findById(event.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Doctor Appointment');
  });

  it('should retrieve events filtered by date', async () => {
    const targetDate = '2026-11-20';
    await calendarRepository.create({
      title: 'Project Kickoff Meeting',
      description: 'Review architecture roadmap',
      date: targetDate,
      time: '10:00',
      ringAlarm: true,
    });

    const eventsForDate = await calendarRepository.findByDate(targetDate);
    expect(eventsForDate.length).toBeGreaterThanOrEqual(1);
    expect(eventsForDate.some((e) => e.title === 'Project Kickoff Meeting')).toBe(true);
  });

  it('should update event status and details', async () => {
    const event = await calendarRepository.create({
      title: 'Client Call',
      description: 'Discuss contract milestones',
      date: '2026-11-25',
      time: '16:00',
      ringAlarm: true,
    });

    const updated = await calendarRepository.update(event.id, {
      status: 'completed',
      time: '16:30',
    });

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('completed');
    expect(updated?.time).toBe('16:30');

    const verified = await calendarRepository.findById(event.id);
    expect(verified?.status).toBe('completed');
  });

  it('should delete a calendar event', async () => {
    const event = await calendarRepository.create({
      title: 'Temporary Event',
      date: '2026-12-01',
      time: '09:00',
      ringAlarm: false,
    });

    await calendarRepository.delete(event.id);
    const deleted = await calendarRepository.findById(event.id);
    expect(deleted).toBeNull();
  });

  it('should schedule and cancel event alarms without throwing errors', async () => {
    const event = await calendarRepository.create({
      title: 'Important Presentation',
      description: 'Final deck delivery',
      date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      time: '11:00',
      ringAlarm: true,
    });

    // Test scheduling event alarm
    await expect(
      alarmService.scheduleEventAlarm(
        event.id,
        event.title,
        event.date,
        event.time,
        event.description
      )
    ).resolves.not.toThrow();

    // Test cancelling event alarm
    await expect(
      alarmService.cancelEventAlarm(event.id)
    ).resolves.not.toThrow();
  });

  it('should include calendar events in backup export and restore them properly', async () => {
    const uniqueTitle = `Backup Event ${Date.now()}`;
    await calendarRepository.create({
      title: uniqueTitle,
      description: 'Preserved across export and import',
      date: '2026-12-31',
      time: '23:59',
      ringAlarm: true,
    });

    const backupJson = await backupService.exportBackup();
    const backupObj = JSON.parse(backupJson);

    expect(backupObj.calendarEvents).toBeDefined();
    expect(Array.isArray(backupObj.calendarEvents)).toBe(true);
    expect(backupObj.calendarEvents.some((e: any) => e.title === uniqueTitle)).toBe(true);

    const restoreResult = await backupService.importBackup(backupJson, 'merge');
    expect(restoreResult.success).toBe(true);

    const allEvents = await calendarRepository.findAll();
    expect(allEvents.some((e) => e.title === uniqueTitle)).toBe(true);
  });
});
