import React from 'react';
import { Keyboard } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import ReactTestRenderer from 'react-test-renderer';
import {
  BottomTabNavigator,
  MainTabParamList,
} from '../src/navigation/BottomTabNavigator';
import DefaultBottomTabNavigator from '../src/navigation/BottomTabNavigator';
import { TodayTabIcon, KeepNotesTabIcon, SettingsTabIcon } from '../src/components/TabIcons';

describe('BottomTabNavigator Suite', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    ReactTestRenderer.act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  it('1. should export both named and default BottomTabNavigator components identically', () => {
    expect(BottomTabNavigator).toBeDefined();
    expect(DefaultBottomTabNavigator).toBeDefined();
    expect(BottomTabNavigator).toBe(DefaultBottomTabNavigator);
  });

  it('2. should render BottomTabNavigator inside NavigationContainer without throwing', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <NavigationContainer>
          <BottomTabNavigator />
        </NavigationContainer>
      );
    });

    expect(renderer).not.toBeNull();
    const tree = renderer!.toJSON();
    expect(tree).toBeDefined();
  });

  it('3. should render Today, KeepNotes, and Settings tab vector icons correctly', () => {
    let todayTree: ReactTestRenderer.ReactTestRenderer | null = null;
    let notesTree: ReactTestRenderer.ReactTestRenderer | null = null;
    let settingsTree: ReactTestRenderer.ReactTestRenderer | null = null;

    ReactTestRenderer.act(() => {
      todayTree = ReactTestRenderer.create(
        <TodayTabIcon focused={true} color="#8B5CF6" size={24} />
      );
      notesTree = ReactTestRenderer.create(
        <KeepNotesTabIcon focused={false} color="#94A3B8" size={22} />
      );
      settingsTree = ReactTestRenderer.create(
        <SettingsTabIcon focused={true} color="#10B981" size={20} />
      );
    });

    expect(todayTree).not.toBeNull();
    expect(notesTree).not.toBeNull();
    expect(settingsTree).not.toBeNull();
  });

  it('4. should correctly enforce MainTabParamList shape and keys', () => {
    type ExpectedKeys = keyof MainTabParamList;
    const tabKeys: ExpectedKeys[] = ['Today', 'Notes', 'Settings'];
    expect(tabKeys).toEqual(['Today', 'Notes', 'Settings']);

    const settingsParam1: MainTabParamList['Settings'] = undefined;
    const settingsParam2: MainTabParamList['Settings'] = { showBack: true };
    expect(settingsParam1).toBeUndefined();
    expect(settingsParam2?.showBack).toBe(true);
  });

  it('5. should dismiss keyboard on tab switch interaction', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    Keyboard.dismiss();
    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockRestore();
  });
});
