/**
 * Life Planner - Local-First Android Productivity Application
 */

import { AppRegistry, LogBox } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';

// Suppress known benign LogBox overlays in development
if (__DEV__) {
  LogBox.ignoreLogs([
    'Non-serializable values were found in the navigation state',
  ]);
}

// Background event handler (Runs when app is killed or in background)
notifee.onBackgroundEvent(async (event) => {
  const isHabitAlarm = event.detail?.notification?.data?.actionType === 'habit_alarm';
  if (isHabitAlarm) {
    await alarmService.handleNotificationAction(event);
  } else {
    await notificationService.handleNotificationEvent(event);
  }
});

// Register foreground service runner to ensure Android foreground notifications work reliably
notifee.registerForegroundService(() => {
  return new Promise((resolve) => {
    const unsubscribe = alarmService.subscribe((state) => {
      if (!state.isRinging) {
        unsubscribe();
        resolve();
      }
    });
  });
});

AppRegistry.registerComponent(appName, () => App);
