begin;

-- Feedback is readable only by the project administrators, never by app clients.
create table public.app_feedback (
  id uuid primary key,
  created_at timestamptz not null default now(),
  reason text not null check (reason in ('bugs', 'battery', 'confusing', 'missing_features', 'not_using', 'other')),
  message text check (char_length(message) between 1 and 2000),
  reply_email text check (char_length(reply_email) between 3 and 254 and reply_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.app_feedback enable row level security;
revoke all on public.app_feedback from public, anon, authenticated;
grant all on public.app_feedback to service_role;

-- A caller-generated ID makes retries safe without exposing submitted feedback.
create function public.submit_app_feedback(p_id uuid, p_reason text, p_message text, p_reply_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.app_feedback (id, reason, message, reply_email)
  values (p_id, p_reason, nullif(btrim(p_message), ''), nullif(btrim(p_reply_email), ''))
  on conflict (id) do nothing;
$$;
revoke all on function public.submit_app_feedback(uuid, text, text, text) from public;
grant execute on function public.submit_app_feedback(uuid, text, text, text) to anon, authenticated;

commit;
