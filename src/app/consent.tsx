import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalText } from '@/components/LegalText';
import { Button, Sub, Title, styles as ui } from '@/components/ui';
import { acceptTerms } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function Consent() {
  const { refreshProfile, signOut, profile } = useAuth();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    setLoading(true);
    setError(null);
    try {
      await acceptTerms();
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <Title>Olá, {profile?.display_name?.split(' ')[0]}!</Title>
        <Sub>Antes de começar, leia como o Pace Hunter usa os seus dados.</Sub>

        <View style={s.box}>
          <Text style={s.boxTitle}>📍 Uso da localização</Text>
          <Text style={s.boxText}>
            O Pace Hunter coleta a sua localização apenas enquanto você grava uma corrida, inclusive com a
            tela apagada. Uma notificação fica visível o tempo todo durante a gravação. Fora das corridas, nenhuma
            localização é coletada.
          </Text>
        </View>

        <LegalText />
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={s.check}
          onPress={() => setChecked((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}>
          <View style={[s.box2, checked && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            {checked && <Text style={{ color: '#111', fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: colors.ink, flex: 1 }}>Li e aceito os Termos de Uso e a Política de Privacidade.</Text>
        </Pressable>
        <Button title="Aceitar e continuar" onPress={onAccept} disabled={!checked} loading={loading} />
        <Button title="Sair" variant="ghost" onPress={signOut} style={{ marginTop: 4 }} />
        {error && <Text style={ui.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  box: {
    backgroundColor: colors.panel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginVertical: 18,
  },
  boxTitle: { color: colors.ink, fontWeight: '700', fontSize: 15, marginBottom: 6 },
  boxText: { color: colors.ink, fontSize: 14.5, lineHeight: 21 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.panel },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  box2: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.mute,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
