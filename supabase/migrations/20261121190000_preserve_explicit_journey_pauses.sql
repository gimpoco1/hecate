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
      where case when jsonb_typeof(sample) = 'array' and jsonb_array_length(sample) in (2, 3) then
        jsonb_typeof(sample -> 0) <> 'number' or jsonb_typeof(sample -> 1) <> 'boolean'
        or (jsonb_array_length(sample) = 3 and (sample -> 1 <> 'true'::jsonb or sample -> 2 <> 'true'::jsonb))
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

alter function public.get_walk_routes_page(timestamptz, uuid, integer)
  rename to get_walk_routes_page_with_pauses;

create function public.get_walk_routes_page(p_after_started_at timestamptz, p_after_id uuid, p_limit integer)
returns table (walk_id uuid, started_at timestamptz, finished_at timestamptz, coordinates jsonb, achievement_eligible boolean, point_metadata jsonb)
language sql stable security invoker set search_path = '' as $$
  select w.walk_id, w.started_at, w.finished_at, w.coordinates, w.achievement_eligible,
    (select jsonb_agg(case when jsonb_array_length(sample) = 3 then sample - 2 else sample end order by ordinal)
     from jsonb_array_elements(w.point_metadata) with ordinality as points(sample, ordinal))
  from public.get_walk_routes_page_with_pauses(p_after_started_at, p_after_id, p_limit) w
  order by w.started_at, w.walk_id;
$$;
revoke all on function public.get_walk_routes_page(timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_walk_routes_page(timestamptz, uuid, integer) to authenticated;
