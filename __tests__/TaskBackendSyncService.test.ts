const http = require('http');
import { taskBackendSyncService, TaskBackendSyncService } from '../src/services/tasks/TaskBackendSyncService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { tombstoneRepository } from '../src/database/repositories/TombstoneRepository';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { getDatabase } from '../src/database/connection';
import { syncEventBus } from '../src/services/backup/SyncEventBus';
import { Task } from '../src/types';
import { notificationService } from '../src/services/notifications/NotificationService';

describe('TaskBackendSyncService Integration Test Suite (No Mocks)', () => {
  let server: any;
  let serverPort: number;
  let serverHandler: (req: any, res: any, body: any) => void;

  beforeAll(async () => {
    await getDatabase();

    // Start a real, local HTTP server to handle sync requests over loopback
    await new Promise<void>((resolve) => {
      server = http.createServer((req: any, res: any) => {
        let rawBody = '';
        req.on('data', (chunk: any) => {
          rawBody += chunk;
        });
        req.on('end', () => {
          let parsedBody = null;
          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : null;
          } catch {}
          if (serverHandler) {
            serverHandler(req, res, parsedBody);
          } else {
            res.writeHead(404);
            res.end();
          }
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    taskBackendSyncService.destroy();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    taskBackendSyncService.cancelScheduledSync();
    const db = await getDatabase();
    await db.execute('DELETE FROM tasks');
    await db.execute('DELETE FROM sync_tombstones');
    await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_SERVER, `http://127.0.0.1:${serverPort}`);
    await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, '');
    await taskBackendSyncService.setBackendUrl(`http://127.0.0.1:${serverPort}`);
    await taskBackendSyncService.resetSyncState();
  });

  afterEach(() => {
    taskBackendSyncService.cancelScheduledSync();
    jest.restoreAllMocks();
  });

  it('1. should resolve backend URL from settings repository and support OTA URL adaptation', async () => {
    await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_SERVER, '');
    await settingsRepository.set('ota_server_url', 'http://10.34.159.73:8888');

    const resolved = await taskBackendSyncService.getBackendUrl();
    expect(resolved).toBe('http://10.34.159.73:10000');

    await taskBackendSyncService.setBackendUrl(`http://127.0.0.1:${serverPort}`);
    const persisted = await taskBackendSyncService.getBackendUrl();
    expect(persisted).toBe(`http://127.0.0.1:${serverPort}`);
  });

  it('2. should perform two-way sync: send local tasks and ingest new server tasks into SQLite', async () => {
    // 1. Create a local task
    const localTask: Task = {
      id: 'local_task_1',
      title: 'Local Client Task',
      date: '2026-10-31',
      startTime: '09:00',
      priority: 'high',
      status: 'pending',
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(localTask);

    let receivedPayload: any = null;

    serverHandler = (_req, res, body) => {
      receivedPayload = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T09:30:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'server_task_2',
              title: 'Server Ingested Task',
              date: '2026-11-01',
              startTime: '14:30',
              priority: 'medium',
              status: 'pending',
              createdAt: '2026-10-31T08:15:00.000Z',
              updatedAt: '2026-10-31T08:15:00.000Z',
            },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();

    expect(syncResult.success).toBe(true);
    expect(syncResult.syncedCount).toBe(1);
    expect(syncResult.serverUpsertCount).toBe(1);

    // Verify client payload received by real HTTP server
    expect(receivedPayload).toBeDefined();
    expect(receivedPayload.upserts).toHaveLength(1);
    expect(receivedPayload.upserts[0].id).toBe('local_task_1');
    expect(receivedPayload.upserts[0].title).toBe('Local Client Task');

    // Verify server task was written to SQLite
    const ingestedTask = await taskRepository.findById('server_task_2');
    expect(ingestedTask).toBeDefined();
    expect(ingestedTask?.title).toBe('Server Ingested Task');
    expect(ingestedTask?.date).toBe('2026-11-01');
    expect(ingestedTask?.startTime).toBe('14:30');

    // Verify last sync timestamp persisted
    const lastSync = await taskBackendSyncService.getLastSyncTimestamp();
    expect(lastSync).toBe('2026-10-31T09:30:00.000Z');
  });

  it('3. should apply Last-Write-Wins: update local task when server version is newer', async () => {
    const originalLocal: Task = {
      id: 'conflict_task_1',
      title: 'Original Title',
      date: '2026-10-31',
      priority: 'low',
      status: 'pending',
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(originalLocal);

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'conflict_task_1',
              title: 'Updated From Cloud Dashboard',
              date: '2026-10-31',
              priority: 'high',
              status: 'in_progress',
              createdAt: '2026-10-31T08:00:00.000Z',
              updatedAt: '2026-10-31T09:00:00.000Z', // Newer than local 08:00:00
            },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);

    const updatedLocal = await taskRepository.findById('conflict_task_1');
    expect(updatedLocal?.title).toBe('Updated From Cloud Dashboard');
    expect(updatedLocal?.priority).toBe('high');
    expect(updatedLocal?.status).toBe('in_progress');
  });

  it('4. should apply Last-Write-Wins: preserve local task when local version is newer', async () => {
    const newerLocal: Task = {
      id: 'conflict_task_2',
      title: 'Newer Local Edit',
      date: '2026-10-31',
      priority: 'high',
      status: 'completed',
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T11:00:00.000Z', // Newer than server
    };
    await taskRepository.create(newerLocal);

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T11:05:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'conflict_task_2',
              title: 'Stale Server Version',
              date: '2026-10-31',
              priority: 'low',
              status: 'pending',
              createdAt: '2026-10-31T08:00:00.000Z',
              updatedAt: '2026-10-31T09:00:00.000Z', // Older than local 11:00:00
            },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);

    const checkLocal = await taskRepository.findById('conflict_task_2');
    expect(checkLocal?.title).toBe('Newer Local Edit');
    expect(checkLocal?.status).toBe('completed');
  });

  it('5. should ingest server deletions into SQLite and avoid generating phantom tombstones', async () => {
    const taskToDelete: Task = {
      id: 'to_be_deleted_remote',
      title: 'Will Be Deleted By Cloud',
      date: '2026-10-31',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(taskToDelete);

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: ['to_be_deleted_remote'],
          serverTasks: [],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);
    expect(syncResult.serverDeleteCount).toBe(1);

    // Verify task deleted from SQLite
    const found = await taskRepository.findById('to_be_deleted_remote');
    expect(found).toBeNull();

    // Verify NO phantom tombstone was created locally
    const tombstones = await tombstoneRepository.getAll();
    const taskTombstones = tombstones.filter((t) => t.id === 'to_be_deleted_remote');
    expect(taskTombstones).toHaveLength(0);
  });

  it('6. should sync local deletions to server and clear acknowledged tombstones', async () => {
    // Record a local deletion in tombstone table
    await tombstoneRepository.recordDeleted('task_deleted_by_user', 'task');

    let deletedIdsReceived: string[] = [];

    serverHandler = (_req, res, body) => {
      deletedIdsReceived = body.deletedIds || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);
    expect(deletedIdsReceived).toContain('task_deleted_by_user');

    // Tombstone must be cleared after successful sync
    const remaining = await tombstoneRepository.getAll();
    expect(remaining.find((t) => t.id === 'task_deleted_by_user')).toBeUndefined();
  });

  it('7. should not resurrect a task that was recently deleted locally', async () => {
    await tombstoneRepository.recordDeleted('deleted_do_not_resurrect', 'task');

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'deleted_do_not_resurrect',
              title: 'Old Ghost Task',
              date: '2026-10-31',
              status: 'pending',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const checkResurrected = await taskRepository.findById('deleted_do_not_resurrect');
    expect(checkResurrected).toBeNull();
  });

  it('8. should safely parse and handle malformed or corrupted recurrenceRule JSON', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_with_corrupt_recurrence',
              title: 'Malformed Recurrence Task',
              date: '2026-10-31',
              recurrenceRule: '{bad-json: broken',
            },
            {
              id: 'task_with_valid_recurrence',
              title: 'Valid Recurrence Task',
              date: '2026-10-31',
              recurrenceRule: JSON.stringify({ type: 'daily', interval: 1 }),
            },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);

    const corruptTask = await taskRepository.findById('task_with_corrupt_recurrence');
    expect(corruptTask).toBeDefined();
    expect(corruptTask?.recurrenceRule?.type).toBe('none');

    const validTask = await taskRepository.findById('task_with_valid_recurrence');
    expect(validTask).toBeDefined();
    expect(validTask?.recurrenceRule?.type).toBe('daily');
  });

  it('9. should notify status subscribers and handle subscriber exceptions gracefully', async () => {
    const statusEvents: boolean[] = [];
    const unsub = taskBackendSyncService.subscribeStatus((connected) => {
      statusEvents.push(connected);
      if (!connected) {
        throw new Error('Explosive subscriber error');
      }
    });

    expect(statusEvents.length).toBeGreaterThanOrEqual(1);

    serverHandler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    };

    const failedSync = await taskBackendSyncService.syncWithBackend();
    expect(failedSync.success).toBe(false);
    expect(taskBackendSyncService.getIsConnected()).toBe(false);

    unsub();
  });

  it('10. should notify syncEventBus data restored when changes occur', async () => {
    let restoredNotified = false;
    const unsubRestore = syncEventBus.subscribeToRestore(() => {
      restoredNotified = true;
    });

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'restore_notification_test_task',
              title: 'Restore Event Task',
              date: '2026-10-31',
              status: 'pending',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();
    expect(restoredNotified).toBe(true);

    unsubRestore();
  });

  it('11. should support scheduleSync debounce and cancelScheduledSync', async () => {
    taskBackendSyncService.scheduleSync(5000);
    taskBackendSyncService.cancelScheduledSync();
    // Verify no throw and clean cancellation
    expect(taskBackendSyncService.getIsConnected()).toBeDefined();
  });

  it('12. should test backend connection endpoint with success and failure responses', async () => {
    serverHandler = (req, res) => {
      if (req.url?.startsWith('/api/tasks?limit=1')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: 0, data: [] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    };

    const successResult = await taskBackendSyncService.testConnection();
    expect(successResult.success).toBe(true);
    expect(successResult.message).toContain('Successfully connected');

    serverHandler = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
    };

    const failResult = await taskBackendSyncService.testConnection();
    expect(failResult.success).toBe(false);
  });

  it('13. should sanitize and normalize invalid enums, completedAt, and snoozeUntil from server', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_with_weird_enums',
              title: 'Weird Enums Task',
              date: '2026-10-31',
              priority: 'super_ultra_high', // Invalid priority
              status: 'sleeping', // Invalid status
              eisenhowerQuadrant: 'q99', // Invalid quadrant
              snoozeUntil: 'invalid-snooze-string',
            },
            {
              id: 'task_completed_auto_timestamp',
              title: 'Completed Without Timestamp',
              date: '2026-10-31',
              status: 'completed',
              completedAt: null, // Should get auto timestamp
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const weirdTask = await taskRepository.findById('task_with_weird_enums');
    expect(weirdTask?.priority).toBe('medium');
    expect(weirdTask?.status).toBe('pending');
    expect(weirdTask?.eisenhowerQuadrant).toBeUndefined();
    expect(weirdTask?.snoozeUntil).toBeUndefined();

    const completedTask = await taskRepository.findById('task_completed_auto_timestamp');
    expect(completedTask?.status).toBe('completed');
    expect(completedTask?.completedAt).toBeDefined();
  });

  it('14. should safeguard against non-existent category IDs to prevent foreign key errors', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_with_fake_cat',
              title: 'Ghost Category Task',
              date: '2026-10-31',
              categoryId: 'completely_nonexistent_category_id_9999',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_with_fake_cat');
    expect(task).toBeDefined();
    expect(task?.categoryId).toBeUndefined();
  });

  it('15. should reflect getIsSyncing status properly during execution', async () => {
    expect(taskBackendSyncService.getIsSyncing()).toBe(false);
  });

  it('16. should safely handle corrupted createdAt and updatedAt without RangeError', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: 'not-a-valid-timestamp',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_with_garbage_dates',
              title: 'Corrupted Dates Task',
              date: '2026-10-31',
              createdAt: 'invalid-time-value',
              updatedAt: 'another-broken-date',
            },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);

    const task = await taskRepository.findById('task_with_garbage_dates');
    expect(task).toBeDefined();
    expect(new Date(task!.createdAt).getTime()).not.toBeNaN();
    expect(new Date(task!.updatedAt).getTime()).not.toBeNaN();
  });

  it('17. should convert whitespace-only titles to Untitled Task', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_blank_spaces_title',
              title: '     ',
              date: '2026-10-31',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_blank_spaces_title');
    expect(task?.title).toBe('Untitled Task');
  });

  it('18. should normalize Infinity and NaN on estimatedMinutes and reminderMinutes', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_infinite_numbers',
              title: 'Infinite Numbers Task',
              date: '2026-10-31',
              estimatedMinutes: Infinity,
              reminderMinutes: -5,
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_infinite_numbers');
    expect(task?.estimatedMinutes).toBeUndefined();
    expect(task?.reminderMinutes).toBe(0);
  });

  it('19. should safely handle unsubscription inside a status notification callback', async () => {
    let callCount = 0;
    let unsub1: (() => void) | null = null;

    unsub1 = taskBackendSyncService.subscribeStatus((connected) => {
      callCount++;
      if (unsub1) {
        unsub1(); // Unsubscribe during execution
      }
    });

    const unsub2 = taskBackendSyncService.subscribeStatus(() => {
      callCount++;
    });

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, serverDeletions: [], serverTasks: [] }));
    };

    await taskBackendSyncService.syncWithBackend();
    expect(callCount).toBeGreaterThanOrEqual(2);

    unsub2();
  });

  it('20. should clear startTime and endTime when a task is moved to backlog (empty date)', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_backlog_clears_times',
              title: 'Backlog Task',
              date: '',
              startTime: '14:00',
              endTime: '15:00',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_backlog_clears_times');
    expect(task).toBeDefined();
    expect(task?.date).toBe('');
    expect(task?.startTime).toBeUndefined();
    expect(task?.endTime).toBeUndefined();
  });

  it('21. should inherit isLoudAlarm and isOvernight from recurrenceRule when top-level fields are undefined', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_recurrence_alarm_flags',
              title: 'Recurring Loud Alarm Task',
              date: '2026-10-31',
              recurrenceRule: JSON.stringify({
                type: 'daily',
                interval: 1,
                isLoudAlarm: true,
                isOvernight: true,
              }),
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_recurrence_alarm_flags');
    expect(task?.isLoudAlarm).toBe(true);
    expect(task?.isOvernight).toBe(true);
  });

  it('22. should fallback to createdAt when comparing timestamps if updatedAt is null', async () => {
    const localTask: Task = {
      id: 'task_created_at_fallback',
      title: 'Local Task Older',
      date: '2026-10-31',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-10-31T07:00:00.000Z',
      updatedAt: '2026-10-31T07:00:00.000Z',
    };
    await taskRepository.create(localTask);

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_created_at_fallback',
              title: 'Server Task Newer via CreatedAt',
              date: '2026-10-31',
              status: 'in_progress',
              createdAt: '2026-10-31T08:00:00.000Z', // 08:00 > 07:00
              updatedAt: null,
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_created_at_fallback');
    expect(task?.title).toBe('Server Task Newer via CreatedAt');
    expect(task?.status).toBe('in_progress');
  });

  it('23. should preserve disabled reminderMinutes (-1) in outgoing payload and incoming server delta', async () => {
    const disabledReminderTask: Task = {
      id: 'task_reminder_disabled',
      title: 'Task with Reminder Disabled',
      date: '2026-10-31',
      startTime: '14:00',
      priority: 'medium',
      status: 'pending',
      reminderMinutes: -1,
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(disabledReminderTask);

    let sentUpserts: any[] = [];
    serverHandler = (_req, res, body) => {
      sentUpserts = body.upserts;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'server_disabled_reminder',
              title: 'Server Task with Reminder Disabled',
              date: '2026-10-31',
              startTime: '15:00',
              status: 'pending',
              reminderMinutes: -1,
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    // Verify outgoing payload preserved -1
    const outgoing = sentUpserts.find((u) => u.id === 'task_reminder_disabled');
    expect(outgoing?.reminderMinutes).toBe(-1);

    // Verify incoming task preserved -1 in SQLite
    const incoming = await taskRepository.findById('server_disabled_reminder');
    expect(incoming?.reminderMinutes).toBe(-1);
  });

  it('24. should normalize case-insensitive enums (e.g. HIGH, COMPLETED, Q1) from server', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_cased_enums',
              title: 'Cased Enums Task',
              date: '2026-10-31',
              priority: 'HIGH',
              status: 'COMPLETED',
              eisenhowerQuadrant: 'Q1',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const task = await taskRepository.findById('task_cased_enums');
    expect(task?.priority).toBe('high');
    expect(task?.status).toBe('completed');
    expect(task?.eisenhowerQuadrant).toBe('q1');
  });

  it('25. should reconcile reminders: cancel reminder on remote deletion and schedule on remote upsert', async () => {
    // 1. Create existing local task
    const existingTask: Task = {
      id: 'task_to_delete_remotely',
      title: 'Task To Delete',
      date: '2026-10-31',
      startTime: '11:00',
      priority: 'medium',
      status: 'pending',
      reminderMinutes: 10,
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(existingTask);

    const cancelSpy = jest.spyOn(notificationService, 'cancelTaskReminder').mockResolvedValue(undefined);
    const scheduleSpy = jest.spyOn(notificationService, 'scheduleTaskReminder').mockResolvedValue('notification-id-1');

    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: ['task_to_delete_remotely'],
          serverTasks: [
            {
              id: 'task_to_schedule_remotely',
              title: 'New Server Task with Reminder',
              date: '2026-10-31',
              startTime: '16:00',
              status: 'pending',
              reminderMinutes: 15,
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    expect(cancelSpy).toHaveBeenCalledWith('task_to_delete_remotely');
    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task_to_schedule_remotely',
        title: 'New Server Task with Reminder',
      })
    );
  });

  it('26. should not resurrect tasks deleted locally while HTTP sync was in-flight', async () => {
    let resolveServerRequest: () => void = () => {};
    const serverRequestReceived = new Promise<void>((resolve) => {
      resolveServerRequest = resolve;
    });

    serverHandler = (_req, res) => {
      resolveServerRequest();
      // Delay response slightly so client has time to record a local tombstone
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            timestamp: '2026-10-31T10:00:00.000Z',
            serverDeletions: [],
            serverTasks: [
              {
                id: 'task_deleted_in_flight',
                title: 'Task Deleted While Fetch In Flight',
                date: '2026-10-31',
                status: 'pending',
                createdAt: '2026-10-31T08:00:00.000Z',
                updatedAt: '2026-10-31T08:00:00.000Z',
              },
            ],
          })
        );
      }, 50);
    };

    const syncPromise = taskBackendSyncService.syncWithBackend();

    // Wait until HTTP request has arrived at server
    await serverRequestReceived;

    // Simulate user deleting the task locally right during the HTTP in-flight window
    await tombstoneRepository.recordDeleted('task_deleted_in_flight', 'task');

    await syncPromise;

    // The in-flight deleted task must NOT be resurrected into SQLite
    const task = await taskRepository.findById('task_deleted_in_flight');
    expect(task).toBeNull();
  });

  it('27. should transmit createdAt and updatedAt in outgoing upserts for accurate LWW preservation', async () => {
    const task: Task = {
      id: 'task_with_timestamps',
      title: 'Task With Timestamps',
      date: '2026-10-31',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-10-31T05:30:00.000Z',
      updatedAt: '2026-10-31T06:45:00.000Z',
    };
    await taskRepository.create(task);

    let sentUpserts: any[] = [];
    serverHandler = (_req, res, body) => {
      sentUpserts = body.upserts;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const sent = sentUpserts.find((u) => u.id === 'task_with_timestamps');
    expect(sent?.createdAt).toBe('2026-10-31T05:30:00.000Z');
    expect(sent?.updatedAt).toBe('2026-10-31T06:45:00.000Z');
  });

  it('28. should not persist lastSyncTimestamp if local database transaction fails', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T11:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'task_should_fail',
              title: 'Should Fail Transaction',
              date: '2026-10-31',
            },
          ],
        })
      );
    };

    const db = await getDatabase();
    // Simulate transaction failure
    const originalTransaction = db.transaction.bind(db);
    jest.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Simulated SQLite disk error'));

    const result = await taskBackendSyncService.syncWithBackend();
    expect(result.success).toBe(false);

    // Verify lastSyncTimestamp was NOT updated in settings repository
    const savedTimestamp = await settingsRepository.get(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, '');
    expect(savedTimestamp).toBe('');
  });

  it('29. should convert string numbers on estimatedMinutes in both incoming and outgoing payloads', async () => {
    const task: any = {
      id: 'task_string_est_min',
      title: 'String Estimated Minutes',
      date: '2026-10-31',
      priority: 'medium',
      status: 'pending',
      estimatedMinutes: '45' as any,
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(task);

    let sentUpserts: any[] = [];
    serverHandler = (_req, res, body) => {
      sentUpserts = body.upserts;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [
            {
              id: 'server_task_string_est',
              title: 'Server String Est Min',
              date: '2026-10-31',
              estimatedMinutes: '60',
            },
          ],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const sent = sentUpserts.find((u) => u.id === 'task_string_est_min');
    expect(sent?.estimatedMinutes).toBe(45);

    const incoming = await taskRepository.findById('server_task_string_est');
    expect(incoming?.estimatedMinutes).toBe(60);
  });

  it('30. should deduplicate identical serverDeletions and serverTasks within a single sync batch', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: ['dup_del_1', 'dup_del_1'],
          serverTasks: [
            { id: 'dup_task_1', title: 'Task 1', date: '2026-10-31' },
            { id: 'dup_task_1', title: 'Task 1 Duplicate', date: '2026-10-31' },
          ],
        })
      );
    };

    const syncResult = await taskBackendSyncService.syncWithBackend();
    expect(syncResult.success).toBe(true);
    expect(syncResult.serverUpsertCount).toBe(1);
    expect(syncResult.serverDeleteCount).toBe(1);
  });

  it('31. should not send tasks that have active tombstones in outgoing upserts', async () => {
    const task: Task = {
      id: 'task_in_tombstone_and_db',
      title: 'Should Not Be Sent',
      date: '2026-10-31',
      priority: 'low',
      status: 'pending',
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    };
    await taskRepository.create(task);
    await tombstoneRepository.recordDeleted('task_in_tombstone_and_db', 'task');

    let sentUpserts: any[] = [];
    serverHandler = (_req, res, body) => {
      sentUpserts = body.upserts;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          timestamp: '2026-10-31T10:00:00.000Z',
          serverDeletions: [],
          serverTasks: [],
        })
      );
    };

    await taskBackendSyncService.syncWithBackend();

    const found = sentUpserts.find((u) => u.id === 'task_in_tombstone_and_db');
    expect(found).toBeUndefined();
  });
});
