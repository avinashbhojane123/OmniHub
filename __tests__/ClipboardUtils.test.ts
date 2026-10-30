import { Alert } from 'react-native';
import {
  copyToClipboard,
  copyToClipboardAsync,
  copyToClipboardWithFeedback,
  getFromClipboard,
  hasClipboardText,
  clearClipboard,
  clearClipboardAsync,
  extractUrlFromText,
  getURLFromClipboard,
} from '../src/utils/clipboard';

describe('Clipboard Utilities (src/utils/clipboard.ts)', () => {
  beforeEach(() => {
    clearClipboard();
    jest.clearAllMocks();
  });

  describe('copyToClipboard', () => {
    it('returns false for null and undefined without throwing', () => {
      expect(copyToClipboard(null)).toBe(false);
      expect(copyToClipboard(undefined)).toBe(false);
    });

    it('copies standard text string successfully', async () => {
      const ok = copyToClipboard('Hello OmniHub');
      expect(ok).toBe(true);

      const content = await getFromClipboard();
      expect(content).toBe('Hello OmniHub');
    });

    it('defensively coerces numbers and booleans to strings', async () => {
      expect(copyToClipboard(12345)).toBe(true);
      expect(await getFromClipboard()).toBe('12345');

      expect(copyToClipboard(true)).toBe(true);
      expect(await getFromClipboard()).toBe('true');
    });

    it('defensively serializes plain objects', async () => {
      expect(copyToClipboard({ id: 'task-1', title: 'Test' })).toBe(true);
      const text = await getFromClipboard();
      expect(JSON.parse(text)).toEqual({ id: 'task-1', title: 'Test' });
    });
  });

  describe('copyToClipboardAsync', () => {
    it('returns false for null and undefined', async () => {
      expect(await copyToClipboardAsync(null)).toBe(false);
      expect(await copyToClipboardAsync(undefined)).toBe(false);
    });

    it('asynchronously copies text and resolves to true', async () => {
      const ok = await copyToClipboardAsync('Async clipboard text');
      expect(ok).toBe(true);
      expect(await getFromClipboard()).toBe('Async clipboard text');
    });
  });

  describe('getFromClipboard', () => {
    it('always returns a string (never null or undefined)', async () => {
      clearClipboard();
      const res = await getFromClipboard();
      expect(typeof res).toBe('string');
      expect(res).toBe('');
    });

    it('retrieves previously copied text accurately', async () => {
      copyToClipboard('Persistent clipboard test');
      expect(await getFromClipboard()).toBe('Persistent clipboard test');
    });
  });

  describe('hasClipboardText', () => {
    it('returns false when clipboard is empty', async () => {
      clearClipboard();
      expect(await hasClipboardText()).toBe(false);
    });

    it('returns true when clipboard has content', async () => {
      copyToClipboard('Some content');
      expect(await hasClipboardText()).toBe(true);
    });
  });

  describe('clearClipboard and clearClipboardAsync', () => {
    it('synchronously clears the clipboard', async () => {
      copyToClipboard('Sensitive password');
      expect(await hasClipboardText()).toBe(true);

      expect(clearClipboard()).toBe(true);
      expect(await getFromClipboard()).toBe('');
      expect(await hasClipboardText()).toBe(false);
    });

    it('asynchronously clears the clipboard', async () => {
      copyToClipboard('Sensitive token');
      expect(await hasClipboardText()).toBe(true);

      expect(await clearClipboardAsync()).toBe(true);
      expect(await getFromClipboard()).toBe('');
      expect(await hasClipboardText()).toBe(false);
    });
  });

  describe('extractUrlFromText', () => {
    it('returns null for null, undefined, empty, or non-string inputs', () => {
      expect(extractUrlFromText(null)).toBeNull();
      expect(extractUrlFromText(undefined)).toBeNull();
      expect(extractUrlFromText('')).toBeNull();
      expect(extractUrlFromText('No link here')).toBeNull();
    });

    it('extracts direct standalone URLs', () => {
      expect(extractUrlFromText('https://omnihub.app/watch?v=123')).toBe(
        'https://omnihub.app/watch?v=123'
      );
      expect(extractUrlFromText('http://localhost:8888/ota/version')).toBe(
        'http://localhost:8888/ota/version'
      );
    });

    it('extracts URLs surrounded by sentence text and strips trailing punctuation', () => {
      expect(
        extractUrlFromText('Watch this trailer: https://youtube.com/watch?v=sample!')
      ).toBe('https://youtube.com/watch?v=sample');

      expect(
        extractUrlFromText('Check documentation (https://reactnative.dev/docs/intro).')
      ).toBe('https://reactnative.dev/docs/intro');

      expect(
        extractUrlFromText('Download link: https://example.com/file.apk;')
      ).toBe('https://example.com/file.apk');
    });
  });

  describe('getURLFromClipboard', () => {
    it('returns extracted URL when clipboard contains a link', async () => {
      copyToClipboard('Hey, join our stream here: https://commondatastorage.googleapis.com/movie.mp4!');
      const url = await getURLFromClipboard();
      expect(url).toBe('https://commondatastorage.googleapis.com/movie.mp4');
    });

    it('returns null when clipboard has no URL', async () => {
      copyToClipboard('Just regular text message without any url');
      expect(await getURLFromClipboard()).toBeNull();
    });
  });

  describe('copyToClipboardWithFeedback', () => {
    it('copies text and presents an Alert', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const ok = copyToClipboardWithFeedback('Code snippet', 'Copied!', 'Ready to paste.');
      expect(ok).toBe(true);
      expect(alertSpy).toHaveBeenCalledWith('Copied!', 'Ready to paste.');

      alertSpy.mockRestore();
    });

    it('returns false on null input and does not trigger Alert', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const ok = copyToClipboardWithFeedback(null);
      expect(ok).toBe(false);
      expect(alertSpy).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });
});

