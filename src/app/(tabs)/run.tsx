import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Stat, Sub, Title, styles as ui } from '@/components/ui';
import type { SubmitResult } from '@/lib/api';
import { fmtDuration, fmtKm, fmtPace } from '@/lib/format';
import {
  discardRun,
  elapsedSeconds,
  finishRun,
  flushPending,
  getActiveRun,
  getPoints,
  liveDistanceKm,
  pauseRun,
  pendingCount,
  requestPermissions,
  resumeRun,
  startRun,
  subscribe,
  type ActiveRun,
} from '@/lib/tracking';
import { colors, mapStyleDark } from '@/theme';

type Coord = { latitude: number; longitude: number };

export default function RunScreen() {
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [km, setKm] = useState(0);
  const [path, setPath] = useState<Coord[]>([]);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const mapRef = useRef<MapView>(null);

  const refreshPoints = useCallback(async () => {
    const pts = await getPoints();
    setKm(liveDistanceKm(pts));
    setPath(pts.map((p) => ({ latitude: p.lat, longitude: p.lng })));
  }, []);

  // ao abrir a aba: retoma corrida em andamento (ex.: app foi fechado) e reenvia pendentes
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const r = await getActiveRun();
        setRun(r);
        if (r) await refreshPoints();
        if ((await pendingCount()) > 0) {
          const sent = await flushPending().catch(() => 0);
          if (sent) setMessage(`${sent} corrida(s) pendente(s) enviada(s).`);
        }
        setPending(await pendingCount());
      })();
    }, [refreshPoints]),
  );

  useEffect(() => subscribe(refreshPoints), [refreshPoints]);

  // relógio da tela
  useEffect(() => {
    if (!run || run.paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [run]);

  // acompanha o corredor no mapa
  useEffect(() => {
    const last = path[path.length - 1];
    if (last) mapRef.current?.animateCamera({ center: last, zoom: 16 }, { duration: 500 });
  }, [path]);

  async function onStart() {
    // Divulgação clara antes de pedir a permissão (exigência do Google Play)
    Alert.alert(
      'Permitir localização',
      'Para medir a corrida, o Território usa o GPS somente enquanto você grava, inclusive com a tela apagada. ' +
        'Uma notificação fica visível durante toda a gravação.',
      [
        { text: 'Agora não', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            setBusy(true);
            setResult(null);
            setMessage(null);
            try {
              if (!(await requestPermissions())) {
                setMessage('Sem permissão de localização. Ative nas configurações do Android.');
                return;
              }
              const r = await startRun();
              setRun(r);
              setKm(0);
              setPath([]);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function onPauseResume() {
    setRun(run?.paused ? await resumeRun() : await pauseRun());
  }

  function onFinish() {
    Alert.alert('Encerrar corrida?', 'A corrida será enviada e os km somados aos territórios.', [
      { text: 'Continuar correndo', style: 'cancel' },
      {
        text: 'Encerrar',
        onPress: async () => {
          setBusy(true);
          const r = await finishRun();
          setBusy(false);
          setRun(null);
          if (r.status === 'sent') setResult(r.result);
          else if (r.status === 'queued') {
            setMessage('Sem internet agora. A corrida foi guardada e será enviada automaticamente.');
            setPending(await pendingCount());
          } else setMessage(`Corrida não registrada: ${r.reason}.`);
        },
      },
    ]);
  }

  function onDiscard() {
    Alert.alert('Descartar corrida?', 'Os dados desta corrida serão apagados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await discardRun();
          setRun(null);
          setPath([]);
          setKm(0);
        },
      },
    ]);
  }

  const secs = run ? elapsedSeconds(run) : 0;

  if (!run) {
    return (
      <SafeAreaView style={ui.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Title>Nova corrida</Title>
          <Sub>Os km vão para os territórios por onde você passar.</Sub>

          {result && (
            <View style={s.result}>
              <Text style={s.resultTitle}>Corrida registrada ✓</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Stat value={fmtKm(result.distanceKm, 2)} label="km" />
                <Stat value={fmtDuration(result.movingSeconds)} label="tempo" />
                <Stat value={fmtPace(result.movingSeconds, result.distanceKm)} label="min/km" />
              </View>
              {result.cells && (
                <Text style={[ui.sub, { marginTop: 10 }]}>
                  Somou km em {Object.keys(result.cells).length} território(s). Veja no mapa quem domina agora.
                </Text>
              )}
            </View>
          )}
          {message && <Text style={{ color: colors.ink, fontSize: 14.5 }}>{message}</Text>}
          {pending > 0 && (
            <Text style={ui.sub}>{pending} corrida(s) aguardando internet para envio.</Text>
          )}

          <Button title="▶  Iniciar corrida" onPress={onStart} loading={busy} />
          <Text style={[ui.sub, { lineHeight: 19 }]}>
            Dicas: mantenha o GPS ligado e o celular com você. Trechos em velocidade de veículo e saltos de sinal não
            contam. Corridas precisam ser enviadas em até 72 horas.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={ui.screen}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyleDark}
        showsUserLocation
        toolbarEnabled={false}
        initialRegion={
          path[0]
            ? { ...path[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }
            : { latitude: -20.0216, longitude: -44.0587, latitudeDelta: 0.05, longitudeDelta: 0.05 }
        }>
        {path.length > 1 && <Polyline coordinates={path} strokeColor={colors.accent} strokeWidth={5} />}
      </MapView>
      <SafeAreaView edges={['bottom']} style={s.panel}>
        <Text style={s.bigKm}>{fmtKm(km, 2)}</Text>
        <Text style={s.bigLabel}>quilômetros{run.paused ? ' · PAUSADO' : ''}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 14 }}>
          <Stat value={fmtDuration(secs)} label="tempo" />
          <Stat value={fmtPace(secs, km)} label="ritmo min/km" />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title={run.paused ? 'Retomar' : 'Pausar'}
            variant="secondary"
            onPress={onPauseResume}
            style={{ flex: 1 }}
          />
          <Button title="Encerrar" onPress={onFinish} loading={busy} style={{ flex: 1 }} />
        </View>
        <Button title="Descartar" variant="ghost" onPress={onDiscard} style={{ marginTop: 4 }} />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: colors.panel, padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  bigKm: { color: colors.ink, fontSize: 64, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  bigLabel: { color: colors.mute, textAlign: 'center', marginTop: -4 },
  result: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.success },
  resultTitle: { color: colors.success, fontSize: 17, fontWeight: '800' },
});
