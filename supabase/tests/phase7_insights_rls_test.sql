begin;

select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.post_insight_jobs'::regclass), 'insights jobs have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.post_insight_snapshots'::regclass), 'insights snapshots have RLS enabled');
select ok(not has_table_privilege('anon', 'public.post_insight_jobs', 'select'), 'anon cannot read insights jobs');
select ok(not has_table_privilege('anon', 'public.post_insight_snapshots', 'select'), 'anon cannot read insights snapshots');
select ok(has_table_privilege('authenticated', 'public.post_insight_jobs', 'select'), 'authenticated can read insights jobs');
select ok(has_table_privilege('authenticated', 'public.post_insight_snapshots', 'select'), 'authenticated can read insights snapshots');
select ok(has_table_privilege('service_role', 'public.post_insight_jobs', 'insert'), 'service role can insert insights jobs');
select ok(has_table_privilege('service_role', 'public.post_insight_snapshots', 'insert'), 'service role can insert insights snapshots');
select ok(not has_table_privilege('authenticated', 'public.post_insight_jobs', 'insert'), 'authenticated cannot enqueue insights jobs');
select ok(not has_table_privilege('authenticated', 'public.post_insight_snapshots', 'insert'), 'authenticated cannot insert insights snapshots');
select ok((select relrowsecurity from pg_class where oid = 'public.post_set_posts'::regclass), 'post set posts retain RLS');
select ok(has_column_privilege('service_role', 'public.post_set_posts', 'published_at', 'update'), 'service role can save published time');

select * from finish();

rollback;
