begin;

-- Older feedback cannot be attributed retrospectively. Account deletion clears the link.
alter table public.app_feedback
  add column user_id uuid references auth.users(id) on delete set null;
create index app_feedback_user_id_idx on public.app_feedback (user_id) where user_id is not null;

create or replace function public.submit_app_feedback(p_id uuid, p_reason text, p_message text, p_reply_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  feedback_user_id uuid := auth.uid();
begin
  if feedback_user_id is null then
    raise exception 'Sign in before sending feedback.' using errcode = '42501';
  end if;
  insert into public.app_feedback (id, user_id, reason, message, reply_email)
  values (p_id, feedback_user_id, p_reason, nullif(btrim(p_message), ''), nullif(btrim(p_reply_email), ''))
  on conflict (id) do nothing;
end;
$$;
revoke all on function public.submit_app_feedback(uuid, text, text, text) from public, anon;
grant execute on function public.submit_app_feedback(uuid, text, text, text) to authenticated;

commit;
