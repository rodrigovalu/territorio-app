/**
 * Grade hexagonal de territórios.
 *
 * ESTE ARQUIVO É COMPARTILHADO entre o app (React Native) e as Edge Functions (Deno).
 * Não importe nada aqui — precisa rodar nos dois ambientes.
 *
 * Como funciona
 * - As coordenadas (lat/lng) são projetadas numa projeção azimutal equivalente de Lambert
 *   (LAEA), que preserva áreas. Assim todo hexágono tem a mesma área real em qualquer lugar
 *   do Brasil.
 * - No plano projetado (em km), usamos uma grade de hexágonos "pointy-top" em coordenadas
 *   axiais (q, r).
 *
 * ⚠️ NUNCA altere GRID_ORIGIN nem HEX_SIDE_KM depois que o app estiver em produção:
 * todos os territórios mudariam de lugar e o histórico ficaria inconsistente.
 */

/** Área de cada território, em km². */
export const HEX_AREA_KM2 = 40;
/** Lado do hexágono (= raio do círculo circunscrito), em km. ≈ 3,92 km */
export const HEX_SIDE_KM = Math.sqrt((2 * HEX_AREA_KM2) / (3 * Math.sqrt(3)));
/** Distância de ponta a ponta do hexágono (vértice a vértice), em km. ≈ 7,85 km */
export const HEX_CORNER_TO_CORNER_KM = HEX_SIDE_KM * 2;
/** Centro da projeção: centro geográfico aproximado do Brasil. */
export const GRID_ORIGIN = { lat: -15.0, lng: -52.0 } as const;

const R_EARTH_KM = 6371.0088;
const DEG = Math.PI / 180;
const SQRT3 = Math.sqrt(3);

const PHI0 = GRID_ORIGIN.lat * DEG;
const LAM0 = GRID_ORIGIN.lng * DEG;
const SIN_PHI0 = Math.sin(PHI0);
const COS_PHI0 = Math.cos(PHI0);

export type LatLng = { latitude: number; longitude: number };
export type CellId = string; // formato "q_r", ex.: "12_-40"

// ---------------------------------------------------------------------------
// Projeção LAEA (esfera) — km
// ---------------------------------------------------------------------------
export function project(lat: number, lng: number): [number, number] {
  const phi = lat * DEG;
  const dLam = lng * DEG - LAM0;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const cosDLam = Math.cos(dLam);
  const k = Math.sqrt(2 / (1 + SIN_PHI0 * sinPhi + COS_PHI0 * cosPhi * cosDLam));
  const x = R_EARTH_KM * k * cosPhi * Math.sin(dLam);
  const y = R_EARTH_KM * k * (COS_PHI0 * sinPhi - SIN_PHI0 * cosPhi * cosDLam);
  return [x, y];
}

export function unproject(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  if (rho < 1e-9) return [GRID_ORIGIN.lat, GRID_ORIGIN.lng];
  const c = 2 * Math.asin(rho / (2 * R_EARTH_KM));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const phi = Math.asin(cosC * SIN_PHI0 + (y * sinC * COS_PHI0) / rho);
  const lam = LAM0 + Math.atan2(x * sinC, rho * COS_PHI0 * cosC - y * SIN_PHI0 * sinC);
  return [phi / DEG, lam / DEG];
}

// ---------------------------------------------------------------------------
// Grade hexagonal
// ---------------------------------------------------------------------------
export const cellKey = (q: number, r: number): CellId => `${q}_${r}`;

export function parseCell(id: CellId): [number, number] {
  const m = /^(-?\d{1,6})_(-?\d{1,6})$/.exec(id);
  if (!m) throw new Error(`cell id inválido: ${id}`);
  return [Number(m[1]), Number(m[2])];
}

export function isValidCellId(id: unknown): id is CellId {
  return typeof id === 'string' && /^-?\d{1,6}_-?\d{1,6}$/.test(id);
}

function axialRound(qf: number, rf: number): [number, number] {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q + 0, r + 0]; // +0 evita "-0"
}

export function cellFromXY(x: number, y: number): CellId {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / HEX_SIDE_KM;
  const rf = ((2 / 3) * y) / HEX_SIDE_KM;
  const [q, r] = axialRound(qf, rf);
  return cellKey(q, r);
}

export function cellFromLatLng(lat: number, lng: number): CellId {
  const [x, y] = project(lat, lng);
  return cellFromXY(x, y);
}

export function cellCenterXY(id: CellId): [number, number] {
  const [q, r] = parseCell(id);
  return [HEX_SIDE_KM * SQRT3 * (q + r / 2), HEX_SIDE_KM * 1.5 * r];
}

export function cellCenter(id: CellId): LatLng {
  const [x, y] = cellCenterXY(id);
  const [latitude, longitude] = unproject(x, y);
  return { latitude, longitude };
}

/** Vértices do hexágono (6 pontos), prontos para um Polygon do mapa. */
export function cellBoundary(id: CellId): LatLng[] {
  const [cx, cy] = cellCenterXY(id);
  const out: LatLng[] = [];
  for (let i = 0; i < 6; i++) {
    const a = DEG * (60 * i - 30);
    const [latitude, longitude] = unproject(cx + HEX_SIDE_KM * Math.cos(a), cy + HEX_SIDE_KM * Math.sin(a));
    out.push({ latitude, longitude });
  }
  return out;
}

export function cellDistance(a: CellId, b: CellId): number {
  const [q1, r1] = parseCell(a);
  const [q2, r2] = parseCell(b);
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Todas as células a até `k` passos de `id` (inclui a própria). */
export function cellDisk(id: CellId, k: number): CellId[] {
  const [q0, r0] = parseCell(id);
  const out: CellId[] = [];
  for (let dq = -k; dq <= k; dq++) {
    for (let dr = Math.max(-k, -dq - k); dr <= Math.min(k, -dq + k); dr++) {
      out.push(cellKey(q0 + dq, r0 + dr));
    }
  }
  return out;
}

/**
 * Células que cobrem uma área retangular do mapa (região visível).
 * `limit` evita gerar milhares de polígonos quando o usuário afasta muito o zoom.
 */
export function cellsInBounds(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
  limit = 400,
): CellId[] {
  const corners = [
    project(minLat, minLng),
    project(minLat, maxLng),
    project(maxLat, minLng),
    project(maxLat, maxLng),
    project((minLat + maxLat) / 2, minLng),
    project((minLat + maxLat) / 2, maxLng),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = HEX_SIDE_KM;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;

  const set = new Set<CellId>();
  const stepX = HEX_SIDE_KM * SQRT3 * 0.5;
  const stepY = HEX_SIDE_KM * 0.75;
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      set.add(cellFromXY(x, y));
      if (set.size >= limit) return [...set];
    }
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Distâncias geográficas
// ---------------------------------------------------------------------------
/** Distância entre dois pontos em metros (haversine). */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dPhi = (lat2 - lat1) * DEG;
  const dLam = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLam / 2) ** 2;
  return 2 * R_EARTH_KM * 1000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
