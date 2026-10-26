begin;

create extension if not exists pg_net with schema extensions;

-- Provision feedback_email_url and feedback_webhook_secret in Supabase Vault before applying.
-- The webhook secret must match FEEDBACK_WEBHOOK_SECRET in the notify-feedback Edge Function.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'feedback_email_url' and decrypted_secret <> '')
     or not exists (select 1 from vault.decrypted_secrets where name = 'feedback_webhook_secret' and decrypted_secret <> '') then
    raise exception 'Configure feedback_email_url and feedback_webhook_secret in Supabase Vault before enabling feedback email alerts.';
  end if;
end;
$$;

create function public.notify_app_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint text;
  webhook_secret text;
begin
  select decrypted_secret into strict endpoint from vault.decrypted_secrets where name = 'feedback_email_url';
  select decrypted_secret into strict webhook_secret from vault.decrypted_secrets where name = 'feedback_webhook_secret';
  if endpoint is null or endpoint = '' or webhook_secret is null or webhook_secret = '' then
    raise exception 'Feedback email webhook secrets are missing. Restore feedback_email_url and feedback_webhook_secret in Supabase Vault.';
  end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-feedback-secret', webhook_secret),
    body := jsonb_build_object('type', 'INSERT', 'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW)),
    timeout_milliseconds := 100000
  );
  return NEW;
end;
$$;
revoke all on function public.notify_app_feedback() from public, anon, authenticated;

create trigger app_feedback_email
  after insert on public.app_feedback
  for each row execute function public.notify_app_feedback();

commit;
