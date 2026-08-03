-- constrained-sql-fixture: true
-- Verifies the disposable SQL runner retains only its narrow bootstrap seams.

begin;

do $block$
begin
  if has_schema_privilege(current_user, 'auth', 'usage') then
    raise exception 'Constrained SQL fixture runner unexpectedly has auth schema usage';
  end if;

  if exists (
    select 1
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where namespace.nspname = 'public'
      and privilege.grantee = (
        select oid from pg_roles where rolname = current_user
      )
      and privilege.privilege_type = 'EXECUTE'
      and routine.proname not in (
         'sql_fixture_create_auth_user',
         'sql_fixture_delete_auth_profile',
         'sql_fixture_delete_auth_user',
         'sql_fixture_seed_finance_plan',
         'sql_fixture_seed_finance_snapshot',
         'sql_fixture_open_connection'
      )
  ) then
    raise exception 'Constrained SQL fixture runner has an unexpected direct public function grant';
  end if;
end
$block$;

select public.sql_fixture_create_auth_user(
  '00000000-0000-0000-0000-000000000901',
  'sql-fixture-runner-security@example.test'
);

select public.sql_fixture_delete_auth_profile(
  '00000000-0000-0000-0000-000000000901'
);

rollback;
