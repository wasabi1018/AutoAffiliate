# Phase 4: ranking dry run

Phase 4 fetches the Rakuten Ichiba Ranking API, stores normalized products and immutable snapshots, applies the saved product filters, and records a weighted dry-run evaluation. It never publishes to Threads.

## Database

Apply `supabase/migrations/20260906024802_phase4_ranking.sql` after the Phase 1-3 migrations. The migration creates `ranking_history`, `products`, `product_snapshots`, and `product_selection_evaluations`. All tables are protected by RLS and readable only by admin users through the browser.

## Deploy

Deploy the new function after the Phase 3 shared functions:

    supabase functions deploy ranking-dry-run

The function reads the encrypted Rakuten credentials stored by `provider-check`, so no new secret is required. It accepts an optional `genre_id`, `page`, and `result_limit` and uses the current 2022-06-01 Ranking API endpoint.

## Scoring

The saved Phase 2 strategy weights are applied to three components:

- RANKING: normalized rank score, from 100 for rank 1 down to 0 for the last item.
- SALE: 100 only while the API sale window is active; otherwise 0.
- TRENDING: 0 in Phase 4 because historical comparison is reserved for a later phase.

The saved price, stock, review-count, and excluded-word filters determine eligibility. Each item stores the component scores and human-readable reasons. The dashboard displays the latest run at `/dashboard/ranking`.

## Verification

The local pgTAP test is `supabase/tests/phase4_ranking_rls_test.sql`. Run it when local Supabase/Docker is available.
