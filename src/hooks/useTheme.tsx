import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Appearance, ColorSchemeName, Platform, StatusBar, useColorScheme } from 'react-native';
import { darkTheme, lightTheme, ThemeColors } from '../theme';
import { settingsRepository } from '../database/repositories/SettingsRepository';
import { syncEventBus } from '../services/backup/SyncEventBus';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  changeTheme: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  isReady: boolean;
}

/**
 * Sanitizes and normalizes an unknown theme value into a valid ThemeMode.
 */
export function sanitizeThemeMode(raw: unknown): ThemeMode {
  if (typeof raw === 'string') {
    const clean = raw.trim().toLowerCase();
    if (clean === 'dark') return 'dark';
    if (clean === 'light') return 'light';
    if (clean === 'system') return 'system';
  }
  return 'system';
}

const defaultColors = darkTheme;

export const defaultThemeContext: ThemeContextType = {
  colors: defaultColors,
  isDark: true,
  themeMode: 'dark',
  changeTheme: async () => {},
  toggleTheme: async () => {},
  isReady: false,
};

const ThemeContext = createContext<ThemeContextType>(defaultThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hookScheme = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null | undefined>(() => {
    try {
      return Appearance.getColorScheme();
    } catch {
      return undefined;
    }
  });

  // Cold-start safe: default to 'system' so it dynamically follows OS without white flash
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');

  const [isReady, setIsReady] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Sync with native Appearance changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (isMountedRef.current) {
        setSystemScheme(colorScheme ?? undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Load and subscribe to persistent theme setting
  useEffect(() => {
    isMountedRef.current = true;

    const loadPersistedTheme = async () => {
      try {
        const val = await settingsRepository.get('theme', 'system');
        if (!isMountedRef.current) return;
        if (val) {
          setThemeMode(sanitizeThemeMode(val));
        }
        setIsReady(true);
      } catch (err) {
        console.warn('[ThemeProvider] Failed to load theme setting:', err);
        if (isMountedRef.current) {
          setIsReady(true);
        }
      }
    };

    loadPersistedTheme();

    const unsubRestore = syncEventBus.subscribeToRestore(() => {
      if (isMountedRef.current) {
        loadPersistedTheme();
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubRestore();
    };
  }, []);

  const effectiveSystem = systemScheme || hookScheme || 'light';
  const isDark = themeMode === 'system' ? effectiveSystem === 'dark' : themeMode === 'dark';
  const colors: ThemeColors = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  // Synchronize native StatusBar text brightness and Android background
  useEffect(() => {
    try {
      StatusBar.setBarStyle(colors.statusBar, true);
      if (Platform.OS === 'android') {
        (StatusBar as any).setBackgroundColor?.(colors.background, true);
      }
    } catch {
      // Ignored in non-native environments / unit tests
    }
  }, [colors.statusBar, colors.background]);

  const changeTheme = useCallback(async (mode: ThemeMode) => {
    const safeMode = sanitizeThemeMode(mode);
    setThemeMode(safeMode);
    try {
      await settingsRepository.set('theme', safeMode);
    } catch (err) {
      console.error('[ThemeProvider] Failed to persist theme preference:', err);
    }
  }, []);

  const toggleTheme = useCallback(async () => {
    await changeTheme(isDark ? 'light' : 'dark');
  }, [isDark, changeTheme]);

  const contextValue: ThemeContextType = useMemo(
    () => ({
      colors,
      isDark,
      themeMode,
      changeTheme,
      toggleTheme,
      isReady,
    }),
    [colors, isDark, themeMode, changeTheme, toggleTheme, isReady]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = (): ThemeContextType => useContext(ThemeContext);

export const useTheme = useAppTheme;

export default useAppTheme;
