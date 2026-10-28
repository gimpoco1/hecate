begin;

-- Counters are private and have one row per account/action, rather than one row per request.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.request_quotas (
  subject text not null,
  action text not null,
  window_started_at timestamptz not null,
  requests integer not null,
  primary key (subject, action)
);
revoke all on private.request_quotas from public, anon, authenticated;

create function private.consume_quota(p_subject text, p_action text, p_limit integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_count integer;
begin
  insert into private.request_quotas as quota (subject, action, window_started_at, requests)
  values (p_subject, p_action, now(), 1)
  on conflict (subject, action) do update set
    requests = case when quota.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then 1 else quota.requests + 1 end,
    window_started_at = case when quota.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then now() else quota.window_started_at end
  returning requests into request_count;
  if request_count > p_limit then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'RATE_LIMITED', 'message', 'Too many requests. Wait before trying again.')::text,
      detail = json_build_object('status', 429, 'headers', json_build_object('Retry-After', p_window_seconds::text))::text;
  end if;
end;
$$;
revoke all on function private.consume_quota(text, text, integer, integer) from public, anon, authenticated;

create or replace function public.submit_app_feedback(p_id uuid, p_reason text, p_message text, p_reply_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  feedback_user_id uuid := auth.uid();
begin
  if feedback_user_id is null then
    raise exception 'Sign in before sending feedback.' using errcode = '42501';
  end if;
  -- Serialize an account's submissions, including simultaneous retries of one ID.
  perform pg_advisory_xact_lock(hashtextextended(feedback_user_id::text || ':feedback', 0));
  if exists (select 1 from public.app_feedback where id = p_id and user_id = feedback_user_id) then
    return;
  end if;
  perform private.consume_quota(feedback_user_id::text, 'feedback-minute', 1, 60);
  perform private.consume_quota(feedback_user_id::text, 'feedback-day', 5, 86400);
  perform private.consume_quota('global', 'feedback-hour', 100, 3600);
  insert into public.app_feedback (id, user_id, reason, message, reply_email)
  values (p_id, feedback_user_id, p_reason, nullif(btrim(p_message), ''), nullif(btrim(p_reply_email), ''));
end;
$$;
revoke all on function public.submit_app_feedback(uuid, text, text, text) from public, anon;
grant execute on function public.submit_app_feedback(uuid, text, text, text) to authenticated;

-- Run for every auth-user deletion, including administrator and Dashboard deletions.
create function private.delete_user_public_data()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.leaderboard_entries
  where entry_id in (select entry_id from public.leaderboard_profiles where user_id = old.id);
  delete from private.request_quotas where subject = old.id::text;
  return old;
end;
$$;
revoke all on function private.delete_user_public_data() from public, anon, authenticated;
create trigger delete_user_public_data before delete on auth.users
for each row execute function private.delete_user_public_data();

-- NOT VALID preserves historical data; PostgreSQL still checks every new/updated row.
alter table public.discovery_cells add constraint discovery_cells_tile_bounds
  check (cell_x < (1::bigint << cell_z) and cell_y < (1::bigint << cell_z)) not valid;
alter table public.discovered_cities add constraint discovered_cities_text_bounds
  check (char_length(city_id) between 1 and 160 and char_length(name) between 1 and 120) not valid;
alter table public.discovered_cities add constraint discovered_cities_geometry_size
  check (octet_length(geometry::text) <= 4194304) not valid;
alter table public.leaderboard_city_stats add constraint leaderboard_city_id_bounds
  check (char_length(city_id) between 1 and 160) not valid;
alter table public.leaderboard_city_stats add constraint leaderboard_city_distance_finite
  check (discovered_km >= 0 and discovered_km < 'Infinity'::double precision) not valid;
alter table public.leaderboard_entries add constraint leaderboard_total_finite
  check (total_discovered_km >= 0 and total_discovered_km < 'Infinity'::double precision) not valid;

create function private.validate_discovered_city()
returns trigger language plpgsql set search_path = '' as $$
declare
  boundary extensions.geometry;
begin
  if octet_length(new.geometry::text) > 4194304 or new.geometry ->> 'type' not in ('Polygon', 'MultiPolygon') then
    raise exception 'City geometry must be a Polygon or MultiPolygon no larger than 4 MiB.' using errcode = '22023';
  end if;
  boundary := extensions.st_geomfromgeojson(new.geometry);
  if boundary is null or extensions.st_isempty(boundary) or not extensions.st_isvalid(boundary)
     or extensions.st_npoints(boundary) > 100000
     or extensions.st_xmin(boundary::extensions.box3d) < -180 or extensions.st_xmax(boundary::extensions.box3d) > 180
     or extensions.st_ymin(boundary::extensions.box3d) < -90 or extensions.st_ymax(boundary::extensions.box3d) > 90 then
    raise exception 'City geometry must contain a valid geographic boundary with at most 100000 points.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_discovered_city() from public, anon, authenticated;
create trigger validate_discovered_city before insert or update of geometry on public.discovered_cities
for each row execute function private.validate_discovered_city();

create function private.validate_walk()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.point_count not between 2 and 20000 or extensions.st_npoints(new.route) <> new.point_count
     or extensions.st_isempty(new.route) or not extensions.st_isvalid(new.route)
     or extensions.st_xmin(new.route::extensions.box3d) < -180 or extensions.st_xmax(new.route::extensions.box3d) > 180
     or extensions.st_ymin(new.route::extensions.box3d) < -90 or extensions.st_ymax(new.route::extensions.box3d) > 90
     or not isfinite(new.started_at) or not isfinite(new.finished_at)
     or new.started_at < '1970-01-01'::timestamptz or new.finished_at > now() + interval '5 minutes' then
    raise exception 'Walks require 2–20000 geographic points, a matching point count, and valid past timestamps.' using errcode = '22023';
  end if;
  new.distance_m := extensions.st_length(new.route::extensions.geography);
  if new.achievement_eligible and new.distance_m > 15 * extract(epoch from (new.finished_at - new.started_at)) then
    raise exception 'Recorded walk distance exceeds the 15 m/s safety limit for its duration. Import this route as GPX instead.' using errcode = '22023';
  end if;
  if not (new.distance_m >= 0 and new.distance_m < 'Infinity'::double precision) then
    raise exception 'Walk distance must be finite.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_walk() from public, anon, authenticated;
create trigger validate_walk before insert or update on public.walks
for each row execute function private.validate_walk();

create table private.leaderboard_publish_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_id uuid not null,
  started_at timestamptz not null
);
revoke all on private.leaderboard_publish_requests from public, anon, authenticated;

