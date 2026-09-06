# Phase 6: staged Threads publishing

Phase 6 adds a manual post-set workflow and the Threads text publishing flow. A post is created as a media container first, then published with `threads_publish`. Replies use the published parent post ID as `reply_to_id`.

## Deploy

After applying the Phase 6 migration, deploy these authenticated-user functions:

    supabase functions deploy post-set-create
    supabase functions deploy post-set-approve
    supabase functions deploy threads-publish

The workflow is available at `/dashboard/publishing`. Creating a post set stores it as `pending` approval. Approval is separate from publishing.

## Live gate

`threads-publish` refuses to call Threads unless all of these are true:

- the post set is manually approved;
- `app_settings.live_posting_enabled = true`;
- `app_settings.dry_run = false`;
- global and emergency stops are off;
- the selected account is active;
- an encrypted Threads token is available.

The default remains safe: Dry Run is enabled and live posting is disabled. Enable live mode only after the staged rollout review:

    update public.app_settings
    set dry_run = false, live_posting_enabled = true
    where id = true;

Do not run that statement until real posting is intentionally authorized.

## Failure behavior

Parent and reply posts are tracked independently. A published parent is never sent again when a reply fails. A timeout or network failure is recorded as `AMBIGUOUS_OUTCOME`; the stored container ID is retained when available so the operator can review before retrying. Non-ambiguous failures produce `partial_failure` and can be retried from the approval screen.

The function stores only provider IDs and safe error metadata. Access tokens are read from the existing encrypted private-schema record and are never returned to the browser.
