/**
 * Gravação da corrida por GPS.
 *
 * Usa um "foreground service" do Android (notificação fixa enquanto corre). Com ele o app
 * continua recebendo a localização com a tela apagada, SEM precisar da permissão de
 * localização em segundo plano (ACCESS_BACKGROUND_LOCATION), que o Google Play restringe.
 *
 * Os pontos ficam só no aparelho até o envio. Corridas que não puderam ser enviadas (sem
 * internet) ficam numa fila e são reenviadas depois.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { haversineM } from '../../supabase/functions/_shared/hexgrid';
import { RULES, type GpsPoint } from '../../supabase/functions/_shared/validateRun';
import { submitRun, type SubmitResult } from './api';

export const TRACKING_TASK = 'territorio-run-tracking';

const K_ACTIVE = 'run:active';
const K_POINTS = 'run:points';
const K_PENDING = 'run:pending';

export type ActiveRun = {
  clientRunId: string;
  startedAt: number;
  paused: boolean;
  /** segundos acumulados até a última pausa */
  elapsedBeforePause: number;
  /** início do trecho atual (ms) */
  segmentStartedAt: number;
};

type PendingRun = { clientRunId: string; points: GpsPoint[]; endedAt: number };

// Fila simples para não perder pontos se duas entregas chegarem juntas
let writeChain: Promise<void> = Promise.resolve();
function appendPoints(pts: GpsPoint[]) {
  writeChain = writeChain.then(async () => {
    const raw = await AsyncStorage.getItem(K_POINTS);
    const all: GpsPoint[] = raw ? JSON.parse(raw) : [];
    const lastT = all.length ? all[all.length - 1].t : 0;
    for (const p of pts) if (p.t > lastT) all.push(p);
    await AsyncStorage.setItem(K_POINTS, JSON.stringify(all));
    listeners.forEach((l) => l());
  });
  return writeChain;
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
    }));
  if (pts.length) await appendPoints(pts);
});

// ----------------------------------------------------------------------------
const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getActiveRun(): Promise<ActiveRun | null> {
  const raw = await AsyncStorage.getItem(K_ACTIVE);
  return raw ? (JSON.parse(raw) as ActiveRun) : null;
}

export async function getPoints(): Promise<GpsPoint[]> {
  const raw = await AsyncStorage.getItem(K_POINTS);
  return raw ? JSON.parse(raw) : [];
}

/** Distância ao vivo (mesmos filtros do servidor, só para exibir). */
export function liveDistanceKm(points: GpsPoint[]): number {
  let m = 0;
  let prev: GpsPoint | null = null;
  for (const p of points) {
    if (p.acc != null && p.acc > RULES.MAX_ACCURACY_M) continue;
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      const d = haversineM(prev.lat, prev.lng, p.lat, p.lng);
      if (dt > 0 && dt <= RULES.MAX_GAP_S && d / dt <= RULES.MAX_SEGMENT_SPEED_MS) m += d;
    }
    prev = p;
  }
  return m / 1000;
}

export function elapsedSeconds(run: ActiveRun, now = Date.now()): number {
  return run.elapsedBeforePause + (run.paused ? 0 : (now - run.segmentStartedAt) / 1000);
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
    distanceInterval: 5,
    activityType: Location.LocationActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Corrida em andamento',
      notificationBody: 'O Território está registrando seu percurso.',
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
  };
  await AsyncStorage.multiSet([
    [K_ACTIVE, JSON.stringify(run)],
    [K_POINTS, '[]'],
  ]);
  await startUpdates();
  return run;
}

export async function pauseRun(): Promise<ActiveRun | null> {
  const run = await getActiveRun();
  if (!run || run.paused) return run;
  await stopUpdates();
  const next = { ...run, paused: true, elapsedBeforePause: elapsedSeconds(run) };
  await AsyncStorage.setItem(K_ACTIVE, JSON.stringify(next));
  return next;
}

export async function resumeRun(): Promise<ActiveRun | null> {
  const run = await getActiveRun();
  if (!run || !run.paused) return run;
  const next = { ...run, paused: false, segmentStartedAt: Date.now() };
  await AsyncStorage.setItem(K_ACTIVE, JSON.stringify(next));
  await startUpdates();
  return next;
}

export async function discardRun() {
  await stopUpdates();
  await writeChain;
  await AsyncStorage.multiRemove([K_ACTIVE, K_POINTS]);
}

/**
 * Encerra e envia. Se falhar por rede, a corrida vai para a fila de pendentes.
 * Se o servidor RECUSAR (antifraude, curta demais…), o erro é repassado.
 */
export async function finishRun(): Promise<
  { status: 'sent'; result: SubmitResult } | { status: 'queued' } | { status: 'rejected'; reason: string }
> {
  await stopUpdates();
  await writeChain;
  const run = await getActiveRun();
  const points = await getPoints();
  await AsyncStorage.multiRemove([K_ACTIVE, K_POINTS]);
  if (!run) return { status: 'rejected', reason: 'Nenhuma corrida ativa.' };

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
export async function flushPending(): Promise<number> {
  const raw = await AsyncStorage.getItem(K_PENDING);
  if (!raw) return 0;
  const list: PendingRun[] = JSON.parse(raw);
  const keep: PendingRun[] = [];
  let sent = 0;
  for (const p of list) {
    if (Date.now() - p.endedAt > RULES.MAX_AGE_S * 1000) continue;
    try {
      await submitRun(p.clientRunId, p.points);
      sent++;
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
  await writeChain;
  await AsyncStorage.multiRemove([K_ACTIVE, K_POINTS, K_PENDING]);
}
