alter table public.favorite_places
  add column if not exists name text not null default 'Favorite place'
  check (char_length(name) between 1 and 80);