create function public.begin_leaderboard_publish()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Sign in before publishing.' using errcode = '42501'; end if;
  perform private.consume_quota(auth.uid()::text, 'publish-minute', 6, 60);
  perform private.consume_quota(auth.uid()::text, 'publish-day', 100, 86400);
  insert into private.leaderboard_publish_requests values (auth.uid(), v_request_id, now())
  on conflict (user_id) do update set request_id = excluded.request_id, started_at = excluded.started_at;
  return v_request_id;
end;
$$;
revoke all on function public.begin_leaderboard_publish() from public, anon;
grant execute on function public.begin_leaderboard_publish() to authenticated;

-- Private history is paged by a stable (started_at, id) cursor and remains protected by RLS.
create function public.get_walk_routes_page(p_after_started_at timestamptz, p_after_id uuid, p_limit integer)
returns table (walk_id uuid, started_at timestamptz, finished_at timestamptz, coordinates jsonb, achievement_eligible boolean)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 20 or (p_after_started_at is null) <> (p_after_id is null) then
    raise exception 'Walk pages require a limit of 1–20 and a complete cursor.' using errcode = '22023';
  end if;
  return query select w.id, w.started_at, w.finished_at,
    extensions.st_asgeojson(case when not w.achievement_eligible and w.point_count > 2000
      then extensions.st_simplifypreservetopology(w.route, 0.00002) else w.route end)::jsonb -> 'coordinates',
    w.achievement_eligible
  from public.walks w
  where w.user_id = auth.uid() and (p_after_started_at is null or (w.started_at, w.id) > (p_after_started_at, p_after_id))
  order by w.started_at, w.id limit p_limit;
