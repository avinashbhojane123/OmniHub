import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, StatusBar, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDatabase } from './src/database/connection';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';
import { batteryService } from './src/services/battery/BatteryService';
import { AlarmRingingModal } from './src/components/AlarmRingingModal';
import { ThemeProvider, useAppTheme } from './src/hooks/useTheme';
import { safeGuardStore } from './src/services/safeguard/SafeGuardStore';

function MainApp() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initialRoute, setInitialRoute] = useState<string>('WorkspaceSelect');
  const { colors } = useAppTheme();

  const bootstrap = useCallback(async () => {
    setInitError(null);
    setReady(false);
    try {
      // 1. Initialize SQLite Database & Migrations
      await getDatabase();

      // 2. Initialize Android Notification Channels & Permissions
      await notificationService.initialize();
      await alarmService.initialize();
      await batteryService.initialize();

      // 3. Restore all scheduled alarms & pending reminders (Reboot recovery & cold start)
      await notificationService.restoreAllReminders();
      await alarmService.restoreAllHabitAlarms();

      // 4. Resolve default workspace or direct shortcut deep link
      try {
        const initialUrl = await Linking.getInitialURL();
        let deepLinkWs: string | null = null;
        if (initialUrl && initialUrl.includes('omnihub://workspace/')) {
          deepLinkWs = initialUrl.split('omnihub://workspace/')[1]?.split('?')[0]?.trim() || null;
        }

        const currentRole = safeGuardStore.getRole();
        if (currentRole === 'CHILD') {
          setInitialRoute('SafeGuard');
        } else if (deepLinkWs) {
          if (deepLinkWs === 'planner') {
            setInitialRoute('MainTabs');
          } else if (deepLinkWs === 'chat') {
            setInitialRoute('Chat');
          } else if (deepLinkWs === 'battery') {
            setInitialRoute('BatteryAlarm');
          } else if (deepLinkWs === 'safeguard') {
            setInitialRoute('SafeGuard');
          } else {
            setInitialRoute('WorkspaceSelect');
          }
        } else {
          setInitialRoute('WorkspaceSelect');
        }
      } catch (wsErr) {
        console.warn('Failed to resolve startup workspace:', wsErr);
        setInitialRoute('WorkspaceSelect');
      }

      setReady(true);
    } catch (err: any) {
      console.error('App bootstrap error:', err);
      setInitError(err?.message || 'Database initialization failed.');
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (initError) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Initialization Error</Text>
        <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{initError}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={bootstrap}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Retry Startup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={colors.statusBar} />
      <RootNavigator initialRouteName={initialRoute} />
      <AlarmRingingModal />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
