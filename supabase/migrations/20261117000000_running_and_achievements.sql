-- =============================================================================
-- v2: estatísticas completas da corrida, recordes, acessos semanais e medalhas
-- Mesmas regras: o app não grava nada disso diretamente. Medalhas são concedidas
-- apenas pelo servidor (apply_run / record_visit).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estatísticas da corrida
-- -----------------------------------------------------------------------------
alter table public.runs
  add column avg_pace_s       integer check (avg_pace_s is null or avg_pace_s > 0),
  add column elevation_gain_m integer not null default 0 check (elevation_gain_m >= 0),
  add column splits           jsonb   not null default '[]'::jsonb,
  add column time_1k_s        integer,   -- tempo em movimento ao completar o 1º km
  add column time_5k_s        integer,
  add column time_10k_s       integer,
  add column time_21k_s       integer,
  add column best_km_s        integer;   -- km mais rápido da corrida

-- -----------------------------------------------------------------------------
-- Acessos (1 registro por usuário por dia, fuso de Brasília)
-- -----------------------------------------------------------------------------
create table public.user_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.user_visits enable row level security;
create policy "dono lê os próprios acessos"
  on public.user_visits for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_visits from anon, authenticated;
grant select on public.user_visits to authenticated;

-- -----------------------------------------------------------------------------
-- Catálogo de medalhas
-- -----------------------------------------------------------------------------
create table public.achievements (
  id              text primary key,
  category        text not null check (category in
                    ('run_distance','run_count','total_km','weekly_days','weekly_streak',
                     'territory','time_5k','time_10k','elevation')),
  threshold       numeric not null,
  lower_is_better boolean not null default false,
  tier            text not null check (tier in ('bronze','prata','ouro','diamante')),
  title           text not null,
  description     text not null,
  icon            text not null,      -- nome do ícone Material Symbols
  sort            integer not null
);
alter table public.achievements enable row level security;
create policy "catálogo visível para usuários logados"
  on public.achievements for select to authenticated using (true);
revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;

