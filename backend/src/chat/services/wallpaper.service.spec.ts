import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import { WallpaperService } from './wallpaper.service';
import { Room } from '../../rooms/room.entity';
import { User } from '../../users/user.entity';
import { UserSession } from '../chat.types';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    unlinkSync: jest.fn(),
  };
});

describe('WallpaperService', () => {
  let service: WallpaperService;

  const mockRoomQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };

  const mockUserQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRoomRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((entity) =>
      Array.isArray(entity) ? Promise.resolve(entity) : Promise.resolve({ id: entity.id || 1, ...entity }),
    ),
    createQueryBuilder: jest.fn(() => mockRoomQueryBuilder),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((entity) => Promise.resolve({ id: entity.id || 1, ...entity })),
    createQueryBuilder: jest.fn(() => mockUserQueryBuilder),
  };

  const mockServer: any = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mockSocket: any = {
    id: 'socket_1',
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReset();
    (fs.unlinkSync as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WallpaperService,
        { provide: getRepositoryToken(Room), useValue: mockRoomRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<WallpaperService>(WallpaperService);
  });

  describe('isLocalUpload & getSafeUploadPath (Path Traversal & External URL Protections)', () => {
    it('should NOT treat external URLs with /uploads/ in path as local uploads', async () => {
      const room: any = {
        id: 1,
        passcode: 'testroom',
        theme: 'custom',
        customWallpaper: 'https://images.unsplash.com/photo-1234/uploads/banner.jpg',
      };

      await service.validateRoomWallpaper(room);

      // External URL must not be checked on local filesystem or wiped
      expect(room.customWallpaper).toBe('https://images.unsplash.com/photo-1234/uploads/banner.jpg');
      expect(mockRoomRepo.save).not.toHaveBeenCalled();
      expect(fs.existsSync).not.toHaveBeenCalled();
    });

    it('should block directory traversal payloads in local uploads', async () => {
      const maliciousUrl = '/uploads/../../package.json';
      const session: UserSession = {
        nickname: 'Alice',
        passcode: 'secret',
        role: 'host',
      };

      mockRoomQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        passcode: 'secret',
        theme: 'wa-doodle',
        customWallpaper: null,
      });

      mockUserQueryBuilder.getOne.mockResolvedValue({
        id: 10,
        nickname: 'Alice',
        role: 'host',
        isBanned: false,
      });

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          customWallpaper: maliciousUrl,
        },
        mockSocket,
      );

      expect(res.success).toBe(false);
      expect(res.message).toContain('does not exist on server');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('does not exist'),
      }));
    });
  });

  describe('validateRoomWallpaper', () => {
    it('should do nothing if room has no custom wallpaper', async () => {
      const room: any = { id: 1, passcode: 'room1', customWallpaper: null };
      await service.validateRoomWallpaper(room);
      expect(mockRoomRepo.save).not.toHaveBeenCalled();
    });

    it('should reset dead local wallpaper and switch custom theme to wa-doodle', async () => {
      const room: any = {
        id: 1,
        passcode: 'room1',
        theme: 'custom',
        customWallpaper: '/uploads/missing-image.png',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.validateRoomWallpaper(room);

      expect(room.customWallpaper).toBeNull();
      expect(room.theme).toBe('wa-doodle');
      expect(mockRoomRepo.save).toHaveBeenCalledWith(room);
    });

    it('should preserve existing local wallpaper file', async () => {
      const room: any = {
        id: 1,
        passcode: 'room1',
        theme: 'custom',
        customWallpaper: '/uploads/existing-image.png',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.validateRoomWallpaper(room);

      expect(room.customWallpaper).toBe('/uploads/existing-image.png');
      expect(mockRoomRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('cleanupDeadWallpapers', () => {
    it('should batch-update rooms with dead wallpapers on bootstrap', async () => {
      const deadRoom: any = {
        id: 1,
        passcode: 'room1',
        theme: 'custom',
        customWallpaper: '/uploads/dead.png',
      };
      const externalRoom: any = {
        id: 2,
        passcode: 'room2',
        theme: 'custom',
        customWallpaper: 'https://cdn.example.com/uploads/photo.jpg',
      };

      mockRoomQueryBuilder.getMany.mockResolvedValue([deadRoom, externalRoom]);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.cleanupDeadWallpapers();

      expect(deadRoom.customWallpaper).toBeNull();
      expect(deadRoom.theme).toBe('wa-doodle');
      // External wallpaper must remain intact
      expect(externalRoom.customWallpaper).toBe('https://cdn.example.com/uploads/photo.jpg');
      expect(mockRoomRepo.save).toHaveBeenCalledWith([deadRoom]);
    });
  });

  describe('getRoomWallpaperState', () => {
    it('should safely return defaults when room is undefined', () => {
      const state = service.getRoomWallpaperState('unknown', undefined as any);
      expect(state).toEqual({
        theme: 'wa-doodle',
        customWallpaper: null,
      });
    });

    it('should return cached state if available', () => {
      const room: any = { passcode: 'roomA', theme: 'dark', customWallpaper: 'https://example.com/bg.png' };
      const state1 = service.getRoomWallpaperState('roomA', room);
      expect(state1.theme).toBe('dark');

      // Change room object; cached state should be returned
      const roomChanged: any = { passcode: 'roomA', theme: 'light', customWallpaper: null };
      const state2 = service.getRoomWallpaperState('roomA', roomChanged);
      expect(state2.theme).toBe('dark');
    });

    it('should reset dead upload wallpaper on user join and save room safely', () => {
      const room: any = { passcode: 'roomDead', theme: 'custom', customWallpaper: '/uploads/deleted.jpg' };
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const state = service.getRoomWallpaperState('roomDead', room);

      expect(state.customWallpaper).toBeNull();
      expect(state.theme).toBe('wa-doodle');
      expect(mockRoomRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateRoomWallpaper', () => {
    it('should reject invalid or missing payload', async () => {
      const res = await service.updateRoomWallpaper(mockServer, undefined, null as any, mockSocket);
      expect(res.success).toBe(false);
      expect(res.message).toBe('Invalid payload');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Invalid payload' });
    });

    it('should reject when session is missing or unauthorized', async () => {
      const res = await service.updateRoomWallpaper(
        mockServer,
        undefined,
        { passcode: 'room123' },
        mockSocket,
      );
      expect(res.success).toBe(false);
      expect(res.message).toBe('Unauthorized session');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized session' });
    });

    it('should reject when room is not found (case-insensitive query check)', async () => {
      const session: UserSession = { nickname: 'Bob', passcode: 'UnknownRoom', role: 'host' };
      mockRoomQueryBuilder.getOne.mockResolvedValue(null);

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        { passcode: 'UnknownRoom' },
        mockSocket,
      );

      expect(res.success).toBe(false);
      expect(res.message).toBe('Room not found');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Room not found' });
    });

    it('should reject when user is banned from the room', async () => {
      const session: UserSession = { nickname: 'BannedUser', passcode: 'secret', role: 'host' };
      mockRoomQueryBuilder.getOne.mockResolvedValue({ id: 1, passcode: 'secret' });
      mockUserQueryBuilder.getOne.mockResolvedValue({
        id: 5,
        nickname: 'BannedUser',
        isBanned: true,
      });

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        { passcode: 'secret' },
        mockSocket,
      );

      expect(res.success).toBe(false);
      expect(res.message).toContain('banned');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('banned'),
      }));
    });

    it('should reject when user is not host or admin', async () => {
      const session: UserSession = { nickname: 'Charlie', passcode: 'secret', role: 'member' };
      mockRoomQueryBuilder.getOne.mockResolvedValue({ id: 1, passcode: 'secret' });
      mockUserQueryBuilder.getOne.mockResolvedValue({
        id: 6,
        nickname: 'Charlie',
        role: 'member',
        isBanned: false,
      });

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        { passcode: 'secret' },
        mockSocket,
      );

      expect(res.success).toBe(false);
      expect(res.message).toContain('host or admin');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('host or admin'),
      }));
    });

    it('should sanitize XSS schemes like javascript: in customWallpaper', async () => {
      const session: UserSession = { nickname: 'Host', passcode: 'secret', role: 'host' };
      const room: any = { id: 1, passcode: 'secret', theme: 'wa-doodle', customWallpaper: null };
      mockRoomQueryBuilder.getOne.mockResolvedValue(room);
      mockUserQueryBuilder.getOne.mockResolvedValue({ id: 1, nickname: 'Host', role: 'host', isBanned: false });

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          customWallpaper: 'javascript:alert(1)',
        },
        mockSocket,
      );

      expect(res.success).toBe(true);
      expect(res.customWallpaper).toBeNull(); // XSS url sanitized to null
    });

    it('should fallback custom theme to wa-doodle when wallpaper is removed', async () => {
      const session: UserSession = { nickname: 'Host', passcode: 'secret', role: 'host' };
      const room: any = { id: 1, passcode: 'secret', theme: 'custom', customWallpaper: 'https://example.com/bg.png' };
      mockRoomQueryBuilder.getOne.mockResolvedValue(room);
      mockUserQueryBuilder.getOne.mockResolvedValue({ id: 1, nickname: 'Host', role: 'host', isBanned: false });

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          customWallpaper: null,
        },
        mockSocket,
      );

      expect(res.success).toBe(true);
      expect(res.customWallpaper).toBeNull();
      expect(res.theme).toBe('wa-doodle');
      expect(res.isDefault).toBe(true);
    });

    it('should safely unlink replaced old local uploaded wallpaper if not used elsewhere', async () => {
      const session: UserSession = { nickname: 'Host', passcode: 'secret', role: 'host' };
      const room: any = { id: 1, passcode: 'secret', theme: 'custom', customWallpaper: '/uploads/old-wall.png' };
      mockRoomQueryBuilder.getOne.mockResolvedValue(room);
      mockUserQueryBuilder.getOne.mockResolvedValue({ id: 1, nickname: 'Host', role: 'host', isBanned: false });
      mockRoomQueryBuilder.getCount.mockResolvedValue(0); // Not used by other rooms

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          theme: 'dark',
          customWallpaper: null,
        },
        mockSocket,
      );

      expect(res.success).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should successfully update valid wallpaper and broadcast roomWallpaperUpdated', async () => {
      const session: UserSession = { nickname: 'Host', passcode: 'secret', role: 'host' };
      const room: any = { id: 1, passcode: 'SecretRoom', theme: 'wa-doodle', customWallpaper: null };
      mockRoomQueryBuilder.getOne.mockResolvedValue(room);
      mockUserQueryBuilder.getOne.mockResolvedValue({ id: 1, nickname: 'Host', role: 'host', isBanned: false });

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          theme: 'dark',
          customWallpaper: 'https://example.com/beautiful.jpg',
        },
        mockSocket,
      );

      expect(res.success).toBe(true);
      expect(res.theme).toBe('dark');
      expect(res.customWallpaper).toBe('https://example.com/beautiful.jpg');
      expect(res.isDefault).toBe(false);
      expect(mockServer.to).toHaveBeenCalledWith('SecretRoom');
      expect(mockServer.emit).toHaveBeenCalledWith('roomWallpaperUpdated', {
        theme: 'dark',
        customWallpaper: 'https://example.com/beautiful.jpg',
        isDefault: false,
        updatedBy: 'Host',
      });
    });

    it('should revert and emit error if database save fails', async () => {
      const session: UserSession = { nickname: 'Host', passcode: 'secret', role: 'host' };
      const room: any = { id: 1, passcode: 'secret', theme: 'wa-doodle', customWallpaper: null };
      mockRoomQueryBuilder.getOne.mockResolvedValue(room);
      mockUserQueryBuilder.getOne.mockResolvedValue({ id: 1, nickname: 'Host', role: 'host', isBanned: false });
      mockRoomRepo.save.mockRejectedValueOnce(new Error('DB write failed'));

      const res = await service.updateRoomWallpaper(
        mockServer,
        session,
        {
          passcode: 'secret',
          theme: 'dark',
        },
        mockSocket,
      );

      expect(res.success).toBe(false);
      expect(res.message).toContain('Failed to update room wallpaper in database');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to update room wallpaper in database.',
      });
    });
  });

  describe('Cache management and LRU eviction', () => {
    it('should clear cache for room passcode', () => {
      const room: any = { passcode: 'roomToClear', theme: 'dark', customWallpaper: null };
      service.getRoomWallpaperState('roomToClear', room);

      service.clearCacheForRoom('roomToClear');
      // Next call creates new state
      const state = service.getRoomWallpaperState('roomToClear', { ...room, theme: 'light' });
      expect(state.theme).toBe('light');
    });
  });
});
