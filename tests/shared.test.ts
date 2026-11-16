import { describe, expect, it } from 'vitest';
import {
  HEX_AREA_KM2,
  HEX_CORNER_TO_CORNER_KM,
  cellBoundary,
  cellCenter,
  cellDisk,
  cellFromLatLng,
  cellsInBounds,
  haversineM,
  project,
  unproject,
} from '../supabase/functions/_shared/hexgrid.ts';
import { RULES, validateRun, type GpsPoint } from '../supabase/functions/_shared/validateRun.ts';

const IBIRITE = { lat: -20.0216, lng: -44.0587 };

describe('hexgrid', () => {
  it('projeção ida e volta', () => {
    for (const [lat, lng] of [[-20.02, -44.05], [-3.1, -60.0], [-30.0, -51.2], [5, -35]]) {
      const [x, y] = project(lat, lng);
      const [la, ln] = unproject(x, y);
      expect(la).toBeCloseTo(lat, 9);
      expect(ln).toBeCloseTo(lng, 9);
    }
  });

  it('hexágono tem ~10 km de ponta a ponta e ~65 km²', () => {
    expect(HEX_CORNER_TO_CORNER_KM).toBe(10);
    expect(HEX_AREA_KM2).toBeCloseTo(64.95, 1);
    const id = cellFromLatLng(IBIRITE.lat, IBIRITE.lng);
    const b = cellBoundary(id);
    const d = haversineM(b[0].latitude, b[0].longitude, b[3].latitude, b[3].longitude);
    expect(d / 1000).toBeGreaterThan(9.8);
    expect(d / 1000).toBeLessThan(10.2);
  });

  it('centro da célula pertence à própria célula', () => {
    for (const id of cellDisk(cellFromLatLng(IBIRITE.lat, IBIRITE.lng), 3)) {
      const c = cellCenter(id);
      expect(cellFromLatLng(c.latitude, c.longitude)).toBe(id);
    }
  });

  it('cellsInBounds cobre a região', () => {
    const cells = cellsInBounds(-20.1, -44.15, -19.95, -43.95);
    expect(cells).toContain(cellFromLatLng(IBIRITE.lat, IBIRITE.lng));
    expect(cells.length).toBeLessThan(40);
  });
});

/** gera uma corrida em linha reta a `speedMs` m/s, um ponto a cada 2 s */
function fakeRun(km: number, speedMs = 3, endAgoS = 60, acc = 5): GpsPoint[] {
  const n = Math.round((km * 1000) / speedMs / 2);
  const end = Date.now() - endAgoS * 1000;
  const start = end - n * 2000;
  const pts: GpsPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const metres = i * 2 * speedMs;
    pts.push({ t: start + i * 2000, lat: IBIRITE.lat + metres / 111_320, lng: IBIRITE.lng, acc });
  }
  return pts;
}

describe('validateRun', () => {
  it('aceita corrida normal e calcula a distância', () => {
    const r = validateRun(fakeRun(10));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distanceKm).toBeGreaterThan(9.9);
      expect(r.distanceKm).toBeLessThan(10.1);
      const sum = Object.values(r.cells).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(r.distanceKm, 1);
      expect(Object.keys(r.cells).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('recusa velocidade de carro', () => {
    const r = validateRun(fakeRun(20, 15));
    expect(r.ok).toBe(false);
  });

  it('recusa corrida muito antiga', () => {
    const r = validateRun(fakeRun(5, 3, RULES.MAX_AGE_S + 100));
    expect(r.ok).toBe(false);
  });

  it('recusa horários fora de ordem', () => {
    const pts = fakeRun(2);
    pts[5].t = pts[3].t;
    expect(validateRun(pts).ok).toBe(false);
  });

  it('descarta trechos com salto de GPS sem recusar a corrida', () => {
    const pts = fakeRun(8);
    pts[100] = { ...pts[100], lat: pts[100].lat + 0.002 }; // salto de ~220 m
    const r = validateRun(pts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flags.vehicleSegments).toBeGreaterThan(0);
      expect(r.distanceKm).toBeLessThan(8.05);
    }
  });

  it('ignora pontos imprecisos', () => {
    const pts = fakeRun(3).map((p, i) => (i % 2 ? { ...p, acc: 80 } : p));
    const r = validateRun(pts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flags.droppedInaccurate).toBeGreaterThan(0);
  });

  it('recusa entrada malformada', () => {
    expect(validateRun('x').ok).toBe(false);
    expect(validateRun([{ t: 'a' }]).ok).toBe(false);
  });
});
