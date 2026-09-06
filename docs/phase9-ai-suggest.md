# Phase 9: AI SUGGEST

Phase 9 uses only aggregate Threads Insights and posting metadata to create conservative operation suggestions. It never gives the model credentials, raw integration responses, personal data, code, RLS settings, or emergency-stop settings.

## What is stored

`ai_analysis_runs` stores the analysis period, aggregate input summary, model, token counts, estimated cost, and status. `ai_suggestions` stores the recommendation, rationale, confidence, before value, proposed value, review state, and reviewer/application timestamps.

## Human approval and bounds

Generation creates `pending` suggestions only. An administrator must approve each suggestion and explicitly apply it. Strategy changes must total 100% and each weight may move by at most 20 points. Posting-time suggestions keep the existing weekdays and timezone. Template suggestions can only select an active hook template. Stale suggestions are rejected if the underlying setting changed after analysis.

## Configuration

The Edge Function uses the Vercel AI Gateway through the AI SDK. Set these as Supabase Edge Function secrets:

```bash
supabase secrets set AI_GATEWAY_API_KEY=<gateway-key>
supabase secrets set AI_SUGGEST_MODEL=openai/gpt-5.4-mini
supabase secrets set AI_INPUT_COST_PER_1M_USD=0.75
supabase secrets set AI_OUTPUT_COST_PER_1M_USD=4.5
```

The model and rates are recorded for each run. The rates are estimates and can be changed without changing previous records.

## Deploy

Apply the migration and deploy the function:

```bash
supabase db push
supabase functions deploy ai-suggest
```

Then open `/dashboard/suggestions`. If fewer than three published posts or fewer than three posts with official metrics exist in the selected period, the run is stored as `insufficient_data` and no AI request is made.