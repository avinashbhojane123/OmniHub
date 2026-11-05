import {
  linking,
  navigationRef,
  navigate,
  resetRoot,
  goBack,
  RootStackParamList,
} from '../src/navigation/RootNavigator';

describe('RootNavigator & Deep Linking Configuration Suite', () => {
  it('1. should define all valid URL prefixes for Android intents and universal links', () => {
    expect(linking.prefixes).toBeDefined();
    expect(linking.prefixes).toContain('omnihub://workspace');
    expect(linking.prefixes).toContain('omnihub://workspace/');
    expect(linking.prefixes).toContain('omnihub://');
  });

  it('2. should configure deep link route mappings for all workspaces and screens', () => {
    expect(linking.config?.initialRouteName).toBe('WorkspaceSelect');
    const screens = linking.config?.screens as any;
    expect(screens).toBeDefined();
    expect(screens.WorkspaceSelect).toBe('select');
    expect(screens.BatteryAlarm).toBe('battery');
    expect(screens.ChatRoom).toBe('chat');
    expect(screens.MovieWorkspace).toBe('movies');
    expect(screens.TasksScreen).toBe('tasks');
  });

  it('3. should support nested tab navigation deep linking inside MainTabs', () => {
    const screens = linking.config?.screens as any;
    expect(screens.MainTabs).toBeDefined();
    expect(typeof screens.MainTabs).toBe('object');
    expect(screens.MainTabs.path).toBe('planner');
    expect(screens.MainTabs.screens).toBeDefined();
    expect(screens.MainTabs.screens.Today).toBe('today');
    expect(screens.MainTabs.screens.Notes).toBe('notes');
    expect(screens.MainTabs.screens.Settings).toBe('settings');
  });

  it('4. should support task deep linking with optional taskId param', () => {
    const screens = linking.config?.screens as any;
    expect(screens.CreateEditTask).toBeDefined();
    expect(typeof screens.CreateEditTask).toBe('object');
    expect(screens.CreateEditTask.path).toBe('task/:taskId?');
  });

  it('5. should expose a valid navigationRef and navigation dispatch helpers', () => {
    expect(navigationRef).toBeDefined();
    expect(typeof navigationRef.isReady).toBe('function');
    expect(typeof navigate).toBe('function');
    expect(typeof resetRoot).toBe('function');
    expect(typeof goBack).toBe('function');

    // Calling navigate/resetRoot/goBack when not ready should safely no-op without crashing
    expect(() => {
      navigate('WorkspaceSelect');
      resetRoot('WorkspaceSelect');
      goBack();
    }).not.toThrow();
  });
});


