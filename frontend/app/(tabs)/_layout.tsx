import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { MiniPlayer } from '@/features/player/MiniPlayer';

import { BottomTabBar, NAV_ITEMS, Sidebar } from '@/components/layout/Navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';

/**
 * Phones get a bottom tab bar; desktop-width windows get a persistent sidebar with a wider
 * content area. Same routes, same state — only the chrome changes.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { isDesktop } = useLayout();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
      tabBar={({ state, navigateToTab }) => {
        const activeName = state.routes[state.index]?.name ?? 'index';
        const onNavigate = (name: string) => {
          const route = state.routes.find((r) => r.name === name);
          if (route) navigateToTab(route.key);
        };
        return isDesktop ? (
          <Sidebar activeName={activeName} onNavigate={onNavigate} footer={<MiniPlayer variant="sidebar" />} />
        ) : (
          <View>
            <MiniPlayer />
            <BottomTabBar activeName={activeName} onNavigate={onNavigate} />
          </View>
        );
      }}
    >
      {NAV_ITEMS.map((item) => (
        <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
      ))}
    </Tabs>
  );
}
