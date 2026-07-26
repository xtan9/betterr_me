#!/usr/bin/env bash

# Produces the intentionally small, sanitized Gate 1 artifact. Raw CLI output
# is only a transient local file and is never uploaded.
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

cleanup() {
  supabase stop --no-backup > "$raw_log_dir/stop.log" 2>&1 || true
  rm -rf "$raw_log_dir"
}
trap cleanup EXIT

supabase stop --no-backup > "$raw_log_dir/preclean.log" 2>&1 || true
supabase start > "$raw_log_dir/start.log" 2>&1
supabase db reset --local --no-seed > "$raw_log_dir/reset.log" 2>&1

for log in preclean start reset; do
  sanitize < "$raw_log_dir/$log.log" > "$evidence_dir/$log.sanitized.log"
done
