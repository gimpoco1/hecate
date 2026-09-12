-- Hecate spatial storage. This script is safe to run again after the original
-- discovery_points schema: it migrates existing points without deleting them.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- Kept temporarily as a backward-compatible source for existing installations.
create table if not exists public.discovery_points (
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  accuracy double precision,
  primary key (user_id, recorded_at)
);

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

alter table public.discovery_points enable row level security;
alter table public.walks enable row level security;
alter table public.discovery_cells enable row level security;

drop policy if exists "Users read their own discovery points" on public.discovery_points;
drop policy if exists "Users insert their own discovery points" on public.discovery_points;
drop policy if exists "Users update their own discovery points" on public.discovery_points;
create policy "Users read their own discovery points" on public.discovery_points
  for select using (auth.uid() = user_id);
create policy "Users insert their own discovery points" on public.discovery_points
  for insert with check (auth.uid() = user_id);
create policy "Users update their own discovery points" on public.discovery_points
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own walks" on public.walks;
create policy "Users manage their own walks" on public.walks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own discovery cells" on public.discovery_cells;
create policy "Users manage their own discovery cells" on public.discovery_cells
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.walks to authenticated;
grant select, insert, update, delete on public.discovery_cells to authenticated;

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

  -- Roughly 2 m in latitude; enough to remove redundant GPS samples without
  -- visibly changing a pedestrian route.
  v_route := extensions.st_simplify(v_route, 0.00002);

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

-- Backfill each unique legacy position into a cell.
with legacy_cells as (
  select
    user_id,
    recorded_at,
    floor(((longitude + 180) / 360) * 1048576)::integer as cell_x,
    floor(
      (1 - ln(
        tan(radians(least(85.05112878, greatest(-85.05112878, latitude))))
        + 1 / cos(radians(least(85.05112878, greatest(-85.05112878, latitude))))
      ) / pi()) / 2 * 1048576
    )::integer as cell_y
  from public.discovery_points
)
insert into public.discovery_cells (user_id, cell_z, cell_x, cell_y, first_discovered_at)
select
  user_id,
  20,
  cell_x,
  cell_y,
  min(recorded_at)
from legacy_cells
group by user_id, cell_x, cell_y
on conflict (user_id, cell_z, cell_x, cell_y) do nothing;

-- Infer legacy walk boundaries from a two-hour gap or a five-kilometre jump,
-- then compact each inferred walk into a single PostGIS line.
with point_geometries as (
  select
    user_id,
    recorded_at,
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326) as point
  from public.discovery_points
), sequenced as (
  select
    *,
    lag(recorded_at) over (partition by user_id order by recorded_at) as previous_at,
    lag(point) over (partition by user_id order by recorded_at) as previous_point
  from point_geometries
), boundaries as (
  select
    *,
    case
      when previous_at is null
        or recorded_at - previous_at > interval '2 hours'
        or extensions.st_distance(point::extensions.geography, previous_point::extensions.geography) > 5000
      then 1 else 0
    end as starts_walk
  from sequenced
), grouped as (
  select
    *,
    sum(starts_walk) over (partition by user_id order by recorded_at) as walk_number
  from boundaries
), legacy_routes as (
  select
    user_id,
    walk_number,
    min(recorded_at) as started_at,
    max(recorded_at) as finished_at,
    count(*)::integer as point_count,
    extensions.st_simplify(extensions.st_makeline(point order by recorded_at), 0.00002) as route
  from grouped
  group by user_id, walk_number
  having count(*) >= 2
)
insert into public.walks (id, user_id, started_at, finished_at, point_count, distance_m, route)
select
  md5(user_id::text || ':' || started_at::text)::uuid,
  user_id,
  started_at,
  finished_at,
  point_count,
  extensions.st_length(route::extensions.geography),
  route
from legacy_routes
on conflict (id) do nothing;

-- Verify the migration before removing discovery_points in a later release:
-- select count(*) from public.walks;
-- select count(*) from public.discovery_cells;
