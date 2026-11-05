import React, { useMemo } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabNavigationProp as NativeBottomTabNavigationProp,
  BottomTabScreenProps as NativeBottomTabScreenProps,
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';
import { KeepNotesScreen } from '../screens/KeepNotesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAppTheme } from '../hooks/useTheme';
import { FloatingTimerWidget } from '../components/FloatingTimerWidget';
import {
  TodayTabIcon,
  KeepNotesTabIcon,
  SettingsTabIcon,
} from '../components/TabIcons';

/**
 * Route parameter contract for BottomTabNavigator
 */
export type MainTabParamList = {
  Today: undefined;
  Notes: undefined;
  Settings: { showBack?: boolean } | undefined;
};

export type BottomTabNavigationProp<RouteName extends keyof MainTabParamList> =
  NativeBottomTabNavigationProp<MainTabParamList, RouteName>;

export type BottomTabScreenProps<RouteName extends keyof MainTabParamList> =
  NativeBottomTabScreenProps<MainTabParamList, RouteName>;

const Tab = createBottomTabNavigator<MainTabParamList>();

const renderTodayIcon = ({
  focused,
  color,
  size,
}: {
  focused: boolean;
  color: string;
  size: number;
}) => <TodayTabIcon focused={focused} color={color} size={size || 22} />;

const renderNotesIcon = ({
  focused,
  color,
  size,
}: {
  focused: boolean;
  color: string;
  size: number;
}) => <KeepNotesTabIcon focused={focused} color={color} size={size || 22} />;

const renderSettingsIcon = ({
  focused,
  color,
  size,
}: {
  focused: boolean;
  color: string;
  size: number;
}) => <SettingsTabIcon focused={focused} color={color} size={size || 22} />;

export const BottomTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  // Memoize screenOptions to prevent unnecessary tab re-renders
  const screenOptions: BottomTabNavigationOptions = useMemo(
    () => ({
      headerShown: false,
      lazy: true,
      freezeOnBlur: true,
      animation: 'fade',
      tabBarHideOnKeyboard: true,
      tabBarAllowFontScaling: false,
      tabBarRepeatedPressBehavior: {
        scrollToTop: true,
        popToTop: true,
      },
      sceneStyle: {
        backgroundColor: colors.background || '#121826',
      },
      tabBarStyle: {
        backgroundColor: colors.surface || '#1E293B',
        borderTopColor: colors.borderSubtle || 'rgba(255, 255, 255, 0.08)',
        borderTopWidth: 1,
        height: 58 + Math.max(insets.bottom, 10),
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 4,
      },
      tabBarItemStyle: {
        paddingVertical: 2,
      },
      tabBarActiveTintColor: colors.primary || '#FF6B00',
      tabBarInactiveTintColor: colors.textMuted || '#94A3B8',
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '700',
        marginTop: 2,
      },
    }),
    [colors, insets.bottom]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background || '#121826' }]}>
      <Tab.Navigator
        initialRouteName="Today"
        backBehavior="initialRoute"
        screenOptions={screenOptions}
        screenListeners={{
          tabPress: () => {
            // Dismiss keyboard when switching tabs to prevent input obstruction
            Keyboard.dismiss();
          },
        }}
      >
        <Tab.Screen
          name="Today"
          component={TodayScreen}
          options={{
            tabBarLabel: 'Today',
            tabBarAccessibilityLabel: 'Today, tab 1 of 3',
            tabBarButtonTestID: 'tab-button-today',
            tabBarIcon: renderTodayIcon,
          }}
        />
        <Tab.Screen
          name="Notes"
          component={KeepNotesScreen}
          options={{
            tabBarLabel: 'Notes',
            tabBarAccessibilityLabel: 'Notes, tab 2 of 3',
            tabBarButtonTestID: 'tab-button-notes',
            tabBarIcon: renderNotesIcon,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: 'Settings',
            tabBarAccessibilityLabel: 'Settings, tab 3 of 3',
            tabBarButtonTestID: 'tab-button-settings',
            tabBarIcon: renderSettingsIcon,
          }}
        />
      </Tab.Navigator>
      <FloatingTimerWidget />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
});

export default BottomTabNavigator;
