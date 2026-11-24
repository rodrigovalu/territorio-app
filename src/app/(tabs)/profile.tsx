import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalLink } from '@/components/LegalModal';
import { Button, Sub, Title, styles as ui } from '@/components/ui';
import { deleteAccount, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disablePush, enablePush, isPushEnabled } from '@/lib/notifications';
import { clearLocalData } from '@/lib/tracking';
import { RUNNER_COLORS, colors } from '@/theme';

export default function Profile() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState(profile?.color ?? RUNNER_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [alertsOn, setAlertsOn] = useState(true);
  useEffect(() => {
    isPushEnabled().then(setAlertsOn);
  }, []);

  async function toggleAlerts(v: boolean) {
    setAlertsOn(v);
    try {
      if (v) {
        const ok = await enablePush(true);
        if (!ok) {
          setAlertsOn(false);
          Alert.alert('Notificações bloqueadas', 'Permita as notificações do Território nas configurações do Android.');
        }
      } else await disablePush();
    } catch (e) {
      Alert.alert('Erro', (e as Error).message);
    }
  }

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setColor(profile?.color ?? RUNNER_COLORS[0]);
  }, [profile]);

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
    await disablePush(false);
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

        <View style={{ marginTop: 28, gap: 10 }}>
          <Button title="Minhas corridas" variant="secondary" onPress={() => router.navigate('/activities')} />
          <Button title="Minhas medalhas" variant="secondary" onPress={() => router.navigate('/medals')} />
          <Button title="Ranking do mês" variant="secondary" onPress={() => router.push('/ranking')} />
          <Button title="Alertas de território" variant="secondary" onPress={() => router.push('/alerts')} />
          <View style={s.toggle}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15 }}>Avisar quando meu território estiver em perigo</Text>
              <Text style={{ color: colors.mute, fontSize: 12 }}>Notificação quando alguém chegar perto de tomar ou tomar um território seu</Text>
            </View>
            <Switch value={alertsOn} onValueChange={toggleAlerts} trackColor={{ true: colors.accent, false: colors.line }} thumbColor="#fff" />
          </View>
        </View>

        <View style={{ marginTop: 28, gap: 10 }}>
          <LegalLink label="Termos de Uso e Política de Privacidade" style={{ fontSize: 15, paddingVertical: 6 }} />
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  swatchOn: { borderWidth: 3, borderColor: '#fff' },
});
