-- Hecate spatial storage. Safe to rerun after the legacy discovery_points
-- table has been retired.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.walks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  point_count integer not null check (point_count >= 2),
  distance_m double precision not null check (distance_m >= 0),
  route extensions.geometry(LineString, 4326) not null,
  created_at timestamptz not null default now(),
  check (finished_at >= started_at)
);

create index if not exists walks_user_started_idx on public.walks (user_id, started_at desc);
create index if not exists walks_route_gix on public.walks using gist (route);

-- Zoom-20 Web Mercator cells are about 38 m wide at the equator and smaller
-- toward the poles. A repeated visit upserts the same key instead of adding data.
create table if not exists public.discovery_cells (
  user_id uuid not null references auth.users(id) on delete cascade,
  cell_z smallint not null default 20 check (cell_z between 0 and 22),
  cell_x integer not null check (cell_x >= 0),
  cell_y integer not null check (cell_y >= 0),
  first_discovered_at timestamptz not null,
  primary key (user_id, cell_z, cell_x, cell_y)
);

-- A compact index of municipalities where the user has made discoveries.
-- Keeping the boundary lets every signed-in device calculate city coverage
-- without repeatedly reverse-geocoding the user's historical routes.
create table if not exists public.discovered_cities (
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id text not null,
  name text not null,
  geometry jsonb not null,
  first_discovered_at timestamptz not null,
  last_discovered_at timestamptz not null,
  primary key (user_id, city_id)
);

-- A stable source of the city-region polygons for older app versions that
-- still submit municipality IDs. Hosted cleanup seeds these three rows.
create table if not exists public.city_region_boundaries (
  region_id text primary key,
  name text not null,
  geometry jsonb not null
);
alter table public.city_region_boundaries enable row level security;
revoke all on public.city_region_boundaries from anon, authenticated;

insert into public.city_region_boundaries (region_id, name, geometry)
select distinct on (city_id) city_id, name, geometry
from public.discovered_cities
where city_id in ('region:barcelona-metropolitan', 'region:greater-london', 'region:new-york')
order by city_id, last_discovered_at desc
on conflict (region_id) do nothing;

create or replace function public.canonicalize_discovered_city()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_region_id text;
begin
  target_region_id := case new.city_id
    when 'relation:347950' then 'region:barcelona-metropolitan'
    when 'relation:345761' then 'region:barcelona-metropolitan'
    when 'relation:51781' then 'region:greater-london'
    when 'relation:183779' then 'region:greater-london'
    when 'relation:8398124' then 'region:new-york'
    else null
  end;
  if target_region_id is not null then
    select region_id, name, geometry
    into new.city_id, new.name, new.geometry
    from public.city_region_boundaries
    where region_id = target_region_id;
    if not found then
      raise exception 'Canonical city region % is missing', target_region_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists canonicalize_discovered_city on public.discovered_cities;
create trigger canonicalize_discovered_city
before insert or update on public.discovered_cities
for each row execute function public.canonicalize_discovered_city();

-- Retired municipality IDs have canonical city-region replacements. Older
-- clients must not reinsert them after the hosted cleanup.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.discovered_cities'::regclass
      and conname = 'discovered_cities_no_obsolete_region_ids'
  ) then
    alter table public.discovered_cities
      add constraint discovered_cities_no_obsolete_region_ids
      check (city_id not in (
        'relation:347950', 'relation:345761',
        'relation:51781', 'relation:183779', 'relation:8398124'
      ));
  end if;
end;
$$;

-- Preserve the earliest discovery and latest visit when multiple old city
-- boundaries are consolidated into one metropolitan region.
create or replace function public.preserve_discovered_city_first_seen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_discovered_at := least(old.first_discovered_at, new.first_discovered_at,
    old.last_discovered_at, new.last_discovered_at);
  new.last_discovered_at := greatest(old.last_discovered_at, new.last_discovered_at);
  return new;
end;
$$;

