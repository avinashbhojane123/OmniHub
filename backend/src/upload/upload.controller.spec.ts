import { Test, TestingModule } from '@nestjs/testing';
import {
  UploadController,
  getUploadDir,
  inspectFileSafety,
  getMaxFileSizeMB,
  getBlockedExtensions,
  DEFAULT_BLOCKED_FILE_EXTENSIONS,
} from './upload.controller';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('UploadController', () => {
  let controller: UploadController;
  const testUploadDir = path.resolve(process.cwd(), 'test-uploads-spec');

  beforeAll(() => {
    process.env.UPLOAD_DIR = 'test-uploads-spec';
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }
  });

  afterAll(() => {
    delete process.env.UPLOAD_DIR;
    if (fs.existsSync(testUploadDir)) {
      fs.rmSync(testUploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  afterEach(() => {
    // Clean files created inside testUploadDir between tests
    if (fs.existsSync(testUploadDir)) {
      const entries = fs.readdirSync(testUploadDir);
      for (const entry of entries) {
        try {
          fs.rmSync(path.join(testUploadDir, entry), {
            recursive: true,
            force: true,
          });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status and writable upload directory', () => {
      const health = controller.getHealth();
      expect(health.status).toBe('ok');
      expect(health.service).toBe('upload');
      expect(health.isWritable).toBe(true);
      expect(health.uploadDir).toContain('test-uploads-spec');
      expect(typeof health.timestamp).toBe('string');
      expect(health.maxFileSizeMB).toBeGreaterThan(0);
    });
  });

  describe('files', () => {
    it('should list only non-hidden files and exclude subdirectories', () => {
      const file1 = path.join(testUploadDir, 'file1.txt');
      const file2 = path.join(testUploadDir, 'file2.jpg');
      const hiddenFile = path.join(testUploadDir, '.hidden');
      const subDir = path.join(testUploadDir, 'subfolder');

      fs.writeFileSync(file1, 'content 1');
      fs.writeFileSync(file2, 'content 2');
      fs.writeFileSync(hiddenFile, 'hidden content');
      fs.mkdirSync(subDir, { recursive: true });

      const res = controller.files();
      expect(res.success).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files).toContain('file1.txt');
      expect(res.files).toContain('file2.jpg');
      expect(res.files).not.toContain('.hidden');
      expect(res.files).not.toContain('subfolder');
    });

    it('should filter files by search query term', () => {
      fs.writeFileSync(path.join(testUploadDir, 'avatar-user1.png'), 'avatar');
      fs.writeFileSync(path.join(testUploadDir, 'document.pdf'), 'doc');
      fs.writeFileSync(path.join(testUploadDir, 'avatar-user2.png'), 'avatar 2');

      const res = controller.files(undefined, undefined, 'avatar');
      expect(res.success).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files).toContain('avatar-user1.png');
      expect(res.files).toContain('avatar-user2.png');
      expect(res.files).not.toContain('document.pdf');
    });

    it('should apply limit and offset pagination correctly', () => {
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(
          path.join(testUploadDir, `item-${i}.txt`),
          `item ${i}`,
        );
      }

      const paginated = controller.files('2', '1');
      expect(paginated.success).toBe(true);
      expect(paginated.total).toBe(5);
      expect(paginated.count).toBe(2);
      expect(paginated.files.length).toBe(2);
    });

    it('should throw BadRequestException on invalid limit parameter', () => {
      expect(() => controller.files('invalid', '0')).toThrow(
        BadRequestException,
      );
      expect(() => controller.files('-5', '0')).toThrow(BadRequestException);
      expect(() => controller.files('0', '0')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid offset parameter', () => {
      expect(() => controller.files('10', 'invalid')).toThrow(
        BadRequestException,
      );
      expect(() => controller.files('10', '-1')).toThrow(BadRequestException);
    });
  });

  describe('uploadFile', () => {
    it('should throw BadRequestException if no file is provided', () => {
      expect(() => controller.uploadFile(undefined as any)).toThrow(
        BadRequestException,
      );
    });

    it('should reject and clean up 0-byte empty files', () => {
      const emptyFilePath = path.join(testUploadDir, 'empty.txt');
      fs.writeFileSync(emptyFilePath, Buffer.alloc(0));

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'empty.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        destination: testUploadDir,
        filename: 'empty.txt',
        path: emptyFilePath,
        buffer: Buffer.alloc(0),
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(emptyFilePath)).toBe(false);
    });

    it('should reject Windows DOS MZ executables and unlink file', () => {
      const exeFilePath = path.join(testUploadDir, 'malicious.dat');
      // MZ magic bytes (0x4D, 0x5A)
      const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      fs.writeFileSync(exeFilePath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'safe-looking.dat',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'malicious.dat',
        path: exeFilePath,
        buffer,
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(exeFilePath)).toBe(false);
    });

    it('should reject Linux ELF binaries and unlink file', () => {
      const elfFilePath = path.join(testUploadDir, 'elf.dat');
      // 0x7F 'E' 'L' 'F'
      const buffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
      fs.writeFileSync(elfFilePath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'safe.dat',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'elf.dat',
        path: elfFilePath,
        buffer,
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(elfFilePath)).toBe(false);
    });

    it('should reject Shell script with shebang and unlink file', () => {
      const shFilePath = path.join(testUploadDir, 'script.dat');
      // #!
      const buffer = Buffer.from('#!/bin/bash\necho bad');
      fs.writeFileSync(shFilePath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'script.dat',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'script.dat',
        path: shFilePath,
        buffer,
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(shFilePath)).toBe(false);
    });

    it('should reject Mach-O executable header signatures', () => {
      const machOPath = path.join(testUploadDir, 'macho.dat');
      // 0xCA 0xFE 0xBA 0xBE
      const buffer = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x01]);
      fs.writeFileSync(machOPath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'binary.dat',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'macho.dat',
        path: machOPath,
        buffer,
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(machOPath)).toBe(false);
    });

    it('should reject disguised HTML/script content', () => {
      const htmlPath = path.join(testUploadDir, 'disguised.jpg');
      const buffer = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script>');
      fs.writeFileSync(htmlPath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'disguised.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'disguised.jpg',
        path: htmlPath,
        buffer,
        stream: null as any,
      };

      expect(() => controller.uploadFile(mockFile)).toThrow(
        BadRequestException,
      );
      expect(fs.existsSync(htmlPath)).toBe(false);
    });

    it('should accept valid safe file and return complete metadata response', () => {
      const validPath = path.join(testUploadDir, 'valid.png');
      // Valid PNG header: 0x89 0x50 0x4E 0x47
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
        0x0d,
      ]);
      fs.writeFileSync(validPath, buffer);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'photo.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: buffer.length,
        destination: testUploadDir,
        filename: 'valid.png',
        path: validPath,
        buffer,
        stream: null as any,
      };

      const res = controller.uploadFile(mockFile);
      expect(res.success).toBe(true);
      expect(res.fileName).toBe('photo.png');
      expect(res.fileType).toBe('image/png');
      expect(res.fileSize).toBe(buffer.length);
      expect(res.fileUrl).toContain('/uploads/valid.png');
      expect(fs.existsSync(validPath)).toBe(true);
    });
  });

  describe('deleteFile', () => {
    it('should throw BadRequestException if filename is empty or missing', () => {
      expect(() => controller.deleteFile('')).toThrow(BadRequestException);
      expect(() => controller.deleteFile('   ')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when path traversal characters are present', () => {
      expect(() => controller.deleteFile('../secret.txt')).toThrow(
        BadRequestException,
      );
      expect(() => controller.deleteFile('dir/sub.txt')).toThrow(
        BadRequestException,
      );
      expect(() => controller.deleteFile('dir\\sub.txt')).toThrow(
        BadRequestException,
      );
      expect(() => controller.deleteFile('%2e%2e%2fsecret.txt')).toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if the file does not exist', () => {
      expect(() => controller.deleteFile('nonexistent.png')).toThrow(
        NotFoundException,
      );
    });

    it('should successfully delete an existing file', () => {
      const targetFile = path.join(testUploadDir, 'delete-me.txt');
      fs.writeFileSync(targetFile, 'temporary');

      const res = controller.deleteFile('delete-me.txt');
      expect(res.success).toBe(true);
      expect(res.message).toBe('File deleted successfully');
      expect(fs.existsSync(targetFile)).toBe(false);
    });
  });

  describe('inspectFileSafety', () => {
    it('should throw BadRequestException if file does not exist', () => {
      expect(() =>
        inspectFileSafety(path.join(testUploadDir, 'missing.bin')),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException on empty file', () => {
      const emptyFile = path.join(testUploadDir, 'zero.bin');
      fs.writeFileSync(emptyFile, Buffer.alloc(0));
      expect(() => inspectFileSafety(emptyFile)).toThrow(
        BadRequestException,
      );
    });

    it('should pass on benign text or image data', () => {
      const textFile = path.join(testUploadDir, 'benign.txt');
      fs.writeFileSync(textFile, 'Hello world text document');
      expect(() => inspectFileSafety(textFile)).not.toThrow();
    });
  });

  describe('Utility & Configuration Helpers', () => {
    it('should return default blocked extension list', () => {
      delete process.env.BLOCKED_FILE_EXTENSIONS;
      const list = getBlockedExtensions();
      expect(list).toEqual(DEFAULT_BLOCKED_FILE_EXTENSIONS);
      expect(list).toContain('.exe');
      expect(list).toContain('.html');
      expect(list).toContain('.js');
    });

    it('should parse custom BLOCKED_FILE_EXTENSIONS from environment', () => {
      process.env.BLOCKED_FILE_EXTENSIONS = 'apk, dmg, .iso';
      const list = getBlockedExtensions();
      expect(list).toContain('.apk');
      expect(list).toContain('.dmg');
      expect(list).toContain('.iso');
      delete process.env.BLOCKED_FILE_EXTENSIONS;
    });

    it('should parse MAX_FILE_SIZE_MB and fallback safely', () => {
      process.env.MAX_FILE_SIZE_MB = '250';
      expect(getMaxFileSizeMB()).toBe(250);

      process.env.MAX_FILE_SIZE_MB = 'invalid';
      expect(getMaxFileSizeMB()).toBe(100);

      process.env.MAX_FILE_SIZE_MB = '-50';
      expect(getMaxFileSizeMB()).toBe(100);

      delete process.env.MAX_FILE_SIZE_MB;
      expect(getMaxFileSizeMB()).toBe(100);
    });

    it('should resolve and create upload dir dynamically', () => {
      const dir = getUploadDir();
      expect(fs.existsSync(dir)).toBe(true);
    });
  });
});
