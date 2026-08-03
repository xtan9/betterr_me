#!/usr/bin/env bash
set -euo pipefail

database_url="${SQL_FIXTURE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
results_root="${SQL_FIXTURE_RESULTS_DIR:-${RUNNER_TEMP:-.artifacts}/sql-fixtures}"
list_only=false
registry_args=(--plan)

while (( $# > 0 )); do
  case "$1" in
    --)
      shift
      ;;
    --domain|--fixture)
      if [[ -z "${2:-}" ]]; then
        echo "$1 requires a value" >&2
        exit 2
      fi
      registry_args+=("$1" "$2")
      shift 2
      ;;
    --list)
      list_only=true
      shift
      ;;
    *)
      echo "usage: $0 [--list] [--domain name] [--fixture name]" >&2
      exit 2
      ;;
  esac
done

case "$database_url" in
  postgresql://*:*@127.0.0.1:54322/postgres|postgresql://*:*@localhost:54322/postgres)
    ;;
  *)
    echo "SQL fixture runner refuses non-disposable database URL; expected local Supabase PostgreSQL on port 54322" >&2
    exit 1
    ;;
esac

node scripts/ci/sql-fixture-registry.mjs --validate
plan_output="$(node scripts/ci/sql-fixture-registry.mjs "${registry_args[@]}")"
mapfile -t plan <<<"$plan_output"

if $list_only; then
  printf '%s\n' "${plan[@]}"
  exit 0
fi

for command in psql pg_dump; do
  if ! command -v "$command" >/dev/null; then
    echo "SQL fixture runner requires $command" >&2
    exit 1
  fi
done

safe_path='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
safe_home="$(mktemp -d)"
trap 'rm -rf -- "$safe_home"' EXIT
mkdir -p "$results_root"

snapshot_database() {
  local destination="$1"
  env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
    pg_dump "$database_url" --schema-only --no-owner \
    | sed '/^\\restrict /d;/^\\unrestrict /d;/^-- Dumped from database version/d;/^-- Dumped by pg_dump version/d' \
    >"${destination}.schema"
  env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
    pg_dump "$database_url" --data-only --no-owner --column-inserts \
    | sed '/^\\restrict /d;/^\\unrestrict /d;/^-- Dumped from database version/d;/^-- Dumped by pg_dump version/d' \
    >"${destination}.data"
}

capture_database_outcome() {
  local destination="$1"
  if ! env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
    psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select json_build_object('database', current_database(), 'user', current_user, 'server', inet_server_addr(), 'port', inet_server_port())" \
      >"$destination" 2>/dev/null; then
    printf '{"status":"unavailable"}\n' >"$destination"
  fi
}

if printf '%s\n' "${plan[@]}" | grep -q $'\tconstrained\t'; then
  CONSTRAINED_SQL_FIXTURE_DATABASE_URL="$database_url" \
    bash scripts/ci/run-constrained-sql-fixtures.sh --bootstrap-only
fi

for item in "${plan[@]}"; do
  IFS=$'\t' read -r fixture domain role cleanup <<<"$item"
  fixture_path="supabase/tests/$fixture"
  result_directory="$results_root/${fixture%.sql}"
  mkdir -p "$result_directory"

  snapshot_database "$result_directory/before"
  echo "Running SQL fixture: $fixture_path (domain=$domain role=$role cleanup=$cleanup)"
  set +e
  if [[ "$role" == "constrained" ]]; then
    CONSTRAINED_SQL_FIXTURE_DATABASE_URL="$database_url" \
      bash scripts/ci/run-constrained-sql-fixtures.sh --skip-bootstrap --fixture "$fixture_path" \
      2>&1 | tee "$result_directory/output.log"
  else
    env -i PATH="$safe_path" HOME="$safe_home" LANG=C \
      psql "$database_url" -X -v ON_ERROR_STOP=1 -f "$fixture_path" \
      2>&1 | tee "$result_directory/output.log"
  fi
  fixture_status=${PIPESTATUS[0]}
  set -e

  cleanup_status=0
  if ! snapshot_database "$result_directory/after" 2>"$result_directory/cleanup.log"; then
    cleanup_status=1
    echo "Could not capture the post-fixture database state." >>"$result_directory/cleanup.log"
  else
    for snapshot in data schema; do
      if ! diff -u \
        "$result_directory/before.$snapshot" \
        "$result_directory/after.$snapshot" \
        >>"$result_directory/cleanup.log"; then
        cleanup_status=1
      fi
    done
  fi

  if (( fixture_status != 0 || cleanup_status != 0 )); then
    capture_database_outcome "$result_directory/database-outcome.json"
    {
      echo "fixture=$fixture_path"
      echo "fixture_status=$fixture_status"
      echo "cleanup_status=$cleanup_status"
    } >"$result_directory/outcome.txt"
    echo "SQL fixture failed: $fixture_path" >&2
    echo "Database state was preserved; diagnostics: $result_directory" >&2
    if [[ -s "$result_directory/cleanup.log" ]]; then
      cat "$result_directory/cleanup.log" >&2
    fi
    exit 1
  fi

  printf 'fixture=%s\nfixture_status=0\ncleanup_status=0\n' "$fixture_path" \
    >"$result_directory/outcome.txt"
done

echo "All selected SQL fixtures passed without database residue. Diagnostics: $results_root"