drop trigger if exists preserve_discovered_city_first_seen on public.discovered_cities;
create trigger preserve_discovered_city_first_seen
before update on public.discovered_cities
for each row execute function public.preserve_discovered_city_first_seen();

alter table public.walks enable row level security;
alter table public.discovery_cells enable row level security;
alter table public.discovered_cities enable row level security;

drop policy if exists "Users manage their own walks" on public.walks;
create policy "Users manage their own walks" on public.walks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own discovery cells" on public.discovery_cells;
create policy "Users manage their own discovery cells" on public.discovery_cells
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Upserts need both a SELECT policy to inspect a conflicting row and explicit
-- INSERT/UPDATE policies for the write path used by the Supabase REST API.
drop policy if exists "Users manage their own discovered cities" on public.discovered_cities;
drop policy if exists "Users read their own discovered cities" on public.discovered_cities;
drop policy if exists "Users insert their own discovered cities" on public.discovered_cities;
drop policy if exists "Users update their own discovered cities" on public.discovered_cities;
drop policy if exists "Users delete their own discovered cities" on public.discovered_cities;
create policy "Users read their own discovered cities" on public.discovered_cities
  for select using ((select auth.uid()) = user_id);
create policy "Users insert their own discovered cities" on public.discovered_cities
  for insert with check ((select auth.uid()) = user_id);
create policy "Users update their own discovered cities" on public.discovered_cities
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own discovered cities" on public.discovered_cities
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.walks to authenticated;
grant select, insert, update, delete on public.discovery_cells to authenticated;
grant select, insert, update, delete on public.discovered_cities to authenticated;

create or replace function public.save_walk(
  p_walk_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_coordinates jsonb,
  p_point_count integer
) returns void
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_route extensions.geometry;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_coordinates) <> 'array'
     or jsonb_array_length(p_coordinates) < 2
     or jsonb_array_length(p_coordinates) > 20000
     or p_point_count <> jsonb_array_length(p_coordinates) then
    raise exception 'A walk must contain between 2 and 20000 coordinates';
  end if;

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

  insert into public.walks (
    id, user_id, started_at, finished_at, point_count, distance_m, route
  ) values (
    p_walk_id,
    v_user_id,
    p_started_at,
    p_finished_at,
    p_point_count,
    extensions.st_length(v_route::extensions.geography),
    v_route
  )
  on conflict (id) do update set
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    point_count = excluded.point_count,
    distance_m = excluded.distance_m,
    route = excluded.route
  where public.walks.user_id = excluded.user_id;
end;
$$;

create or replace function public.get_walk_routes()
returns table (
  walk_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  coordinates jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    id,
    walks.started_at,
    walks.finished_at,
    (extensions.st_asgeojson(route)::jsonb -> 'coordinates')
  from public.walks
  where user_id = auth.uid()
  order by walks.started_at;
$$;

revoke all on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer) from public, anon;
revoke all on function public.get_walk_routes() from public, anon;
grant execute on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer) to authenticated;
grant execute on function public.get_walk_routes() to authenticated;

-- Account deletion is intentionally exposed only through this authenticated
-- function. Removing the auth user cascades to every user-owned table above.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from auth.users where id = v_user_id;
  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Public leaderboard snapshots. Ownership lives in a separate table so the
-- public realtime payload never exposes an account UUID. A snapshot contains
-- aggregate totals only; routes, coordinates, cells, and city boundaries stay
-- in the private tables above.
create table if not exists public.leaderboard_entries (
  entry_id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 30),
  total_discovered_km double precision not null check (total_discovered_km >= 0),
  city_count integer not null check (city_count >= 0),
  calculation_version smallint not null default 3 check (calculation_version > 0),
  updated_at timestamptz not null default now()
);

-- Existing snapshots may use an older distance definition. Keep their stored
-- version so current clients can hide them until their owners explicitly
-- publish a corrected version-3 snapshot.
alter table public.leaderboard_entries
  add column if not exists calculation_version smallint not null default 1
  check (calculation_version > 0);

