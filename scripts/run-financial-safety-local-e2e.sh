#!/usr/bin/env bash

# Runs the partial Gate 1 browser evidence against a disposable local stack.
# It never reads remote E2E secrets or calls a production environment.
set -euo pipefail

temp_env_file=".env.financial-safety-local"
cleanup() {
  rm -f "$temp_env_file"
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

supabase stop --no-backup >/dev/null 2>&1 || true
supabase start >/dev/null
supabase db reset --local --no-seed >/dev/null

status="$(supabase status -o env)"
api_url="$(printf '%s\n' "$status" | sed -n 's/^API_URL=//p')"
anon_key="$(printf '%s\n' "$status" | sed -n 's/^ANON_KEY=//p')"

if [[ -z "$api_url" || -z "$anon_key" ]]; then
  echo "Local Supabase did not provide API_URL and ANON_KEY." >&2
  exit 1
fi

cat > "$temp_env_file" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$api_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

set -a
source "$temp_env_file"
set +a
pnpm build
FINANCIAL_SAFETY_LOCAL_E2E=1 CI=1 pnpm exec playwright test e2e/financial-safety.spec.ts --project=financial-safety-local --workers=1 --retries=0
