-- =============================================================================
-- v3: alertas de território (ameaça e perda) + tokens de notificação push
-- =============================================================================

-- Tokens de push (Expo). Um usuário pode ter vários aparelhos.
create table public.push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;  -- só via RPC / service_role

create or replace function public.register_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'não autenticado'; end if;
  if (select count(*) from public.push_tokens where user_id = v_user) >= 10 then
    delete from public.push_tokens where token in (
      select token from public.push_tokens where user_id = v_user order by updated_at limit 1);
  end if;
  -- o mesmo aparelho trocando de conta: o token passa para o usuário atual
  insert into public.push_tokens (token, user_id) values (p_token, v_user)
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid())
$$;

revoke all on function public.register_push_token(text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- Alertas
create table public.territory_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,   -- quem recebe
  kind          text not null check (kind in ('threat', 'lost')),
  cell_id       text not null check (cell_id ~ '^-?\d{1,6}_-?\d{1,6}$'),
  month         date not null,
  challenger_id uuid references auth.users (id) on delete set null,
  challenger_name text not null,
  my_km         numeric(9,3) not null,
  challenger_km numeric(9,3) not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index territory_alerts_user_idx on public.territory_alerts (user_id, created_at desc);
alter table public.territory_alerts enable row level security;
create policy "dono lê os próprios alertas"
  on public.territory_alerts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.territory_alerts from anon, authenticated;
grant select on public.territory_alerts to authenticated;

create or replace function public.mark_alerts_read() returns void
language sql security definer set search_path = '' as $$
  update public.territory_alerts set read_at = now()
   where user_id = (select auth.uid()) and read_at is null
$$;
revoke all on function public.mark_alerts_read() from public, anon;
grant execute on function public.mark_alerts_read() to authenticated;

-- Dono atual de cada célula (mês corrente)
create or replace function public.cell_leaders(p_month date, p_cells text[])
returns table (cell_id text, user_id uuid, km numeric, second_user uuid, second_km numeric)
language sql stable security definer set search_path = '' as $$
  with r as (
    select t.cell_id, t.user_id, t.km,
           row_number() over (partition by t.cell_id order by t.km desc, t.first_at) rn
      from public.cell_month_totals t
     where t.month = p_month and t.cell_id = any(p_cells) and t.km > 0
  )
  select a.cell_id, a.user_id, a.km, b.user_id, b.km
    from r a left join r b on b.cell_id = a.cell_id and b.rn = 2
   where a.rn = 1
$$;
revoke all on function public.cell_leaders(date, text[]) from public, anon, authenticated;

/**
 * Regra de ameaça: o desafiante ficou a menos de 20% (mínimo 1 km) do dono.
 * No máximo 1 alerta de ameaça por território a cada 12 h para o mesmo dono.
 */
create or replace function public.territory_events(p_user uuid, p_month date, p_cells text[], p_before jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now record;
  v_prev uuid;
  v_name text;
  v_out jsonb := '[]'::jsonb;
  v_id uuid;
begin
  select display_name into v_name from public.profiles where id = p_user;
  for v_now in select * from public.cell_leaders(p_month, p_cells) loop
    v_prev := nullif(p_before ->> v_now.cell_id, '')::uuid;

    if v_prev is not null and v_prev <> p_user and v_now.user_id = p_user then
      -- tomou o território de alguém
      insert into public.territory_alerts (user_id, kind, cell_id, month, challenger_id, challenger_name, my_km, challenger_km)
      values (v_prev, 'lost', v_now.cell_id, p_month, p_user, coalesce(v_name, 'Alguém'),
              coalesce((select km from public.cell_month_totals where month = p_month and cell_id = v_now.cell_id and user_id = v_prev), 0),
              v_now.km)
      returning id into v_id;
      v_out := v_out || jsonb_build_object('id', v_id, 'user_id', v_prev, 'kind', 'lost', 'cell_id', v_now.cell_id,
                                           'challenger', v_name, 'gap_km', 0);

    elsif v_now.user_id <> p_user and v_now.second_user = p_user
          and v_now.km - v_now.second_km <= greatest(1, v_now.km * 0.2)
          and not exists (select 1 from public.territory_alerts a
                           where a.user_id = v_now.user_id and a.cell_id = v_now.cell_id and a.kind = 'threat'
                             and a.created_at > now() - interval '12 hours') then
      insert into public.territory_alerts (user_id, kind, cell_id, month, challenger_id, challenger_name, my_km, challenger_km)
      values (v_now.user_id, 'threat', v_now.cell_id, p_month, p_user, coalesce(v_name, 'Alguém'), v_now.km, v_now.second_km)
      returning id into v_id;
      v_out := v_out || jsonb_build_object('id', v_id, 'user_id', v_now.user_id, 'kind', 'threat', 'cell_id', v_now.cell_id,
                                           'challenger', v_name, 'gap_km', round(v_now.km - v_now.second_km, 2));
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.territory_events(uuid, date, text[], jsonb) from public, anon, authenticated;

-- apply_run v3: igual à v2 + alertas
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
  v_cells text[];
  v_before jsonb;
  v_alerts jsonb;
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
    return jsonb_build_object('run_id', v_run_id, 'duplicate', true,
                              'new_achievements', '[]'::jsonb, 'alerts', '[]'::jsonb);
  end if;

  select array_agg(key) into v_cells from jsonb_object_keys(p_cells) key;
  v_cells := coalesce(v_cells, '{}');
  -- trava as células desta corrida para que duas corridas simultâneas não se atropelem
  perform pg_advisory_xact_lock(hashtext(v_month::text || c)) from unnest(v_cells) c order by c;
  select coalesce(jsonb_object_agg(l.cell_id, l.user_id), '{}'::jsonb) into v_before
    from public.cell_leaders(v_month, v_cells) l;

  for v_cell in select key as cell_id, value::numeric as km from jsonb_each_text(p_cells) loop
    continue when v_cell.km <= 0;
    insert into public.run_cells (run_id, cell_id, km) values (v_run_id, v_cell.cell_id, v_cell.km);
    insert into public.cell_month_totals (month, cell_id, user_id, km)
    values (v_month, v_cell.cell_id, p_user_id, v_cell.km)
    on conflict (month, cell_id, user_id)
    do update set km = public.cell_month_totals.km + excluded.km, updated_at = now();
  end loop;

  v_alerts := public.territory_events(p_user_id, v_month, v_cells, v_before);

  insert into public.user_visits (user_id, day)
  values (p_user_id, (p_started_at at time zone 'America/Sao_Paulo')::date)
  on conflict do nothing;

  select array_agg(x) into v_new from public.evaluate_achievements(p_user_id, v_run_id) x;

  return jsonb_build_object('run_id', v_run_id, 'duplicate', false,
                            'new_achievements', public.achievements_json(coalesce(v_new, '{}')),
                            'alerts', v_alerts);
end $$;
revoke all on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_run(uuid, uuid, timestamptz, timestamptz, numeric, integer, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- Lista de alertas do usuário logado
create or replace function public.get_my_alerts(p_limit int default 50)
returns table (id uuid, kind text, cell_id text, challenger_name text, my_km numeric,
               challenger_km numeric, created_at timestamptz, read_at timestamptz,
               current_owner_is_me boolean, current_gap_km numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.cell_id, a.challenger_name, a.my_km, a.challenger_km, a.created_at, a.read_at,
         l.user_id = a.user_id,
         case when l.user_id = a.user_id then l.km - coalesce(l.second_km, 0) end
    from public.territory_alerts a
    left join lateral public.cell_leaders(a.month, array[a.cell_id]) l on true
   where a.user_id = (select auth.uid())
   order by a.created_at desc
   limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.get_my_alerts(int) from public, anon;
grant execute on function public.get_my_alerts(int) to authenticated;

-- Termos atualizados (notificações): todos aceitam a nova versão
create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'não autenticado'; end if;
  -- a versão anterior continua aceita até todos atualizarem o app
  if p_version not in ('2026-11', '2026-11-24') then raise exception 'versão dos termos inválida'; end if;
  update public.profiles
     set terms_version = p_version, terms_accepted_at = now()
   where id = (select auth.uid());
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- Grade nova (40 km²): a única corrida registrada até aqui cai na célula 171_-98
update public.run_cells set cell_id = '171_-98' where cell_id = '134_-77';
update public.cell_month_totals set cell_id = '171_-98' where cell_id = '134_-77';
