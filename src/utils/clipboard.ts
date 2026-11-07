import { Alert, Clipboard } from 'react-native';

let inMemoryClipboard = '';

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

export function extractUrlFromText(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^\s<>]+[^\s<>.,!?:;)}\]]/i);
  return match ? match[0] : null;
}

export const copyToClipboard = (text: unknown): boolean => {
  const sanitized = sanitizeInput(text);
  if (sanitized === null) return false;
  inMemoryClipboard = sanitized;
  try {
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(sanitized);
    }
    return true;
  } catch {
    return false;
  }
};

export const copyToClipboardAsync = async (text: unknown): Promise<boolean> => {
  return copyToClipboard(text);
};

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
      // headless fallback
    }
  }
  return success;
};

export const getFromClipboard = async (): Promise<string> => {
  try {
    if (Clipboard && typeof Clipboard.getString === 'function') {
      const result = await Clipboard.getString();
      if (typeof result === 'string' && result.length > 0) {
        inMemoryClipboard = result;
        return result;
      }
    }
  } catch {
    // fallback
  }
  return inMemoryClipboard || '';
};

export const hasClipboardText = async (): Promise<boolean> => {
  if (inMemoryClipboard && inMemoryClipboard.trim().length > 0) {
    return true;
  }
  try {
    if (Clipboard && typeof (Clipboard as any).hasString === 'function') {
      const hasStr = await (Clipboard as any).hasString();
      if (typeof hasStr === 'boolean' && hasStr) return true;
    }
    const text = await getFromClipboard();
    return Boolean(text && text.trim().length > 0);
  } catch {
    return Boolean(inMemoryClipboard && inMemoryClipboard.trim().length > 0);
  }
};

export const getURLFromClipboard = async (): Promise<string | null> => {
  const text = await getFromClipboard();
  return extractUrlFromText(text);
};

export const clearClipboard = (): boolean => {
  inMemoryClipboard = '';
  return copyToClipboard('');
};

export const clearClipboardAsync = async (): Promise<boolean> => {
  inMemoryClipboard = '';
  return copyToClipboardAsync('');
};