-- Public-name ownership survives unpublishing. This prevents a user from
-- resetting the one-rename allowance by deleting and recreating a snapshot.
-- The table is private; only security-definer leaderboard functions use it.
create table if not exists public.leaderboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  display_name_changes smallint not null default 0 check (display_name_changes between 0 and 1),
  updated_at timestamptz not null default now()
);

create unique index if not exists leaderboard_profiles_display_name_unique
  on public.leaderboard_profiles (lower(display_name));

create table if not exists public.leaderboard_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entry_id uuid not null unique references public.leaderboard_entries(entry_id) on delete cascade
);

create table if not exists public.leaderboard_city_stats (
  entry_id uuid not null references public.leaderboard_entries(entry_id) on delete cascade,
  city_id text not null,
  city_name text not null check (char_length(city_name) between 1 and 120),
  discovered_km double precision not null check (discovered_km >= 0),
  discovered_percentage double precision not null check (discovered_percentage between 0 and 100),
  primary key (entry_id, city_id)
);

create table if not exists public.leaderboard_achievements (
  entry_id uuid not null references public.leaderboard_entries(entry_id) on delete cascade,
  achievement_id text not null,
  primary key (entry_id, achievement_id)
);

create index if not exists leaderboard_entries_distance_idx
  on public.leaderboard_entries (total_discovered_km desc, updated_at desc);
create index if not exists leaderboard_city_stats_city_idx
  on public.leaderboard_city_stats (city_id, discovered_percentage desc);

-- Preserve the names of snapshots created before leaderboard_profiles existed.
insert into public.leaderboard_profiles (user_id, display_name)
select owner.user_id, entry.display_name
from public.leaderboard_owners owner
join public.leaderboard_entries entry on entry.entry_id = owner.entry_id
on conflict (user_id) do nothing;

alter table public.leaderboard_entries enable row level security;
alter table public.leaderboard_profiles enable row level security;
alter table public.leaderboard_owners enable row level security;
alter table public.leaderboard_city_stats enable row level security;
alter table public.leaderboard_achievements enable row level security;

drop policy if exists "Leaderboard entries are public" on public.leaderboard_entries;
create policy "Leaderboard entries are public" on public.leaderboard_entries
  for select using (true);
drop policy if exists "Leaderboard city totals are public" on public.leaderboard_city_stats;
create policy "Leaderboard city totals are public" on public.leaderboard_city_stats
  for select using (true);
drop policy if exists "Leaderboard achievements are public" on public.leaderboard_achievements;
create policy "Leaderboard achievements are public" on public.leaderboard_achievements
  for select using (true);
drop policy if exists "Users read their leaderboard ownership" on public.leaderboard_owners;
create policy "Users read their leaderboard ownership" on public.leaderboard_owners
  for select using ((select auth.uid()) = user_id);

revoke all on public.leaderboard_entries from anon, authenticated;
revoke all on public.leaderboard_profiles from anon, authenticated;
revoke all on public.leaderboard_city_stats from anon, authenticated;
revoke all on public.leaderboard_achievements from anon, authenticated;
revoke all on public.leaderboard_owners from anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;
grant select on public.leaderboard_city_stats to anon, authenticated;
grant select on public.leaderboard_achievements to anon, authenticated;
grant select on public.leaderboard_owners to authenticated;

