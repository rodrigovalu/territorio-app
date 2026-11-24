/**
 * Gravação da corrida por GPS.
 *
 * Usa um "foreground service" do Android (notificação fixa enquanto corre). Com ele o app
 * continua recebendo a localização — e falando os avisos de voz — com a tela apagada, SEM a
 * permissão de localização em segundo plano (ACCESS_BACKGROUND_LOCATION).
 *
 * Distância, pace e km usam o MESMO acumulador do servidor (validateRun.ts), então o que
 * aparece na tela bate com o que é registrado.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  RULES,
  accPush,
  newAcc,
  type AccState,
  type GpsPoint,
  type Split,
} from '../../supabase/functions/_shared/validateRun';
import { submitRun, type SubmitResult } from './api';
import { getSettings } from './settings';
import { announceSplit, say, spokenDuration, spokenPace } from './voice';

export const TRACKING_TASK = 'territorio-run-tracking';

const K_ACTIVE = 'run:active';
const K_POINTS = 'run:points';
const K_PENDING = 'run:pending';

export type ActiveRun = {
  clientRunId: string;
  startedAt: number;
  paused: boolean;
  /** segundos de relógio acumulados até a última pausa */
  elapsedBeforePause: number;
  /** início do trecho atual (ms) */
  segmentStartedAt: number;
  /** estado do acumulador (distância, tempo em movimento, splits, elevação) */
  acc: AccState;
  /** pontos recentes para o pace atual (últimos ~30 s) */
  recent: { t: number; m: number }[];
};

type PendingRun = { clientRunId: string; points: GpsPoint[]; endedAt: number };

// ----------------------------------------------------------------------------
// Fila de gravação (evita que duas entregas de GPS se atropelem)
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const emit = () => listeners.forEach((l) => l());

async function readActive(): Promise<ActiveRun | null> {
  const raw = await AsyncStorage.getItem(K_ACTIVE);
  return raw ? (JSON.parse(raw) as ActiveRun) : null;
}

function ingest(run: ActiveRun, all: GpsPoint[], pts: GpsPoint[]): Split[] {
  const done: Split[] = [];
  const lastT = all.length ? all[all.length - 1].t : 0;
  for (const p of pts) {
    if (p.t <= lastT || p.t < run.segmentStartedAt - 5000) continue;
    all.push(p);
    done.push(...accPush(run.acc, p));
    run.recent.push({ t: p.t, m: run.acc.distM });
  }
  const cut = Date.now() - 30_000;
  run.recent = run.recent.filter((r) => r.t >= cut);
  return done;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const pts: GpsPoint[] = data.locations
    .filter((l) => !l.mocked) // ignora GPS falso (apps de "fake GPS")
    .map((l) => ({
      t: Math.round(l.timestamp),
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      acc: l.coords.accuracy ?? null,
      alt: l.coords.altitude ?? null,
    }));
  if (!pts.length) return;

  const splits = await serial(async () => {
    const run = await readActive();
    if (!run || run.paused) return [];
    const raw = await AsyncStorage.getItem(K_POINTS);
    const all: GpsPoint[] = raw ? JSON.parse(raw) : [];
    const done = ingest(run, all, pts);
    await AsyncStorage.multiSet([
      [K_ACTIVE, JSON.stringify(run)],
      [K_POINTS, JSON.stringify(all)],
    ]);
    return done;
  });
  emit();

  if (splits.length) {
    const settings = await getSettings();
    announceSplit(splits[splits.length - 1], settings);
  }
});

// ----------------------------------------------------------------------------
export async function getActiveRun(): Promise<ActiveRun | null> {
  return readActive();
}

export async function getPoints(): Promise<GpsPoint[]> {
  const raw = await AsyncStorage.getItem(K_POINTS);
  return raw ? JSON.parse(raw) : [];
}

/** tempo de relógio, sem as pausas */
export function elapsedSeconds(run: ActiveRun, now = Date.now()): number {
  return run.elapsedBeforePause + (run.paused ? 0 : (now - run.segmentStartedAt) / 1000);
}

/** pace atual (s/km) com base nos últimos ~30 s */
export function currentPace(run: ActiveRun): number | null {
  const r = run.recent;
  if (r.length < 2) return null;
  const dm = r[r.length - 1].m - r[0].m;
  const dt = (r[r.length - 1].t - r[0].t) / 1000;
  if (dm < 15 || dt < 8) return null;
  return (dt / dm) * 1000;
}

export async function requestPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  if (!(await Location.hasServicesEnabledAsync())) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      return false;
    }
  }
  return true;
}

async function startUpdates() {
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 3,
    activityType: Location.LocationActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Corrida em andamento',
      notificationBody: 'O Pace Hunter está registrando seu percurso.',
      notificationColor: '#FF6A2B',
      killServiceOnDestroy: false,
    },
  });
}

async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}

