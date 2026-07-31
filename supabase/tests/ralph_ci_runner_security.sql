-- ralph-ci: true
-- Verifies the disposable SQL runner retains only its narrow bootstrap seams.

begin;

do $block$
begin
  if current_setting('betterr.sql_fixture_failure_probe', true) = 'on' then
    raise exception 'intentional SQL fixture runner failure probe';
  end if;

  if has_schema_privilege(current_user, 'auth', 'usage') then
    raise exception 'Ralph SQL runner unexpectedly has auth schema usage';
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
        'ralph_ci_create_auth_user',
        'ralph_ci_open_connection'
      )
  ) then
    raise exception 'Ralph SQL runner has an unexpected direct public function grant';
  end if;
end
$block$;

select public.ralph_ci_create_auth_user(
  '00000000-0000-0000-0000-000000000901',
  'ralph-runner-security@example.invalid'
);

rollback;
