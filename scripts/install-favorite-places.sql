-- Private favorite places saved by each authenticated user.

begin;

create table if not exists public.favorite_places (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  comment text not null check (char_length(comment) between 1 and 240),
  icon text not null default 'star' check (icon in (
    'star',
    'tree',
    'restaurant',
    'cafe',
    'viewpoint',
    'landmark',
    'shop',
    'sports'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (updated_at >= created_at)
);

create index if not exists favorite_places_user_updated_idx
  on public.favorite_places (user_id, updated_at desc);

alter table public.favorite_places enable row level security;

drop policy if exists "Users can read their favorite places"
  on public.favorite_places;
create policy "Users can read their favorite places"
  on public.favorite_places
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their favorite places"
  on public.favorite_places;
create policy "Users can create their favorite places"
  on public.favorite_places
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their favorite places"
  on public.favorite_places;
create policy "Users can update their favorite places"
  on public.favorite_places
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their favorite places"
  on public.favorite_places;
create policy "Users can delete their favorite places"
  on public.favorite_places
  for delete
  using (auth.uid() = user_id);

revoke all on public.favorite_places from anon, authenticated;
grant select, insert, update, delete on public.favorite_places to authenticated;

commit;

