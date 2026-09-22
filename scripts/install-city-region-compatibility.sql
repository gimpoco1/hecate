-- Installed on hosted Hecate after the 2026-09-21 city cleanup.
begin;
-- A stable source of the city-region polygons for older app versions that
-- still submit municipality IDs. Hosted cleanup seeds these three rows.
create table if not exists public.city_region_boundaries (
  region_id text primary key,
  name text not null,
  geometry jsonb not null
);
alter table public.city_region_boundaries enable row level security;
revoke all on public.city_region_boundaries from anon, authenticated;

insert into public.city_region_boundaries (region_id, name, geometry)
select distinct on (city_id) city_id, name, geometry
from public.discovered_cities
where city_id in ('region:barcelona-metropolitan', 'region:greater-london', 'region:new-york')
order by city_id, last_discovered_at desc
on conflict (region_id) do nothing;

create or replace function public.canonicalize_discovered_city()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_region_id text;
begin
  target_region_id := case new.city_id
    when 'relation:347950' then 'region:barcelona-metropolitan'
    when 'relation:345761' then 'region:barcelona-metropolitan'
    when 'relation:51781' then 'region:greater-london'
    when 'relation:183779' then 'region:greater-london'
    when 'relation:8398124' then 'region:new-york'
    else null
  end;
  if target_region_id is not null then
    select region_id, name, geometry
    into new.city_id, new.name, new.geometry
    from public.city_region_boundaries
    where region_id = target_region_id;
    if not found then
      raise exception 'Canonical city region % is missing', target_region_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists canonicalize_discovered_city on public.discovered_cities;
create trigger canonicalize_discovered_city
before insert or update on public.discovered_cities
for each row execute function public.canonicalize_discovered_city();

commit;
