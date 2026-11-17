import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Sub, Title, styles as ui } from '@/components/ui';
import { getMyRuns, getMyStats, type MyStats, type RunRow } from '@/lib/api';
import { fmtDate, fmtDuration, fmtKm, fmtPaceS } from '@/lib/format';
import { colors } from '@/theme';

const PAGE = 30;

export default function Activities() {
  const [stats, setStats] = useState<MyStats | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([getMyStats(), getMyRuns(0, PAGE)]);
      setStats(s);
      setRuns(r);
      setPage(0);
      setDone(r.length < PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function more() {
    if (done || loading) return;
    setLoading(true);
    try {
      const r = await getMyRuns(page + 1, PAGE);
      setRuns((prev) => [...prev, ...r]);
      setPage(page + 1);
      setDone(r.length < PAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading && page === 0} onRefresh={reload} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            <Title>Atividades</Title>
            {error && <Text style={ui.error}>{error}</Text>}
            {stats && <Summary s={stats} />}
            <Text style={s.section}>Todas as corridas</Text>
          </View>
        }
        ListEmptyComponent={!loading ? <Sub>Nenhuma corrida ainda. Que tal a primeira?</Sub> : undefined}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/activity/[id]', params: { id: item.id } })}
            style={({ pressed }) => [s.run, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.runDate}>{fmtDate(item.started_at)}</Text>
              <Text style={s.runKm}>{fmtKm(item.distance_km, 2)} km</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.runMeta}>{fmtDuration(item.moving_seconds)}</Text>
              <Text style={s.runMeta}>{fmtPaceS(item.avg_pace_s)} /km</Text>
            </View>
            <Text style={s.chev}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Summary({ s: st }: { s: MyStats }) {
  return (
    <View>
      <View style={s.cards}>
        <Card label="Esta semana" value={`${fmtKm(st.week_km)} km`} sub={`${st.week_runs} corrida(s) · ${st.week_visits} acesso(s)`} />
        <Card label="Este mês" value={`${fmtKm(st.month_km)} km`} sub={`${st.month_runs} corrida(s)`} />
      </View>
      <View style={s.cards}>
        <Card label="Total" value={`${fmtKm(st.total_km)} km`} sub={`${st.total_runs} corridas · ${fmtDuration(st.total_s)}`} />
      </View>

      <Text style={s.section}>Recordes pessoais</Text>
      <View style={s.prs}>
        <Pr label="Km mais rápido" value={st.best_km_s != null ? fmtPaceS(st.best_km_s) : '—'} />
        <Pr label="Melhor 5 km" value={st.best_5k_s != null ? fmtDuration(st.best_5k_s) : '—'} />
        <Pr label="Melhor 10 km" value={st.best_10k_s != null ? fmtDuration(st.best_10k_s) : '—'} />
        <Pr label="Melhor 21 km" value={st.best_21k_s != null ? fmtDuration(st.best_21k_s) : '—'} />
        <Pr label="Maior distância" value={st.longest_km != null ? `${fmtKm(st.longest_km, 2)} km` : '—'} />
        <Pr label="Melhor pace médio" value={st.best_pace_s != null ? `${fmtPaceS(st.best_pace_s)} /km` : '—'} />
      </View>
    </View>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={s.cardValue}>{value}</Text>
      <Text style={s.cardSub}>{sub}</Text>
    </View>
  );
}

function Pr({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.pr}>
      <Text style={s.prValue}>{value}</Text>
      <Text style={s.prLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 10, marginTop: 12 },
  card: { flex: 1, backgroundColor: colors.panel, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line },
  cardLabel: { color: colors.mute, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { color: colors.ink, fontSize: 26, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
  cardSub: { color: colors.mute, fontSize: 12, marginTop: 2 },
  section: { color: colors.mute, fontSize: 13, marginTop: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  prs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pr: { width: '31.5%', backgroundColor: colors.panel, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.line },
  prValue: { color: colors.ink, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  prLabel: { color: colors.mute, fontSize: 11, marginTop: 2 },
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  runDate: { color: colors.mute, fontSize: 12.5 },
  runKm: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: 2 },
  runMeta: { color: colors.ink, fontSize: 13.5, fontVariant: ['tabular-nums'] },
  chev: { color: colors.mute, fontSize: 24 },
});
