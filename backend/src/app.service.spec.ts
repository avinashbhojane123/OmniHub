import { AppService } from './app.service';
import { DataSource } from 'typeorm';

describe('AppService', () => {
  let service: AppService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return info without dataSource', () => {
    service = new AppService();
    const info = service.getInfo();
    expect(info.name).toBe('OmniHub API');
    expect(typeof info.version).toBe('string');
    expect(info.status).toBe('online');
    expect(info.environment).toBe(process.env.NODE_ENV || 'development');
    expect(info.nodeVersion).toBe(process.version);
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(info.modules)).toBe(true);
    expect(info.modules).toContain('RoomsModule');
    expect(info.modules).toContain('ChatModule');
    expect(info.modules).toContain('TasksModule');
    expect(typeof info.timestamp).toBe('string');
  });

  it('should resolve and cache version from APP_VERSION and allow resetting', () => {
    process.env.APP_VERSION = '2.5.0';
    service = new AppService();
    expect(service.getVersion()).toBe('2.5.0');
    expect(service.getInfo().version).toBe('2.5.0');

    // Cached value remains consistent even if env is changed
    process.env.APP_VERSION = '3.0.0';
    expect(service.getVersion()).toBe('2.5.0');

    // Resetting cache allows reading new version
    service.resetCachedVersion();
    expect(service.getVersion()).toBe('3.0.0');
  });

  it('should return memory usage and system metrics including platform and cpuCount', () => {
    service = new AppService();
    const mem = service.getMemoryUsage();
    expect(mem.heapUsedMB).toBeGreaterThan(0);
    expect(mem.heapTotalMB).toBeGreaterThan(0);
    expect(mem.rssMB).toBeGreaterThan(0);

    const sys = service.getSystemMetrics();
    expect(typeof sys.platform).toBe('string');
    expect(sys.cpuCount).toBeGreaterThan(0);
    expect(Array.isArray(sys.loadAverage)).toBe(true);
    expect(sys.freeMemoryMB).toBeGreaterThan(0);
    expect(sys.totalMemoryMB).toBeGreaterThan(0);
  });

  describe('pingDatabase', () => {
    it('should return not connected if dataSource is missing', async () => {
      service = new AppService(undefined);
      const res = await service.pingDatabase();
      expect(res.connected).toBe(false);
      expect(res.error).toContain('not configured');
    });

    it('should return not connected if dataSource is not initialized', async () => {
      const mockDataSource = {
        isInitialized: false,
        options: { type: 'postgres' },
      } as unknown as DataSource;

      service = new AppService(mockDataSource);
      const res = await service.pingDatabase();
      expect(res.connected).toBe(false);
      expect(res.error).toContain('not initialized');
    });

    it('should ping database successfully and report latency, entitiesCount, and pool metrics', async () => {
      const mockDataSource = {
        isInitialized: true,
        options: { type: 'postgres' },
        entityMetadatas: [{ name: 'User' }, { name: 'Room' }],
        driver: {
          master: {
            _pool: {
              totalCount: 10,
              idleCount: 8,
              waitingCount: 0,
            },
          },
        },
        query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      } as unknown as DataSource;

      service = new AppService(mockDataSource);
      const res = await service.pingDatabase();
      expect(res.connected).toBe(true);
      expect(typeof res.latencyMs).toBe('number');
      expect(res.entitiesCount).toBe(2);
      expect(res.pool).toEqual({
        total: 10,
        idle: 8,
        waiting: 0,
      });
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should catch database query failures and report error', async () => {
      const mockDataSource = {
        isInitialized: true,
        options: { type: 'postgres' },
        query: jest.fn().mockRejectedValue(new Error('Connection reset')),
      } as unknown as DataSource;

      service = new AppService(mockDataSource);
      const res = await service.pingDatabase();
      expect(res.connected).toBe(false);
      expect(res.error).toBe('Connection reset');
    });

    it('should handle timeout when query takes longer than timeoutMs', async () => {
      const mockDataSource = {
        isInitialized: true,
        options: { type: 'postgres' },
        query: jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 500)),
          ),
      } as unknown as DataSource;

      service = new AppService(mockDataSource);
      const res = await service.pingDatabase(50);
      expect(res.connected).toBe(false);
      expect(res.error).toContain('timed out');
    });
  });

  describe('getHealth', () => {
    it('should report degraded status when dataSource is not connected', async () => {
      service = new AppService(undefined);
      const health = await service.getHealth();
      expect(health.status).toBe('degraded');
      expect(health.database.connected).toBe(false);
      expect(health.nodeVersion).toBe(process.version);
      expect(health.system.platform).toBeDefined();
      expect(health.modules.length).toBeGreaterThan(0);
    });

    it('should report ok status when dataSource is healthy and responsive', async () => {
      const mockDataSource = {
        isInitialized: true,
        options: { type: 'postgres' },
        entityMetadatas: [{ name: 'Task' }],
        query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      } as unknown as DataSource;

      service = new AppService(mockDataSource);
      const health = await service.getHealth();
      expect(health.status).toBe('ok');
      expect(health.database.connected).toBe(true);
      expect(health.database.type).toBe('postgres');
      expect(health.database.entitiesCount).toBe(1);
      expect(typeof health.database.latencyMs).toBe('number');
      expect(health.memory.heapUsedMB).toBeGreaterThan(0);
      expect(health.system.cpuCount).toBeGreaterThan(0);
      expect(health.modules).toContain('TasksModule');
    });
  });
});