end;
$$;
revoke all on function public.get_walk_routes_page(timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_walk_routes_page(timestamptz, uuid, integer) to authenticated;

create or replace function public.save_walk(
  p_walk_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_coordinates jsonb,
  p_point_count integer,
  p_achievement_eligible boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_route extensions.geometry;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_coordinates is null or p_point_count is null or jsonb_typeof(p_coordinates) <> 'array'
     or jsonb_array_length(p_coordinates) < 2
     or jsonb_array_length(p_coordinates) > 20000
     or p_point_count <> jsonb_array_length(p_coordinates) then
    raise exception 'A walk must contain between 2 and 20000 coordinates';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_coordinates) as points(coordinate)
    where case when jsonb_typeof(coordinate) = 'array' and jsonb_array_length(coordinate) = 2 then
      jsonb_typeof(coordinate -> 0) <> 'number' or jsonb_typeof(coordinate -> 1) <> 'number'
      or not ((coordinate ->> 0)::double precision between -180 and 180)
      or not ((coordinate ->> 1)::double precision between -90 and 90)
    else true end
  ) then
    raise exception 'Each walk coordinate must be a numeric [longitude, latitude] pair within geographic bounds.' using errcode = '22023';
  end if;
  perform private.consume_quota(v_user_id::text, 'walk-minute', 60, 60);

  select extensions.st_setsrid(
    extensions.st_makeline(
      extensions.st_makepoint(
        (coordinate ->> 0)::double precision,
        (coordinate ->> 1)::double precision
      ) order by ordinal
    ),
    4326
  )
  into v_route
  from jsonb_array_elements(p_coordinates) with ordinality as points(coordinate, ordinal);

  -- Keep every client-accepted sample. Hecate's new-ground kilometres depend
  -- on the order in which cells are unlocked, so simplifying a line here would
  -- make the total change after an app restart.

  if exists (select 1 from public.walks where id = p_walk_id and user_id <> v_user_id) then
    raise exception 'This walk ID belongs to another account.' using errcode = '42501';
  end if;
  insert into public.walks (
    id, user_id, started_at, finished_at, point_count, distance_m, route,
    achievement_eligible
  ) values (
    p_walk_id,
    v_user_id,
    p_started_at,
    p_finished_at,
    p_point_count,
    extensions.st_length(v_route::extensions.geography),
    v_route,
    p_achievement_eligible
  )
  on conflict (id) do update set
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    point_count = excluded.point_count,
    distance_m = excluded.distance_m,
    route = excluded.route,
    achievement_eligible = excluded.achievement_eligible
  where public.walks.user_id = excluded.user_id;
end;
$$;

revoke insert, update on public.walks from authenticated;
revoke all on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean) from public, anon;
grant execute on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean) to authenticated;

