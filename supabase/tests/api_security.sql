-- Run after the migration inside one transaction and always roll back.
-- Fixtures are synthetic; pg_net sends only committed webhook requests.
create temporary table security_test_ids as select gen_random_uuid() as user_a, gen_random_uuid() as user_b,
  gen_random_uuid() as walk_a, gen_random_uuid() as feedback_a;
grant select on security_test_ids to authenticated, service_role;
insert into auth.users(id, email)
select user_a, user_a::text || '@security-test.invalid' from security_test_ids
union all select user_b, user_b::text || '@security-test.invalid' from security_test_ids;

set local role authenticated;
select set_config('request.jwt.claim.sub', user_a::text, true) from security_test_ids;
select public.begin_leaderboard_publish();
select public.save_walk(walk_a, now() - interval '10 minutes', now() - interval '5 minutes',
  '[[2,41],[2.001,41.001]]'::jsonb, 2, true) from security_test_ids;

do $$
declare test_id uuid;
begin
  if (select count(*) from public.walks where id = (select walk_a from security_test_ids)) <> 1 then
    raise exception 'Owner cannot read their saved walk';
  end if;
  if has_table_privilege(current_user, 'public.walks', 'INSERT') or has_table_privilege(current_user, 'public.walks', 'UPDATE') then
    raise exception 'Direct walk writes bypass the RPC';
  end if;
  if has_function_privilege(current_user, 'public.publish_leaderboard_snapshot(text,double precision,jsonb,smallint,jsonb)', 'EXECUTE') then
    raise exception 'Untrusted leaderboard publishing is still exposed';
  end if;
  if has_function_privilege(current_user, 'public.store_leaderboard_snapshot(uuid,uuid,text,double precision,jsonb,smallint,jsonb)', 'EXECUTE') then
    raise exception 'Clients can call trusted snapshot storage';
  end if;
  select walk_a into test_id from security_test_ids;
  begin
    perform public.save_walk(test_id, now() - interval '10 minutes', now() - interval '5 minutes', '[[181,41],[2,41]]', 2, true);
    raise exception 'Out-of-range longitude was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_walk(test_id, now() - interval '10 minutes', now() - interval '5 minutes', '[[null,41],[2,41]]', 2, true);
    raise exception 'Null coordinate was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_walk(test_id, now() - interval '10 minutes', now() - interval '5 minutes', '[[2,41],[2.001,41.001]]', 20001, true);
    raise exception 'False point count was accepted';
  exception when raise_exception then
    if sqlerrm = 'False point count was accepted' then raise; end if;
  end;
end;
$$;

select public.submit_app_feedback(feedback_a, 'bugs', 'Synthetic security integration test', '') from security_test_ids;
-- Retrying the same ID must succeed without consuming another quota or sending another email.
select public.submit_app_feedback(feedback_a, 'bugs', 'Synthetic security integration test', '') from security_test_ids;
do $$
begin
  begin
    perform public.submit_app_feedback(gen_random_uuid(), 'bugs', 'Second submission must be rate-limited', '');
    raise exception 'Feedback quota was bypassed';
  exception when sqlstate 'PGRST' then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', user_b::text, true) from security_test_ids;
do $$
declare test_id uuid;
begin
  select walk_a into test_id from security_test_ids;
  if exists (select 1 from public.walks where id = test_id) then raise exception 'Cross-account walk read succeeded'; end if;
  begin
    perform public.save_walk(test_id, now() - interval '10 minutes', now() - interval '5 minutes', '[[2,41],[2.001,41.001]]', 2, true);
    raise exception 'Cross-account walk overwrite succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.discovery_cells (user_id, cell_z, cell_x, cell_y, first_discovered_at)
    values (auth.uid(), 20, 1048576, 0, now());
    raise exception 'Out-of-range map tile accepted';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

-- Exercise the privileged write and public pagination with a synthetic profile.
select public.store_leaderboard_snapshot(user_a, (select request_id from private.leaderboard_publish_requests where user_id=user_a), 'security-' || left(user_a::text, 8), 1.0,
  '[{"city_id":"security:fixture","city_name":"Security Fixture","discovered_km":1,"discovered_percentage":0.1}]',
  3::smallint, '[]') from security_test_ids;
set local role anon;
do $$
begin
  if has_table_privilege(current_user, 'public.app_feedback', 'SELECT') then raise exception 'Anonymous feedback read is exposed'; end if;
  if has_function_privilege(current_user, 'public.save_walk(uuid,timestamptz,timestamptz,jsonb,integer,boolean)', 'EXECUTE') then
    raise exception 'Anonymous walk writes are exposed';
  end if;
  if (select count(*) from public.get_leaderboard_city_page(0, 1, null)) > 1 then raise exception 'City page exceeded its limit'; end if;
  if jsonb_array_length(public.get_leaderboard_city_explorers('security:fixture', 0, 1)) <> 1 then
    raise exception 'Public city explorer page is invalid';
  end if;
  begin
    perform public.get_leaderboard_city_page(0, 500, null);
    raise exception 'Unbounded page limit accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- Administrator deletion must remove the public entry too, not just the private owner link.
delete from auth.users where id = (select user_a from security_test_ids);
do $$
begin
  if exists (select 1 from public.leaderboard_city_stats where city_id='security:fixture') then
    raise exception 'Account deletion left a public snapshot behind';
  end if;
  if (select count(*) from public.app_feedback where id = (select feedback_a from security_test_ids)) <> 1 then
    raise exception 'Feedback retry created duplicate submissions';
  end if;
end;
$$;
select 'API security integration checks passed; rolling back all changes.' as result;
