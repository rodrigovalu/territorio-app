import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalLink } from '@/components/LegalModal';
import { Button, styles as ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { HEX_AREA_KM2 } from '@/lib/grid';
import { colors } from '@/theme';

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[ui.screen, s.wrap]}>
      <View style={s.hero}>
        <Text style={s.brand}>
          TERRI<Text style={{ color: colors.accent }}>TÓRIO</Text>
        </Text>
        <Text style={s.tag}>Corra, some quilômetros e domine a sua região.</Text>
        <View style={s.points}>
          <Text style={s.point}>⬡  Territórios de {HEX_AREA_KM2} km² no mapa</Text>
          <Text style={s.point}>♛  Quem correr mais no mês é o dono</Text>
          <Text style={s.point}>↻  Todo dia 1º a disputa recomeça</Text>
        </View>
      </View>

      <View>
        <Button title="Entrar com Google" onPress={onLogin} loading={loading} />
        {error && <Text style={ui.error}>{error}</Text>}
        <Text style={s.legal}>
          Ao entrar você poderá ler e aceitar os{' '}
          <LegalLink label="Termos de Uso e a Política de Privacidade" />
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, justifyContent: 'space-between' },
  hero: { marginTop: 80 },
  brand: { color: colors.ink, fontSize: 48, fontWeight: '900', letterSpacing: 1 },
  tag: { color: colors.mute, fontSize: 17, marginTop: 8 },
  points: { marginTop: 36, gap: 14 },
  point: { color: colors.ink, fontSize: 16 },
  legal: { color: colors.mute, fontSize: 12.5, marginTop: 16, textAlign: 'center', lineHeight: 18 },
  link: { color: colors.accent },
});
