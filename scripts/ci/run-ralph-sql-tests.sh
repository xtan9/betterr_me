#!/usr/bin/env bash
set -euo pipefail

database_url="${RALPH_SQL_TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
list_only=false
if [[ "${1:-}" == "--list" ]]; then
  list_only=true
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--list]" >&2
  exit 2
fi

mapfile -d '' fixtures < <(
  find supabase/tests -maxdepth 1 -type f -name '*.sql' -print0 | sort -z
)

selected=()
for fixture in "${fixtures[@]}"; do
  if head -n 12 "$fixture" | grep -Fqx -- '-- ralph-ci: true'; then
    node scripts/ci/ralph-sql-policy.mjs --validate "$fixture"
    selected+=("$fixture")
  fi
done

if $list_only; then
  printf '%s\n' "${selected[@]}"
  exit 0
fi

if (( ${#selected[@]} == 0 )); then
  echo "No Ralph SQL fixtures opted into disposable-database CI."
  exit 0
fi

safe_path='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
safe_home="$(mktemp -d)"
trap 'rm -rf -- "$safe_home"' EXIT
runner_password='ralph-ci-disposable-only'
runner_database_url="postgresql://ralph_ci_test:${runner_password}@127.0.0.1:54322/postgres"

env -i PATH="$safe_path" HOME="$safe_home" LANG=C psql "$database_url" \
  -v ON_ERROR_STOP=1 \
  -v runner_password="$runner_password" <<'SQL'
create extension if not exists dblink with schema extensions;
do $block$
begin
  if not exists (select 1 from pg_roles where rolname = 'ralph_ci_test') then
    execute 'create role ralph_ci_test login password ''ralph-ci-disposable-only'' nosuperuser nocreatedb nocreaterole noinherit';
  end if;
end
$block$;
alter role ralph_ci_test password 'ralph-ci-disposable-only'
  nosuperuser nocreatedb nocreaterole noinherit;
grant authenticated, anon to ralph_ci_test;
grant usage, create on schema public to ralph_ci_test;
grant usage on schema auth, extensions to ralph_ci_test;
grant all privileges on all tables in schema public, auth to ralph_ci_test;
grant all privileges on all sequences in schema public, auth to ralph_ci_test;
grant execute on all functions in schema public, auth to ralph_ci_test;

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
begin
  if connection_name !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'invalid Ralph CI connection name';
  end if;
  return extensions.dblink_connect(
    connection_name,
    'host=127.0.0.1 port=54322 dbname=postgres user=ralph_ci_test password=ralph-ci-disposable-only'
  );
end
$function$;
alter function public.ralph_ci_open_connection(text) owner to postgres;
revoke all on function public.ralph_ci_open_connection(text) from public;
grant execute on function public.ralph_ci_open_connection(text) to ralph_ci_test;
SQL

for fixture in "${selected[@]}"; do
  echo "Running Ralph SQL fixture: $fixture"
  env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
    psql "$runner_database_url" -v ON_ERROR_STOP=1 -f "$fixture"
done
