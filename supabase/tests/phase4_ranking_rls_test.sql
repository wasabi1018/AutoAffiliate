begin;

select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.ranking_history'::regclass), 'ranking history has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'products has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.product_snapshots'::regclass), 'product snapshots has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.product_selection_evaluations'::regclass), 'product evaluations have RLS enabled');

select ok(not has_table_privilege('anon', 'public.ranking_history', 'select'), 'anon cannot read ranking history');
select ok(not has_table_privilege('anon', 'public.products', 'select'), 'anon cannot read products');
select ok(not has_table_privilege('anon', 'public.product_snapshots', 'select'), 'anon cannot read product snapshots');
select ok(not has_table_privilege('anon', 'public.product_selection_evaluations', 'select'), 'anon cannot read product evaluations');

select ok(has_table_privilege('authenticated', 'public.ranking_history', 'select'), 'authenticated can read ranking history');
select ok(has_table_privilege('authenticated', 'public.products', 'select'), 'authenticated can read products');
select ok(has_table_privilege('authenticated', 'public.product_snapshots', 'select'), 'authenticated can read product snapshots');
select ok(has_table_privilege('authenticated', 'public.product_selection_evaluations', 'select'), 'authenticated can read product evaluations');

select * from finish();

rollback;