export async function startRun(): Promise<ActiveRun> {
  const now = Date.now();
  const run: ActiveRun = {
    clientRunId: Crypto.randomUUID(),
    startedAt: now,
    paused: false,
    elapsedBeforePause: 0,
    segmentStartedAt: now,
    acc: newAcc(),
    recent: [],
  };
  await serial(() =>
    AsyncStorage.multiSet([
      [K_ACTIVE, JSON.stringify(run)],
      [K_POINTS, '[]'],
    ]),
  );
  await startUpdates();
  if ((await getSettings()).voice) say('Corrida iniciada. Bom treino!');
  emit();
  return run;
}

export async function pauseRun(): Promise<ActiveRun | null> {
  await stopUpdates();
  const next = await serial(async () => {
    const run = await readActive();
    if (!run || run.paused) return run;
    const n: ActiveRun = { ...run, paused: true, elapsedBeforePause: elapsedSeconds(run), recent: [] };
    await AsyncStorage.setItem(K_ACTIVE, JSON.stringify(n));
    return n;
  });
  if ((await getSettings()).voice) say('Corrida pausada.');
  emit();
  return next;
}

export async function resumeRun(): Promise<ActiveRun | null> {
  const next = await serial(async () => {
    const run = await readActive();
    if (!run || !run.paused) return run;
    // não liga o último ponto antes da pausa ao primeiro depois dela
    const n: ActiveRun = { ...run, paused: false, segmentStartedAt: Date.now(), acc: { ...run.acc, lastPt: null } };
    await AsyncStorage.setItem(K_ACTIVE, JSON.stringify(n));
    return n;
  });
  await startUpdates();
  if ((await getSettings()).voice) say('Corrida retomada.');
  emit();
  return next;
}

export async function discardRun() {
  await stopUpdates();
  await serial(() => AsyncStorage.multiRemove([K_ACTIVE, K_POINTS]));
  emit();
}

export type FinishResult =
  | { status: 'sent'; result: SubmitResult }
  | { status: 'queued' }
  | { status: 'rejected'; reason: string };

/**
 * Encerra e envia. Se falhar por rede, a corrida vai para a fila de pendentes.
 * Se o servidor RECUSAR (antifraude, curta demais…), o motivo é devolvido.
 */
export async function finishRun(): Promise<FinishResult> {
  await stopUpdates();
  const { run, points } = await serial(async () => {
    const r = await readActive();
    const p = await getPoints();
    await AsyncStorage.multiRemove([K_ACTIVE, K_POINTS]);
    return { run: r, points: p };
  });
  emit();
  if (!run) return { status: 'rejected', reason: 'Nenhuma corrida ativa.' };

  const settings = await getSettings();
  if (settings.voice && run.acc.distM >= 100) {
    const km = run.acc.distM / 1000;
    say(
      `Corrida encerrada. ${km.toFixed(2).replace('.', ',')} quilômetros em ${spokenDuration(run.acc.movingS)}. ` +
        `Pace médio: ${spokenPace(run.acc.movingS / km)}.`,
    );
  }

  try {
    const result = await submitRun(run.clientRunId, points);
    return { status: 'sent', result };
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (isNetworkError(msg)) {
      await enqueue({ clientRunId: run.clientRunId, points, endedAt: Date.now() });
      return { status: 'queued' };
    }
    return { status: 'rejected', reason: msg || 'Corrida recusada.' };
  }
}

function isNetworkError(msg: string) {
  return /network|fetch|timeout|internet|Failed to send/i.test(msg);
}

async function enqueue(p: PendingRun) {
  const raw = await AsyncStorage.getItem(K_PENDING);
  const list: PendingRun[] = raw ? JSON.parse(raw) : [];
  list.push(p);
  await AsyncStorage.setItem(K_PENDING, JSON.stringify(list));
}

export async function pendingCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(K_PENDING);
  return raw ? (JSON.parse(raw) as PendingRun[]).length : 0;
}

/** Reenvia corridas pendentes. Descarta as que o servidor recusar ou que passaram de 72 h. */
export async function flushPending(): Promise<SubmitResult[]> {
  const raw = await AsyncStorage.getItem(K_PENDING);
  if (!raw) return [];
  const list: PendingRun[] = JSON.parse(raw);
  const keep: PendingRun[] = [];
  const sent: SubmitResult[] = [];
  for (const p of list) {
    if (Date.now() - p.endedAt > RULES.MAX_AGE_S * 1000) continue;
    try {
      sent.push(await submitRun(p.clientRunId, p.points));
    } catch (e) {
      if (isNetworkError((e as Error).message ?? '')) keep.push(p);
    }
  }
  await AsyncStorage.setItem(K_PENDING, JSON.stringify(keep));
  return sent;
}

/** Remove tudo que é local (usado no logout e na exclusão de conta). */
export async function clearLocalData() {
  await stopUpdates();
  await serial(() => AsyncStorage.multiRemove([K_ACTIVE, K_POINTS, K_PENDING]));
}
