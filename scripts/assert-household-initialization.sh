#!/usr/bin/env bash
set -euo pipefail

: "${FINANCIAL_SAFETY_DB_URL:?FINANCIAL_SAFETY_DB_URL is required}"
evidence_dir="${FINANCIAL_SAFETY_EVIDENCE_DIR:-ci-evidence}"
mkdir -p "$evidence_dir"
user_id='44444444-4444-4444-4444-444444444444'

psql "$FINANCIAL_SAFETY_DB_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('$user_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'household-race@example.com', crypt('not-used-in-test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());
SQL

call_rpc() {
  psql "$FINANCIAL_SAFETY_DB_URL" -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '$user_id', true);
SELECT public.initialize_my_household();
COMMIT;
SQL
}
call_rpc > "$evidence_dir/household-race-a.txt" & first=$!
call_rpc > "$evidence_dir/household-race-b.txt" & second=$!
wait "$first"
wait "$second"

first_id="$(grep -E '^[0-9a-f-]{36}$' "$evidence_dir/household-race-a.txt" | tail -1)"
second_id="$(grep -E '^[0-9a-f-]{36}$' "$evidence_dir/household-race-b.txt" | tail -1)"
test -n "$first_id" && test "$first_id" = "$second_id"

psql "$FINANCIAL_SAFETY_DB_URL" -At -F $'\t' -v ON_ERROR_STOP=1 <<SQL > "$evidence_dir/household-race-postconditions.tsv"
SELECT 'returned_ids_equal', ('$first_id'::uuid = '$second_id'::uuid)::text;
SELECT 'households', count(*)::text FROM public.households WHERE id = '$first_id'::uuid;
SELECT 'owner_memberships', count(*)::text FROM public.household_members WHERE user_id = '$user_id'::uuid AND household_id = '$first_id'::uuid AND role = 'owner';
SELECT 'all_memberships_for_user', count(*)::text FROM public.household_members WHERE user_id = '$user_id'::uuid;
SELECT 'orphan_households', count(*)::text FROM public.households h WHERE h.id = '$first_id'::uuid AND NOT EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = h.id);
SQL
grep -qx $'returned_ids_equal\ttrue' "$evidence_dir/household-race-postconditions.tsv"
grep -qx $'households\t1' "$evidence_dir/household-race-postconditions.tsv"
grep -qx $'owner_memberships\t1' "$evidence_dir/household-race-postconditions.tsv"
grep -qx $'all_memberships_for_user\t1' "$evidence_dir/household-race-postconditions.tsv"
grep -qx $'orphan_households\t0' "$evidence_dir/household-race-postconditions.tsv"
