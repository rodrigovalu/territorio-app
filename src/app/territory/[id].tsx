import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Dot, Sub, Title, styles as ui } from '@/components/ui';
import { getCellRanking, type CellRank } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentMonthInfo, fmtKm } from '@/lib/format';
import { HEX_AREA_KM2, isValidCellId } from '@/lib/grid';
import { colors } from '@/theme';

export default function TerritoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [rows, setRows] = useState<CellRank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = currentMonthInfo();

  useEffect(() => {
    if (!isValidCellId(id)) {
      setError('Território inválido.');
      return;
    }
    getCellRanking(id).then(setRows).catch((e) => setError((e as Error).message));
  }, [id]);

  const me = session?.user.id;
  const mine = rows?.find((r) => r.user_id === me);
  const leader = rows?.[0];
  const need = leader && leader.user_id !== me ? leader.km - (mine?.km ?? 0) + 0.01 : 0;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20 }}>
      <Title>Território {id}</Title>
      <Sub>
        {Math.round(HEX_AREA_KM2)} km² · disputa de {month.label}
      </Sub>

      {error && <Text style={ui.error}>{error}</Text>}
      {!rows && !error && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

      {rows && rows.length === 0 && (
        <Text style={[ui.sub, { marginTop: 18, fontSize: 15 }]}>
          Território livre! Corra aqui este mês e ele é seu.
        </Text>
      )}

      {rows && rows.length > 0 && (
        <View style={{ marginTop: 14 }}>
          {rows.map((r) => (
            <View key={r.user_id} style={ui.row}>
              <Text style={[ui.rowSmall, { width: 22, textAlign: 'right' }]}>{r.pos}</Text>
              <Dot color={r.color} />
              <View style={{ flex: 1 }}>
                <Text style={ui.rowText}>
                  {r.display_name}
                  {r.user_id === me ? ' (você)' : ''}
                </Text>
                {r.pos === 1 && <Text style={[ui.rowSmall, { color: '#FFD23F' }]}>♛ Dono do território</Text>}
              </View>
              <Text style={ui.rowValue}>{fmtKm(r.km)} km</Text>
            </View>
          ))}
          {need > 0 && (
            <Text style={[ui.sub, { marginTop: 16, fontSize: 14.5 }]}>
              Faltam <Text style={{ color: colors.accent, fontWeight: '800' }}>{fmtKm(need)} km</Text> aqui para
              você conquistar este território.
            </Text>
          )}
          {leader?.user_id === me && (
            <Text style={[ui.sub, { marginTop: 16, fontSize: 14.5, color: colors.success }]}>
              Você é o dono! Continue correndo para manter a liderança até o fim do mês.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
