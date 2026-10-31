/* eslint-env jest */

// 1. Official React Native Safe Area Context mock
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

// 2. Mock @notifee/react-native (functional stubs, no fake mock data)
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn().mockResolvedValue(''),
    requestPermission: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
    getNotificationSettings: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
    isBatteryOptimizationEnabled: jest.fn().mockResolvedValue(false),
    openBatteryOptimizationSettings: jest.fn().mockResolvedValue(undefined),
    openAlarmPermissionSettings: jest.fn().mockResolvedValue(undefined),
    registerForegroundService: jest.fn(),
    stopForegroundService: jest.fn().mockResolvedValue(undefined),
    onForegroundEvent: jest.fn(),
    onBackgroundEvent: jest.fn(),
    createTriggerNotification: jest.fn().mockResolvedValue(''),
    displayNotification: jest.fn().mockResolvedValue(''),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
    cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
    getTriggerNotificationIds: jest.fn().mockResolvedValue([]),
    getDisplayedNotifications: jest.fn().mockResolvedValue([]),
    getInitialNotification: jest.fn().mockResolvedValue(null),
    getChannels: jest.fn().mockResolvedValue([]),
    deleteChannel: jest.fn().mockResolvedValue(undefined),
  },
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  AndroidCategory: { ALARM: 'alarm', REMINDER: 'reminder', CALL: 'call', EMAIL: 'email', EVENT: 'event', MESSAGE: 'message', STATUS: 'status' },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
}));

// 3. Mock @op-engineering/op-sqlite
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(() => ({ rows: { length: 0, item: () => null }, rowsAffected: 0 })),
    executeAsync: jest.fn(async () => ({ rows: { length: 0, item: () => null }, rowsAffected: 0 })),
    close: jest.fn(),
  })),
}));

// 4. Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockWebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      injectJavaScript: jest.fn(),
      postMessage: jest.fn(),
      reload: jest.fn(),
      stopLoading: jest.fn(),
    }));
    return React.createElement(View, props);
  });
  return {
    __esModule: true,
    default: MockWebView,
    WebView: MockWebView,
  };
});

// 5. Mock socket.io-client to avoid real network socket leaks
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
  };
  return {
    __esModule: true,
    io: jest.fn(() => mockSocket),
    default: jest.fn(() => mockSocket),
  };
});

