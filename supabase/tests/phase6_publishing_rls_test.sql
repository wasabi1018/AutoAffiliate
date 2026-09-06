begin;

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.post_set_posts'::regclass), 'post set posts have RLS enabled');
select ok(not has_table_privilege('anon', 'public.post_set_posts', 'select'), 'anon cannot read post set posts');
select ok(has_table_privilege('authenticated', 'public.post_set_posts', 'select'), 'authenticated can read post set posts');

select ok(not has_table_privilege('anon', 'public.post_attempts', 'insert'), 'anon cannot insert post attempts');
select ok(not has_table_privilege('authenticated', 'public.post_attempts', 'insert'), 'authenticated cannot insert post attempts');
select ok(has_table_privilege('service_role', 'public.post_attempts', 'insert'), 'service role can insert post attempts');

select ok(not has_table_privilege('anon', 'public.post_sets', 'update'), 'anon cannot update approval state');
select ok(not has_table_privilege('authenticated', 'public.post_sets', 'update'), 'authenticated cannot directly update approval state');
select ok(has_table_privilege('service_role', 'public.post_sets', 'update'), 'service role can update approval state');
select ok((select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass), 'app settings remain protected by RLS');

select * from finish();

rollback;
