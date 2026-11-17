import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Sub, Title, styles as ui } from '@/components/ui';
import { celebrate } from '@/lib/celebrate';
import { fmtDuration, fmtKm, fmtPaceS } from '@/lib/format';
import { getSettings, saveSettings, type Settings } from '@/lib/settings';
import {
  currentPace,
  discardRun,
  elapsedSeconds,
  finishRun,
  flushPending,
  getActiveRun,
  getPoints,
  pauseRun,
  pendingCount,
  requestPermissions,
  resumeRun,
  startRun,
  subscribe,
  type ActiveRun,
} from '@/lib/tracking';
import { say } from '@/lib/voice';
import { colors, mapStyleDark } from '@/theme';

type Coord = { latitude: number; longitude: number };

export default function RunScreen() {
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [path, setPath] = useState<Coord[]>([]);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);

  const refresh = useCallback(async () => {
    const r = await getActiveRun();
    setRun(r);
    if (r) {
      const pts = await getPoints();
      setPath(pts.map((p) => ({ latitude: p.lat, longitude: p.lng })));
    } else setPath([]);
  }, []);

  // ao abrir a aba: retoma corrida em andamento e reenvia pendentes
  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSettings(await getSettings());
        await refresh();
        if ((await pendingCount()) > 0) {
          const sent = await flushPending().catch(() => []);
          if (sent.length) {
            setMessage(`${sent.length} corrida(s) pendente(s) enviada(s).`);
            sent.forEach((r) => celebrate(r.newAchievements));
          }
        }
        setPending(await pendingCount());
      })();
    }, [refresh]),
  );

  useEffect(() => subscribe(refresh), [refresh]);

  // relógio da tela
  useEffect(() => {
    if (!run || run.paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [run]);

  // segue o corredor
  useEffect(() => {
    const last = path[path.length - 1];
    if (last) mapRef.current?.animateCamera({ center: last, zoom: 16 }, { duration: 500 });
  }, [path]);

  async function begin() {
    setBusy(true);
    setMessage(null);
    try {
      if (!(await requestPermissions())) {
        setMessage('Sem permissão de localização. Ative nas configurações do Android.');
        return;
      }
      const s = await getSettings();
      if (s.countdown) {
        for (let n = 3; n >= 1; n--) {
          setCountdown(n);
          if (s.voice) say(String(n));
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdown(null);
      }
      setRun(await startRun());
    } catch (e) {
      setCountdown(null);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onStart() {
    // Divulgação clara antes de pedir a permissão (exigência do Google Play)
    Alert.alert(
      'Permitir localização',
      'Para medir a corrida, o Território usa o GPS somente enquanto você grava, inclusive com a tela apagada. ' +
        'Uma notificação fica visível durante toda a gravação.',
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Continuar', onPress: begin },
      ],
    );
  }

  async function onPauseResume() {
    setRun(run?.paused ? await resumeRun() : await pauseRun());
  }

  function onFinish() {
    Alert.alert('Encerrar corrida?', 'A corrida será salva e os km somados aos territórios.', [
      { text: 'Continuar correndo', style: 'cancel' },
      {
        text: 'Encerrar',
        onPress: async () => {
          setBusy(true);
          const r = await finishRun();
          setBusy(false);
          setRun(null);
          setPath([]);
          if (r.status === 'sent') {
            celebrate(r.result.newAchievements);
            router.push({ pathname: '/activity/[id]', params: { id: r.result.runId } });
          } else if (r.status === 'queued') {
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
      { text: 'Descartar', style: 'destructive', onPress: () => discardRun().then(refresh) },
    ]);
  }

  async function toggle(patch: Partial<Settings>) {
    setSettings(await saveSettings(patch));
  }

  if (countdown != null) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.countdown}>{countdown}</Text>
        <Text style={ui.sub}>Prepare-se…</Text>
      </View>
    );
  }

  if (!run) {
    return (
      <SafeAreaView style={ui.screen} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Title>Nova corrida</Title>
          <Sub>Os km vão para os territórios por onde você passar.</Sub>

          {message && <Text style={{ color: colors.ink, fontSize: 14.5 }}>{message}</Text>}
          {pending > 0 && <Text style={ui.sub}>{pending} corrida(s) aguardando internet para envio.</Text>}

          <Button title="▶  Iniciar corrida" onPress={onStart} loading={busy} style={{ paddingVertical: 22 }} />

          {settings && (
            <View style={s.card}>
              <SettingRow
                label="Avisos de voz"
                hint="Tempo e pace médio a cada km"
                value={settings.voice}
                onChange={(v) => toggle({ voice: v })}
              />
              <SettingRow
                label="Falar o pace do último km"
                value={settings.voiceSplitPace}
                disabled={!settings.voice}
                onChange={(v) => toggle({ voiceSplitPace: v })}
              />
              <View style={[s.setting, { borderBottomWidth: 0 }]}>
                <Text style={[ui.rowText, !settings.voice && { opacity: 0.4 }]}>Avisar a cada</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {([1, 2, 5] as const).map((n) => (
                    <Text
                      key={n}
                      onPress={() => settings.voice && toggle({ voiceEveryKm: n })}
                      style={[s.chip, settings.voiceEveryKm === n && s.chipOn, !settings.voice && { opacity: 0.4 }]}>
                      {n} km
                    </Text>
                  ))}
                </View>
              </View>
              <SettingRow
                label="Contagem regressiva"
                hint="3, 2, 1 antes de começar"
                value={settings.countdown}
                onChange={(v) => toggle({ countdown: v })}
              />
            </View>
          )}

          <Text style={[ui.sub, { lineHeight: 19 }]}>
            Dicas: mantenha o GPS ligado e o celular com você. Trechos em velocidade de veículo e saltos de sinal não
            contam. Corridas precisam ser enviadas em até 72 horas.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <ActiveRunView run={run} path={path} mapRef={mapRef} busy={busy} onPauseResume={onPauseResume} onFinish={onFinish} onDiscard={onDiscard} />;
}

function ActiveRunView({
  run,
  path,
  mapRef,
  busy,
  onPauseResume,
  onFinish,
  onDiscard,
}: {
  run: ActiveRun;
  path: Coord[];
  mapRef: React.RefObject<MapView | null>;
  busy: boolean;
  onPauseResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  useKeepAwake(); // tela não apaga sozinha com o app aberto (o GPS segue mesmo se apagar)
  const km = run.acc.distM / 1000;
  const elapsed = elapsedSeconds(run);
  const moving = run.acc.movingS;
  const avg = km >= 0.05 ? moving / km : null;
  const cur = currentPace(run);
  const lastSplit = run.acc.splits[run.acc.splits.length - 1];
  const partialM = run.acc.distM - run.acc.splits.length * 1000;

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
        {run.paused && <Text style={s.paused}>PAUSADO</Text>}
        <Text style={s.bigKm}>{fmtKm(km, 2)}</Text>
        <Text style={s.bigLabel}>quilômetros</Text>

        <View style={s.grid}>
          <Metric value={fmtDuration(elapsed)} label="tempo" />
          <Metric value={fmtPaceS(avg)} label="pace médio" accent />
          <Metric value={fmtPaceS(cur)} label="pace atual" />
        </View>
        <View style={s.kmBar}>
          <View style={[s.kmFill, { width: `${Math.min(100, (partialM / 1000) * 100)}%` }]} />
        </View>
        <Text style={s.kmText}>
          {lastSplit ? `Último km (${lastSplit.km}º): ${fmtPaceS(lastSplit.s)} /km · ` : ''}
          faltam {fmtKm(Math.max(0, 1000 - partialM) / 1000, 2)} km para o próximo
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title={run.paused ? '▶ Retomar' : '❚❚ Pausar'} variant="secondary" onPress={onPauseResume} style={{ flex: 1 }} />
          <Button title="■ Encerrar" onPress={onFinish} loading={busy} style={{ flex: 1 }} />
        </View>
        {run.paused && <Button title="Descartar corrida" variant="ghost" onPress={onDiscard} style={{ marginTop: 4 }} />}
      </SafeAreaView>
    </View>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[s.metric, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function SettingRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[s.setting, disabled && { opacity: 0.4 }]}>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowText}>{label}</Text>
        {hint && <Text style={ui.rowSmall}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.line }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  countdown: { color: colors.accent, fontSize: 160, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 10,
  },
  chip: {
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  chipOn: { borderColor: colors.accent, color: colors.accent },
  panel: { backgroundColor: colors.panel, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  paused: { color: colors.accent, textAlign: 'center', fontWeight: '900', letterSpacing: 2 },
  bigKm: { color: colors.ink, fontSize: 72, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  bigLabel: { color: colors.mute, textAlign: 'center', marginTop: -6 },
  grid: { flexDirection: 'row', marginTop: 16 },
  metric: { color: colors.ink, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.mute, fontSize: 12, marginTop: 2 },
  kmBar: { height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 16, overflow: 'hidden' },
  kmFill: { height: '100%', backgroundColor: colors.accent },
  kmText: { color: colors.mute, fontSize: 12.5, marginTop: 6, textAlign: 'center' },
});