create or replace function public.store_leaderboard_snapshot(
  p_user_id uuid,
  p_request_id uuid,
  p_display_name text,
  p_total_discovered_km double precision,
  p_cities jsonb,
  p_calculation_version smallint,
  p_achievements jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_request_id uuid;
  v_entry_id uuid;
  v_city jsonb;
  v_achievement text;
  v_achievement_ids text[] := '{}';
  v_name text := btrim(p_display_name);
  v_profile_name text;
  v_name_changes smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  select request_id into v_request_id from private.leaderboard_publish_requests
  where user_id = v_user_id and started_at >= now() - interval '5 minutes' for update;
  if p_request_id is null or v_request_id is distinct from p_request_id then
    raise exception 'This publishing request expired or was cancelled. Try publishing again.' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 30 then
    raise exception 'Public name must contain between 2 and 30 characters';
  end if;
  if p_total_discovered_km is null or not (p_total_discovered_km between 0 and 1000000) then
    raise exception 'Discovery distance is outside the accepted range';
  end if;
  if p_cities is null or jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) < 1
     or jsonb_array_length(p_cities) > 500 then
    raise exception 'Cities must be an array containing between 1 and 500 entries';
  end if;
  if p_achievements is null or jsonb_typeof(p_achievements) <> 'array'
     or jsonb_array_length(p_achievements) > 20 then
    raise exception 'Achievements must be an array containing at most 20 entries';
  end if;
  if p_calculation_version is null or p_calculation_version <> 3 then
    raise exception 'This Hecate version uses an outdated leaderboard calculation';
  end if;

  select display_name, display_name_changes
  into v_profile_name, v_name_changes
  from public.leaderboard_profiles
  where user_id = v_user_id
  for update;

  if v_profile_name is null then
    begin
      insert into public.leaderboard_profiles (user_id, display_name)
      values (v_user_id, v_name)
      returning display_name, display_name_changes
      into v_profile_name, v_name_changes;
    exception when unique_violation then
      raise exception 'Public name is already taken';
    end;
  elsif v_name <> v_profile_name then
    if v_name_changes >= 1 then
      raise exception 'Public name can only be changed once';
    end if;
    begin
      update public.leaderboard_profiles set
        display_name = v_name,
        display_name_changes = display_name_changes + 1,
        updated_at = now()
      where user_id = v_user_id
      returning display_name, display_name_changes
      into v_profile_name, v_name_changes;
    exception when unique_violation then
      raise exception 'Public name is already taken';
    end;
  end if;

  select entry_id into v_entry_id
  from public.leaderboard_profiles
  where user_id = v_user_id;

  if v_entry_id is null then
    insert into public.leaderboard_entries (
      display_name, total_discovered_km, city_count, calculation_version, achievement_ids
    ) values (
      v_profile_name, p_total_discovered_km, jsonb_array_length(p_cities), p_calculation_version, '{}'
    ) returning entry_id into v_entry_id;
    update public.leaderboard_profiles
    set entry_id = v_entry_id
    where user_id = v_user_id;
  else
    update public.leaderboard_entries set
      display_name = v_profile_name,
      total_discovered_km = p_total_discovered_km,
      city_count = jsonb_array_length(p_cities),
      calculation_version = p_calculation_version,
      updated_at = now()
    where entry_id = v_entry_id;
    delete from public.leaderboard_city_stats where entry_id = v_entry_id;
  end if;

  for v_city in select value from jsonb_array_elements(p_cities)
  loop
    if char_length(coalesce(v_city ->> 'city_id', '')) not between 1 and 160
       or char_length(coalesce(v_city ->> 'city_name', '')) not between 1 and 120
       or not (coalesce((v_city ->> 'discovered_km')::double precision, -1) >= 0 and (v_city ->> 'discovered_km')::double precision < 'Infinity'::double precision)
       or coalesce((v_city ->> 'discovered_percentage')::double precision, -1) not between 0 and 100 then
      raise exception 'A city total is invalid';
    end if;
    insert into public.leaderboard_city_stats (
      entry_id, city_id, city_name, discovered_km, discovered_percentage
    ) values (
      v_entry_id,
      v_city ->> 'city_id',
      v_city ->> 'city_name',
      (v_city ->> 'discovered_km')::double precision,
      (v_city ->> 'discovered_percentage')::double precision
    );
  end loop;

  for v_achievement in select value from jsonb_array_elements_text(p_achievements)
  loop
    -- BEGIN PERSONAL_ACHIEVEMENT_IDS
    -- Keep this allow-list synchronized with PERSONAL_ACHIEVEMENT_IDS in
    -- src/achievements.ts. npm test and npm run build enforce parity.
    if v_achievement is null or v_achievement not in (
      'the-long-way',
      'mostly-uncharted',
      'full-circle',
      'three-day-spark',
      'momentum',
      'local-ritual',
      'city-hopper',
      'against-the-familiar'
    ) then
    -- END PERSONAL_ACHIEVEMENT_IDS
      raise exception 'An achievement ID is invalid';
    end if;
    if not (v_achievement = any(v_achievement_ids)) then
      v_achievement_ids := array_append(v_achievement_ids, v_achievement);
    end if;
  end loop;

  update public.leaderboard_entries
  set achievement_ids = v_achievement_ids
  where entry_id = v_entry_id;

  return v_entry_id;
end;
$$;

