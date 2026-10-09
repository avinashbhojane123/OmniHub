import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, ThemeColors } from '../theme';
import { settingsRepository } from '../database/repositories/SettingsRepository';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  changeTheme: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: lightTheme,
  isDark: false,
  themeMode: 'light',
  changeTheme: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    settingsRepository.get('theme', 'light').then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemeMode(val as ThemeMode);
      }
    });
  }, []);

  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const colors: ThemeColors = isDark ? darkTheme : lightTheme;

  const changeTheme = async (mode: ThemeMode) => {
    setThemeMode(mode);
    await settingsRepository.set('theme', mode);
  };

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
