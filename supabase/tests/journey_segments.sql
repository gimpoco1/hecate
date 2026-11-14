-- Run in a transaction after the migrations and roll back all fixtures.
create temporary table journey_segment_test_ids as select gen_random_uuid() as user_id, gen_random_uuid() as walk_id;
grant select on journey_segment_test_ids to authenticated;
insert into auth.users(id, email) select user_id, user_id::text || '@journey-test.invalid' from journey_segment_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub', user_id::text, true) from journey_segment_test_ids;
select public.save_walk(walk_id, '2026-01-01 12:00:00Z', '2026-01-01 12:11:00Z',
  '[[2,41],[2.001,41],[2.01,41],[2.011,41]]', 4, true,
  '[[1767268800000,false],[1767268860000,false],[1767269400000,true],[1767269460000,false]]')
from journey_segment_test_ids;

do $$
declare v_walk_id uuid; v_metadata jsonb; v_distance double precision;
begin
  select walk_id into v_walk_id from journey_segment_test_ids;
  select point_metadata, distance_m into v_metadata, v_distance from public.walks where id = v_walk_id;
  if v_distance not between 160 and 180 or jsonb_array_length(v_metadata) <> 4 then
    raise exception 'Paused gap contributed to saved distance or its metadata was lost';
  end if;
  if not exists (select 1 from public.get_walk_routes_page(null, null, 20) where walk_id = v_walk_id and point_metadata = v_metadata) then
    raise exception 'History did not return exact pause metadata';
  end if;
  begin
    perform public.save_walk(v_walk_id, '2026-01-01 12:00:00Z', '2026-01-01 12:01:00Z',
      '[[2,41],[2.001,41]]', 2, true, '[[1767268800000,false]]');
    raise exception 'Mismatched point metadata was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_walk(v_walk_id, '2026-01-01 12:00:00Z', '2026-01-01 12:01:00Z',
    '[[2,41],[2.001,41]]', 2, true);
  if (select point_metadata is not null from public.walks where id = v_walk_id) then
    raise exception 'Legacy writer retained incompatible pause metadata';
  end if;
end;
$$;
