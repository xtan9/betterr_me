#!/usr/bin/env bash
set -euo pipefail

evidence_dir="${FINANCIAL_SAFETY_EVIDENCE_DIR:-ci-evidence}"
mkdir -p "$evidence_dir"
source_file='lib/db/households.ts'

resolve_source="$(sed -n '/async resolveHousehold()/,/^  }[[:space:]]*$/p' "$source_file")"
printf '%s\n' "$resolve_source" > "$evidence_dir/household-initialization-source.txt"
grep -F 'rpc("initialize_my_household")' "$evidence_dir/household-initialization-source.txt"
if grep -En 'randomUUID|PGRST116|23505|\.delete\(' "$evidence_dir/household-initialization-source.txt" > "$evidence_dir/household-initialization-prohibited-source.txt"; then
  echo 'legacy initialization flow remains reachable' >&2
  exit 1
fi
if grep -RInE --include='*.ts' --include='*.tsx' 'resolveHousehold\([^)]*,[^)]+' app lib > "$evidence_dir/household-initialization-callers.txt"; then
  echo 'caller supplied an identity to resolveHousehold' >&2
  exit 1
fi
if grep -RIn --include='*.ts' --include='*.tsx' 'initialize_my_household' app lib | grep -v "$source_file" > "$evidence_dir/household-initialization-rpc-callers.txt"; then
  echo 'authenticated RPC must only be reached through HouseholdsDB' >&2
  exit 1
fi
