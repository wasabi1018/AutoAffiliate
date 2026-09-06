begin;

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.account_strategy_settings'::regclass), 'account strategy settings have RLS enabled');
select ok(not has_table_privilege('anon', 'public.account_strategy_settings', 'select'), 'anon cannot read account strategy settings');
select ok(has_table_privilege('authenticated', 'public.account_strategy_settings', 'select'), 'authenticated can read account strategy settings');
select ok(has_table_privilege('authenticated', 'public.account_strategy_settings', 'update'), 'authenticated can update account strategy settings');
select ok(has_table_privilege('service_role', 'public.account_strategy_settings', 'update'), 'service role can update account strategy settings');
select ok((select relrowsecurity from pg_class where oid = 'public.product_selection_evaluations'::regclass), 'selection evaluations retain RLS');
select ok(has_table_privilege('service_role', 'public.product_selection_evaluations', 'insert'), 'service role can insert strategy evaluations');
select ok(has_column_privilege('service_role', 'public.product_selection_evaluations', 'selected_strategy', 'insert'), 'evaluations store selected strategy');
select ok(has_column_privilege('service_role', 'public.product_selection_evaluations', 'strategy_evidence', 'insert'), 'evaluations store strategy evidence');
select ok(has_table_privilege('authenticated', 'public.product_selection_evaluations', 'select'), 'authenticated can read strategy evaluations');

select * from finish();

rollback;
