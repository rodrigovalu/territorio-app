import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Sub, Title, styles as ui } from '@/components/ui';
import { deleteAccount, getMyRuns, updateProfile, type RunRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDuration, fmtKm } from '@/lib/format';
import { clearLocalData } from '@/lib/tracking';
import { RUNNER_COLORS, colors } from '@/theme';

export default function Profile() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState(profile?.color ?? RUNNER_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setColor(profile?.color ?? RUNNER_COLORS[0]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      getMyRuns().then(setRuns).catch(() => {});
    }, []),
  );

  const dirty = name.trim() !== profile?.display_name || color !== profile?.color;

  async function onSave() {
    const n = name.trim();
    if (n.length < 2 || n.length > 30) {
      setMsg('O nome precisa ter entre 2 e 30 caracteres.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await updateProfile({ display_name: n, color });
      await refreshProfile();
      setMsg('Perfil atualizado.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await clearLocalData();
    await signOut();
  }

  function onDelete() {
    Alert.alert(
      'Excluir conta?',
      'Sua conta, todas as corridas e os km nos territórios serão apagados para sempre. Não dá para desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir tudo',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              await clearLocalData();
              try {
                await GoogleSignin.revokeAccess();
              } catch {
                // ignora
              }
              await signOut();
            } catch (e) {
              Alert.alert('Erro', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  const monthKm = runs
    .filter((r) => new Date(r.started_at).getMonth() === new Date().getMonth())
    .reduce((a, r) => a + r.distance_km, 0);

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.avatar, { borderColor: color }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: color, borderColor: color }]} />
          )}
          <View style={{ flex: 1 }}>
            <Title>{profile?.display_name}</Title>
            <Sub>{session?.user.email}</Sub>
          </View>
        </View>

        <Text style={s.label}>Nome exibido no ranking</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={30}
          style={s.input}
          placeholderTextColor={colors.mute}
          autoCapitalize="words"
        />

        <Text style={s.label}>Sua cor no mapa</Text>
        <View style={s.colors}>
          {RUNNER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityLabel={`Cor ${c}`}
              style={[s.swatch, { backgroundColor: c }, c === color && s.swatchOn]}
            />
          ))}
        </View>
        <Button title="Salvar" onPress={onSave} loading={saving} disabled={!dirty} />
        {msg && <Text style={[ui.sub, { marginTop: 8 }]}>{msg}</Text>}

        <Text style={[s.label, { marginTop: 28 }]}>Minhas corridas · {fmtKm(monthKm)} km neste mês</Text>
        {runs.length === 0 && <Text style={ui.sub}>Nenhuma corrida ainda.</Text>}
        {runs.map((r) => (
          <View key={r.id} style={ui.row}>
            <View style={{ flex: 1 }}>
              <Text style={ui.rowText}>{fmtDate(r.started_at)}</Text>
              <Text style={ui.rowSmall}>{fmtDuration(r.moving_seconds)}</Text>
            </View>
            <Text style={ui.rowValue}>{fmtKm(r.distance_km, 2)} km</Text>
          </View>
        ))}

        <View style={{ marginTop: 28, gap: 10 }}>
          <Link href="/legal" style={{ color: colors.accent, fontSize: 15, paddingVertical: 6 }}>
            Termos de Uso e Política de Privacidade
          </Link>
          <Button title="Sair" variant="secondary" onPress={onLogout} />
          <Button title="Excluir minha conta" variant="danger" onPress={onDelete} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3 },
  label: { color: colors.mute, fontSize: 13, marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.panel,
    color: colors.ink,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchOn: { borderWidth: 3, borderColor: '#fff' },
});
