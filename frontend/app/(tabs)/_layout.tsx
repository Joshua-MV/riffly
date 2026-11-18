import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { BottomTabBar, NAV_ITEMS } from '@/components/layout/Navigation';
import { Transport } from '@/features/player/Transport';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints } from '@/theme/tokens';
import { useLayout } from '@/theme/useLayout';

/**
 * Wide windows: the rail and transport live in the app shell, so the tab bar is hidden.
 * Phones: a five-tab bottom bar with the transport floating above it.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { width } = useLayout();
  const wide = width >= breakpoints.desktop;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, animation: 'fade' }}
      tabBar={({ state, navigateToTab }) => {
        if (wide) return null;
        const activeName = state.routes[state.index]?.name ?? 'index';
        const onNavigate = (name: string) => {
          const route = state.routes.find((r) => r.name === name);
          if (route) navigateToTab(route.key);
        };
        return (
          <View>
            <Transport />
            <BottomTabBar activeName={activeName} onNavigate={onNavigate} />
          </View>
        );
      }}
    >
      {NAV_ITEMS.map((item) => (
        <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
      ))}
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="analyze" options={{ title: 'Import' }} />
    </Tabs>
  );
}
