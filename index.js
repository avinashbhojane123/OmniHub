/**
 * Life Planner - Local-First Android Productivity Application
 */

import { AppRegistry, LogBox } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { notificationService } from './src/services/notifications/NotificationService';
import { alarmService } from './src/services/alarm/AlarmService';
import { batteryService } from './src/services/battery/BatteryService';

// Suppress known benign LogBox overlays in development
if (__DEV__) {
  LogBox.ignoreLogs([
    'Non-serializable values were found in the navigation state',
  ]);
}

// Background event handler (Runs when app is killed or in background)
notifee.onBackgroundEvent(async (event) => {
  const data = event.detail?.notification?.data;
  const notifId = event.detail?.notification?.id || '';
  const pressId = event.detail?.pressAction?.id || '';

  const isAlarmAction =
    data?.actionType === 'habit_alarm' ||
    data?.actionType === 'event_alarm' ||
    data?.actionType === 'task_alarm' ||
    notifId.startsWith('alarm_') ||
    notifId === 'active_battery_alarm' ||
    notifId === 'active_ringing_alarm' ||
    pressId === 'stop_alarm' ||
    pressId === 'dismiss' ||
    pressId === 'snooze_alarm' ||
    pressId === 'done' ||
    pressId === 'snooze';

  if (isAlarmAction) {
    await alarmService.handleNotificationAction(event);
  } else {
    await notificationService.handleNotificationEvent(event);
  }
});

// Register foreground service runner to ensure Android foreground notifications work reliably
notifee.registerForegroundService((notification) => {
  return new Promise((resolve) => {
    if (notification?.id === 'battery_guard_monitor') {
      const unsub = batteryService.subscribeStatus((st) => {
        if (!st.isCharging) {
          unsub();
          resolve();
        }
      });
      return;
    }

    const unsubscribe = alarmService.subscribe((state) => {
      if (!state.isRinging) {
        unsubscribe();
        resolve();
      }
    });
  });
});

AppRegistry.registerComponent(appName, () => App);
