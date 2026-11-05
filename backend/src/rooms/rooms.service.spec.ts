import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { Room } from './room.entity';
import { User } from '../users/user.entity';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn(),
  };
});

describe('RoomsService', () => {
  let service: RoomsService;

  let mockRoomQueryBuilder: any;
  let mockUserQueryBuilder: any;

  const mockRoomRepo = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRoomQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    mockRoomRepo.createQueryBuilder.mockReturnValue(mockRoomQueryBuilder);

    mockUserQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    mockUserRepo.createQueryBuilder.mockReturnValue(mockUserQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('checkBanned', () => {
    it('should return false for invalid roomId', async () => {
      expect(await service.checkBanned(0, 'alice')).toBe(false);
      expect(await service.checkBanned(-1, 'alice')).toBe(false);
      expect(await service.checkBanned(NaN, 'alice')).toBe(false);
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return false for empty or whitespace nickname', async () => {
      expect(await service.checkBanned(1, '')).toBe(false);
      expect(await service.checkBanned(1, '   ')).toBe(false);
      expect(mockUserRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return true if a banned user record matches', async () => {
      mockUserQueryBuilder.getOne.mockResolvedValueOnce({
        id: 10,
        nickname: 'Alice',
        isBanned: true,
      });

      const isBanned = await service.checkBanned(1, ' ALICE ');
      expect(isBanned).toBe(true);
      expect(mockUserQueryBuilder.where).toHaveBeenCalledWith(
        'user.roomId = :roomId AND LOWER(TRIM(user.nickname)) = :cleanNick AND user.isBanned = :isBanned',
        {
          roomId: 1,
          cleanNick: 'alice',
          isBanned: true,
        },
      );
    });

    it('should return false if no banned user matches', async () => {
      mockUserQueryBuilder.getOne.mockResolvedValueOnce(null);

      const isBanned = await service.checkBanned(1, 'bob');
      expect(isBanned).toBe(false);
    });
  });

  describe('validateRoomWallpaper & Directory Traversal Protection', () => {
    it('should skip when room has no custom wallpaper or empty string', async () => {
      const room = { id: 1, passcode: 'ABC', customWallpaper: null } as Room;
      await service.validateRoomWallpaper(room);
      expect(mockRoomRepo.save).not.toHaveBeenCalled();

      room.customWallpaper = '   ';
      await service.validateRoomWallpaper(room);
      expect(room.customWallpaper).toBeNull();
    });

    it('should ignore external web URLs (e.g. Unsplash)', async () => {
      const room = {
        id: 1,
        passcode: 'ABC',
        customWallpaper: 'https://images.unsplash.com/photo-1234',
      } as Room;

      await service.validateRoomWallpaper(room);
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(mockRoomRepo.save).not.toHaveBeenCalled();
      expect(room.customWallpaper).toBe('https://images.unsplash.com/photo-1234');
    });

    it('should keep wallpaper if local file exists on disk', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const room = {
        id: 1,
        passcode: 'ABC',
        customWallpaper: '/uploads/existing-bg.jpg',
        theme: 'custom',
      } as Room;

      await service.validateRoomWallpaper(room);
      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockRoomRepo.save).not.toHaveBeenCalled();
      expect(room.customWallpaper).toBe('/uploads/existing-bg.jpg');
    });

    it('should reset dead wallpaper and custom theme if local file is missing from disk', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const room = {
        id: 1,
        passcode: 'ABC',
        customWallpaper: '/uploads/deleted-file.png',
        theme: 'custom',
      } as Room;

      await service.validateRoomWallpaper(room);
      expect(room.customWallpaper).toBeNull();
      expect(room.theme).toBe('wa-doodle');
      expect(mockRoomRepo.save).toHaveBeenCalledWith(room);
    });

    it('should neutralize and reset directory traversal wallpaper attempts (e.g. /uploads/../../package.json)', async () => {
      const room = {
        id: 1,
        passcode: 'ABC',
        customWallpaper: '/uploads/../../package.json',
        theme: 'custom',
      } as Room;

      await service.validateRoomWallpaper(room);
      expect(room.customWallpaper).toBeNull();
      expect(room.theme).toBe('wa-doodle');
      expect(mockRoomRepo.save).toHaveBeenCalledWith(room);
    });

    it('should handle repository save error gracefully when clearing wallpaper', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      mockRoomRepo.save.mockRejectedValueOnce(new Error('DB failure'));

      const room = {
        id: 1,
        passcode: 'ABC',
        customWallpaper: '/uploads/missing.png',
      } as Room;

      await expect(service.validateRoomWallpaper(room)).resolves.not.toThrow();
      expect(room.customWallpaper).toBeNull();
    });
  });

  describe('findOrCreate', () => {
    it('should throw BadRequestException if passcode is empty or whitespace', async () => {
      await expect(service.findOrCreate('')).rejects.toThrow(BadRequestException);
      await expect(service.findOrCreate('   ')).rejects.toThrow(BadRequestException);
      await expect(service.findOrCreate(null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if passcode exceeds 50 characters', async () => {
      const longPass = 'p'.repeat(51);
      await expect(service.findOrCreate(longPass)).rejects.toThrow(BadRequestException);
    });

    it('should return existing room if found via case-insensitive query', async () => {
      const existingRoom = {
        id: 5,
        passcode: 'Alpha123',
        roomName: 'Room-Alpha123',
        theme: 'wa-doodle',
        customWallpaper: null,
      } as Room;

      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(existingRoom);

      const room = await service.findOrCreate('  alpha123  ');
      expect(room).toEqual(existingRoom);
      expect(mockRoomRepo.create).not.toHaveBeenCalled();
      expect(mockRoomQueryBuilder.where).toHaveBeenCalledWith(
        'LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))',
        { passcode: 'alpha123' },
      );
    });

    it('should reactivate existing room if it was marked inactive', async () => {
      const inactiveRoom = {
        id: 6,
        passcode: 'InactivePass',
        isActive: false,
      } as Room;

      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(inactiveRoom);

      const room = await service.findOrCreate('InactivePass');
      expect(room.isActive).toBe(true);
      expect(mockRoomRepo.save).toHaveBeenCalledWith(inactiveRoom);
    });

    it('should create and save new room if not found', async () => {
      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(null);

      const newRoom = {
        id: 10,
        passcode: 'SecretPass',
        roomName: 'Room-SecretPass',
        theme: 'wa-doodle',
        isActive: true,
      } as Room;

      mockRoomRepo.create.mockReturnValue(newRoom);
      mockRoomRepo.save.mockResolvedValue(newRoom);

      const result = await service.findOrCreate('SecretPass');
      expect(result).toEqual(newRoom);
      expect(mockRoomRepo.create).toHaveBeenCalledWith({
        passcode: 'SecretPass',
        roomName: 'Room-SecretPass',
        theme: 'wa-doodle',
        isActive: true,
      });
      expect(mockRoomRepo.save).toHaveBeenCalledWith(newRoom);
    });

    it('should handle PostgreSQL unique constraint race condition (code 23505)', async () => {
      mockRoomQueryBuilder.getOne
        .mockResolvedValueOnce(null) // first query -> not found
        .mockResolvedValueOnce({ id: 11, passcode: 'RacePass' }); // query after race -> found

      mockRoomRepo.create.mockReturnValue({ passcode: 'RacePass' });
      mockRoomRepo.save.mockRejectedValueOnce({ code: '23505' });

      const room = await service.findOrCreate('RacePass');
      expect(room.id).toBe(11);
    });

    it('should handle SQLite unique constraint race condition (SQLITE_CONSTRAINT)', async () => {
      mockRoomQueryBuilder.getOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 12, passcode: 'SqlitePass' });

      mockRoomRepo.create.mockReturnValue({ passcode: 'SqlitePass' });
      mockRoomRepo.save.mockRejectedValueOnce({
        code: 'SQLITE_CONSTRAINT',
        message: 'UNIQUE constraint failed: rooms.passcode',
      });

      const room = await service.findOrCreate('SqlitePass');
      expect(room.id).toBe(12);
    });

    it('should handle MySQL unique constraint race condition (ER_DUP_ENTRY / 1062)', async () => {
      mockRoomQueryBuilder.getOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 13, passcode: 'MysqlPass' });

      mockRoomRepo.create.mockReturnValue({ passcode: 'MysqlPass' });
      mockRoomRepo.save.mockRejectedValueOnce({
        code: 'ER_DUP_ENTRY',
        errno: 1062,
      });

      const room = await service.findOrCreate('MysqlPass');
      expect(room.id).toBe(13);
    });

    it('should rethrow non-unique database errors', async () => {
      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockRoomRepo.create.mockReturnValue({ passcode: 'CrashPass' });
      mockRoomRepo.save.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(service.findOrCreate('CrashPass')).rejects.toThrow('Connection lost');
    });
  });

  describe('findById & findByPasscode', () => {
    it('findById: should return null for invalid IDs', async () => {
      expect(await service.findById(0)).toBeNull();
      expect(await service.findById(-5)).toBeNull();
      expect(await service.findById(NaN)).toBeNull();
    });

    it('findById: should find room and validate wallpaper', async () => {
      const room = { id: 7, passcode: 'P7', customWallpaper: null } as Room;
      mockRoomRepo.findOne.mockResolvedValueOnce(room);

      const res = await service.findById(7);
      expect(res).toEqual(room);
      expect(mockRoomRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    it('findByPasscode: should return null for invalid passcode', async () => {
      expect(await service.findByPasscode('')).toBeNull();
      expect(await service.findByPasscode('   ')).toBeNull();
      expect(await service.findByPasscode(null as any)).toBeNull();
    });

    it('findByPasscode: should find room by passcode and validate wallpaper', async () => {
      const room = { id: 8, passcode: 'TargetPass', customWallpaper: null } as Room;
      mockRoomQueryBuilder.getOne.mockResolvedValueOnce(room);

      const res = await service.findByPasscode('TargetPass');
      expect(res).toEqual(room);
      expect(mockRoomQueryBuilder.where).toHaveBeenCalledWith(
        'LOWER(TRIM(room.passcode)) = LOWER(TRIM(:passcode))',
        { passcode: 'TargetPass' },
      );
    });
  });
});

