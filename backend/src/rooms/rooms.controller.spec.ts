import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { Room } from './room.entity';

describe('RoomsController', () => {
  let controller: RoomsController;
  let service: RoomsService;

  const mockRoomsService = {
    findOrCreate: jest.fn(),
    checkBanned: jest.fn(),
    findById: jest.fn(),
    findByPasscode: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        {
          provide: RoomsService,
          useValue: mockRoomsService,
        },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
    service = module.get<RoomsService>(RoomsService);
  });

  describe('getHealth', () => {
    it('should return health status for rooms service', () => {
      const health = controller.getHealth();
      expect(health.status).toBe('ok');
      expect(health.service).toBe('rooms');
      expect(typeof health.timestamp).toBe('string');
    });
  });

  describe('join', () => {
    it('should successfully join an existing/created room when user is not banned', async () => {
      const room = {
        id: 1,
        passcode: 'alpha',
        roomName: 'Room-alpha',
        theme: 'wa-doodle',
        customWallpaper: null,
      } as Room;

      mockRoomsService.findOrCreate.mockResolvedValueOnce(room);
      mockRoomsService.checkBanned.mockResolvedValueOnce(false);

      const res = await controller.join({
        passcode: '  alpha  ',
        nickname: '  Alice  ',
      });

      expect(res).toEqual({
        success: true,
        roomId: 1,
        passcode: 'alpha',
        nickname: 'Alice',
        theme: 'wa-doodle',
        customWallpaper: null,
      });
      expect(mockRoomsService.findOrCreate).toHaveBeenCalledWith('alpha');
      expect(mockRoomsService.checkBanned).toHaveBeenCalledWith(1, 'Alice');
    });

    it('should throw ForbiddenException if user is banned from the room', async () => {
      const room = {
        id: 2,
        passcode: 'beta',
      } as Room;

      mockRoomsService.findOrCreate.mockResolvedValueOnce(room);
      mockRoomsService.checkBanned.mockResolvedValueOnce(true);

      await expect(
        controller.join({
          passcode: 'beta',
          nickname: 'BannedUser',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if body is missing or null', async () => {
      await expect(controller.join(null as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.join(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if passcode is missing or not a string', async () => {
      await expect(
        controller.join({ passcode: '', nickname: 'Alice' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.join({ passcode: null, nickname: 'Alice' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.join({ passcode: 12345, nickname: 'Alice' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if passcode is empty or only whitespace/control/zero-width chars', async () => {
      await expect(
        controller.join({
          passcode: '   \r\n\t\u200B\uFEFF   ',
          nickname: 'Alice',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if passcode exceeds 50 characters', async () => {
      await expect(
        controller.join({
          passcode: 'P'.repeat(51),
          nickname: 'Alice',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if nickname is missing or not a string', async () => {
      await expect(
        controller.join({ passcode: 'room1', nickname: '' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.join({ passcode: 'room1', nickname: null } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.join({ passcode: 'room1', nickname: 456 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if nickname is empty or only whitespace/control/zero-width chars', async () => {
      await expect(
        controller.join({
          passcode: 'room1',
          nickname: '   \r\n\t\0\u200B\uFEFF   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if nickname exceeds 50 characters', async () => {
      await expect(
        controller.join({
          passcode: 'room1',
          nickname: 'N'.repeat(51),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should sanitize CRLF, zero-width spaces, and control characters from passcode and nickname', async () => {
      const room = {
        id: 10,
        passcode: 'clean-pass',
        roomName: 'Room-clean-pass',
        theme: 'midnight',
        customWallpaper: '/uploads/wall.jpg',
      } as Room;

      mockRoomsService.findOrCreate.mockResolvedValueOnce(room);
      mockRoomsService.checkBanned.mockResolvedValueOnce(false);

      const res = await controller.join({
        passcode: '  clean-pass\r\n\t\0\u200B  ',
        nickname: '  Bob\r\nBuilder\0\uFEFF  ',
      });

      expect(mockRoomsService.findOrCreate).toHaveBeenCalledWith('clean-pass');
      expect(mockRoomsService.checkBanned).toHaveBeenCalledWith(
        10,
        'BobBuilder',
      );
      expect(res.nickname).toBe('BobBuilder');
      expect(res.theme).toBe('midnight');
      expect(res.customWallpaper).toBe('/uploads/wall.jpg');
    });

    it('should fallback to default theme wa-doodle if room theme is null or whitespace only', async () => {
      const room = {
        id: 11,
        passcode: 'room-notheme',
        roomName: 'Room-room-notheme',
        theme: '   ',
        customWallpaper: null,
      } as Room;

      mockRoomsService.findOrCreate.mockResolvedValueOnce(room);
      mockRoomsService.checkBanned.mockResolvedValueOnce(false);

      const res = await controller.join({
        passcode: 'room-notheme',
        nickname: 'Alice',
      });

      expect(res.theme).toBe('wa-doodle');
    });
  });

  describe('getRoomById', () => {
    it('should return room details when room exists', async () => {
      const room = {
        id: 5,
        passcode: 'vip-room',
        roomName: 'Room-vip-room',
        theme: 'cyberpunk',
        customWallpaper: '/uploads/cyber.png',
        isActive: true,
      } as Room;

      mockRoomsService.findById.mockResolvedValueOnce(room);

      const res = await controller.getRoomById('5');

      expect(res).toEqual({
        success: true,
        roomId: 5,
        passcode: 'vip-room',
        roomName: 'Room-vip-room',
        theme: 'cyberpunk',
        customWallpaper: '/uploads/cyber.png',
        isActive: true,
      });
      expect(mockRoomsService.findById).toHaveBeenCalledWith(5);
    });

    it('should throw BadRequestException if ID is invalid or non-positive', async () => {
      await expect(controller.getRoomById('abc')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getRoomById('0')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getRoomById('-4')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if room is not found', async () => {
      mockRoomsService.findById.mockResolvedValueOnce(null);

      await expect(controller.getRoomById('999')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRoomsService.findById).toHaveBeenCalledWith(999);
    });
  });

  describe('getRoomByPasscode', () => {
    it('should return room details when room with passcode exists', async () => {
      const room = {
        id: 7,
        passcode: 'secret7',
        roomName: 'Room-secret7',
        theme: 'sunset',
        customWallpaper: null,
        isActive: true,
      } as Room;

      mockRoomsService.findByPasscode.mockResolvedValueOnce(room);

      const res = await controller.getRoomByPasscode('  secret7\r\n\u200B  ');

      expect(res).toEqual({
        success: true,
        roomId: 7,
        passcode: 'secret7',
        roomName: 'Room-secret7',
        theme: 'sunset',
        customWallpaper: null,
        isActive: true,
      });
      expect(mockRoomsService.findByPasscode).toHaveBeenCalledWith('secret7');
    });

    it('should throw BadRequestException if passcode is empty or only whitespace/control chars', async () => {
      await expect(
        controller.getRoomByPasscode('   \r\n\t\u200B   '),
      ).rejects.toThrow(BadRequestException);
      await expect(controller.getRoomByPasscode('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getRoomByPasscode(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if room with passcode is not found', async () => {
      mockRoomsService.findByPasscode.mockResolvedValueOnce(null);

      await expect(
        controller.getRoomByPasscode('nonexistent'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRoomsService.findByPasscode).toHaveBeenCalledWith(
        'nonexistent',
      );
    });
  });
});
