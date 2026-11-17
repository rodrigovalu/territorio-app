import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dot, Sub, styles as ui } from '@/components/ui';
import { getLeaderboard, type LeaderRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentMonthInfo, fmtKm } from '@/lib/format';
import { colors } from '@/theme';

export default function Ranking() {
  const { session } = useAuth();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = currentMonthInfo();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getLeaderboard());
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
    <SafeAreaView style={ui.screen} edges={[]}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 10 }}>
            <Sub>Territórios dominados em {month.label}</Sub>
            {error && <Text style={ui.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          !loading ? <Text style={ui.sub}>Ninguém correu este mês ainda. Seja o primeiro!</Text> : undefined
        }
        renderItem={({ item }) => {
          const me = item.user_id === session?.user.id;
          return (
            <View style={[ui.row, me && { backgroundColor: 'rgba(255,106,43,0.08)' }]}>
              <Text style={[ui.rowSmall, { width: 22, textAlign: 'right' }]}>{item.pos}</Text>
              <Dot color={item.color} />
              <View style={{ flex: 1 }}>
                <Text style={ui.rowText}>
                  {item.display_name}
                  {me ? ' (você)' : ''}
                </Text>
                <Text style={ui.rowSmall}>{fmtKm(item.total_km)} km no mês</Text>
              </View>
              <Text style={ui.rowValue}>
                {item.territories} {item.territories === 1 ? 'território' : 'territórios'}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
