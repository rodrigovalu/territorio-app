import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

const icon =
  (android: AndroidSymbol, ios: SFSymbol) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <SymbolView name={{ android, ios }} tintColor={color} size={size} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mute,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Mapa', tabBarIcon: icon('map', 'map') }} />
      <Tabs.Screen name="activities" options={{ title: 'Atividades', tabBarIcon: icon('history', 'clock') }} />
      <Tabs.Screen name="run" options={{ title: 'Correr', tabBarIcon: icon('directions_run', 'figure.run') }} />
      <Tabs.Screen name="medals" options={{ title: 'Medalhas', tabBarIcon: icon('military_tech', 'medal') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('person', 'person') }} />
    </Tabs>
  );
}
