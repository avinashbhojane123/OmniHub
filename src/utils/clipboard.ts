import { Clipboard } from 'react-native';

/**
 * Safely copies string content to the system clipboard.
 * Gracefully catches deprecation warnings or unsupported platform environments.
 */
export const copyToClipboard = (text: string): boolean => {
  try {
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      return true;
    }
  } catch (err) {
    console.warn('[Clipboard] Failed to copy text to clipboard:', err);
  }
  return false;
};
