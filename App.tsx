import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Linking,
} from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDatabase } from './src/database/connection';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';
import { batteryService } from './src/services/battery/BatteryService';
import { AlarmRingingModal } from './src/components/AlarmRingingModal';
import { ThemeProvider, useAppTheme } from './src/hooks/useTheme';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { settingsRepository } from './src/database/repositories/SettingsRepository';
import { googleSheetsSyncService } from './src/services/backup/GoogleSheetsSyncService';
import { taskBackendSyncService } from './src/services/tasks/TaskBackendSyncService';
import { FocusTimerProvider } from './src/context/FocusTimerContext';

type StartupWorkspaceRoute =
  | 'WorkspaceSelect'
  | 'MainTabs'
  | 'BatteryAlarm'
  | 'ChatRoom'
  | 'MovieWorkspace';

function MainApp() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initialRoute, setInitialRoute] = useState<StartupWorkspaceRoute>('WorkspaceSelect');
  const { colors } = useAppTheme();
  const isMountedRef = useRef(true);

  const bootstrap = useCallback(async () => {
    if (!isMountedRef.current) return;
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
            type: EventType.PRESS,
            detail: {
              notification: initialNotif.notification,
              pressAction: initialNotif.pressAction,
            },
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

        if (!deepLinkWs) {
          // Check saved default workspace setting on cold start
          const savedDefault = await settingsRepository.get('default_workspace');
          if (savedDefault && savedDefault !== 'select') {
            deepLinkWs = savedDefault;
          }
        }

        if (isMountedRef.current) {
          if (deepLinkWs === 'planner') {
            setInitialRoute('MainTabs');
          } else if (deepLinkWs === 'battery') {
            setInitialRoute('BatteryAlarm');
          } else if (deepLinkWs === 'chat') {
            setInitialRoute('ChatRoom');
          } else if (deepLinkWs === 'movies') {
            setInitialRoute('MovieWorkspace');
          } else {
            setInitialRoute('WorkspaceSelect');
          }
        }
      } catch (wsErr) {
        console.warn('Failed to resolve startup workspace:', wsErr);
        if (isMountedRef.current) {
          setInitialRoute('WorkspaceSelect');
        }
      }

      // Render UI immediately
      if (isMountedRef.current) {
        setReady(true);
      }

      // In background: quietly restore scheduled alarms, pending reminders, & cloud state without stalling cold-start UI
      Promise.all([
        notificationService.restoreAllReminders(),
        googleSheetsSyncService.autoRestoreIfEmptyOnStartup(),
        taskBackendSyncService.syncWithBackend(),
      ]).catch((e) => console.warn('Background reminder restoration error:', e));
    } catch (err: any) {
      console.error('App bootstrap error:', err);
      if (isMountedRef.current) {
        setInitError(err?.message || 'Database initialization failed.');
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    bootstrap();
    return () => {
      isMountedRef.current = false;
    };
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
    <>
      <StatusBar barStyle={colors.statusBar} />
      <RootNavigator initialRouteName={initialRoute} />
      <AlarmRingingModal />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
        <ThemeProvider>
          <FocusTimerProvider>
            <MainApp />
          </FocusTimerProvider>
        </ThemeProvider>
      </SafeAreaProvider>
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
