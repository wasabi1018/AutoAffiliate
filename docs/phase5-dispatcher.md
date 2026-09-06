# Phase 5: hosted Supabase dispatcher

Phase 5 creates scheduled work and processes it in safe Dry Run mode. The dispatcher never calls the Threads publishing API. It claims due jobs with `FOR UPDATE SKIP LOCKED`, applies account status and rate limits, records attempts, retries failures with exponential backoff, and moves exhausted jobs to `dead_letter`.

## Deploy

After applying the Phase 5 migration, set a random `DISPATCHER_SECRET` in Edge Function Secrets and deploy:

    supabase functions deploy dispatcher --no-verify-jwt

The function accepts either the `x-dispatcher-secret` header used by pg_cron or an authenticated administrator session for the dashboard button at `/dashboard/jobs`.

## Schedule with pg_cron

Hosted Supabase supports invoking Edge Functions from `pg_cron` and `pg_net`. Store the project URL and dispatcher secret in Supabase Vault, then run the following SQL once after replacing the placeholders:

    select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
    select vault.create_secret('<same value as DISPATCHER_SECRET>', 'dispatcher_secret');

    select cron.schedule(
      'auto-affiliater-dispatcher',
      '* * * * *',
      $$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/dispatcher',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-dispatcher-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_secret')
        ),
        body := '{"source":"pg_cron"}'::jsonb
      );
      $$
    );

The migration does not create this schedule automatically because the project URL and secret are project-specific. To remove it later, run `select cron.unschedule('auto-affiliater-dispatcher');`.

## Safety behavior

- `dry_run` must remain enabled; live posting is explicitly rejected in Phase 5.
- Paused or disabled accounts, global stop, and emergency stop cancel the job with an audit attempt.
- Daily limits and minimum intervals reschedule work without consuming a retry attempt.
- Failed work is retried after bounded exponential backoff and then moved to `dead_letter`.
- Attempt metadata excludes provider secrets and expires after 31 days.
