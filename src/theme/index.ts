export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryMuted: string;
  secondary: string;
  brandDark: string;
  reminderBanner: string;
  bellOrange: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHighlight: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  priorityLow: string;
  priorityMedium: string;
  priorityHigh: string;
  eventTask: string;
  eventHabit: string;
  overlay: string;
  statusBar: 'light-content' | 'dark-content';
}

export const darkTheme: ThemeColors = {
  primary: '#FF6B00',
  primaryLight: '#FF8A3D',
  primaryDark: '#E05A00',
  primaryMuted: 'rgba(255, 107, 0, 0.18)',
  secondary: '#EC4899',
  brandDark: '#FF6B00',
  reminderBanner: '#2A1F18',
  bellOrange: '#FF7A00',
  background: '#121826',
  surface: '#1E293B',
  surfaceElevated: '#283548',
  surfaceHighlight: 'rgba(255, 255, 255, 0.08)',
  card: '#1E293B',
  cardBorder: 'rgba(255, 255, 255, 0.12)',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1', // High contrast for IPS LCD
  textMuted: '#94A3B8',
  border: '#334155',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  success: '#FF6B00',
  successBg: 'rgba(255, 107, 0, 0.18)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerBg: 'rgba(239, 68, 68, 0.15)',
  info: '#3B82F6',
  infoBg: 'rgba(59, 130, 246, 0.15)',
  priorityLow: '#10B981',
  priorityMedium: '#F59E0B',
  priorityHigh: '#EF4444',
  eventTask: '#3B82F6',
  eventHabit: '#FF6B00',
  overlay: 'rgba(0, 0, 0, 0.7)',
  statusBar: 'light-content',
};

export const lightTheme: ThemeColors = {
  primary: '#FF6B00', // Vivid warm orange
  primaryLight: '#FF8A3D',
  primaryDark: '#E05A00',
  primaryMuted: 'rgba(255, 107, 0, 0.12)',
  secondary: '#362112', // Rich espresso brown
  brandDark: '#362112',
  reminderBanner: '#FFE5D4', // Soft peach
  bellOrange: '#FF7A00',
  background: '#FBF7F4', // Warm soft cream
  surface: '#FFFFFF',
  surfaceElevated: '#F7F2EC',
  surfaceHighlight: 'rgba(0, 0, 0, 0.03)',
  card: '#FFFFFF',
  cardBorder: '#F0EBE5',
  text: '#1E1F24', // Dark crisp text
  textSecondary: '#6B6D76',
  textMuted: '#A2A4B0',
  border: '#EBE5DF',
  borderSubtle: '#F3EFEA',
  success: '#FF6B00', // Matching the orange checkmarks in Image 1
  successBg: 'rgba(255, 107, 0, 0.12)',
  warning: '#D97706',
  warningBg: 'rgba(217, 119, 6, 0.1)',
  danger: '#DC2626',
  dangerBg: 'rgba(220, 38, 38, 0.1)',
  info: '#2563EB',
  infoBg: 'rgba(37, 99, 235, 0.1)',
  priorityLow: '#059669',
  priorityMedium: '#D97706',
  priorityHigh: '#DC2626',
  eventTask: '#2563EB',
  eventHabit: '#FF6B00',
  overlay: 'rgba(0, 0, 0, 0.5)',
  statusBar: 'dark-content',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const typography = {
  headerLarge: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  headerMedium: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  headerSmall: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  bodyBold: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  micro: {
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
};
