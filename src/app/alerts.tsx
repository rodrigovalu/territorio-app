import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Sub, styles as ui } from '@/components/ui';
import { getMyAlerts, markAlertsRead, type TerritoryAlert } from '@/lib/api';
import { fmtDate, fmtKm } from '@/lib/format';
import { colors } from '@/theme';

export default function Alerts() {
  const [items, setItems] = useState<TerritoryAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getMyAlerts());
      await markAlertsRead();
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

  return (
    <FlatList
      style={ui.screen}
      data={items}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      ListHeaderComponent={error ? <Text style={ui.error}>{error}</Text> : undefined}
      ListEmptyComponent={
        !loading ? <Sub>Nenhum alerta. Quando alguém ameaçar um território seu, você fica sabendo aqui.</Sub> : undefined
      }
      renderItem={({ item: a }) => {
        const threat = a.kind === 'threat';
        const status =
          a.current_owner_is_me === true
            ? `Você ainda é o dono · vantagem de ${fmtKm(a.current_gap_km ?? 0)} km`
            : a.current_owner_is_me === false
              ? 'Você não é mais o dono'
              : '';
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/territory/[id]', params: { id: a.cell_id } })}
            style={({ pressed }) => [s.item, !a.read_at && s.unread, pressed && { opacity: 0.7 }]}>
            <Text style={s.icon}>{threat ? '⚠️' : '🏳️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{threat ? 'Território em perigo' : 'Território perdido'}</Text>
              <Text style={s.body}>
                {threat
                  ? `${a.challenger_name} chegou a ${fmtKm(a.challenger_km)} km no território ${a.cell_id} (você tinha ${fmtKm(a.my_km)} km).`
                  : `${a.challenger_name} conquistou o território ${a.cell_id} com ${fmtKm(a.challenger_km)} km.`}
              </Text>
              {!!status && (
                <Text style={[s.status, { color: a.current_owner_is_me ? colors.success : colors.danger }]}>{status}</Text>
              )}
              <Text style={s.date}>{fmtDate(a.created_at)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  unread: { borderColor: colors.accent },
  icon: { fontSize: 24 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 15.5 },
  body: { color: colors.ink, fontSize: 14, marginTop: 4, lineHeight: 20 },
  status: { fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  date: { color: colors.mute, fontSize: 12, marginTop: 6 },
});
