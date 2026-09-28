-- Private, cross-device achievement delivery and acknowledgement state.

begin;

create table if not exists public.user_achievement_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null check (achievement_id in (
    'the-long-way',
    'mostly-uncharted',
    'full-circle',
    'three-day-spark',
    'momentum',
    'local-ritual',
    'city-hopper',
    'against-the-familiar'
  )),
  earned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (user_id, achievement_id)
);

alter table public.user_achievement_unlocks enable row level security;

drop policy if exists "Users can read their achievement unlocks"
  on public.user_achievement_unlocks;
create policy "Users can read their achievement unlocks"
  on public.user_achievement_unlocks
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their achievement unlocks"
  on public.user_achievement_unlocks;
create policy "Users can create their achievement unlocks"
  on public.user_achievement_unlocks
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can acknowledge their achievement unlocks"
  on public.user_achievement_unlocks;
create policy "Users can acknowledge their achievement unlocks"
  on public.user_achievement_unlocks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_achievement_unlocks from anon, authenticated;
grant select, insert, update on public.user_achievement_unlocks to authenticated;

commit;
