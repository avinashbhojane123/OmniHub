import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { KeepNotesScreen } from '../screens/KeepNotesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAppTheme } from '../hooks/useTheme';
import {
  TodayTabIcon,
  TasksTabIcon,
  KeepNotesTabIcon,
  SettingsTabIcon,
} from '../components/TabIcons';

const Tab = createBottomTabNavigator();

const renderTodayIcon = ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
  <TodayTabIcon focused={focused} color={color} size={size || 22} />
);

const renderTasksIcon = ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
  <TasksTabIcon focused={focused} color={color} size={size || 22} />
);

const renderNotesIcon = ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
  <KeepNotesTabIcon focused={focused} color={color} size={size || 22} />
);

const renderSettingsIcon = ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
  <SettingsTabIcon focused={focused} color={color} size={size || 22} />
);

export const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
          height: 58 + Math.max(insets.bottom, 12),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarLabel: 'Today',
          tabBarIcon: renderTodayIcon,
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarLabel: 'Tasks',
          tabBarIcon: renderTasksIcon,
        }}
      />
      <Tab.Screen
        name="Notes"
        component={KeepNotesScreen}
        options={{
          tabBarLabel: 'Notes',
          tabBarIcon: renderNotesIcon,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: renderSettingsIcon,
        }}
      />
    </Tab.Navigator>
  );
};
