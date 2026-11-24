import { FunctionsHttpError } from '@supabase/supabase-js';

import type { GpsPoint, Split } from '../../supabase/functions/_shared/validateRun';
import { TERMS_VERSION } from './env';
import { supabase } from './supabase';

export type Territory = {
  cell_id: string;
  owner_id: string;
  owner_name: string;
  owner_color: string;
  owner_km: number;
  runner_up_km: number;
  runners: number;
  my_km: number;
};

export type CellRank = {
  pos: number;
  user_id: string;
  display_name: string;
  color: string;
  avatar_url: string | null;
  km: number;
};

export type LeaderRow = {
  pos: number;
  user_id: string;
  display_name: string;
  color: string;
  avatar_url: string | null;
  territories: number;
  total_km: number;
};

export type RunRow = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_km: number;
  moving_seconds: number;
  avg_pace_s: number | null;
  elevation_gain_m: number;
};

export type RunDetail = RunRow & {
  splits: Split[];
  /** [lat, lng, t, alt] */
  route: [number, number, number, number | null][];
  best_km_s: number | null;
};

export type Medal = {
  id: string;
  title: string;
  description: string;
  tier: 'bronze' | 'prata' | 'ouro' | 'diamante';
  icon: string;
};

export type MedalProgress = Medal & {
  category: string;
  threshold: number;
  lower_is_better: boolean;
  value: number | null;
  earned_at: string | null;
};

export type MyStats = {
  week_km: number;
  week_runs: number;
  month_km: number;
  month_runs: number;
  total_km: number;
  total_runs: number;
  total_s: number;
  week_visits: number;
  best_km_s: number | null;
  best_5k_s: number | null;
  best_10k_s: number | null;
  best_21k_s: number | null;
  longest_km: number | null;
  best_pace_s: number | null;
};

const num = <T extends Record<string, unknown>>(rows: T[] | null, keys: (keyof T)[]): T[] =>
  (rows ?? []).map((r) => {
    const o = { ...r };
    for (const k of keys) o[k] = Number(o[k]) as T[keyof T];
    return o;
  });

export async function getTerritories(cells: string[]): Promise<Territory[]> {
  if (!cells.length) return [];
  const { data, error } = await supabase.rpc('get_territories', { p_cells: cells });
  if (error) throw error;
  return num<Territory>(data, ['owner_km', 'runner_up_km', 'my_km']);
}

export async function getCellRanking(cellId: string): Promise<CellRank[]> {
  const { data, error } = await supabase.rpc('get_cell_ranking', { p_cell: cellId });
  if (error) throw error;
  return num<CellRank>(data, ['km']);
}

export async function getLeaderboard(): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', {});
  if (error) throw error;
  return num<LeaderRow>(data, ['total_km']);
}

const RUN_COLS = 'id, started_at, ended_at, distance_km, moving_seconds, avg_pace_s, elevation_gain_m';

/** Histórico paginado (todas as corridas) */
export async function getMyRuns(page = 0, pageSize = 30): Promise<RunRow[]> {
  const from = page * pageSize;
  const { data, error } = await supabase
    .from('runs')
    .select(RUN_COLS)
    .order('started_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return num<RunRow>(data, ['distance_km']);
}

export async function getRun(id: string): Promise<RunDetail> {
  const { data, error } = await supabase
    .from('runs')
    .select(`${RUN_COLS}, splits, route, best_km_s`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return { ...(data as RunDetail), distance_km: Number(data.distance_km) };
}

export async function getMyStats(): Promise<MyStats> {
  const { data, error } = await supabase.rpc('get_my_stats');
  if (error) throw error;
  const o = data as Record<string, number | null>;
  for (const k of ['week_km', 'month_km', 'total_km', 'longest_km']) if (o[k] != null) o[k] = Number(o[k]);
  return o as unknown as MyStats;
}

export async function getMyAchievements(): Promise<MedalProgress[]> {
  const { data, error } = await supabase.rpc('get_my_achievements');
  if (error) throw error;
  return (data as MedalProgress[]).map((m) => ({
    ...m,
    threshold: Number(m.threshold),
    value: m.value == null ? null : Number(m.value),
  }));
}

/** Registra o acesso de hoje; devolve medalhas novas */
export async function recordVisit(): Promise<Medal[]> {
  const { data, error } = await supabase.rpc('record_visit');
  if (error) throw error;
  return (data as Medal[]) ?? [];
}

export async function acceptTerms() {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
  if (error) throw error;
}

export async function updateProfile(patch: { display_name?: string; color?: string }) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('não autenticado');
  const { error } = await supabase.from('profiles').update(patch).eq('id', u.user.id);
  if (error) throw error;
}

async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return new Error(String(body.error));
    } catch {
      // ignora
    }
  }
  return error instanceof Error ? error : new Error('Erro de rede');
}

export type SubmitResult = {
  runId: string;
  distanceKm: number;
  movingSeconds: number;
  avgPaceS?: number | null;
  elevationGainM?: number;
  splits?: Split[];
  cells?: Record<string, number>;
  duplicate?: boolean;
  newAchievements?: Medal[];
};

export async function submitRun(clientRunId: string, points: GpsPoint[]): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke<SubmitResult>('submit-run', {
    body: { clientRunId, points },
  });
  if (error) throw await functionError(error);
  return data!;
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'EXCLUIR' } });
  if (error) throw await functionError(error);
}

// ---------------------------------------------------------------------------
// Alertas de território e notificações
export type TerritoryAlert = {
  id: string;
  kind: 'threat' | 'lost';
  cell_id: string;
  challenger_name: string;
  my_km: number;
  challenger_km: number;
  created_at: string;
  read_at: string | null;
  current_owner_is_me: boolean | null;
  current_gap_km: number | null;
};

export async function getMyAlerts(): Promise<TerritoryAlert[]> {
  const { data, error } = await supabase.rpc('get_my_alerts', { p_limit: 50 });
  if (error) throw error;
  return (data as TerritoryAlert[]).map((a) => ({
    ...a,
    my_km: Number(a.my_km),
    challenger_km: Number(a.challenger_km),
    current_gap_km: a.current_gap_km == null ? null : Number(a.current_gap_km),
  }));
}

export async function markAlertsRead() {
  const { error } = await supabase.rpc('mark_alerts_read');
  if (error) throw error;
}

export async function registerPushToken(token: string) {
  const { error } = await supabase.rpc('register_push_token', { p_token: token });
  if (error) throw error;
}

export async function unregisterPushToken(token: string) {
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) throw error;
}