drop function if exists public.publish_leaderboard_snapshot(text, double precision, jsonb);
drop function if exists public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint);
create or replace function public.publish_leaderboard_snapshot(
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
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_city jsonb;
  v_achievement text;
  v_name text := btrim(p_display_name);
  v_profile_name text;
  v_name_changes smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 30 then
    raise exception 'Public name must contain between 2 and 30 characters';
  end if;
  if p_total_discovered_km < 0 or p_total_discovered_km > 1000000 then
    raise exception 'Discovery distance is outside the accepted range';
  end if;
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) < 1
     or jsonb_array_length(p_cities) > 500 then
    raise exception 'Cities must be an array containing between 1 and 500 entries';
  end if;
  if jsonb_typeof(p_achievements) <> 'array'
     or jsonb_array_length(p_achievements) > 20 then
    raise exception 'Achievements must be an array containing at most 20 entries';
  end if;
  if p_calculation_version <> 3 then
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
  from public.leaderboard_owners
  where user_id = v_user_id;

  if v_entry_id is null then
    insert into public.leaderboard_entries (
      display_name, total_discovered_km, city_count, calculation_version
    ) values (
      v_profile_name, p_total_discovered_km, jsonb_array_length(p_cities), p_calculation_version
    ) returning entry_id into v_entry_id;
    insert into public.leaderboard_owners (user_id, entry_id)
      values (v_user_id, v_entry_id);
  else
    update public.leaderboard_entries set
      display_name = v_profile_name,
      total_discovered_km = p_total_discovered_km,
      city_count = jsonb_array_length(p_cities),
      calculation_version = p_calculation_version,
      updated_at = now()
    where entry_id = v_entry_id;
    delete from public.leaderboard_city_stats where entry_id = v_entry_id;
    delete from public.leaderboard_achievements where entry_id = v_entry_id;
  end if;

  for v_city in select value from jsonb_array_elements(p_cities)
  loop
    if coalesce(v_city ->> 'city_id', '') = ''
       or char_length(coalesce(v_city ->> 'city_name', '')) not between 1 and 120
       or coalesce((v_city ->> 'discovered_km')::double precision, -1) < 0
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
    if v_achievement not in (
      'the-long-way',
      'mostly-uncharted',
      'full-circle',
      'three-day-spark',
      'momentum',
      'local-ritual',
      'city-hopper',
      'against-the-familiar'
    ) then
      raise exception 'An achievement ID is invalid';
    end if;
    insert into public.leaderboard_achievements (entry_id, achievement_id)
    values (v_entry_id, v_achievement)
    on conflict do nothing;
  end loop;

  return v_entry_id;
end;
$$;

create or replace function public.get_my_leaderboard_entry_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entry_id
  from public.leaderboard_owners
  where user_id = auth.uid();
$$;

create or replace function public.get_my_leaderboard_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'entry_id', owner.entry_id,
    'display_name', profile.display_name,
    'display_name_changes', profile.display_name_changes
  )
  from public.leaderboard_profiles profile
  left join public.leaderboard_owners owner on owner.user_id = profile.user_id
  where profile.user_id = auth.uid();
$$;

create or replace function public.unpublish_leaderboard_snapshot()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  select entry_id into v_entry_id
  from public.leaderboard_owners
  where user_id = v_user_id;
  if v_entry_id is not null then
    delete from public.leaderboard_entries where entry_id = v_entry_id;
  end if;
end;
$$;

revoke all on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint, jsonb) from public, anon;
revoke all on function public.get_my_leaderboard_entry_id() from public, anon;
revoke all on function public.get_my_leaderboard_profile() from public, anon;
revoke all on function public.unpublish_leaderboard_snapshot() from public, anon;
grant execute on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint, jsonb) to authenticated;
grant execute on function public.get_my_leaderboard_entry_id() to authenticated;
grant execute on function public.get_my_leaderboard_profile() to authenticated;
grant execute on function public.unpublish_leaderboard_snapshot() to authenticated;

-- Realtime provides immediate updates while the web client also polls as a
-- resilience fallback. Duplicate membership is harmless on repeated installs.
do $$
begin
  alter publication supabase_realtime add table public.leaderboard_entries;
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.leaderboard_city_stats;
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.leaderboard_achievements;
exception when duplicate_object then null;
end;
$$;

-- The legacy table has no remaining readers or writers. Existing installs
-- should migrate any remaining legacy rows before rerunning this script.
do $$
declare
  has_legacy_rows boolean;
begin
  if to_regclass('public.discovery_points') is not null then
    execute 'select exists (select 1 from public.discovery_points)' into has_legacy_rows;
    if has_legacy_rows then
      raise exception 'discovery_points still contains rows; migrate them before dropping the table';
    end if;
  end if;
end;
$$;
drop table if exists public.discovery_points;
