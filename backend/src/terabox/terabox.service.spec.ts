import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { TeraboxService } from './terabox.service';

describe('TeraboxService', () => {
  let service: TeraboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeraboxService],
    }).compile();

    service = module.get<TeraboxService>(TeraboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAndSanitizeUrl', () => {
    it('should allow valid TeraBox URLs with HTTPS', () => {
      const url = 'https://terabox.com/s/1aB2c3D4e5F';
      const result = service.validateAndSanitizeUrl(url);
      expect(result).toBe('https://terabox.com/s/1aB2c3D4e5F');
    });

    it('should prepend https to protocol-relative or bare domain URLs', () => {
      const url = 'terabox.app/s/1xyz987';
      const result = service.validateAndSanitizeUrl(url);
      expect(result).toBe('https://terabox.app/s/1xyz987');
    });

    it('should reject URLs from disallowed domains', () => {
      expect(() => {
        service.validateAndSanitizeUrl('https://evil-site.com/s/malicious');
      }).toThrow(BadRequestException);
    });

    it('should reject private or loopback IP addresses (SSRF defense)', () => {
      expect(() => {
        service.validateAndSanitizeUrl('http://127.0.0.1/admin');
      }).toThrow(BadRequestException);

      expect(() => {
        service.validateAndSanitizeUrl('http://192.168.1.10/metadata');
      }).toThrow(BadRequestException);

      expect(() => {
        service.validateAndSanitizeUrl('http://169.254.169.254/latest/meta-data');
      }).toThrow(BadRequestException);
    });
  });

  describe('extractSurl', () => {
    it('should extract surl from query parameter', () => {
      const url = 'https://terabox.app/sharing/link?surl=AbCdEf123';
      const surl = service.extractSurl(url);
      expect(surl).toBe('AbCdEf123');
    });

    it('should extract surl from /s/1XXXX path', () => {
      const url = 'https://1024tera.com/s/1sampleCode99';
      const surl = service.extractSurl(url);
      expect(surl).toBe('sampleCode99');
    });

    it('should extract surl from /s/XXXX path', () => {
      const url = 'https://terabox.com/s/codeWithoutOne';
      const surl = service.extractSurl(url);
      expect(surl).toBe('codeWithoutOne');
    });

    it('should return null for non-matching URLs', () => {
      const url = 'https://terabox.com/';
      const surl = service.extractSurl(url);
      expect(surl).toBeNull();
    });
  });

  describe('Stream Token & Proxying', () => {
    it('should create and retrieve stream proxy tokens', () => {
      const upstream = 'https://cdn.terabox.com/video/stream.mp4';
      const token = service.createStreamToken(upstream, 'Sample Movie');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const info = service.getStreamByToken(token);
      expect(info).not.toBeNull();
      expect(info?.url).toBe(upstream);
      expect(info?.title).toBe('Sample Movie');
    });

    it('should return null for non-existent token', () => {
      expect(service.getStreamByToken('non-existent-token')).toBeNull();
    });
  });

  describe('extractVideoMetadata caching & error handling', () => {
    it('should reject invalid input before making network calls', async () => {
      await expect(service.extractVideoMetadata('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should report healthy stats', () => {
      const stats = service.getStats();
      expect(stats.status).toBe('healthy');
      expect(stats.cachedItems).toBeGreaterThanOrEqual(0);
      expect(stats.metrics.totalRequests).toBeGreaterThanOrEqual(0);
    });
  });
});

