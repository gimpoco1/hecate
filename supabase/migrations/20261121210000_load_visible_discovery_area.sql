create function public.get_visible_discovery_area(p_lng double precision, p_lat double precision)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_lng double precision := p_lng;
  v_lat double precision := p_lat;
  v_latest extensions.geometry;
  v_area extensions.geometry;
  v_lon_span double precision;
  v_south double precision;
  v_north double precision;
  v_walks jsonb;
  v_cells jsonb;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if (p_lng is null) <> (p_lat is null) or
      (p_lng is not null and (p_lng not between -180 and 180 or p_lat not between -90 and 90)) then
    raise exception 'The visible discovery area requires both longitude and latitude within geographic bounds.' using errcode = '22023';
  end if;

  if v_lng is null then
    select extensions.st_endpoint(w.route) into v_latest
    from public.walks w where w.user_id = v_owner
    order by w.finished_at desc, w.id desc limit 1;
    if v_latest is null then
      select ((c.cell_x + 0.5) / power(2.0, c.cell_z)) * 360 - 180,
             degrees(atan(sinh(pi() * (1 - 2 * (c.cell_y + 0.5) / power(2.0, c.cell_z)))))
      into v_lng, v_lat
      from public.discovery_cells c where c.user_id = v_owner
      order by c.first_discovered_at desc, c.cell_z, c.cell_x, c.cell_y limit 1;
    else
      v_lng := extensions.st_x(v_latest);
      v_lat := extensions.st_y(v_latest);
    end if;
    if v_lng is null then
      return jsonb_build_object('center', null, 'walks', '[]'::jsonb, 'cells', '[]'::jsonb);
    end if;
  end if;

  -- A city-scale viewport with padding for panning and the discovery radius.
  v_lon_span := least(180, 0.07 / greatest(0.001, cos(radians(v_lat))));
  v_south := greatest(-90, v_lat - 0.07);
  v_north := least(90, v_lat + 0.07);
  v_area := extensions.st_makeenvelope(greatest(-180, v_lng - v_lon_span), v_south,
                                       least(180, v_lng + v_lon_span), v_north, 4326);
  if v_lng - v_lon_span < -180 then
    v_area := extensions.st_union(v_area, extensions.st_makeenvelope(v_lng - v_lon_span + 360, v_south, 180, v_north, 4326));
  elsif v_lng + v_lon_span > 180 then
    v_area := extensions.st_union(v_area, extensions.st_makeenvelope(-180, v_south, v_lng + v_lon_span - 360, v_north, 4326));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'walk_id', w.id, 'started_at', w.started_at, 'finished_at', w.finished_at,
    'coordinates', extensions.st_asgeojson(case when w.point_metadata is null and not w.achievement_eligible and w.point_count > 2000
      then extensions.st_simplifypreservetopology(w.route, 0.00002) else w.route end)::jsonb -> 'coordinates',
    'achievement_eligible', w.achievement_eligible, 'point_metadata', w.point_metadata
  )), '[]'::jsonb) into v_walks
  from public.walks w
  where w.user_id = v_owner and extensions.st_intersects(w.route, v_area);

  with tile_bounds as (
    select z,
      floor((extensions.st_xmin(part.geom) + 180) / 360 * scale)::integer as min_x,
      floor((extensions.st_xmax(part.geom) + 180) / 360 * scale)::integer as max_x,
      floor((1 - asinh(tan(radians(greatest(-85.05112878, least(85.05112878, v_north))))) / pi()) / 2 * scale)::integer as min_y,
      floor((1 - asinh(tan(radians(greatest(-85.05112878, least(85.05112878, v_south))))) / pi()) / 2 * scale)::integer as max_y
    from extensions.st_dump(v_area) part
    cross join generate_series(0, 22) zooms(z)
    cross join lateral (select power(2.0, z) as scale) sizes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cell_z', c.cell_z, 'cell_x', c.cell_x, 'cell_y', c.cell_y, 'first_discovered_at', c.first_discovered_at
  )), '[]'::jsonb) into v_cells
  from public.discovery_cells c
  where c.user_id = v_owner and exists (
    select 1 from tile_bounds b
    where c.cell_z = b.z and c.cell_x between b.min_x and b.max_x and c.cell_y between b.min_y and b.max_y
  );

  return jsonb_build_object('center', jsonb_build_array(v_lng, v_lat), 'walks', v_walks, 'cells', v_cells);
end;
$$;

revoke all on function public.get_visible_discovery_area(double precision, double precision) from public, anon;
grant execute on function public.get_visible_discovery_area(double precision, double precision) to authenticated;
