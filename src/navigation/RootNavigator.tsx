import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabNavigator } from './BottomTabNavigator';
import { WorkspaceSelectScreen } from '../screens/WorkspaceSelectScreen';
import { MovieWorkspaceScreen } from '../screens/MovieWorkspaceScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { BatteryAlarmScreen } from '../screens/BatteryAlarmScreen';
import { CreateEditTaskScreen } from '../screens/CreateEditTaskScreen';
import { TasksScreen } from '../screens/TasksScreen';

const Stack = createNativeStackNavigator();

const linking: LinkingOptions<any> = {
  prefixes: ['omnihub://workspace', 'omnihub://workspace/'],
  config: {
    screens: {
      MainTabs: 'planner',
      BatteryAlarm: 'battery',
      ChatRoom: 'chat',
      MovieWorkspace: 'movies',
      WorkspaceSelect: 'select',
    },
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
        <Stack.Screen
          name="WorkspaceSelect"
          component={WorkspaceSelectScreen}
        />
        <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
        <Stack.Screen name="BatteryAlarm" component={BatteryAlarmScreen} />
        <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
        <Stack.Screen name="MovieWorkspace" component={MovieWorkspaceScreen} />
        <Stack.Screen name="TasksScreen" component={TasksScreen} />
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

export default RootNavigator;

