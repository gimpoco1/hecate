-- Run in the Supabase SQL editor when you are ready to enable cross-device sync.
create table if not exists public.discovery_points (
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  accuracy double precision,
  primary key (user_id, recorded_at)
);

alter table public.discovery_points enable row level security;

create policy "Users read their own discovery points"
  on public.discovery_points for select
  using (auth.uid() = user_id);

create policy "Users insert their own discovery points"
  on public.discovery_points for insert
  with check (auth.uid() = user_id);

create policy "Users update their own discovery points"
  on public.discovery_points for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
