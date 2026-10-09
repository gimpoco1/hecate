alter table public.walks
  add column if not exists achievement_eligible boolean not null default true;

create or replace function public.save_walk(
  p_walk_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_coordinates jsonb,
  p_point_count integer,
  p_achievement_eligible boolean
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

drop function if exists public.get_walk_routes();
create function public.get_walk_routes()
returns table (
  walk_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  coordinates jsonb,
  achievement_eligible boolean
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
    (extensions.st_asgeojson(route)::jsonb -> 'coordinates'),
    walks.achievement_eligible
  from public.walks
  where user_id = auth.uid()
  order by walks.started_at;
$$;

revoke all on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean) from public, anon;
revoke all on function public.get_walk_routes() from public, anon;
grant execute on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean) to authenticated;
grant execute on function public.get_walk_routes() to authenticated;
