import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { Stat, styles as ui } from '@/components/ui';
import { getRun, type RunDetail } from '@/lib/api';
import { fmtDayLong, fmtDuration, fmtKm, fmtPaceS, fmtTime } from '@/lib/format';
import { colors, mapStyleDark } from '@/theme';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!UUID_RE.test(id ?? '')) {
      setError('Corrida inválida.');
      return;
    }
    getRun(id).then(setRun).catch((e) => setError((e as Error).message));
  }, [id]);

  const coords = useMemo(() => (run?.route ?? []).map(([latitude, longitude]) => ({ latitude, longitude })), [run]);

  if (error) return <Text style={[ui.error, { padding: 20 }]}>{error}</Text>;
  if (!run) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;

  const splits = run.splits ?? [];
  const lastKmM = Math.round(run.distance_km * 1000) - splits.length * 1000;
  const fastest = splits.length ? Math.min(...splits.map((s) => s.s)) : 0;
  const slowest = splits.length ? Math.max(...splits.map((s) => s.s)) : 0;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: fmtTime(run.started_at) + ' · ' + fmtKm(run.distance_km, 2) + ' km' }} />
      {coords.length > 1 && (
        <MapView
          ref={mapRef}
          style={{ height: 280 }}
          provider={PROVIDER_GOOGLE}
          customMapStyle={mapStyleDark}
          toolbarEnabled={false}
          onMapReady={() =>
            mapRef.current?.fitToCoordinates(coords, {
              edgePadding: { top: 40, bottom: 40, left: 40, right: 40 },
              animated: false,
            })
          }>
          <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={5} />
          <Marker coordinate={coords[0]} pinColor="green" title="Início" />
          <Marker coordinate={coords[coords.length - 1]} pinColor="red" title="Fim" />
        </MapView>
      )}

      <View style={{ padding: 20 }}>
        <Text style={s.date}>{fmtDayLong(run.started_at)}</Text>
        <Text style={s.km}>
          {fmtKm(run.distance_km, 2)} <Text style={s.kmUnit}>km</Text>
        </Text>

        <View style={s.row}>
          <Stat value={fmtDuration(run.moving_seconds)} label="tempo em movimento" />
          <Stat value={fmtPaceS(run.avg_pace_s)} label="pace médio /km" />
        </View>
        <View style={s.row}>
          <Stat value={fmtPaceS(run.best_km_s)} label="km mais rápido" />
          <Stat value={`${run.elevation_gain_m} m`} label="subida acumulada" />
        </View>

        <Text style={s.section}>Parciais por km</Text>
        {splits.length === 0 && <Text style={ui.sub}>Corrida com menos de 1 km.</Text>}
        {splits.map((sp) => {
          const span = Math.max(1, slowest - fastest);
          const w = 45 + 55 * (1 - (sp.s - fastest) / span); // mais rápido = barra maior
          return (
            <View key={sp.km} style={s.split}>
              <Text style={s.splitKm}>{sp.km}</Text>
              <View style={s.splitBarWrap}>
                <View
                  style={[s.splitBar, { width: `${w}%`, backgroundColor: sp.s === fastest ? colors.success : colors.accent }]}
                />
              </View>
              <Text style={s.splitPace}>{fmtPaceS(sp.s)}</Text>
            </View>
          );
        })}
        {lastKmM > 20 && (
          <Text style={[ui.sub, { marginTop: 6 }]}>+ {fmtKm(lastKmM / 1000, 2)} km finais</Text>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  date: { color: colors.mute, fontSize: 13.5, textTransform: 'capitalize' },
  km: { color: colors.ink, fontSize: 56, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kmUnit: { fontSize: 22, color: colors.mute },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  section: { color: colors.mute, fontSize: 13, marginTop: 26, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  splitKm: { color: colors.mute, width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
  splitBarWrap: { flex: 1, height: 18, justifyContent: 'center' },
  splitBar: { height: 14, borderRadius: 7 },
  splitPace: { color: colors.ink, width: 48, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
});
