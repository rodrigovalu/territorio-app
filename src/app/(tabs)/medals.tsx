import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MedalIcon, TIER_COLORS } from '@/components/Medal';
import { Sub, Title, styles as ui } from '@/components/ui';
import { getMyAchievements, type MedalProgress } from '@/lib/api';
import { fmtDuration, fmtKm } from '@/lib/format';
import { colors } from '@/theme';

const GROUPS: { title: string; categories: string[] }[] = [
  { title: 'Distância numa corrida', categories: ['run_distance'] },
  { title: 'Constância', categories: ['run_count', 'total_km'] },
  { title: 'Acessos semanais', categories: ['weekly_days', 'weekly_streak'] },
  { title: 'Velocidade e subida', categories: ['time_5k', 'time_10k', 'elevation'] },
  { title: 'Territórios', categories: ['territory'] },
];

function progressText(m: MedalProgress) {
  const v = m.value;
  switch (m.category) {
    case 'run_distance':
      return `maior corrida: ${fmtKm(v ?? 0, 2)} de ${fmtKm(m.threshold, 1)} km`;
    case 'total_km':
      return `${fmtKm(v ?? 0)} de ${fmtKm(m.threshold, 0)} km`;
    case 'run_count':
      return `${v ?? 0} de ${m.threshold} corridas`;
    case 'weekly_days':
      return `melhor semana: ${v ?? 0} de ${m.threshold} dias`;
    case 'weekly_streak':
      return `melhor sequência: ${v ?? 0} de ${m.threshold} semanas`;
    case 'territory':
      return `agora: ${v ?? 0} de ${m.threshold}`;
    case 'time_5k':
    case 'time_10k':
      return v == null ? 'ainda sem tempo nessa distância' : `seu melhor: ${fmtDuration(v)} (meta ${fmtDuration(m.threshold)})`;
    case 'elevation':
      return `maior subida: ${v ?? 0} de ${m.threshold} m`;
    default:
      return '';
  }
}

function progressRatio(m: MedalProgress) {
  if (m.earned_at) return 1;
  if (m.value == null) return 0;
  if (m.lower_is_better) return Math.max(0, Math.min(0.99, m.threshold / m.value));
  return Math.max(0, Math.min(0.99, m.value / m.threshold));
}

export default function Medals() {
  const [items, setItems] = useState<MedalProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getMyAchievements());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const earned = useMemo(() => items.filter((m) => m.earned_at).length, [items]);

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        <Title>Medalhas</Title>
        <Sub>
          {earned} de {items.length} conquistadas
        </Sub>
        {error && <Text style={ui.error}>{error}</Text>}

        {GROUPS.map((g) => {
          const list = items.filter((m) => g.categories.includes(m.category));
          if (!list.length) return null;
          return (
            <View key={g.title}>
              <Text style={s.section}>{g.title}</Text>
              {list.map((m) => {
                const ratio = progressRatio(m);
                const tier = TIER_COLORS[m.tier];
                return (
                  <View key={m.id} style={[s.item, !m.earned_at && { opacity: 0.85 }]}>
                    <MedalIcon icon={m.icon} tier={m.tier} size={56} locked={!m.earned_at} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{m.title}</Text>
                      <Text style={s.desc}>{m.description}</Text>
                      {m.earned_at ? (
                        <Text style={[s.meta, { color: tier.fg }]}>
                          {tier.label} · conquistada em {new Date(m.earned_at).toLocaleDateString('pt-BR')}
                        </Text>
                      ) : (
                        <>
                          <View style={s.bar}>
                            <View style={[s.fill, { width: `${ratio * 100}%`, backgroundColor: tier.fg }]} />
                          </View>
                          <Text style={s.meta}>{progressText(m)}</Text>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  section: { color: colors.mute, fontSize: 13, marginTop: 24, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  item: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  desc: { color: colors.mute, fontSize: 13, marginTop: 2 },
  meta: { color: colors.mute, fontSize: 12, marginTop: 6 },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
