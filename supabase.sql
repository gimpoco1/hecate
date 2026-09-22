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
