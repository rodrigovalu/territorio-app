-- =============================================================================
-- Território — esquema inicial
-- Regras de segurança:
--   * RLS ligado em TODAS as tabelas.
--   * O app (role "authenticated") NUNCA grava corridas nem km diretamente.
--     Só a Edge Function submit-run (service_role) grava, depois de validar o GPS.
--   * Dados agregados (donos dos territórios, rankings) são lidos apenas por funções
--     que expõem nome, cor e km — nunca trajetos.
--   * Trajetos (route) só podem ser lidos pelo próprio dono.
-- =============================================================================

-- gen_random_uuid() é nativo do Postgres 13+

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text not null check (char_length(btrim(display_name)) between 2 and 30),
  color             text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar_url        text check (avatar_url is null or avatar_url ~ '^https://'),
  terms_version     text,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Qualquer usuário logado vê nome/cor/avatar dos outros (necessário para o mapa e ranking).
create policy "perfis visíveis para usuários logados"
  on public.profiles for select to authenticated using (true);

-- Cada um só altera o próprio perfil, e só as colunas liberadas abaixo.
create policy "usuário altera o próprio perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, color) on public.profiles to authenticated;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Cria o perfil automaticamente no primeiro login (nome vem do Google).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  palette text[] := array['#3B82F6','#22C55E','#E879F9','#FACC15','#06B6D4','#F43F5E',
                          '#A78BFA','#FB923C','#14B8A6','#84CC16','#EC4899','#6366F1'];
  raw_name text := coalesce(new.raw_user_meta_data ->> 'full_name',
                            new.raw_user_meta_data ->> 'name',
                            split_part(new.email, '@', 1), 'Corredor');
  clean text := left(btrim(regexp_replace(raw_name, '[^[:alnum:][:space:]._-]', '', 'g')), 30);
  avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  if char_length(clean) < 2 then clean := 'Corredor'; end if;
  if avatar is not null and avatar !~ '^https://' then avatar := null; end if;
  insert into public.profiles (id, display_name, color, avatar_url)
  values (new.id, clean, palette[1 + floor(random() * array_length(palette, 1))::int], avatar);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Aceite dos termos (LGPD). Versão é validada contra a vigente.
create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'não autenticado'; end if;
  if p_version is distinct from '2026-11' then raise exception 'versão dos termos inválida'; end if;
  update public.profiles
     set terms_version = p_version, terms_accepted_at = now()
   where id = (select auth.uid());
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Corridas
-- -----------------------------------------------------------------------------
create table public.runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  client_run_id  uuid not null,
  started_at     timestamptz not null,
  ended_at       timestamptz not null check (ended_at > started_at),
  month          date not null,
  distance_km    numeric(7,3) not null check (distance_km >= 0 and distance_km <= 100),
  moving_seconds integer not null check (moving_seconds >= 0),
  route          jsonb not null,               -- [[lat,lng,t], ...] — só o dono lê
  flags          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, client_run_id)              -- idempotência: reenvio não duplica
);
create index runs_user_started_idx on public.runs (user_id, started_at desc);

alter table public.runs enable row level security;
create policy "dono lê as próprias corridas"
  on public.runs for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.runs from anon, authenticated;
grant select on public.runs to authenticated;

create table public.run_cells (
  run_id  uuid not null references public.runs (id) on delete cascade,
  cell_id text not null check (cell_id ~ '^-?\d{1,6}_-?\d{1,6}$'),
  km      numeric(7,3) not null check (km > 0),
  primary key (run_id, cell_id)
);
alter table public.run_cells enable row level security;
create policy "dono lê as células das próprias corridas"
  on public.run_cells for select to authenticated
  using (exists (select 1 from public.runs r where r.id = run_id and r.user_id = (select auth.uid())));
revoke all on public.run_cells from anon, authenticated;
grant select on public.run_cells to authenticated;

