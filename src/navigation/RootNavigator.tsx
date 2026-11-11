import React, { useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
  NavigatorScreenParams,
  Theme,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  BottomTabNavigator,
  MainTabParamList,
} from './BottomTabNavigator';
import { WorkspaceSelectScreen } from '../screens/WorkspaceSelectScreen';
import { MovieWorkspaceScreen } from '../screens/MovieWorkspaceScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { BatteryAlarmScreen } from '../screens/BatteryAlarmScreen';
import { CreateEditTaskScreen } from '../screens/CreateEditTaskScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { TeraBoxWorkspaceScreen } from '../screens/TeraBoxWorkspaceScreen';
import { useAppTheme } from '../hooks/useTheme';

export type { MainTabParamList };

export type RootStackParamList = {
  WorkspaceSelect: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  BatteryAlarm: undefined;
  ChatRoom: undefined;
  MovieWorkspace: undefined;
  TeraBoxWorkspace: undefined;
  TasksScreen: undefined;
  CreateEditTask:
    | {
        taskId?: string;
        initialTitle?: string;
        initialNotes?: string;
        initialDate?: string;
        initialStartTime?: string;
        initialEndTime?: string;
        initialCategoryId?: string;
      }
    | undefined;
};

export type RootStackNavigationProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  ...args: RouteName extends unknown
    ? undefined extends RootStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
      : [screen: RouteName, params: RootStackParamList[RouteName]]
    : never
): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate(...(args as [any, any]));
  }
}

export function resetRoot(name: keyof RootStackParamList = 'WorkspaceSelect'): void {
  if (navigationRef.isReady()) {
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name }],
    });
  }
}

export function goBack(): void {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'omnihub://workspace',
    'omnihub://workspace/',
    'omnihub://',
  ],
  config: {
    initialRouteName: 'WorkspaceSelect',
    screens: {
      WorkspaceSelect: 'select',
      MainTabs: {
        path: 'planner',
        screens: {
          Today: 'today',
          Notes: 'notes',
          Settings: 'settings',
        },
      },
      BatteryAlarm: 'battery',
      ChatRoom: 'chat',
      MovieWorkspace: 'movies',
      TeraBoxWorkspace: 'terabox',
      TasksScreen: 'tasks',
      CreateEditTask: {
        path: 'task/:taskId?',
      },
    },
  },
};

export interface RootNavigatorProps {
  initialRouteName?: keyof RootStackParamList;
  onReady?: () => void;
  onStateChange?: () => void;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC<RootNavigatorProps> = ({
  initialRouteName = 'WorkspaceSelect',
  onReady,
  onStateChange,
}) => {
  const { colors, isDark } = useAppTheme();

  const navigationTheme: Theme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.borderSubtle,
        notification: colors.secondary || colors.primary,
      },
    };
  }, [isDark, colors]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navigationTheme}
      onReady={onReady}
      onStateChange={onStateChange}
      fallback={
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      }
    >
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
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
        <Stack.Screen name="TeraBoxWorkspace" component={TeraBoxWorkspaceScreen} />
        <Stack.Screen name="TasksScreen" component={TasksScreen} />
        <Stack.Screen
          name="CreateEditTask"
          component={CreateEditTaskScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
