import React from 'react';
import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabNavigator } from './BottomTabNavigator';
import { CreateEditTaskScreen } from '../screens/CreateEditTaskScreen';
import { WorkspaceSelectScreen } from '../screens/WorkspaceSelectScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { BatteryAlarmScreen } from '../screens/BatteryAlarmScreen';
import { SafeGuardScreen } from '../screens/safeguard/SafeGuardScreen';
import { safeGuardStore } from '../services/safeguard/SafeGuardStore';

const Stack = createNativeStackNavigator();

const linking: LinkingOptions<any> = {
  prefixes: ['omnihub://workspace', 'omnihub://workspace/'],
  config: {
    screens: {
      MainTabs: 'planner',
      Chat: 'chat',
      BatteryAlarm: 'battery',
      SafeGuard: 'safeguard',
      WorkspaceSelect: 'select',
    },
  },
  getStateFromPath: (path, options) => {
    if (safeGuardStore.getRole() === 'CHILD') {
      return {
        routes: [{ name: 'SafeGuard' }],
      };
    }
    return getStateFromPath(path, options);
  },
};

interface RootNavigatorProps {
  initialRouteName?: string;
}

export const RootNavigator: React.FC<RootNavigatorProps> = ({
  initialRouteName = 'WorkspaceSelect',
}) => {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="WorkspaceSelect" component={WorkspaceSelectScreen} />
        <Stack.Screen name="SafeGuard" component={SafeGuardScreen} />
        <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="BatteryAlarm" component={BatteryAlarmScreen} />
        <Stack.Screen
          name="CreateEditTask"
          component={CreateEditTaskScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
