/**
 * Validação antifraude de corridas.
 *
 * COMPARTILHADO entre app e Edge Function. O servidor SEMPRE recalcula tudo a partir dos
 * pontos de GPS brutos — nada do que o app informa (distância, tempo) é confiado.
 */
import { cellFromLatLng, haversineM, type CellId } from './hexgrid.ts';

export type GpsPoint = {
  /** epoch em milissegundos */
  t: number;
  lat: number;
  lng: number;
  /** precisão horizontal em metros (opcional) */
  acc?: number | null;
};

export const RULES = {
  MIN_POINTS: 10,
  MAX_POINTS: 30_000,
  MIN_DURATION_S: 60,
  MAX_DURATION_S: 8 * 3600,
  /** a corrida precisa ter terminado há no máximo 72 h */
  MAX_AGE_S: 72 * 3600,
  /** tolerância de relógio do aparelho */
  MAX_FUTURE_S: 5 * 60,
  /** pontos com precisão pior que isso são descartados */
  MAX_ACCURACY_M: 35,
  /** acima disso (≈ 25 km/h) o trecho não conta — veículo ou salto de GPS */
  MAX_SEGMENT_SPEED_MS: 7,
  /** perda de sinal maior que isso: o trecho não conta (evita "linha reta") */
  MAX_GAP_S: 60,
  /** se mais que 20% da distância bruta foi em velocidade de veículo, a corrida é recusada */
  MAX_VEHICLE_FRACTION: 0.2,
  /** limite de distância válida por corrida */
  MAX_RUN_KM: 100,
  /** distância mínima para registrar */
  MIN_RUN_KM: 0.2,
} as const;

export type RunValidation =
  | {
      ok: true;
      startedAt: number;
      endedAt: number;
      distanceKm: number;
      movingSeconds: number;
      cells: Record<CellId, number>;
      flags: { droppedInaccurate: number; vehicleSegments: number; gapSegments: number };
    }
  | { ok: false; reason: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateRun(raw: unknown, nowMs: number = Date.now()): RunValidation {
  if (!Array.isArray(raw)) return { ok: false, reason: 'formato inválido' };
  if (raw.length < RULES.MIN_POINTS) return { ok: false, reason: 'poucos pontos de GPS' };
  if (raw.length > RULES.MAX_POINTS) return { ok: false, reason: 'pontos demais' };

  const pts: GpsPoint[] = [];
  let droppedInaccurate = 0;
  let prevT = -Infinity;
  for (const p of raw as GpsPoint[]) {
    if (!p || !isNum(p.t) || !isNum(p.lat) || !isNum(p.lng)) return { ok: false, reason: 'ponto inválido' };
    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) return { ok: false, reason: 'coordenada inválida' };
    if (p.t <= prevT) return { ok: false, reason: 'horários fora de ordem' };
    prevT = p.t;
    if (isNum(p.acc) && p.acc > RULES.MAX_ACCURACY_M) {
      droppedInaccurate++;
      continue;
    }
    pts.push({ t: p.t, lat: p.lat, lng: p.lng });
  }
  if (pts.length < 2) return { ok: false, reason: 'sinal de GPS fraco demais' };

  const startedAt = pts[0].t;
  const endedAt = pts[pts.length - 1].t;
  const durationS = (endedAt - startedAt) / 1000;
  if (durationS < RULES.MIN_DURATION_S) return { ok: false, reason: 'corrida curta demais' };
  if (durationS > RULES.MAX_DURATION_S) return { ok: false, reason: 'corrida longa demais' };
  if (endedAt > nowMs + RULES.MAX_FUTURE_S * 1000) return { ok: false, reason: 'horário no futuro' };
  if (nowMs - endedAt > RULES.MAX_AGE_S * 1000) return { ok: false, reason: 'corrida antiga demais para enviar' };

  let validM = 0;
  let rawM = 0;
  let vehicleM = 0;
  let movingS = 0;
  let vehicleSegments = 0;
  let gapSegments = 0;
  const cellsM: Record<CellId, number> = {};

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dt = (b.t - a.t) / 1000;
    const d = haversineM(a.lat, a.lng, b.lat, b.lng);
    rawM += d;
    if (dt > RULES.MAX_GAP_S) {
      gapSegments++;
      continue;
    }
    if (d / dt > RULES.MAX_SEGMENT_SPEED_MS) {
      vehicleSegments++;
      vehicleM += d;
      continue;
    }
    validM += d;
    if (d > 0.5) movingS += dt;
    // atribui o trecho à célula do ponto médio (trechos têm poucos metros)
    const cell = cellFromLatLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    cellsM[cell] = (cellsM[cell] ?? 0) + d;
  }

  if (rawM > 0 && vehicleM / rawM > RULES.MAX_VEHICLE_FRACTION) {
    return { ok: false, reason: 'velocidade incompatível com corrida' };
  }
  const distanceKm = validM / 1000;
  if (distanceKm < RULES.MIN_RUN_KM) return { ok: false, reason: 'distância muito pequena' };
  if (distanceKm > RULES.MAX_RUN_KM) return { ok: false, reason: 'distância acima do limite' };

  const cells: Record<CellId, number> = {};
  for (const [k, m] of Object.entries(cellsM)) {
    const km = Math.round(m) / 1000;
    if (km > 0) cells[k] = km;
  }

  return {
    ok: true,
    startedAt,
    endedAt,
    distanceKm: Math.round(validM) / 1000,
    movingSeconds: Math.round(movingS),
    cells,
    flags: { droppedInaccurate, vehicleSegments, gapSegments },
  };
}
