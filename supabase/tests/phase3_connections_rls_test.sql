begin;

select plan(8);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.provider_connections'::regclass),
  'provider connections has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.provider_connections', 'select'),
  'anon cannot read provider connections'
);
select ok(
  has_table_privilege('authenticated', 'public.provider_connections', 'select'),
  'authenticated can read provider connections'
);
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use private schema'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use private schema'
);
select ok(
  not has_table_privilege('anon', 'private.oauth_states', 'select'),
  'anon cannot read OAuth state'
);
select ok(
  not has_table_privilege('authenticated', 'private.oauth_states', 'select'),
  'authenticated cannot read OAuth state'
);
select ok(
  has_table_privilege('service_role', 'private.oauth_states', 'select'),
  'service role can read OAuth state'
);

select * from finish();

rollback;
