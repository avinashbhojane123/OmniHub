import { InstagramService } from './instagram.service';
import { ConfigService } from '@nestjs/config';

describe('InstagramService', () => {
  let service: InstagramService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_SESSION_ID') return 'mock_session_12345';
        return null;
      }),
    } as any;
    service = new InstagramService(configService);
  });

  it('should parse Instagram Reel URLs correctly', () => {
    const url = 'https://www.instagram.com/reel/C123abc456/?igsh=MWx1Yw==';
    const parsed = service.parseUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.shortcode).toBe('C123abc456');
    expect(parsed?.type).toBe('reel');
    expect(parsed?.cleanUrl).toBe('https://www.instagram.com/reel/C123abc456/');
  });

  it('should parse Instagram Post URLs correctly', () => {
    const url = 'https://instagram.com/p/DABcde987/';
    const parsed = service.parseUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.shortcode).toBe('DABcde987');
    expect(parsed?.type).toBe('p');
  });

  it('should parse Instagram Share Reel URLs correctly', () => {
    const url = 'https://www.instagram.com/share/reel/XYZ123456';
    const parsed = service.parseUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.shortcode).toBe('XYZ123456');
    expect(parsed?.type).toBe('reel');
  });

  it('should convert shortcode to numeric media ID', () => {
    const shortcode = 'B-0123';
    const mediaId = service.shortcodeToMediaId(shortcode);
    expect(mediaId).toBeTruthy();
    expect(typeof mediaId).toBe('string');
  });

  it('should handle session ID config and custom runtime update', () => {
    expect(service.getSessionId()).toBe('mock_session_12345');
    expect(service.hasSessionId()).toBe(true);

    service.setCustomSessionId('custom_test_session');
    expect(service.getSessionId()).toBe('custom_test_session');
  });
});
