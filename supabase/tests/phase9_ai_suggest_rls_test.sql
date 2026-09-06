begin;

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.ai_analysis_runs'::regclass), 'AI analysis runs have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_suggestions'::regclass), 'AI suggestions have RLS enabled');
select ok(not has_table_privilege('anon', 'public.ai_analysis_runs', 'select'), 'anon cannot read AI analysis runs');
select ok(not has_table_privilege('anon', 'public.ai_suggestions', 'select'), 'anon cannot read AI suggestions');
select ok(has_table_privilege('authenticated', 'public.ai_analysis_runs', 'select'), 'authenticated can read AI analysis runs');
select ok(has_table_privilege('authenticated', 'public.ai_suggestions', 'select'), 'authenticated can read AI suggestions');
select ok(has_table_privilege('service_role', 'public.ai_analysis_runs', 'insert'), 'service role can create AI analysis runs');
select ok(has_table_privilege('service_role', 'public.ai_suggestions', 'insert'), 'service role can create AI suggestions');
select ok(has_column_privilege('service_role', 'public.ai_analysis_runs', 'estimated_cost_usd', 'insert'), 'analysis runs store estimated cost');
select ok(has_column_privilege('service_role', 'public.ai_suggestions', 'before_value', 'insert'), 'suggestions store before values');

select * from finish();

rollback;