insert into public.achievements (id, category, threshold, lower_is_better, tier, title, description, icon, sort) values
  ('first_run',   'run_count',     1,       false, 'bronze',   'Primeira corrida',        'Registre sua primeira corrida.',                       'directions_run',          10),
  ('first_1k',    'run_distance',  1,       false, 'bronze',   'Primeiro quilômetro',     'Complete 1 km numa única corrida.',                    'flag',                    20),
  ('first_5k',    'run_distance',  5,       false, 'prata',    'Primeiros 5 km',          'Complete 5 km numa única corrida.',                    'flag',                    30),
  ('first_10k',   'run_distance',  10,      false, 'ouro',     'Primeiros 10 km',         'Complete 10 km numa única corrida.',                   'flag',                    40),
  ('first_21k',   'run_distance',  21.0975, false, 'diamante', 'Meia maratona',           'Complete 21,1 km numa única corrida.',                 'military_tech',           50),
  ('first_42k',   'run_distance',  42.195,  false, 'diamante', 'Maratona',                'Complete 42,2 km numa única corrida.',                 'emoji_events',            60),
  ('runs_10',     'run_count',     10,      false, 'bronze',   '10 corridas',             'Registre 10 corridas.',                                'repeat',                  70),
  ('runs_50',     'run_count',     50,      false, 'prata',    '50 corridas',             'Registre 50 corridas.',                                'repeat',                  80),
  ('runs_100',    'run_count',     100,     false, 'ouro',     '100 corridas',            'Registre 100 corridas.',                               'repeat',                  90),
  ('total_50',    'total_km',      50,      false, 'bronze',   '50 km acumulados',        'Some 50 km em todas as corridas.',                     'route',                  100),
  ('total_100',   'total_km',      100,     false, 'prata',    '100 km acumulados',       'Some 100 km em todas as corridas.',                    'route',                  110),
  ('total_500',   'total_km',      500,     false, 'ouro',     '500 km acumulados',       'Some 500 km em todas as corridas.',                    'route',                  120),
  ('total_1000',  'total_km',      1000,    false, 'diamante', '1.000 km acumulados',     'Some 1.000 km em todas as corridas.',                  'route',                  130),
  ('week_3',      'weekly_days',   3,       false, 'bronze',   'Presença: 3 dias',        'Acesse o app em 3 dias diferentes da mesma semana.',   'calendar_month',         140),
  ('week_5',      'weekly_days',   5,       false, 'prata',    'Presença: 5 dias',        'Acesse o app em 5 dias diferentes da mesma semana.',   'calendar_month',         150),
  ('week_7',      'weekly_days',   7,       false, 'ouro',     'Semana perfeita',         'Acesse o app todos os dias de uma semana.',            'calendar_month',         160),
  ('streak_4',    'weekly_streak', 4,       false, 'prata',    '4 semanas seguidas',      '4 semanas seguidas com pelo menos 3 acessos cada.',    'local_fire_department',  170),
  ('streak_12',   'weekly_streak', 12,      false, 'ouro',     '12 semanas seguidas',     '12 semanas seguidas com pelo menos 3 acessos cada.',   'local_fire_department',  180),
  ('terr_1',      'territory',     1,       false, 'prata',    'Primeiro território',     'Seja dono de um território no mês.',                   'map',                    190),
  ('terr_3',      'territory',     3,       false, 'ouro',     'Conquistador',            'Seja dono de 3 territórios ao mesmo tempo.',           'map',                    200),
  ('sub30_5k',    'time_5k',       1800,    true,  'prata',    '5 km em menos de 30 min', 'Complete os primeiros 5 km de uma corrida em até 30 min.', 'speed',              210),
  ('sub25_5k',    'time_5k',       1500,    true,  'ouro',     '5 km em menos de 25 min', 'Complete os primeiros 5 km de uma corrida em até 25 min.', 'speed',              220),
  ('sub60_10k',   'time_10k',      3600,    true,  'ouro',     '10 km em menos de 1 h',   'Complete os primeiros 10 km de uma corrida em até 1 hora.', 'speed',             230),
  ('climb_200',   'elevation',     200,     false, 'prata',    'Subidão',                 'Acumule 200 m de subida numa única corrida.',          'landscape',              240);

create table public.user_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  earned_at      timestamptz not null default now(),
  run_id         uuid references public.runs (id) on delete set null,
  primary key (user_id, achievement_id)
);
alter table public.user_achievements enable row level security;
create policy "dono lê as próprias medalhas"
  on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_achievements from anon, authenticated;
grant select on public.user_achievements to authenticated;

-- -----------------------------------------------------------------------------
-- Progresso de cada medalha para um usuário
-- -----------------------------------------------------------------------------
create or replace function public.achievement_progress(p_user uuid)
returns table (achievement_id text, value numeric, achieved boolean)
language sql stable security definer set search_path = '' as $$
  with r as (
    select max(distance_km) as max_km, count(*) as n, coalesce(sum(distance_km), 0) as total,
           min(time_5k_s) as t5, min(time_10k_s) as t10, max(elevation_gain_m) as climb
      from public.runs where user_id = p_user
  ),
  w as (
    select date_trunc('week', day)::date as wk, count(*) as days
      from public.user_visits where user_id = p_user group by 1
  ),
  wk3 as (  -- semanas com 3+ acessos; ilhas de semanas consecutivas
    select wk, wk - (row_number() over (order by wk) * 7)::int as grp from w where days >= 3
  ),
  streak as (select coalesce(max(c), 0) as best from (select count(*) c from wk3 group by grp) x),
  terr as (
    select count(*) as owned from (
      select distinct on (t.cell_id) t.cell_id, t.user_id
        from public.cell_month_totals t
       where t.month = public.month_of(now()) and t.km > 0
       order by t.cell_id, t.km desc, t.first_at
    ) o where o.user_id = p_user
  ),
  v as (
    select a.id, a.threshold, a.lower_is_better,
           case a.category
             when 'run_distance'  then (select max_km from r)
             when 'run_count'     then (select n from r)
             when 'total_km'      then (select total from r)
             when 'weekly_days'   then (select coalesce(max(days), 0) from w)
             when 'weekly_streak' then (select best from streak)
             when 'territory'     then (select owned from terr)
             when 'time_5k'       then (select t5 from r)
             when 'time_10k'      then (select t10 from r)
             when 'elevation'     then (select climb from r)
           end::numeric as value
      from public.achievements a
  )
  select v.id, v.value,
         coalesce(case when v.lower_is_better then v.value <= v.threshold else v.value >= v.threshold end, false)
    from v
