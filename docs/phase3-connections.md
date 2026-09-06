# Phase 3: hosted Supabase setup

Phase 3 adds provider connection checks through Supabase Edge Functions. Credentials and OAuth tokens are handled server-side and are never returned to the browser. The private schema remains outside the Data API.

## Required Edge Function Secrets

Set these in the hosted Supabase project:

- THREADS_APP_ID
- THREADS_APP_SECRET
- THREADS_REDIRECT_URI: the exact URL of the deployed threads-oauth-callback function
- THREADS_SCOPES: optional; defaults to threads_basic
- INTEGRATION_SECRET_KEY: a Base64-encoded 32-byte AES key
- SUPABASE_DB_URL: a restricted database connection string for the private schema

Supabase normally provides SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to Edge Functions. Never expose the service role key, database URL, provider app secret, or integration encryption key to the browser.

## Deploy functions

Run these commands after linking the hosted project:

    supabase functions deploy threads-oauth-start
    supabase functions deploy threads-oauth-callback --no-verify-jwt
    supabase functions deploy provider-check

The callback is intentionally deployed without JWT verification because Threads redirects the browser directly to it. The callback is protected by a short-lived, one-time OAuth state hash stored in private.oauth_states.

Register the callback URL in the Threads application exactly as configured in THREADS_REDIRECT_URI.

## Apply database migration

The migration file is:

    supabase/migrations/20260906022117_phase3_connections.sql

If the Phase 1 and Phase 2 migrations are already applied, only this Phase 3 migration is needed. Otherwise apply all migrations in timestamp order.

For a hosted project:

    supabase login
    supabase link --project-ref <project-ref>
    supabase db push

The connection screen is available at /dashboard/connections after the migration and function deployment. Phase 3 only verifies Threads profile/quota access and the current Rakuten Ichiba Ranking API; it does not publish content.

## Security notes

- provider_connections exposes only non-secret metadata and is readable only by admin users.
- OAuth states and encrypted credentials are stored in the private schema.
- Provider credentials are encrypted with AES-GCM before storage.
- Upstream responses are validated, raw response bodies are not returned, and requests time out after 10 seconds.
