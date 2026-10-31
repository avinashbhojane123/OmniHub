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
  try {
    const data = event.detail?.notification?.data;
    const notifId = event.detail?.notification?.id || '';
    const pressId = event.detail?.pressAction?.id || '';

    const isAlarmAction =
      data?.actionType === 'habit_alarm' ||
      data?.actionType === 'event_alarm' ||
      data?.actionType === 'task_alarm' ||
      data?.actionType === 'battery_alarm' ||
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
  } catch (err) {
    console.warn('[Notifee] onBackgroundEvent error:', err);
  }
});

// Register foreground service runner to ensure Android foreground notifications work reliably
notifee.registerForegroundService((notification) => {
  return new Promise((resolve) => {
    if (notification?.id === 'battery_guard_monitor') {
      batteryService.initialize().catch(() => {});
      let unsub;
      unsub = batteryService.subscribeStatus((st) => {
        if (!st.isCharging) {
          if (unsub) unsub();
          else setTimeout(() => unsub?.(), 0);
          resolve();
        }
      });
      return;
    }

    if (
      notification?.id === 'active_ringing_alarm' ||
      notification?.id === 'active_battery_alarm' ||
      notification?.id?.startsWith('alarm_')
    ) {
      let unsubscribe;
      unsubscribe = alarmService.subscribe((state) => {
        if (!state.isRinging) {
          if (unsubscribe) unsubscribe();
          else setTimeout(() => unsubscribe?.(), 0);
          resolve();
        }
      });
      return;
    }

    // Default: resolve immediately for generic foreground tasks
    resolve();
  });
});

AppRegistry.registerComponent(appName, () => App);
if (appName !== 'LifePlanner') {
  AppRegistry.registerComponent('LifePlanner', () => App);
}
if (appName !== 'OmniHub') {
  AppRegistry.registerComponent('OmniHub', () => App);
}
