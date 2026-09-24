-- Production migration: reserve case-insensitive public names, allow one
-- rename per account, and expose the private owner profile to its user.

begin;

create table if not exists public.leaderboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  display_name_changes smallint not null default 0 check (display_name_changes between 0 and 1),
  updated_at timestamptz not null default now()
);

insert into public.leaderboard_profiles (user_id, display_name)
select owner.user_id, entry.display_name
from public.leaderboard_owners owner
join public.leaderboard_entries entry on entry.entry_id = owner.entry_id
on conflict (user_id) do nothing;

create unique index if not exists leaderboard_profiles_display_name_unique
  on public.leaderboard_profiles (lower(display_name));

alter table public.leaderboard_profiles enable row level security;
revoke all on public.leaderboard_profiles from anon, authenticated;

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

create or replace function public.get_my_leaderboard_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'entry_id', owner.entry_id,
    'display_name', profile.display_name,
    'display_name_changes', profile.display_name_changes
  )
  from public.leaderboard_profiles profile
  left join public.leaderboard_owners owner on owner.user_id = profile.user_id
  where profile.user_id = auth.uid();
$$;

revoke all on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint) from public, anon;
revoke all on function public.get_my_leaderboard_profile() from public, anon;
grant execute on function public.publish_leaderboard_snapshot(text, double precision, jsonb, smallint) to authenticated;
grant execute on function public.get_my_leaderboard_profile() to authenticated;

commit;
