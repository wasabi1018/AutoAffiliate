begin;

select plan(9);

select ok((select relrowsecurity from pg_class where oid = 'public.post_sets'::regclass), 'post sets have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.posting_jobs'::regclass), 'posting jobs have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.post_attempts'::regclass), 'post attempts have RLS enabled');

select ok(not has_table_privilege('anon', 'public.post_sets', 'select'), 'anon cannot read post sets');
select ok(not has_table_privilege('anon', 'public.posting_jobs', 'select'), 'anon cannot read posting jobs');
select ok(not has_table_privilege('anon', 'public.post_attempts', 'select'), 'anon cannot read post attempts');

select ok(has_table_privilege('authenticated', 'public.post_sets', 'select'), 'authenticated can read post sets');
select ok(has_table_privilege('authenticated', 'public.posting_jobs', 'select'), 'authenticated can read posting jobs');
select ok(has_table_privilege('authenticated', 'public.post_attempts', 'select'), 'authenticated can read post attempts');

select * from finish();

rollback;
