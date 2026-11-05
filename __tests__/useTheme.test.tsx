import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  useAppTheme,
  useTheme,
  ThemeProvider,
  sanitizeThemeMode,
  ThemeContextType,
} from '../src/hooks/useTheme';
import DefaultUseTheme from '../src/hooks/useTheme';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { syncEventBus } from '../src/services/backup/SyncEventBus';
import { darkTheme, lightTheme } from '../src/theme';

describe('useTheme Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. sanitizeThemeMode helper', () => {
    it('should correctly sanitize valid theme strings', () => {
      expect(sanitizeThemeMode('dark')).toBe('dark');
      expect(sanitizeThemeMode('DARK')).toBe('dark');
      expect(sanitizeThemeMode('  dark  ')).toBe('dark');
      expect(sanitizeThemeMode('light')).toBe('light');
      expect(sanitizeThemeMode('LIGHT')).toBe('light');
      expect(sanitizeThemeMode('system')).toBe('system');
    });

    it('should fallback to system for invalid, empty, or non-string inputs', () => {
      expect(sanitizeThemeMode('')).toBe('system');
      expect(sanitizeThemeMode(null)).toBe('system');
      expect(sanitizeThemeMode(undefined)).toBe('system');
      expect(sanitizeThemeMode('custom-theme')).toBe('system');
      expect(sanitizeThemeMode(123)).toBe('system');
    });
  });

  describe('2. Hook Exports', () => {
    it('should export both useAppTheme, useTheme, and default identically', () => {
      expect(useAppTheme).toBeDefined();
      expect(useTheme).toBeDefined();
      expect(DefaultUseTheme).toBeDefined();
      expect(useAppTheme).toBe(useTheme);
      expect(useAppTheme).toBe(DefaultUseTheme);
    });

    it('should provide a safe fallback context when used outside ThemeProvider', () => {
      let theme: any = null;
      function NakedConsumer() {
        theme = useAppTheme();
        return null;
      }

      ReactTestRenderer.act(() => {
        ReactTestRenderer.create(<NakedConsumer />);
      });

      expect(theme).not.toBeNull();
      expect(theme?.colors).toBeDefined();
      expect(typeof theme?.changeTheme).toBe('function');
      expect(typeof theme?.toggleTheme).toBe('function');
    });
  });

  describe('3. ThemeProvider Context & Lifecycle', () => {
    let renderers: ReactTestRenderer.ReactTestRenderer[] = [];

    afterEach(() => {
      ReactTestRenderer.act(() => {
        renderers.forEach((r) => {
          try {
            r.unmount();
          } catch {}
        });
      });
      renderers = [];
    });

    it('should render children and provide loaded theme state', async () => {
      jest.spyOn(settingsRepository, 'get').mockResolvedValueOnce('dark');

      let themeResult: any = null;
      function Consumer() {
        themeResult = useAppTheme();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(
          <ThemeProvider>
            <Consumer />
          </ThemeProvider>
        );
        renderers.push(r);
        await Promise.resolve();
      });

      expect(themeResult).not.toBeNull();
      expect(themeResult?.isDark).toBe(true);
      expect(themeResult?.colors.background).toBe(darkTheme.background);
      expect(themeResult?.isReady).toBe(true);
    });

    it('should allow changing theme and persist to settingsRepository', async () => {
      jest.spyOn(settingsRepository, 'get').mockResolvedValueOnce('dark');
      const setSpy = jest.spyOn(settingsRepository, 'set').mockResolvedValueOnce();

      let themeResult: any = null;
      function Consumer() {
        themeResult = useAppTheme();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(
          <ThemeProvider>
            <Consumer />
          </ThemeProvider>
        );
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        await themeResult?.changeTheme('light');
      });

      expect(themeResult?.themeMode).toBe('light');
      expect(themeResult?.isDark).toBe(false);
      expect(themeResult?.colors.background).toBe(lightTheme.background);
      expect(setSpy).toHaveBeenCalledWith('theme', 'light');
    });

    it('should allow toggling theme between dark and light via toggleTheme', async () => {
      jest.spyOn(settingsRepository, 'get').mockResolvedValueOnce('dark');
      const setSpy = jest.spyOn(settingsRepository, 'set').mockResolvedValue();

      let themeResult: any = null;
      function Consumer() {
        themeResult = useAppTheme();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(
          <ThemeProvider>
            <Consumer />
          </ThemeProvider>
        );
        renderers.push(r);
        await Promise.resolve();
      });

      expect(themeResult?.isDark).toBe(true);

      // Toggle from dark to light
      await ReactTestRenderer.act(async () => {
        await themeResult?.toggleTheme();
      });

      expect(themeResult?.isDark).toBe(false);
      expect(setSpy).toHaveBeenCalledWith('theme', 'light');

      // Toggle from light to dark
      await ReactTestRenderer.act(async () => {
        await themeResult?.toggleTheme();
      });

      expect(themeResult?.isDark).toBe(true);
      expect(setSpy).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should refresh theme when syncEventBus notifies data restored', async () => {
      const getSpy = jest
        .spyOn(settingsRepository, 'get')
        .mockResolvedValueOnce('light')
        .mockResolvedValueOnce('dark');

      let themeResult: any = null;
      function Consumer() {
        themeResult = useAppTheme();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(
          <ThemeProvider>
            <Consumer />
          </ThemeProvider>
        );
        renderers.push(r);
        await Promise.resolve();
      });

      expect(themeResult?.themeMode).toBe('light');

      await ReactTestRenderer.act(async () => {
        syncEventBus.notifyDataRestored();
        await Promise.resolve();
      });

      expect(getSpy).toHaveBeenCalledWith('theme', 'system');
      expect(themeResult?.themeMode).toBe('dark');
      expect(themeResult?.isDark).toBe(true);
    });
  });
});
