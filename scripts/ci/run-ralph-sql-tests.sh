#!/usr/bin/env bash
set -euo pipefail

database_url="${RALPH_SQL_TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
auth_admin_database_url="${RALPH_SQL_TEST_AUTH_ADMIN_DATABASE_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres}"
list_only=false
bootstrap_only=false
skip_bootstrap=false
requested_fixtures=()
while (( $# > 0 )); do
  case "$1" in
    --list)
      list_only=true
      shift
      ;;
    --bootstrap-only)
      bootstrap_only=true
      shift
      ;;
    --skip-bootstrap)
      skip_bootstrap=true
      shift
      ;;
    --fixture)
      if [[ -z "${2:-}" ]]; then
        echo "--fixture requires a path" >&2
        exit 2
      fi
      requested_fixtures+=("$2")
      shift 2
      ;;
    *)
      echo "usage: $0 [--list] [--bootstrap-only|--skip-bootstrap] [--fixture path ...]" >&2
      exit 2
      ;;
  esac
done

mapfile -d '' fixtures < <(
  find supabase/tests -maxdepth 1 -type f -name '*.sql' -print0 | sort -z
)

selected=()
if (( ${#requested_fixtures[@]} > 0 )); then
  for fixture in "${requested_fixtures[@]}"; do
    node scripts/ci/ralph-sql-policy.mjs --validate "$fixture"
    selected+=("$fixture")
  done
else
  for fixture in "${fixtures[@]}"; do
    if head -n 12 "$fixture" | grep -Fqx -- '-- ralph-ci: true'; then
      node scripts/ci/ralph-sql-policy.mjs --validate "$fixture"
      selected+=("$fixture")
    fi
  done
fi

if $list_only; then
  printf '%s\n' "${selected[@]}"
  exit 0
fi

if (( ${#selected[@]} == 0 )) && ! $bootstrap_only; then
  echo "No Ralph SQL fixtures opted into disposable-database CI."
  exit 0
fi

safe_path='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
safe_home="$(mktemp -d)"
trap 'rm -rf -- "$safe_home"' EXIT
runner_password='ralph-ci-disposable-only'
runner_database_url="postgresql://ralph_ci_test:${runner_password}@127.0.0.1:54322/postgres"

if ! $skip_bootstrap; then
env -i PATH="$safe_path" HOME="$safe_home" LANG=C psql "$database_url" \
  -v ON_ERROR_STOP=1 \
  -v runner_password="$runner_password" <<'SQL'
do $block$
declare
  runner_role pg_roles%rowtype;
  legacy_wrapper_owner name;
  dblink_schema name;
begin
  select * into runner_role
  from pg_roles
  where rolname = 'ralph_ci_test';
  if not found then
    execute 'create role ralph_ci_test login password ''ralph-ci-disposable-only'' nosuperuser nocreatedb nocreaterole noinherit';
  elsif runner_role.rolsuper
      or runner_role.rolcreatedb
      or runner_role.rolcreaterole
      or runner_role.rolinherit
      or runner_role.rolreplication
      or runner_role.rolbypassrls then
    raise exception 'runner role has unsafe attributes';
  end if;
  if exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    where membership.member = (
      select oid from pg_roles where rolname = 'ralph_ci_test'
    )
      and granted_role.rolname not in ('authenticated', 'anon')
  ) then
    raise exception 'runner role has unsafe memberships';
  end if;

  select pg_get_userbyid(routine.proowner)
  into legacy_wrapper_owner
  from pg_proc as routine
  join pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname = 'ralph_ci_open_connection'
    and pg_get_function_identity_arguments(routine.oid) = 'connection_name text';

  if legacy_wrapper_owner = current_user then
    drop function public.ralph_ci_open_connection(text);
  elsif legacy_wrapper_owner is not null
      and legacy_wrapper_owner <> 'supabase_admin' then
    raise exception 'runner connection helper has unexpected owner: %',
      legacy_wrapper_owner;
  end if;

  select namespace.nspname
  into dblink_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'dblink';

  if dblink_schema is not null and dblink_schema <> 'extensions' then
    if to_regnamespace('extensions') is null then
      raise exception 'extensions schema is unavailable for dblink';
    end if;
    alter extension dblink set schema extensions;
  end if;
end
$block$;
alter role ralph_ci_test login password 'ralph-ci-disposable-only';
grant authenticated, anon to ralph_ci_test;
revoke create on schema public from ralph_ci_test;
grant usage on schema public to ralph_ci_test;
grant all privileges on all tables in schema public to ralph_ci_test;
grant all privileges on all sequences in schema public to ralph_ci_test;
do $block$
declare
  function_signature text;
begin
  for function_signature in
    select routine.oid::regprocedure::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where namespace.nspname = 'public'
      and privilege.grantee = (
        select oid from pg_roles where rolname = 'ralph_ci_test'
      )
      and privilege.privilege_type = 'EXECUTE'
      and has_function_privilege(
        current_user,
        routine.oid,
        'EXECUTE WITH GRANT OPTION'
      )
  loop
    execute format(
      'revoke execute on function %s from ralph_ci_test',
      function_signature
    );
  end loop;
end
$block$;
SQL

env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
  psql "$auth_admin_database_url" -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists dblink with schema extensions;
grant usage on schema extensions to ralph_ci_test;

-- Remove grants issued by the legacy runner before exposing the narrow helpers.
-- PostgreSQL ACLs are persistent, so merely omitting the old GRANT statements is
-- insufficient when this script upgrades an existing disposable database.
revoke usage on schema auth from ralph_ci_test;
revoke all privileges on all tables in schema auth from ralph_ci_test;
revoke all privileges on all sequences in schema auth from ralph_ci_test;
revoke execute on all functions in schema auth from ralph_ci_test;
do $block$
declare
  function_signature text;
begin
  for function_signature in
    select routine.oid::regprocedure::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where namespace.nspname = 'public'
      and privilege.grantee = (
        select oid from pg_roles where rolname = 'ralph_ci_test'
      )
      and privilege.privilege_type = 'EXECUTE'
      and has_function_privilege(
        current_user,
        routine.oid,
        'EXECUTE WITH GRANT OPTION'
      )
  loop
    execute format(
      'revoke execute on function %s from ralph_ci_test',
      function_signature
    );
  end loop;

  if exists (
    select 1
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where namespace.nspname = 'public'
      and privilege.grantee = (
        select oid from pg_roles where rolname = 'ralph_ci_test'
      )
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'runner retains an unexpected direct public function grant';
  end if;
end
$block$;

create or replace function public.ralph_ci_create_auth_user(
  test_user_id uuid,
  test_email text
)
returns void
language sql
security definer
set search_path = pg_catalog, auth
as $function$
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    test_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    test_email,
    'not-used',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ) on conflict (id) do nothing;
$function$;
revoke all on function public.ralph_ci_create_auth_user(uuid, text) from public;
grant execute on function public.ralph_ci_create_auth_user(uuid, text)
  to ralph_ci_test;

create or replace function public.ralph_ci_seed_finance_plan(
  plan_id uuid,
  owner_id uuid,
  liquid_resources bigint,
  monthly_essential_expenses bigint,
  monthly_continuing_income bigint
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  insert into public.finance_cushions (
    id,
    user_id,
    liquid_resources_cents,
    monthly_essential_expenses_cents,
    monthly_continuing_income_cents
  ) values (
    plan_id,
    owner_id,
    liquid_resources,
    monthly_essential_expenses,
    monthly_continuing_income
  );
$function$;
revoke all on function public.ralph_ci_seed_finance_plan(uuid, uuid, bigint, bigint, bigint)
  from public;
grant execute on function public.ralph_ci_seed_finance_plan(uuid, uuid, bigint, bigint, bigint)
  to ralph_ci_test;

create or replace function public.ralph_ci_seed_finance_snapshot(
  snapshot_id uuid,
  plan_id uuid,
  owner_id uuid,
  action_id uuid,
  snapshot_trigger text,
  scenario_name text,
  covered_months numeric,
  is_sustainable boolean,
  snapshot_result jsonb,
  snapshot_model_version text
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  insert into public.finance_cushion_snapshots (
    id,
    plan_id,
    user_id,
    action_id,
    trigger,
    scenario,
    months_covered,
    sustainable,
    result,
    model_version
  ) values (
    snapshot_id,
    plan_id,
    owner_id,
    action_id,
    snapshot_trigger,
    scenario_name,
    covered_months,
    is_sustainable,
    snapshot_result,
    snapshot_model_version
  );
$function$;
revoke all on function public.ralph_ci_seed_finance_snapshot(
  uuid, uuid, uuid, uuid, text, text, numeric, boolean, jsonb, text
) from public;
grant execute on function public.ralph_ci_seed_finance_snapshot(
  uuid, uuid, uuid, uuid, text, text, numeric, boolean, jsonb, text
) to ralph_ci_test;

create or replace function public.ralph_ci_delete_auth_profile(
  test_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth
as $function$
declare
  test_email text;
begin
  select email
  into test_email
  from auth.users
  where id = test_user_id;

  if test_email is null or test_email not like '%@example.test' then
    raise exception 'Ralph CI profile helper requires a disposable auth user';
  end if;

  delete from public.profiles
  where id = test_user_id;
  if not found then
    raise exception 'Ralph CI disposable profile is missing';
  end if;
end
$function$;
revoke all on function public.ralph_ci_delete_auth_profile(uuid) from public;
grant execute on function public.ralph_ci_delete_auth_profile(uuid)
  to ralph_ci_test;

create or replace function public.ralph_ci_delete_auth_user(
  test_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth
as $function$
begin
  delete from auth.users
  where id = test_user_id
    and email like '%@example.test';
  if not found then
    raise exception 'Ralph CI test user is missing or is not disposable';
  end if;
end
$function$;
revoke all on function public.ralph_ci_delete_auth_user(uuid) from public;
grant execute on function public.ralph_ci_delete_auth_user(uuid)
  to ralph_ci_test;

-- Extension installation grants EXECUTE to PUBLIC. Remove that ambient access and
-- expose only operations on connections opened by the fixed low-privilege wrapper.
revoke execute on all functions in schema extensions from public, ralph_ci_test;
do $block$
declare
  function_signature text;
begin
  for function_signature in
    select routine.oid::regprocedure::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'extensions'
      and routine.proname in (
        'dblink_send_query',
        'dblink_get_result',
        'dblink_is_busy',
        'dblink_cancel_query',
        'dblink_error_message',
        'dblink_disconnect'
      )
  loop
    execute format('grant execute on function %s to ralph_ci_test', function_signature);
  end loop;
end
$block$;
do $block$
declare
  wrapper_name text;
begin
  for wrapper_name in select fdwname from pg_foreign_data_wrapper
  loop
    execute format(
      'revoke usage on foreign data wrapper %I from public, ralph_ci_test',
      wrapper_name
    );
  end loop;
end
$block$;

create or replace function public.ralph_ci_open_connection(connection_name text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $function$
declare
  connection_status text;
begin
  if connection_name !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'invalid Ralph CI connection name';
  end if;
  connection_status := extensions.dblink_connect(
    connection_name,
    'hostaddr=' || host(inet_server_addr())
      || ' port=' || inet_server_port()
      || ' dbname=' || current_database()
      || ' user=ralph_ci_test password=ralph-ci-disposable-only'
  );
  perform extensions.dblink_exec(connection_name, 'set role authenticated');
  return connection_status;
end
$function$;
revoke all on function public.ralph_ci_open_connection(text) from public;
grant execute on function public.ralph_ci_open_connection(text) to ralph_ci_test;
SQL
fi

if $bootstrap_only; then
  exit 0
fi

for fixture in "${selected[@]}"; do
  echo "Running Ralph SQL fixture: $fixture"
  env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
    psql "$runner_database_url" -v ON_ERROR_STOP=1 -f "$fixture"
done
