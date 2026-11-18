import { Ionicons } from '@expo/vector-icons';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Shell } from '@/components/layout/Shell';
import { PlayerProvider } from '@/features/player/PlayerProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function AppStack() {
  const { colors, scheme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Shell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        />
      </Shell>
    </View>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }),
  );
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium, Newsreader_400Regular, Newsreader_400Regular_Italic,
  });
  // If fonts fail (offline first launch), continue with system fonts rather than blocking.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#1E1F1B' }} />;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <PlayerProvider>
            <AppStack />
          </PlayerProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
