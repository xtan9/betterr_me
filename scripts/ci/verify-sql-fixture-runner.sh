#!/usr/bin/env bash
set -euo pipefail

database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
results_root="${RUNNER_TEMP:-.artifacts}/sql-fixture-failure-probe"
fixture='ralph_ci_runner_security'

reset_failure_probe() {
  psql "$database_url" -X -q -v ON_ERROR_STOP=1 \
    -c "alter role ralph_ci_test reset default_transaction_read_only" \
    >/dev/null 2>&1 || true
}
trap reset_failure_probe EXIT

SQL_FIXTURE_RESULTS_DIR="$results_root/passing" \
  bash scripts/ci/run-sql-fixtures.sh --fixture "$fixture"

psql "$database_url" -X -q -v ON_ERROR_STOP=1 \
  -c "alter role ralph_ci_test set default_transaction_read_only = 'on'"

if SQL_FIXTURE_RESULTS_DIR="$results_root/failing" \
  bash scripts/ci/run-sql-fixtures.sh --fixture "$fixture"; then
  echo "SQL fixture failure probe unexpectedly passed" >&2
  exit 1
fi

diagnostics="$results_root/failing/$fixture"
grep -Fq 'cannot execute INSERT in a read-only transaction' "$diagnostics/output.log"
grep -Eq '^fixture_status=[1-9][0-9]*$' "$diagnostics/outcome.txt"
grep -Fqx 'cleanup_status=0' "$diagnostics/outcome.txt"
test -s "$diagnostics/database-outcome.json"

reset_failure_probe
trap - EXIT
echo "SQL fixture runner preserved passing and failing fixture outcomes."