-- Only the authenticated Edge Function's service client may store computed totals.
revoke all on function public.store_leaderboard_snapshot(uuid, uuid, text, double precision, jsonb, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.store_leaderboard_snapshot(uuid, uuid, text, double precision, jsonb, smallint, jsonb) to service_role;
revoke all on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint, jsonb) from public, anon, authenticated;

create or replace function public.unpublish_leaderboard_snapshot()
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from private.leaderboard_publish_requests where user_id = v_user_id;
  delete from public.leaderboard_entries where entry_id in (
    select entry_id from public.leaderboard_profiles where user_id = v_user_id
  );
end;
$$;
revoke all on function public.unpublish_leaderboard_snapshot() from public, anon;
grant execute on function public.unpublish_leaderboard_snapshot() to authenticated;

-- Retire every historical publishing overload as well.
do $$
declare target regprocedure;
begin
  for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_leaderboard_snapshot'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', target);
  end loop;
end;
$$;

create index leaderboard_city_stats_distance_idx on public.leaderboard_city_stats (city_id, discovered_km desc, entry_id);

-- City summaries include five leaders, never every participant's complete passport.
create function public.get_leaderboard_city_page(p_offset integer, p_limit integer, p_city_slug text)
returns table (city_id text, city_name text, total_discovered_km double precision, explorer_count bigint, leaders jsonb)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 100000 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'City pages require a nonnegative offset up to 100000 and a limit of 1–50.' using errcode = '22023';
  end if;
  return query
  with cities as (
    select c.city_id, min(c.city_name) as city_name, sum(c.discovered_km) as total, count(*) as explorers
    from public.leaderboard_city_stats c join public.leaderboard_entries e using (entry_id)
    where e.calculation_version = 3 and c.discovered_km >= 0.0005
      and (p_city_slug is null or lower(regexp_replace(c.city_name, '\s+', '-', 'g')) = p_city_slug)
    group by c.city_id
    order by sum(c.discovered_km) desc, c.city_id
    limit p_limit offset p_offset
  )
  select c.city_id, c.city_name, c.total, c.explorers,
    (select jsonb_agg(to_jsonb(leader) order by leader.discovered_km desc, leader.discovered_percentage desc, leader.entry_id)
     from (
       select e.entry_id, e.display_name, e.total_discovered_km, e.city_count, e.updated_at, e.calculation_version, e.achievement_ids,
         stats.discovered_km, stats.discovered_percentage
       from public.leaderboard_city_stats stats join public.leaderboard_entries e using (entry_id)
       where stats.city_id = c.city_id and e.calculation_version = 3 and stats.discovered_km >= 0.0005
       order by stats.discovered_km desc, stats.discovered_percentage desc, e.entry_id limit 5
     ) leader)
  from cities c order by c.total desc, c.city_id;
end;
$$;

create function public.get_leaderboard_city_explorers(p_city_id text, p_offset integer, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare entries jsonb;
begin
  if p_city_id is null or char_length(p_city_id) not between 1 and 160 or p_offset is null or p_offset < 0
     or p_offset > 100000 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Explorer pages require a city ID, nonnegative offset up to 100000, and a limit of 1–50.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.discovered_km desc, entry.discovered_percentage desc, entry.entry_id), '[]'::jsonb)
  into entries from (
    select e.entry_id, e.display_name, e.total_discovered_km, e.city_count, e.updated_at, e.calculation_version, e.achievement_ids,
      c.discovered_km, c.discovered_percentage
    from public.leaderboard_city_stats c join public.leaderboard_entries e using (entry_id)
    where c.city_id = p_city_id and e.calculation_version = 3 and c.discovered_km >= 0.0005
    order by c.discovered_km desc, c.discovered_percentage desc, e.entry_id limit p_limit offset p_offset
  ) entry;
  return entries;
end;
$$;
revoke all on function public.get_leaderboard_city_page(integer, integer, text) from public;
revoke all on function public.get_leaderboard_city_explorers(text, integer, integer) from public;
grant execute on function public.get_leaderboard_city_page(integer, integer, text) to anon, authenticated;
grant execute on function public.get_leaderboard_city_explorers(text, integer, integer) to anon, authenticated;

commit;
