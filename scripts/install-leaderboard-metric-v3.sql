-- Targeted production migration for the canonical city-distance metric.
-- Version-2 snapshots remain stored but current clients hide them until their
-- owners explicitly publish a corrected version-3 snapshot.
begin;

create or replace function public.publish_leaderboard_snapshot(
  p_display_name text,
  p_total_discovered_km double precision,
  p_cities jsonb,
  p_calculation_version smallint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_city jsonb;
  v_name text := btrim(p_display_name);
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
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) > 500 then
    raise exception 'Cities must be an array containing at most 500 entries';
  end if;
  if p_calculation_version <> 3 then
    raise exception 'This Hecate version uses an outdated leaderboard calculation';
  end if;

  select entry_id into v_entry_id
  from public.leaderboard_owners
  where user_id = v_user_id;

  if v_entry_id is null then
    insert into public.leaderboard_entries (
      display_name, total_discovered_km, city_count, calculation_version
    ) values (
      v_name, p_total_discovered_km, jsonb_array_length(p_cities), p_calculation_version
    ) returning entry_id into v_entry_id;
    insert into public.leaderboard_owners (user_id, entry_id)
      values (v_user_id, v_entry_id);
  else
    update public.leaderboard_entries set
      display_name = v_name,
      total_discovered_km = p_total_discovered_km,
      city_count = jsonb_array_length(p_cities),
      calculation_version = p_calculation_version,
      updated_at = now()
    where entry_id = v_entry_id;
    delete from public.leaderboard_city_stats where entry_id = v_entry_id;
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

  return v_entry_id;
end;
$$;

revoke all on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint) from public, anon;
grant execute on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint) to authenticated;

commit;
