import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

type Icon = { ios: 'map' | 'figure.run' | 'trophy' | 'person'; android: 'map' | 'directions_run' | 'leaderboard' | 'person' };

const icon =
  (name: Icon) =>
  ({ color, size }: { color: ColorValue; size: number }) => <SymbolView name={name} tintColor={color} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mute,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Mapa', tabBarIcon: icon({ ios: 'map', android: 'map' }) }} />
      <Tabs.Screen
        name="run"
        options={{ title: 'Correr', tabBarIcon: icon({ ios: 'figure.run', android: 'directions_run' }) }}
      />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'Ranking', tabBarIcon: icon({ ios: 'trophy', android: 'leaderboard' }) }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon({ ios: 'person', android: 'person' }) }} />
    </Tabs>
  );
}
