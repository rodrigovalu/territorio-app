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
  /** altitude em metros (opcional) */
  alt?: number | null;
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

export type Split = {
  /** número do km (1, 2, 3…) */
  km: number;
  /** segundos gastos neste km */
  s: number;
  /** tempo total em movimento ao completar este km */
  totalS: number;
};

/**
 * Acumulador da corrida. É o MESMO cálculo no celular (ao vivo, para pace e avisos de voz)
 * e no servidor (oficial). O estado é um objeto simples, que pode ser salvo em JSON.
 */
export type AccState = {
  lastPt: GpsPoint | null;
  distM: number;
  rawM: number;
  vehicleM: number;
  movingS: number;
  splits: Split[];
  eleRef: number | null;
  gainM: number;
  dropped: number;
  vehicleSeg: number;
  gapSeg: number;
  cellsM: Record<CellId, number>;
};

export const newAcc = (): AccState => ({
  lastPt: null,
  distM: 0,
  rawM: 0,
  vehicleM: 0,
  movingS: 0,
  splits: [],
  eleRef: null,
  gainM: 0,
  dropped: 0,
  vehicleSeg: 0,
  gapSeg: 0,
  cellsM: {},
});

const ELEVATION_THRESHOLD_M = 4;

/**
 * Adiciona um ponto. Devolve os km completados por este ponto (normalmente 0 ou 1).
 * `withCells` só é necessário no servidor.
 */
export function accPush(st: AccState, p: GpsPoint, withCells = false): Split[] {
  if (isNum(p.acc) && p.acc > RULES.MAX_ACCURACY_M) {
    st.dropped++;
    return [];
  }
  const a = st.lastPt;
  st.lastPt = { t: p.t, lat: p.lat, lng: p.lng, alt: p.alt ?? null };
  if (!a) {
    if (isNum(p.alt)) st.eleRef = p.alt;
    return [];
  }
  const dt = (p.t - a.t) / 1000;
  if (dt <= 0) return [];
  const d = haversineM(a.lat, a.lng, p.lat, p.lng);
  st.rawM += d;
  if (dt > RULES.MAX_GAP_S) {
    st.gapSeg++;
    return [];
  }
  if (d / dt > RULES.MAX_SEGMENT_SPEED_MS) {
    st.vehicleSeg++;
    st.vehicleM += d;
    return [];
  }

  const done: Split[] = [];
  const beforeM = st.distM;
  const beforeS = st.movingS;
  const segS = d > 0.5 ? dt : 0;
  st.distM += d;
  st.movingS += segS;

  // km completados dentro deste trecho (interpolação linear do tempo)
  let nextKm = st.splits.length + 1;
  while (st.distM >= nextKm * 1000) {
    const frac = d > 0 ? (nextKm * 1000 - beforeM) / d : 1;
    const totalS = beforeS + segS * frac;
    const prevTotal = st.splits.length ? st.splits[st.splits.length - 1].totalS : 0;
    const sp = { km: nextKm, s: Math.round(totalS - prevTotal), totalS: Math.round(totalS) };
    st.splits.push(sp);
    done.push(sp);
    nextKm++;
  }

  // ganho de elevação com histerese (o GPS oscila alguns metros)
  if (isNum(p.alt)) {
    if (st.eleRef == null) st.eleRef = p.alt;
    else if (p.alt - st.eleRef >= ELEVATION_THRESHOLD_M) {
      st.gainM += p.alt - st.eleRef;
      st.eleRef = p.alt;
    } else if (st.eleRef - p.alt >= ELEVATION_THRESHOLD_M) st.eleRef = p.alt;
  }

  if (withCells) {
    const cell = cellFromLatLng((a.lat + p.lat) / 2, (a.lng + p.lng) / 2);
    st.cellsM[cell] = (st.cellsM[cell] ?? 0) + d;
  }
  return done;
}

/** pace médio em segundos por km (null se distância muito pequena) */
export const paceSPerKm = (seconds: number, km: number) => (km >= 0.05 ? seconds / km : null);

export type RunValidation =
  | {
      ok: true;
      startedAt: number;
      endedAt: number;
      distanceKm: number;
      movingSeconds: number;
      avgPaceS: number | null;
      elevationGainM: number;
      splits: Split[];
      cells: Record<CellId, number>;
      flags: { droppedInaccurate: number; vehicleSegments: number; gapSegments: number };
    }
  | { ok: false; reason: string };

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateRun(raw: unknown, nowMs: number = Date.now()): RunValidation {
  if (!Array.isArray(raw)) return { ok: false, reason: 'formato inválido' };
  if (raw.length < RULES.MIN_POINTS) return { ok: false, reason: 'poucos pontos de GPS' };
  if (raw.length > RULES.MAX_POINTS) return { ok: false, reason: 'pontos demais' };

  let prevT = -Infinity;
  let firstT: number | null = null;
  let lastT = 0;
  const st = newAcc();
  for (const p of raw as GpsPoint[]) {
    if (!p || !isNum(p.t) || !isNum(p.lat) || !isNum(p.lng)) return { ok: false, reason: 'ponto inválido' };
    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) return { ok: false, reason: 'coordenada inválida' };
    if (p.alt != null && (!isNum(p.alt) || p.alt < -500 || p.alt > 9000)) return { ok: false, reason: 'altitude inválida' };
    if (p.t <= prevT) return { ok: false, reason: 'horários fora de ordem' };
    prevT = p.t;
    const accurate = !(isNum(p.acc) && p.acc > RULES.MAX_ACCURACY_M);
    if (accurate) {
      firstT ??= p.t;
      lastT = p.t;
    }
    accPush(st, p, true);
  }
  if (firstT == null || firstT === lastT) return { ok: false, reason: 'sinal de GPS fraco demais' };

  const durationS = (lastT - firstT) / 1000;
  if (durationS < RULES.MIN_DURATION_S) return { ok: false, reason: 'corrida curta demais' };
  if (durationS > RULES.MAX_DURATION_S) return { ok: false, reason: 'corrida longa demais' };
  if (lastT > nowMs + RULES.MAX_FUTURE_S * 1000) return { ok: false, reason: 'horário no futuro' };
  if (nowMs - lastT > RULES.MAX_AGE_S * 1000) return { ok: false, reason: 'corrida antiga demais para enviar' };

  if (st.rawM > 0 && st.vehicleM / st.rawM > RULES.MAX_VEHICLE_FRACTION) {
    return { ok: false, reason: 'velocidade incompatível com corrida' };
  }
  const distanceKm = Math.round(st.distM) / 1000;
  if (distanceKm < RULES.MIN_RUN_KM) return { ok: false, reason: 'distância muito pequena' };
  if (distanceKm > RULES.MAX_RUN_KM) return { ok: false, reason: 'distância acima do limite' };

  const cells: Record<CellId, number> = {};
  for (const [k, m] of Object.entries(st.cellsM)) {
    const km = Math.round(m) / 1000;
    if (km > 0) cells[k] = km;
  }
  const movingSeconds = Math.round(st.movingS);
  const pace = paceSPerKm(movingSeconds, distanceKm);

  return {
    ok: true,
    startedAt: firstT,
    endedAt: lastT,
    distanceKm,
    movingSeconds,
    avgPaceS: pace == null ? null : Math.round(pace),
    elevationGainM: Math.round(st.gainM),
    splits: st.splits,
    cells,
    flags: { droppedInaccurate: st.dropped, vehicleSegments: st.vehicleSeg, gapSegments: st.gapSeg },
  };
}
