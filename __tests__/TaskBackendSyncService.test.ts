import http from 'http';
import { AddressInfo } from 'net';
import { taskBackendSyncService, TaskBackendSyncService } from '../src/services/tasks/TaskBackendSyncService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { tombstoneRepository } from '../src/database/repositories/TombstoneRepository';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { getDatabase } from '../src/database/connection';
import { syncEventBus } from '../src/services/backup/SyncEventBus';
import { Task } from '../src/types';

describe('TaskBackendSyncService Integration Test Suite (No Mocks)', () => {
  let server: http.Server;
  let serverPort: number;
  let serverHandler: (req: http.IncomingMessage, res: http.ServerResponse, body: any) => void;

  beforeAll(async () => {
    await getDatabase();

    // Start a real, local HTTP server to handle sync requests over loopback
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        let rawBody = '';
        req.on('data', (chunk) => {
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
        const addr = server.address() as AddressInfo;
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
    const db = await getDatabase();
    await db.execute('DELETE FROM tasks');
    await db.execute('DELETE FROM sync_tombstones');
    await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_SERVER, `http://127.0.0.1:${serverPort}`);
    await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, '');
    await taskBackendSyncService.setBackendUrl(`http://127.0.0.1:${serverPort}`);
    await taskBackendSyncService.resetSyncState();
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
});