$$;
revoke all on function public.achievement_progress(uuid) from public, anon, authenticated;

-- Concede as medalhas que faltam. Devolve as novas.
create or replace function public.evaluate_achievements(p_user uuid, p_run_id uuid default null)
returns setof text
language sql volatile security definer set search_path = '' as $$
  insert into public.user_achievements (user_id, achievement_id, run_id)
  select p_user, p.achievement_id, p_run_id
    from public.achievement_progress(p_user) p
   where p.achieved
  on conflict (user_id, achievement_id) do nothing
  returning achievement_id
$$;
revoke all on function public.evaluate_achievements(uuid, uuid) from public, anon, authenticated;

create or replace function public.achievements_json(p_ids text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'description', a.description,
                                               'tier', a.tier, 'icon', a.icon) order by a.sort), '[]'::jsonb)
    from public.achievements a where a.id = any(p_ids)
$$;
revoke all on function public.achievements_json(text[]) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- apply_run v2 (somente service_role)
-- -----------------------------------------------------------------------------
drop function if exists public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb);

create or replace function public.apply_run(
  p_user_id uuid, p_client_run_id uuid, p_started_at timestamptz, p_ended_at timestamptz,
  p_distance_km numeric, p_moving_seconds integer, p_route jsonb, p_flags jsonb, p_cells jsonb,
  p_stats jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run_id uuid;
  v_month date := public.month_of(p_started_at);
  v_cell record;
  v_splits jsonb := coalesce(p_stats -> 'splits', '[]'::jsonb);
  v_new text[];
begin
  if jsonb_typeof(v_splits) <> 'array' or jsonb_array_length(v_splits) > 200 then
    raise exception 'splits inválidos';
  end if;

  insert into public.runs (user_id, client_run_id, started_at, ended_at, month, distance_km,
                           moving_seconds, route, flags, avg_pace_s, elevation_gain_m, splits,
                           time_1k_s, time_5k_s, time_10k_s, time_21k_s, best_km_s)
  values (p_user_id, p_client_run_id, p_started_at, p_ended_at, v_month, p_distance_km,
          p_moving_seconds, p_route, coalesce(p_flags, '{}'::jsonb),
          nullif((p_stats ->> 'avgPaceS')::numeric, 0)::int,
          greatest(coalesce((p_stats ->> 'elevationGainM')::numeric, 0), 0)::int,
          v_splits,
          (v_splits -> 0  ->> 'totalS')::int,
          (v_splits -> 4  ->> 'totalS')::int,
          (v_splits -> 9  ->> 'totalS')::int,
          (v_splits -> 20 ->> 'totalS')::int,
          (select min((e ->> 's')::int) from jsonb_array_elements(v_splits) e))
  on conflict (user_id, client_run_id) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select id into v_run_id from public.runs
     where user_id = p_user_id and client_run_id = p_client_run_id;
    return jsonb_build_object('run_id', v_run_id, 'duplicate', true, 'new_achievements', '[]'::jsonb);
  end if;

  for v_cell in select key as cell_id, value::numeric as km from jsonb_each_text(p_cells) loop
    continue when v_cell.km <= 0;
    insert into public.run_cells (run_id, cell_id, km) values (v_run_id, v_cell.cell_id, v_cell.km);
    insert into public.cell_month_totals (month, cell_id, user_id, km)
    values (v_month, v_cell.cell_id, p_user_id, v_cell.km)
    on conflict (month, cell_id, user_id)
    do update set km = public.cell_month_totals.km + excluded.km, updated_at = now();
  end loop;

  -- correr também conta como acesso no dia
  insert into public.user_visits (user_id, day)
  values (p_user_id, (p_started_at at time zone 'America/Sao_Paulo')::date)
  on conflict do nothing;

  select array_agg(x) into v_new from public.evaluate_achievements(p_user_id, v_run_id) x;

  return jsonb_build_object('run_id', v_run_id, 'duplicate', false,
                            'new_achievements', public.achievements_json(coalesce(v_new, '{}')));
end $$;
revoke all on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- RPCs do app
-- -----------------------------------------------------------------------------

-- Registra o acesso de hoje e devolve medalhas novas (chamado ao abrir o app)
create or replace function public.record_visit() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_new text[];
begin
  if v_user is null then raise exception 'não autenticado'; end if;
  insert into public.user_visits (user_id, day)
  values (v_user, (now() at time zone 'America/Sao_Paulo')::date)
  on conflict do nothing;
  select array_agg(x) into v_new from public.evaluate_achievements(v_user) x;
  return public.achievements_json(coalesce(v_new, '{}'));
end $$;
revoke all on function public.record_visit() from public, anon;
grant execute on function public.record_visit() to authenticated;

-- Todas as medalhas com progresso do usuário logado
create or replace function public.get_my_achievements()
returns table (id text, category text, threshold numeric, lower_is_better boolean, tier text,
               title text, description text, icon text, value numeric, earned_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.category, a.threshold, a.lower_is_better, a.tier, a.title, a.description, a.icon,
         p.value, ua.earned_at
    from public.achievements a
    join public.achievement_progress((select auth.uid())) p on p.achievement_id = a.id
    left join public.user_achievements ua on ua.achievement_id = a.id and ua.user_id = (select auth.uid())
   where (select auth.uid()) is not null
   order by a.sort
$$;
revoke all on function public.get_my_achievements() from public, anon;
grant execute on function public.get_my_achievements() to authenticated;

-- Resumo e recordes pessoais
create or replace function public.get_my_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  r as (select * from public.runs where user_id = (select id from me)),
  wk as (select date_trunc('week', now() at time zone 'America/Sao_Paulo') as s),
  mo as (select date_trunc('month', now() at time zone 'America/Sao_Paulo') as s)
  select case when (select id from me) is null then null else jsonb_build_object(
    'week_km',    (select coalesce(sum(distance_km), 0) from r, wk where started_at at time zone 'America/Sao_Paulo' >= wk.s),
    'week_runs',  (select count(*) from r, wk where started_at at time zone 'America/Sao_Paulo' >= wk.s),
    'month_km',   (select coalesce(sum(distance_km), 0) from r, mo where started_at at time zone 'America/Sao_Paulo' >= mo.s),
    'month_runs', (select count(*) from r, mo where started_at at time zone 'America/Sao_Paulo' >= mo.s),
    'total_km',   (select coalesce(sum(distance_km), 0) from r),
    'total_runs', (select count(*) from r),
    'total_s',    (select coalesce(sum(moving_seconds), 0) from r),
    'week_visits',(select count(*) from public.user_visits v, wk
                    where v.user_id = (select id from me) and v.day >= wk.s::date),
    'best_km_s',  (select min(best_km_s) from r),
    'best_5k_s',  (select min(time_5k_s) from r),
    'best_10k_s', (select min(time_10k_s) from r),
    'best_21k_s', (select min(time_21k_s) from r),
    'longest_km', (select max(distance_km) from r),
    'best_pace_s',(select min(avg_pace_s) from r where distance_km >= 1)
  ) end
$$;
revoke all on function public.get_my_stats() from public, anon;
grant execute on function public.get_my_stats() to authenticated;
