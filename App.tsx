import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDatabase } from './src/database/connection';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';
import { AlarmRingingModal } from './src/components/AlarmRingingModal';
import { ThemeProvider, useAppTheme } from './src/hooks/useTheme';

function MainApp() {
  const [ready, setReady] = useState(false);
  const { colors } = useAppTheme();

  useEffect(() => {
    async function bootstrap() {
      try {
        // 1. Initialize SQLite Database & Migrations
        await getDatabase();

        // 2. Initialize Android Notification Channels & Permissions
        await notificationService.initialize();
        await alarmService.initialize();

        // 3. Restore all scheduled alarms & pending reminders (Reboot recovery & cold start)
        await notificationService.restoreAllReminders();
        await alarmService.restoreAllHabitAlarms();
      } catch (err) {
        console.error('App bootstrap error:', err);
      } finally {
        setReady(true);
      }
    }

    bootstrap();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.statusBar} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={colors.statusBar} />
      <RootNavigator />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