-- -----------------------------------------------------------------------------
-- Totais mensais por território (base da disputa)
-- -----------------------------------------------------------------------------
create table public.cell_month_totals (
  month      date not null,
  cell_id    text not null check (cell_id ~ '^-?\d{1,6}_-?\d{1,6}$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  km         numeric(9,3) not null default 0 check (km >= 0),
  first_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (month, cell_id, user_id)
);
create index cmt_month_cell_km_idx on public.cell_month_totals (month, cell_id, km desc, first_at);

alter table public.cell_month_totals enable row level security;
-- sem policies: ninguém lê direto; acesso só pelas funções abaixo
revoke all on public.cell_month_totals from anon, authenticated;

-- Mês da disputa, no fuso de Brasília
create or replace function public.month_of(ts timestamptz) returns date
language sql immutable set search_path = '' as $$
  select date_trunc('month', ts at time zone 'America/Sao_Paulo')::date
$$;

-- -----------------------------------------------------------------------------
-- Gravação de corrida — chamada SOMENTE pela Edge Function (service_role)
-- -----------------------------------------------------------------------------
create or replace function public.apply_run(
  p_user_id uuid, p_client_run_id uuid, p_started_at timestamptz, p_ended_at timestamptz,
  p_distance_km numeric, p_moving_seconds integer, p_route jsonb, p_flags jsonb, p_cells jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_run_id uuid;
  v_month date := public.month_of(p_started_at);
  v_cell record;
begin
  insert into public.runs (user_id, client_run_id, started_at, ended_at, month, distance_km,
                           moving_seconds, route, flags)
  values (p_user_id, p_client_run_id, p_started_at, p_ended_at, v_month, p_distance_km,
          p_moving_seconds, p_route, coalesce(p_flags, '{}'::jsonb))
  on conflict (user_id, client_run_id) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    -- já enviada antes: devolve a existente sem somar de novo
    select id into v_run_id from public.runs
     where user_id = p_user_id and client_run_id = p_client_run_id;
    return v_run_id;
  end if;

  for v_cell in select key as cell_id, value::numeric as km from jsonb_each_text(p_cells) loop
    continue when v_cell.km <= 0;
    insert into public.run_cells (run_id, cell_id, km) values (v_run_id, v_cell.cell_id, v_cell.km);
    insert into public.cell_month_totals (month, cell_id, user_id, km)
    values (v_month, v_cell.cell_id, p_user_id, v_cell.km)
    on conflict (month, cell_id, user_id)
    do update set km = public.cell_month_totals.km + excluded.km, updated_at = now();
  end loop;

  return v_run_id;
end $$;
revoke all on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- Leituras públicas (apenas para usuários logados)
-- -----------------------------------------------------------------------------

-- Dono de cada território pedido (máx. 400 por chamada)
create or replace function public.get_territories(p_cells text[], p_month date default null)
returns table (cell_id text, owner_id uuid, owner_name text, owner_color text,
               owner_km numeric, runner_up_km numeric, runners integer, my_km numeric)
language sql stable security definer set search_path = '' as $$
  with params as (
    select coalesce(p_month, public.month_of(now())) as m,
           (select auth.uid()) as me
  ),
  cells as (
    select distinct c from unnest(p_cells[1:400]) c where c ~ '^-?\d{1,6}_-?\d{1,6}$'
  ),
  ranked as (
    select t.cell_id, t.user_id, t.km,
           row_number() over (partition by t.cell_id order by t.km desc, t.first_at) rn,
           count(*) over (partition by t.cell_id) n
      from public.cell_month_totals t, params
     where t.month = params.m and t.cell_id in (select c from cells) and t.km > 0
  )
  select r1.cell_id, r1.user_id, p.display_name, p.color, r1.km,
         coalesce(r2.km, 0), r1.n::int,
         coalesce((select t.km from public.cell_month_totals t, params
                    where t.month = params.m and t.cell_id = r1.cell_id and t.user_id = params.me), 0)
    from ranked r1
    join public.profiles p on p.id = r1.user_id
    left join ranked r2 on r2.cell_id = r1.cell_id and r2.rn = 2
   where r1.rn = 1
     and (select auth.uid()) is not null
$$;

-- Ranking de um território
create or replace function public.get_cell_ranking(p_cell text, p_month date default null, p_limit int default 20)
returns table (pos integer, user_id uuid, display_name text, color text, avatar_url text, km numeric)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by t.km desc, t.first_at))::int, t.user_id,
         p.display_name, p.color, p.avatar_url, t.km
    from public.cell_month_totals t
    join public.profiles p on p.id = t.user_id
   where t.month = coalesce(p_month, public.month_of(now()))
     and t.cell_id = p_cell and t.km > 0
     and (select auth.uid()) is not null
   order by t.km desc, t.first_at
   limit least(greatest(p_limit, 1), 50)
$$;

-- Ranking geral: quantos territórios cada um domina no mês
create or replace function public.get_leaderboard(p_month date default null, p_limit int default 50)
returns table (pos integer, user_id uuid, display_name text, color text, avatar_url text,
               territories integer, total_km numeric)
language sql stable security definer set search_path = '' as $$
  with m as (select coalesce(p_month, public.month_of(now())) as m),
  owners as (
    select distinct on (t.cell_id) t.cell_id, t.user_id
      from public.cell_month_totals t, m
     where t.month = m.m and t.km > 0
     order by t.cell_id, t.km desc, t.first_at
  ),
  totals as (
    select t.user_id, sum(t.km) as km from public.cell_month_totals t, m
     where t.month = m.m group by t.user_id
  ),
  agg as (
    select tt.user_id, coalesce(o.n, 0) as territories, tt.km
      from totals tt
      left join (select user_id, count(*) n from owners group by user_id) o on o.user_id = tt.user_id
  )
  select (row_number() over (order by a.territories desc, a.km desc))::int, a.user_id,
         p.display_name, p.color, p.avatar_url, a.territories::int, a.km
    from agg a join public.profiles p on p.id = a.user_id
   where (select auth.uid()) is not null
   order by a.territories desc, a.km desc
   limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.get_territories(text[], date) from public, anon;
revoke all on function public.get_cell_ranking(text, date, int) from public, anon;
revoke all on function public.get_leaderboard(date, int) from public, anon;
grant execute on function public.get_territories(text[], date) to authenticated;
grant execute on function public.get_cell_ranking(text, date, int) to authenticated;
grant execute on function public.get_leaderboard(date, int) to authenticated;

-- Funções internas não precisam ficar expostas
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
