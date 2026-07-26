#!/usr/bin/env bash

# Produces compact, sanitized Gate 1 evidence. The local stack intentionally
# remains running for the following postcondition workflow step.
set -euo pipefail

evidence_dir="ci-evidence"
raw_log_dir="${RUNNER_TEMP:-/tmp}/financial-safety-ci"
rm -rf "$evidence_dir" "$raw_log_dir"
mkdir -p "$evidence_dir" "$raw_log_dir"

sanitize() {
  sed -E \
    -e 's/(postgres(ql)?:\/\/)[^[:space:]@]+@/\1[REDACTED]@/g' \
    -e 's/(api[_-]?key|token|secret|password)[=:][^[:space:]]+/\1=[REDACTED]/Ig'
}

git rev-parse HEAD > "$evidence_dir/checked-out-head.txt"
supabase --version > "$evidence_dir/supabase-cli-version.txt"
sha256sum supabase/migrations/*.sql supabase/tests/financial_safety_cushion_isolation.sql \
  > "$evidence_dir/migration-and-fixture-manifest.sha256"

supabase stop --no-backup > "$raw_log_dir/preclean.log" 2>&1 || true
supabase start > "$raw_log_dir/start.log" 2>&1
supabase db reset --local --no-seed > "$raw_log_dir/reset.log" 2>&1

for log in preclean start reset; do
  sanitize < "$raw_log_dir/$log.log" > "$evidence_dir/$log.sanitized.log"
done

status_env="$(supabase status -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -nE 's/^DB_URL="?([^\"]*)"?$/\1/p')"
if [ -z "$db_url" ]; then
  echo "Supabase did not report a local DB_URL." >&2
  printf '%s\n' "$status_env" | sanitize > "$evidence_dir/status.sanitized.log"
  cat "$evidence_dir/status.sanitized.log"
  exit 1
fi

for attempt in $(seq 1 30); do
  if psql "$db_url" -Atqc 'SELECT 1' > "$raw_log_dir/readiness.log" 2>&1; then
    printf 'Local database readiness confirmed after attempt %s of 30.\n' "$attempt" \
      | tee "$evidence_dir/db-readiness.txt"
    printf 'FINANCIAL_SAFETY_DB_URL=%s\n' "$db_url" >> "${GITHUB_ENV:?GITHUB_ENV is required in CI}"
    exit 0
  fi
  sleep 2
done

echo "Local database did not become ready within 60 seconds." >&2
supabase status > "$raw_log_dir/status.log" 2>&1 || true
for log in readiness status; do
  sanitize < "$raw_log_dir/$log.log" > "$evidence_dir/$log.sanitized.log"
done
cat "$evidence_dir/readiness.sanitized.log" "$evidence_dir/status.sanitized.log"
exit 1
