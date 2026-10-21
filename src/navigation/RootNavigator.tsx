import React, { Suspense, lazy } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabNavigator } from './BottomTabNavigator';
import { WorkspaceSelectScreen } from '../screens/WorkspaceSelectScreen';

// Lazy-loaded auxiliary workspace screens
const LazyMovieWorkspace = lazy(() =>
  import('../screens/MovieWorkspaceScreen').then((m) => ({ default: m.MovieWorkspaceScreen }))
);
const LazyChatRoom = lazy(() =>
  import('../screens/ChatRoomScreen').then((m) => ({ default: m.ChatRoomScreen }))
);
const LazyBatteryAlarm = lazy(() =>
  import('../screens/BatteryAlarmScreen').then((m) => ({ default: m.BatteryAlarmScreen }))
);
const LazyCreateEditTask = lazy(() =>
  import('../screens/CreateEditTaskScreen').then((m) => ({ default: m.CreateEditTaskScreen }))
);

const ScreenFallback = () => (
  <View style={{ flex: 1, backgroundColor: '#090B10', justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" color="#38BDF8" />
  </View>
);

const MovieWorkspaceWrapper = (props: any) => (
  <Suspense fallback={<ScreenFallback />}>
    <LazyMovieWorkspace {...props} />
  </Suspense>
);

const ChatRoomWrapper = (props: any) => (
  <Suspense fallback={<ScreenFallback />}>
    <LazyChatRoom {...props} />
  </Suspense>
);

const BatteryAlarmWrapper = (props: any) => (
  <Suspense fallback={<ScreenFallback />}>
    <LazyBatteryAlarm {...props} />
  </Suspense>
);

const CreateEditTaskWrapper = (props: any) => (
  <Suspense fallback={<ScreenFallback />}>
    <LazyCreateEditTask {...props} />
  </Suspense>
);

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
        <Stack.Screen name="BatteryAlarm" component={BatteryAlarmWrapper} />
        <Stack.Screen name="ChatRoom" component={ChatRoomWrapper} />
        <Stack.Screen name="MovieWorkspace" component={MovieWorkspaceWrapper} />
        <Stack.Screen
          name="CreateEditTask"
          component={CreateEditTaskWrapper}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

