import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Linking,
} from 'react-native';
import notifee from '@notifee/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDatabase } from './src/database/connection';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';
import { batteryService } from './src/services/battery/BatteryService';
import { AlarmRingingModal } from './src/components/AlarmRingingModal';
import { ThemeProvider, useAppTheme } from './src/hooks/useTheme';
import { ErrorBoundary } from './src/components/ErrorBoundary';

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

      // 2. Initialize Android Notification Channels & Permissions in parallel
      await Promise.all([
        notificationService.initialize(),
        alarmService.initialize(),
        batteryService.initialize(),
      ]);

      // 3. Resolve default workspace, notification click, or direct shortcut deep link
      try {
        let deepLinkWs: string | null = null;

        // Check if app was opened via Notifee notification press (e.g. Battery Guard monitor or alarm trigger)
        const initialNotif =
          typeof notifee?.getInitialNotification === 'function'
            ? await notifee.getInitialNotification()
            : null;
        if (initialNotif?.notification?.data?.screen === 'BatteryAlarm') {
          deepLinkWs = 'battery';
        }

        const notifData = initialNotif?.notification?.data;
        const notifId = initialNotif?.notification?.id || '';
        if (
          initialNotif &&
          (notifData?.actionType === 'event_alarm' ||
            notifData?.actionType === 'habit_alarm' ||
            notifData?.actionType === 'task_alarm' ||
            notifId.startsWith('alarm_') ||
            notifId === 'active_ringing_alarm')
        ) {
          await alarmService.handleNotificationAction({
            type: 1, // EventType.PRESS
            detail: initialNotif as any,
          });
        }

        if (!deepLinkWs) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && initialUrl.includes('omnihub://workspace/')) {
            deepLinkWs =
              initialUrl
                .split('omnihub://workspace/')[1]
                ?.split('?')[0]
                ?.trim() || null;
          }
        }

        if (deepLinkWs) {
          if (deepLinkWs === 'planner') {
            setInitialRoute('MainTabs');
          } else if (deepLinkWs === 'battery') {
            setInitialRoute('BatteryAlarm');
          } else if (deepLinkWs === 'chat') {
            setInitialRoute('ChatRoom');
          } else if (deepLinkWs === 'movies') {
            setInitialRoute('MoviesScreen');
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

      // Render UI frame 1 immediately
      setReady(true);

      // In background: quietly restore scheduled alarms & pending reminders without stalling cold-start UI
      Promise.all([
        notificationService.restoreAllReminders(),
        alarmService.restoreAllHabitAlarms(),
        alarmService.restoreAllEventAlarms(),
      ]).catch((e) => console.warn('Background reminder restoration error:', e));
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
      <View
        style={[styles.centerContainer, { backgroundColor: colors.background }]}
      >
        <StatusBar barStyle={colors.statusBar} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Initialization Error
        </Text>
        <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
          {initError}
        </Text>
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
      <View
        style={[styles.centerContainer, { backgroundColor: colors.background }]}
      >
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
    <ErrorBoundary>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </ErrorBoundary>
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
