import { FunctionsHttpError } from '@supabase/supabase-js';

import type { GpsPoint } from '../../supabase/functions/_shared/validateRun';
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

export async function getMyRuns(limit = 30): Promise<RunRow[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('id, started_at, ended_at, distance_km, moving_seconds')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return num<RunRow>(data, ['distance_km']);
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
  cells?: Record<string, number>;
  duplicate?: boolean;
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
