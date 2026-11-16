/**
 * POST /functions/v1/submit-run
 * Body: { clientRunId: uuid, points: [{ t, lat, lng, acc }] }
 *
 * Recebe os pontos de GPS brutos, valida (antifraude), recalcula distância e km por
 * território e grava tudo numa transação via apply_run (service_role).
 */
import { adminClient, getUser, json, readJson } from '../_shared/http.ts';
import { validateRun } from '../_shared/validateRun.ts';

const MAX_BODY_BYTES = 3 * 1024 * 1024; // ~30 mil pontos
const MAX_RUNS_PER_DAY = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);

  const admin = adminClient();
  const user = await getUser(req, admin);
  if (!user) return json({ error: 'não autenticado' }, 401);

  // Termos aceitos?
  const { data: profile } = await admin
    .from('profiles').select('terms_accepted_at').eq('id', user.id).single();
  if (!profile?.terms_accepted_at) return json({ error: 'aceite os termos de uso primeiro' }, 403);

  let body: { clientRunId?: unknown; points?: unknown };
  try {
    body = (await readJson(req, MAX_BODY_BYTES)) as typeof body;
  } catch (e) {
    return json({ error: (e as Error).message || 'corpo inválido' }, 400);
  }
  if (typeof body.clientRunId !== 'string' || !UUID_RE.test(body.clientRunId)) {
    return json({ error: 'clientRunId inválido' }, 400);
  }

  // Idempotência: se já existe, devolve sem processar de novo
  const { data: existing } = await admin
    .from('runs').select('id, distance_km')
    .eq('user_id', user.id).eq('client_run_id', body.clientRunId).maybeSingle();
  if (existing) return json({ runId: existing.id, distanceKm: Number(existing.distance_km), duplicate: true });

  // Limite de envios por dia
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from('runs').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= MAX_RUNS_PER_DAY) return json({ error: 'limite diário de corridas atingido' }, 429);

  const v = validateRun(body.points);
  if (!v.ok) return json({ error: v.reason }, 422);

  // Trajeto compacto, só para o dono ver
  const route = (body.points as { t: number; lat: number; lng: number }[]).map((p) => [
    Math.round(p.lat * 1e6) / 1e6,
    Math.round(p.lng * 1e6) / 1e6,
    p.t,
  ]);

  const { data: runId, error } = await admin.rpc('apply_run', {
    p_user_id: user.id,
    p_client_run_id: body.clientRunId,
    p_started_at: new Date(v.startedAt).toISOString(),
    p_ended_at: new Date(v.endedAt).toISOString(),
    p_distance_km: v.distanceKm,
    p_moving_seconds: v.movingSeconds,
    p_route: route,
    p_flags: v.flags,
    p_cells: v.cells,
  });
  if (error) {
    console.error('apply_run', error);
    return json({ error: 'falha ao salvar a corrida' }, 500);
  }

  return json({
    runId,
    distanceKm: v.distanceKm,
    movingSeconds: v.movingSeconds,
    cells: v.cells,
  });
});
