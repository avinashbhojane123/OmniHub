/* eslint-env jest */

// Mock @notifee/react-native
jest.mock('@notifee/react-native', () => {
  return {
    __esModule: true,
    default: {
      createChannel: jest.fn().mockResolvedValue('channel_id'),
      requestPermission: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
      onForegroundEvent: jest.fn(),
      onBackgroundEvent: jest.fn(),
      createTriggerNotification: jest.fn().mockResolvedValue('notification_id'),
      displayNotification: jest.fn().mockResolvedValue('notification_id'),
      cancelNotification: jest.fn().mockResolvedValue(undefined),
      cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
      getTriggerNotificationIds: jest.fn().mockResolvedValue([]),
      openBatteryOptimizationSettings: jest.fn().mockResolvedValue(undefined),
    },
    AndroidImportance: {
      HIGH: 4,
      DEFAULT: 3,
      LOW: 2,
    },
    AndroidVisibility: {
      PUBLIC: 1,
      PRIVATE: 0,
      SECRET: -1,
    },
    AndroidCategory: {
      ALARM: 'alarm',
      REMINDER: 'reminder',
      CALL: 'call',
      EMAIL: 'email',
      EVENT: 'event',
      MESSAGE: 'message',
      STATUS: 'status',
    },
    TriggerType: {
      TIMESTAMP: 0,
      INTERVAL: 1,
    },
    EventType: {
      DISMISSED: 0,
      PRESS: 1,
      ACTION_PRESS: 2,
      DELIVERED: 3,
    },
  };
});

// Mock @op-engineering/op-sqlite
jest.mock('@op-engineering/op-sqlite', () => {
  return {
    open: jest.fn(() => ({
      execute: jest.fn(() => ({ rows: { length: 0, item: () => null }, rowsAffected: 0 })),
      executeAsync: jest.fn(async () => ({ rows: { length: 0, item: () => null }, rowsAffected: 0 })),
      close: jest.fn(),
    })),
  };
});

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockWebView = React.forwardRef((props, ref) => {
    return React.createElement(View, { ...props, ref, testID: 'mock-webview' });
  });
  return {
    __esModule: true,
    default: MockWebView,
    WebView: MockWebView,
  };
});

