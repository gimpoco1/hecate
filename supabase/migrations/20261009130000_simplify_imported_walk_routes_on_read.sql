drop function if exists public.get_walk_routes();
create function public.get_walk_routes()
returns table (
  walk_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  coordinates jsonb,
  achievement_eligible boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    id,
    walks.started_at,
    walks.finished_at,
    (
      extensions.st_asgeojson(
        case
          when not walks.achievement_eligible and walks.point_count > 2000
            then extensions.st_simplifypreservetopology(walks.route, 0.00002)
          else walks.route
        end
      )::jsonb -> 'coordinates'
    ),
    walks.achievement_eligible
  from public.walks
  where user_id = auth.uid()
  order by walks.started_at;
$$;

revoke all on function public.get_walk_routes() from public, anon;
grant execute on function public.get_walk_routes() to authenticated;
