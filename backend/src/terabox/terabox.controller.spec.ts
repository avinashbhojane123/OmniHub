import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeraboxController } from './terabox.controller';
import { TeraboxService } from './terabox.service';

describe('TeraboxController', () => {
  let controller: TeraboxController;
  let service: TeraboxService;

  const mockTeraboxService = {
    extractVideoMetadata: jest.fn(),
    getStreamByToken: jest.fn(),
    getStats: jest.fn().mockReturnValue({ status: 'healthy', cachedItems: 5 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeraboxController],
      providers: [
        {
          provide: TeraboxService,
          useValue: mockTeraboxService,
        },
      ],
    }).compile();

    controller = module.get<TeraboxController>(TeraboxController);
    service = module.get<TeraboxService>(TeraboxService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('extract', () => {
    it('should call service extractVideoMetadata and return result', async () => {
      const mockResult = {
        success: true,
        title: 'Sci-Fi Action.mp4',
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        duration: 7200,
        size: 1048576000,
        streams: [
          { quality: '1080p', url: 'https://cdn.example.com/1080.mp4' },
          { quality: '720p', url: 'https://cdn.example.com/720.mp4' },
        ],
        extractedAt: new Date().toISOString(),
      };

      mockTeraboxService.extractVideoMetadata.mockResolvedValue(mockResult);

      const dto = { url: 'https://terabox.com/s/1abcdef' };
      const res = await controller.extract(dto);

      expect(res).toEqual(mockResult);
      expect(mockTeraboxService.extractVideoMetadata).toHaveBeenCalledWith(
        dto.url,
      );
    });
  });

  describe('stream', () => {
    it('should throw BadRequestException if token is missing', async () => {
      const req = {} as any;
      const res = {} as any;
      await expect(controller.stream('', req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if token does not exist', async () => {
      mockTeraboxService.getStreamByToken.mockReturnValue(null);
      const req = { headers: {} } as any;
      const res = {} as any;
      await expect(controller.stream('invalid-token', req, res)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('stats & health', () => {
    it('should return health status', () => {
      const health = controller.getHealth();
      expect(health.status).toBe('UP');
      expect(health.service).toBe('terabox-extraction-service');
    });

    it('should return stats', () => {
      const stats = controller.getStats();
      expect(stats.status).toBe('healthy');
      expect(mockTeraboxService.getStats).toHaveBeenCalled();
    });
  });
});

