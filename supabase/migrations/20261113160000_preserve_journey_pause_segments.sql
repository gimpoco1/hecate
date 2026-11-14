alter table public.walks add column point_metadata jsonb;

create or replace function private.validate_walk()
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
  if new.point_metadata is not null then
    if jsonb_typeof(new.point_metadata) <> 'array' or jsonb_array_length(new.point_metadata) <> new.point_count then
      raise exception 'Walk point metadata must match the coordinate count.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.point_metadata) as entries(sample)
      where case when jsonb_typeof(sample) = 'array' and jsonb_array_length(sample) = 2 then
        jsonb_typeof(sample -> 0) <> 'number' or jsonb_typeof(sample -> 1) <> 'boolean'
        or (sample ->> 0)::numeric < extract(epoch from new.started_at) * 1000
        or (sample ->> 0)::numeric > extract(epoch from new.finished_at) * 1000
      else true end
    ) or exists (
      select 1 from (
        select (sample ->> 0)::numeric as time, lag((sample ->> 0)::numeric) over (order by ordinal) as previous_time
        from jsonb_array_elements(new.point_metadata) with ordinality as entries(sample, ordinal)
      ) times where time < previous_time
    ) then
      raise exception 'Walk metadata requires ordered timestamps within the journey and boolean segment markers.' using errcode = '22023';
    end if;
    select coalesce(sum(case when (new.point_metadata -> (ordinal - 1) ->> 1)::boolean then 0
      else extensions.st_distance(extensions.st_pointn(new.route, ordinal - 1)::extensions.geography,
        extensions.st_pointn(new.route, ordinal)::extensions.geography) end), 0)
    into new.distance_m from generate_series(2, new.point_count) as points(ordinal);
  else
    new.distance_m := extensions.st_length(new.route::extensions.geography);
  end if;
  if new.achievement_eligible and new.distance_m > 15 * extract(epoch from (new.finished_at - new.started_at)) then
    raise exception 'Recorded walk distance exceeds the 15 m/s safety limit for its duration. Import this route as GPX instead.' using errcode = '22023';
  end if;
  if not (new.distance_m >= 0 and new.distance_m < 'Infinity'::double precision) then
    raise exception 'Walk distance must be finite.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.save_walk(
  p_walk_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_coordinates jsonb,
  p_point_count integer,
  p_achievement_eligible boolean,
  p_point_metadata jsonb
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
    achievement_eligible, point_metadata
  ) values (
    p_walk_id,
    v_user_id,
    p_started_at,
    p_finished_at,
    p_point_count,
    extensions.st_length(v_route::extensions.geography),
    v_route,
    p_achievement_eligible, p_point_metadata
  )
  on conflict (id) do update set
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    point_count = excluded.point_count,
    distance_m = excluded.distance_m,
    route = excluded.route,
    achievement_eligible = excluded.achievement_eligible,
    point_metadata = excluded.point_metadata
  where public.walks.user_id = excluded.user_id;
end;
$$;

revoke all on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean, jsonb) from public, anon;
grant execute on function public.save_walk(uuid, timestamptz, timestamptz, jsonb, integer, boolean, jsonb) to authenticated;

-- Older clients write legacy routes without per-point metadata.
create or replace function public.save_walk(p_walk_id uuid, p_started_at timestamptz, p_finished_at timestamptz,
  p_coordinates jsonb, p_point_count integer, p_achievement_eligible boolean)
returns void language sql security invoker set search_path = '' as $$
  select public.save_walk(p_walk_id, p_started_at, p_finished_at, p_coordinates, p_point_count, p_achievement_eligible, null::jsonb);
$$;

drop function public.get_walk_routes_page(timestamptz, uuid, integer);
create function public.get_walk_routes_page(p_after_started_at timestamptz, p_after_id uuid, p_limit integer)
returns table (walk_id uuid, started_at timestamptz, finished_at timestamptz, coordinates jsonb, achievement_eligible boolean, point_metadata jsonb)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 20 or (p_after_started_at is null) <> (p_after_id is null) then
    raise exception 'Walk pages require a limit of 1–20 and a complete cursor.' using errcode = '22023';
  end if;
  return query select w.id, w.started_at, w.finished_at,
    extensions.st_asgeojson(case when w.point_metadata is null and not w.achievement_eligible and w.point_count > 2000
      then extensions.st_simplifypreservetopology(w.route, 0.00002) else w.route end)::jsonb -> 'coordinates',
    w.achievement_eligible, w.point_metadata
  from public.walks w
  where w.user_id = auth.uid() and (p_after_started_at is null or (w.started_at, w.id) > (p_after_started_at, p_after_id))
  order by w.started_at, w.id limit p_limit;
end;
$$;
revoke all on function public.get_walk_routes_page(timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_walk_routes_page(timestamptz, uuid, integer) to authenticated;
