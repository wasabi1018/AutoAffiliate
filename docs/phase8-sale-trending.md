# Phase 8: SALE / TRENDING strategy

Phase 8 extends the ranking dry run without publishing posts.

## SALE evidence

SALE is scored only when the Rakuten response contains a valid `startTime` or `endTime` and the current time is inside that API-provided window. Price changes, discount rates, coupon values, or other inferred sale signals are not generated.

## TRENDING evidence

TRENDING requires at least three rank observations, at least two adjacent improvements, and a net improvement from the oldest observation to the current observation. A one-time spike that returns to its previous rank is rejected. The evaluation stores the history point count, score, and contribution explanation in `strategy_evidence`.

## Account-specific weights

`account_strategy_settings` stores a 100% total for each account. The ranking dry run accepts an optional `account_id`; if that account has no override, the global `strategy_settings` row is used. The settings can be updated by the authenticated administrator or with a controlled SQL change.

The Ranking screen now lets the operator select an account and displays the selected strategy for each candidate. Historical evaluations retain their selected strategy and evidence, so later weight changes do not rewrite prior results.

## Deploy

Apply the migration before deploying the updated function:

```bash
supabase db push
supabase functions deploy ranking-dry-run
```

The Phase 4 Ranking API endpoint is still used. No Threads post is created by this phase.
