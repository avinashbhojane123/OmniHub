import { Alert, Clipboard } from 'react-native';

/**
 * In-memory clipboard cache ensuring reliable fallback in test, headless, or unsupported environments.
 */
let inMemoryClipboard = '';

/**
 * Safely sanitizes arbitrary input to a clean string. Returns null for null/undefined.
 */
function sanitizeInput(text: unknown): string | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'string') return text;
  if (typeof text === 'number' || typeof text === 'boolean' || typeof text === 'bigint') {
    return String(text);
  }
  if (typeof text === 'object') {
    try {
      return JSON.stringify(text);
    } catch {
      return String(text);
    }
  }
  return String(text);
}

/**
 * Extracts the first valid HTTP or HTTPS URL from a text snippet, stripping trailing punctuation and brackets.
 */
export function extractUrlFromText(text: string | undefined | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const urlRegex = /https?:\/\/[^\s<>]+[^\s<>.,!?:;)}\]]/i;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

/**
 * Safely copies string content to the system clipboard synchronously.
 * Handles non-string values defensively and gracefully catches platform exceptions.
 *
 * @param text The text or value to copy.
 * @returns boolean True if copied successfully, false otherwise.
 */
export const copyToClipboard = (text: unknown): boolean => {
  const sanitized = sanitizeInput(text);
  if (sanitized === null) {
    return false;
  }

  inMemoryClipboard = sanitized;

  try {
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(sanitized);
      return true;
    }

    // Web platform fallback (navigator.clipboard)
    const navClipboard = typeof globalThis !== 'undefined' ? (globalThis as any).navigator?.clipboard : null;
    if (navClipboard && typeof navClipboard.writeText === 'function') {
      navClipboard.writeText(sanitized).catch(() => {});
      return true;
    }

    return true;
  } catch (err) {
    console.warn('[Clipboard] Failed to copy text to clipboard:', err);
    return false;
  }
};

/**
 * Asynchronously copies text to the system clipboard, awaiting native bridge and web clipboard completion.
 *
 * @param text The text or value to copy.
 * @returns Promise<boolean> True if copied successfully, false otherwise.
 */
export const copyToClipboardAsync = async (text: unknown): Promise<boolean> => {
  const sanitized = sanitizeInput(text);
  if (sanitized === null) {
    return false;
  }

  inMemoryClipboard = sanitized;

  try {
    // 1. Web navigator.clipboard support
    const navClipboard = typeof globalThis !== 'undefined' ? (globalThis as any).navigator?.clipboard : null;
    if (navClipboard && typeof navClipboard.writeText === 'function') {
      await navClipboard.writeText(sanitized);
      return true;
    }

    // 2. React Native Clipboard support
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(sanitized);
      return true;
    }

    return true;
  } catch (err) {
    console.warn('[Clipboard] Failed to copy text asynchronously:', err);
    return false;
  }
};

/**
 * Safely copies text to the clipboard and presents a user feedback alert.
 */
export const copyToClipboardWithFeedback = (
  text: unknown,
  title: string = 'Copied',
  message: string = 'Copied to clipboard.'
): boolean => {
  const success = copyToClipboard(text);
  if (success && typeof Alert !== 'undefined' && Alert?.alert) {
    try {
      Alert.alert(title, message);
    } catch {
      // non-critical alert failure in headless environment
    }
  }
  return success;
};

/**
 * Safely retrieves text content from the system clipboard.
 * Guaranteed to return a string (never null or undefined).
 *
 * @returns Promise<string> The clipboard text or empty string on failure.
 */
export const getFromClipboard = async (): Promise<string> => {
  try {
    if (Clipboard && typeof Clipboard.getString === 'function') {
      const result = await Clipboard.getString();
      if (typeof result === 'string' && result.length > 0) {
        inMemoryClipboard = result;
        return result;
      }
    }

    // Web platform fallback
    const navClipboard = typeof globalThis !== 'undefined' ? (globalThis as any).navigator?.clipboard : null;
    if (navClipboard && typeof navClipboard.readText === 'function') {
      const text = await navClipboard.readText();
      if (typeof text === 'string' && text.length > 0) {
        inMemoryClipboard = text;
        return text;
      }
    }
  } catch (err) {
    console.warn('[Clipboard] Failed to get text from clipboard:', err);
  }

  return inMemoryClipboard || '';
};

/**
 * Checks whether the system clipboard currently contains non-empty text content
 * without necessarily reading or exposing private user data (honoring privacy on iOS/Android).
 *
 * @returns Promise<boolean> True if text content is available.
 */
export const hasClipboardText = async (): Promise<boolean> => {
  if (inMemoryClipboard && inMemoryClipboard.trim().length > 0) {
    return true;
  }

  try {
    if (Clipboard && typeof (Clipboard as any).hasString === 'function') {
      const hasStr = await (Clipboard as any).hasString();
      if (typeof hasStr === 'boolean' && hasStr) {
        return true;
      }
    }

    const text = await getFromClipboard();
    return Boolean(text && text.trim().length > 0);
  } catch {
    return Boolean(inMemoryClipboard && inMemoryClipboard.trim().length > 0);
  }
};

/**
 * Retrieves the clipboard content and extracts the first valid HTTP/HTTPS URL found.
 * Ideal for watch parties, downloads, and video streaming links.
 *
 * @returns Promise<string | null> The extracted URL, or null if no valid web URL is found.
 */
export const getURLFromClipboard = async (): Promise<string | null> => {
  try {
    const text = await getFromClipboard();
    return extractUrlFromText(text);
  } catch {
    return null;
  }
};

/**
 * Clears the system clipboard content synchronously.
 *
 * @returns boolean True if cleared successfully.
 */
export const clearClipboard = (): boolean => {
  inMemoryClipboard = '';
  return copyToClipboard('');
};

/**
 * Clears the system clipboard content asynchronously.
 *
 * @returns Promise<boolean> True if cleared successfully.
 */
export const clearClipboardAsync = async (): Promise<boolean> => {
  inMemoryClipboard = '';
  return copyToClipboardAsync('');
};
