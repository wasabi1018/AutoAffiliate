begin;

select plan(20);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.threads_accounts'::regclass),
  'threads accounts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.post_templates'::regclass),
  'post templates has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.posting_schedules'::regclass),
  'posting schedules has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.product_filters'::regclass),
  'product filters has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.strategy_settings'::regclass),
  'strategy settings has RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.threads_accounts', 'select'), 'anon cannot read Threads accounts');
select ok(has_table_privilege('authenticated', 'public.threads_accounts', 'select'), 'authenticated can read Threads accounts');
select ok(has_table_privilege('authenticated', 'public.threads_accounts', 'insert'), 'authenticated can create Threads accounts');
select ok(has_table_privilege('authenticated', 'public.threads_accounts', 'update'), 'authenticated can update Threads accounts');
select ok(has_table_privilege('authenticated', 'public.threads_accounts', 'delete'), 'authenticated can delete Threads accounts');

select ok(not has_table_privilege('anon', 'public.post_templates', 'select'), 'anon cannot read post templates');
select ok(has_table_privilege('authenticated', 'public.post_templates', 'select'), 'authenticated can read post templates');

select ok(not has_table_privilege('anon', 'public.app_settings', 'select'), 'anon cannot read app settings');
select ok(has_table_privilege('authenticated', 'public.app_settings', 'update'), 'authenticated can update app settings');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use private schema');
select ok(has_schema_privilege('service_role', 'private', 'usage'), 'service role can use private schema');
select ok(not has_table_privilege('anon', 'private.integration_secrets', 'select'), 'anon cannot read integration secrets');
select ok(not has_table_privilege('authenticated', 'private.integration_secrets', 'select'), 'authenticated cannot read integration secrets');
select ok(has_table_privilege('service_role', 'private.integration_secrets', 'select'), 'service role can read integration secrets');

select * from finish();

rollback;
