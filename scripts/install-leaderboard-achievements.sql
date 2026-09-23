-- Add explicitly selected personal achievements to public leaderboard snapshots.
-- Public rows contain only stable achievement IDs, never routes, dates, or proof.

begin;

create table if not exists public.leaderboard_achievements (
  entry_id uuid not null references public.leaderboard_entries(entry_id) on delete cascade,
  achievement_id text not null,
  primary key (entry_id, achievement_id)
);

alter table public.leaderboard_achievements enable row level security;
drop policy if exists "Leaderboard achievements are public" on public.leaderboard_achievements;
create policy "Leaderboard achievements are public" on public.leaderboard_achievements
  for select using (true);
revoke all on public.leaderboard_achievements from anon, authenticated;
grant select on public.leaderboard_achievements to anon, authenticated;

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

revoke all on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint, jsonb) from public, anon;
grant execute on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint, jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.leaderboard_achievements;
exception when duplicate_object then null;
end;
$$;

commit;
