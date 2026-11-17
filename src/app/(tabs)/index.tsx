import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTerritories, type Territory } from '@/lib/api';
import { currentMonthInfo } from '@/lib/format';
import { HEX_AREA_KM2, cellBoundary, cellsInBounds } from '@/lib/grid';
import { colors, mapStyleDark, withAlpha } from '@/theme';
import { useAuth } from '@/lib/auth';

// Ibirité / região metropolitana de BH como ponto de partida
const DEFAULT_REGION: Region = { latitude: -20.0216, longitude: -44.0587, latitudeDelta: 0.45, longitudeDelta: 0.45 };
/** acima disso há territórios demais na tela; pedimos para aproximar */
const MAX_DELTA = 3;

export default function MapScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [cells, setCells] = useState<string[]>([]);
  const [owners, setOwners] = useState<Record<string, Territory>>({});
  const [hasLocation, setHasLocation] = useState(false);
  const reqId = useRef(0);
  const month = currentMonthInfo();

  // centraliza no usuário se a permissão já foi concedida (não pede aqui)
  useEffect(() => {
    (async () => {
      const p = await Location.getForegroundPermissionsAsync();
      if (p.status !== 'granted') return;
      setHasLocation(true);
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        mapRef.current?.animateToRegion(
          { latitude: last.coords.latitude, longitude: last.coords.longitude, latitudeDelta: 0.35, longitudeDelta: 0.35 },
          600,
        );
      }
    })();
  }, []);

  const load = useCallback(async (r: Region) => {
    if (r.latitudeDelta > MAX_DELTA) {
      setCells([]);
      return;
    }
    const ids = cellsInBounds(
      r.latitude - r.latitudeDelta / 2,
      r.longitude - r.longitudeDelta / 2,
      r.latitude + r.latitudeDelta / 2,
      r.longitude + r.longitudeDelta / 2,
    );
    setCells(ids);
    const id = ++reqId.current;
    try {
      const list = await getTerritories(ids);
      if (id !== reqId.current) return;
      setOwners(Object.fromEntries(list.map((t) => [t.cell_id, t])));
    } catch {
      // mantém o último estado; a próxima movimentação tenta de novo
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(region);
      // recarrega ao voltar para a aba (ex.: depois de uma corrida)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const polygons = useMemo(
    () =>
      cells.map((id) => {
        const t = owners[id];
        const mine = t && t.owner_id === me;
        return {
          id,
          coords: cellBoundary(id),
          fill: t ? withAlpha(t.owner_color, mine ? 0.3 : 0.2) : 'rgba(0,0,0,0)',
          stroke: t ? withAlpha(t.owner_color, 0.9) : 'rgba(139,150,163,0.35)',
          width: mine ? 3 : t ? 2 : 1,
        };
      }),
    [cells, owners, me],
  );

  const mineCount = Object.values(owners).filter((t) => t.owner_id === me).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyleDark}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={hasLocation}
        showsMyLocationButton={hasLocation}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          load(r);
        }}>
        {polygons.map((p) => (
          <Polygon
            key={p.id}
            coordinates={p.coords}
            fillColor={p.fill}
            strokeColor={p.stroke}
            strokeWidth={p.width}
            tappable
            onPress={() => router.push({ pathname: '/territory/[id]', params: { id: p.id } })}
          />
        ))}
      </MapView>

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>
              TERRI<Text style={{ color: colors.accent }}>TÓRIO</Text>
            </Text>
            <Text style={s.month}>
              {month.label} · {month.daysLeft === 0 ? 'último dia' : `faltam ${month.daysLeft} dias`}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/ranking')} style={s.rankBtn} accessibilityRole="button">
            <Text style={s.rankText}>♛ Ranking</Text>
          </Pressable>
        </View>
        {region.latitudeDelta > MAX_DELTA && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={s.hint}>Aproxime o mapa para ver os territórios.</Text>
          </View>
        )}
      </SafeAreaView>

      <View style={s.bottom} pointerEvents="box-none">
        <View style={s.legend}>
          <Text style={s.legendText}>
            Cada território ≈ {Math.round(HEX_AREA_KM2)} km² · Na tela, você domina {mineCount}
          </Text>
        </View>
        <Pressable style={s.fab} onPress={() => router.navigate('/run')} accessibilityRole="button">
          <Text style={s.fabText}>▶ Correr</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, top: 0 },
  card: {
    backgroundColor: 'rgba(22,27,34,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 8,
  },
  brand: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  month: { color: colors.mute, fontSize: 12.5, marginTop: 2 },
  hint: { color: colors.ink, fontSize: 13.5 },
  rankBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  rankText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  legend: { flex: 1, backgroundColor: 'rgba(14,17,22,0.85)', borderRadius: 10, padding: 8 },
  legendText: { color: colors.mute, fontSize: 12 },
  fab: { backgroundColor: colors.accent, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#111', fontWeight: '800', fontSize: 15 },
});
