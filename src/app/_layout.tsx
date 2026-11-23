// Registra a tarefa de GPS antes de qualquer tela (precisa estar no escopo global)
import '@/lib/tracking';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { MedalCelebration } from '@/components/Medal';
import { recordVisit } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { celebrate } from '@/lib/celebrate';
import { TERMS_VERSION } from '@/lib/env';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.panel, primary: colors.accent, border: colors.line },
};

function Gate() {
  const { ready, session, profile } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const active = !!session && !!profile?.terms_accepted_at && profile.terms_version === TERMS_VERSION;

  // Registra o acesso do dia (medalhas de acessos semanais) ao abrir e ao voltar para o app
  useEffect(() => {
    if (!active) return;
    const visit = () => recordVisit().then(celebrate).catch(() => {});
    visit();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && visit());
    return () => sub.remove();
  }, [active]);

  if (!ready) return null;

  const signedIn = !!session;
  if (signedIn && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const consented = !!profile?.terms_accepted_at && profile.terms_version === TERMS_VERSION;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !consented}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && consented}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="territory/[id]"
          options={{ presentation: 'modal', headerShown: true, title: 'Território' }}
        />
        <Stack.Screen name="activity/[id]" options={{ headerShown: true, title: 'Corrida' }} />
        <Stack.Screen name="ranking" options={{ headerShown: true, title: 'Ranking do mês' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <AuthProvider>
        <Gate />
        <MedalCelebration />
      </AuthProvider>
    </ThemeProvider>
  );
}
