import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMyAlerts, getTerritories, type Territory } from '@/lib/api';
import { currentMonthInfo } from '@/lib/format';
import { HEX_AREA_KM2, cellBoundary, cellCenter, cellsInBounds, type LatLng } from '@/lib/grid';
import { colors, mapStyleDark, withAlpha } from '@/theme';
import { useAuth } from '@/lib/auth';

// Ibirité / região metropolitana de BH como ponto de partida
const DEFAULT_REGION: Region = { latitude: -20.0216, longitude: -44.0587, latitudeDelta: 0.45, longitudeDelta: 0.45 };
/** acima disso há territórios demais na tela; pedimos para aproximar */
const MAX_DELTA = 3;
/** abaixo disso mostramos o nome do dono no centro de cada território */
const LABEL_DELTA = 1.2;

// Geometria é fixa por célula: calcula uma vez só (evita redesenhar polígonos à toa)
const geoCache = new Map<string, { boundary: LatLng[]; center: LatLng }>();
function geo(id: string) {
  let g = geoCache.get(id);
  if (!g) {
    g = { boundary: cellBoundary(id), center: cellCenter(id) };
    geoCache.set(id, g);
  }
  return g;
}
const firstName = (n: string) => (n.split(' ')[0] || n).slice(0, 14);

export default function MapScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  // região atual sem depender de re-render (o foco da aba usava a região antiga)
  const regionRef = useRef<Region>(DEFAULT_REGION);
  const [cells, setCells] = useState<string[]>([]);
  const [owners, setOwners] = useState<Record<string, Territory>>({});
  const [hasLocation, setHasLocation] = useState(false);
  const reqId = useRef(0);
  const [unread, setUnread] = useState(0);
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

  // botão "centralizar": vai até a posição atual do corredor
  const [locating, setLocating] = useState(false);
  async function centerOnMe() {
    if (locating) return;
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      setHasLocation(true);
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const delta = Math.min(regionRef.current.latitudeDelta, 0.35);
      mapRef.current?.animateToRegion(
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: delta, longitudeDelta: delta },
        500,
      );
    } catch {
      // sem posição disponível agora
    } finally {
      setLocating(false);
    }
  }

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
      const fresh = Object.fromEntries(list.map((t) => [t.cell_id, t]));
      // atualiza só as células consultadas e mantém as demais já conhecidas
      setOwners((prev) => {
        const next = { ...prev };
        for (const c of ids) {
          if (fresh[c]) next[c] = fresh[c];
          else delete next[c];
        }
        return next;
      });
    } catch {
      // mantém o último estado; a próxima movimentação tenta de novo
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // recarrega ao voltar para a aba (ex.: depois de uma corrida), na região que está na tela
      load(regionRef.current);
      getMyAlerts()
        .then((l) => setUnread(l.filter((a) => !a.read_at).length))
        .catch(() => {});
      // e de novo a cada 60 s enquanto o mapa estiver aberto
      const t = setInterval(() => load(regionRef.current), 60_000);
      return () => clearInterval(t);
    }, [load]),
  );

  const polygons = useMemo(
    () =>
      cells.map((id) => {
        const t = owners[id];
        const mine = t && t.owner_id === me;
        const g = geo(id);
        return {
          id,
          coords: g.boundary,
          center: g.center,
          owner: t,
          mine: !!mine,
          fill: t ? withAlpha(t.owner_color, mine ? 0.32 : 0.22) : 'rgba(0,0,0,0)',
          stroke: t ? withAlpha(t.owner_color, 0.95) : 'rgba(139,150,163,0.35)',
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
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => {
          regionRef.current = r;
          setRegion(r);
          load(r);
        }}>
        {polygons.map((p) => (
          <Polygon
            // a chave inclui dono e cor: no Android, mudar só a cor de um polígono às vezes não
            // é aplicado; trocando a chave o polígono é recriado com a cor certa
            key={`${p.id}:${p.owner?.owner_id ?? '-'}:${p.fill}`}
            coordinates={p.coords}
            fillColor={p.fill}
            strokeColor={p.stroke}
            strokeWidth={p.width}
            tappable
            onPress={() => router.push({ pathname: '/territory/[id]', params: { id: p.id } })}
          />
        ))}
        {region.latitudeDelta <= LABEL_DELTA &&
          polygons
            .filter((p) => p.owner)
            .map((p) => (
              <Marker
                key={`lbl:${p.id}:${p.owner!.owner_id}:${p.owner!.owner_name}`}
                coordinate={p.center}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => router.push({ pathname: '/territory/[id]', params: { id: p.id } })}>
                <View style={[s.label, { borderColor: p.owner!.owner_color }]}>
                  <Text style={s.labelCrown}>♛</Text>
                  <Text style={[s.labelText, p.mine && { color: colors.accent }]} numberOfLines={1}>
                    {p.mine ? 'Você' : firstName(p.owner!.owner_name)}
                  </Text>
                  <Text style={s.labelKm}>{p.owner!.owner_km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</Text>
                </View>
              </Marker>
            ))}
      </MapView>

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>
              PACE <Text style={{ color: colors.accent }}>HUNTER</Text>
            </Text>
            <Text style={s.month}>
              {month.label} · {month.daysLeft === 0 ? 'último dia' : `faltam ${month.daysLeft} dias`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/alerts')}
            style={s.bell}
            accessibilityRole="button"
            accessibilityLabel={`Alertas${unread ? `, ${unread} novos` : ''}`}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
            {unread > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
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
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={centerOnMe}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Centralizar o mapa na minha posição"
            style={({ pressed }) => ({ opacity: pressed || locating ? 0.5 : 1, padding: 4 })}>
            <SymbolView name={{ android: 'my_location', ios: 'location.fill' }} tintColor={colors.accent} size={34} />
          </Pressable>
          <Pressable style={s.fab} onPress={() => router.navigate('/run')} accessibilityRole="button">
            <Text style={s.fabText}>▶ Correr</Text>
          </Pressable>
        </View>
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
  brand: { color: colors.ink, fontSize: 21, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5 },
  month: { color: colors.mute, fontSize: 12.5, marginTop: 2 },
  hint: { color: colors.ink, fontSize: 13.5 },
  bell: { paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 },
  badge: {
    position: 'absolute',
    right: 0,
    top: -2,
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rankBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  rankText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  legend: { flex: 1, backgroundColor: 'rgba(14,17,22,0.85)', borderRadius: 10, padding: 8 },
  legendText: { color: colors.mute, fontSize: 12 },
  fab: { backgroundColor: colors.accent, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#111', fontWeight: '800', fontSize: 15 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(14,17,22,0.88)',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  labelCrown: { color: '#FFD23F', fontSize: 12 },
  labelText: { color: colors.ink, fontWeight: '800', fontSize: 12, maxWidth: 110 },
  labelKm: { color: colors.mute, fontSize: 11 },
});
