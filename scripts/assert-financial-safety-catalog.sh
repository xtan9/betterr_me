#!/usr/bin/env bash

# Captures the catalog surface constrained by the Financial Safety privilege
# repair and proves the migration contains exactly the approved seven grants.
set -euo pipefail

: "${FINANCIAL_SAFETY_DB_URL:?FINANCIAL_SAFETY_DB_URL is required}"
evidence_dir="${FINANCIAL_SAFETY_EVIDENCE_DIR:-ci-evidence}"
mkdir -p "$evidence_dir"
migration="supabase/migrations/20260726000003_grant_financial_safety_post_signup_baseline.sql"
rpc_migration="supabase/migrations/20260726000004_initialize_my_household_rpc.sql"

expected_grants="$evidence_dir/expected-approved-grants.txt"
actual_grants="$evidence_dir/actual-approved-grants.txt"
cat > "$expected_grants" <<'EOF'
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.tasks TO authenticated;
GRANT SELECT ON TABLE public.habits TO authenticated;
GRANT SELECT ON TABLE public.habit_logs TO authenticated;
GRANT SELECT ON TABLE public.household_members TO authenticated;
GRANT INSERT ON TABLE public.households TO authenticated;
GRANT INSERT ON TABLE public.household_members TO authenticated;
EOF

grep -E '^GRANT ' "$migration" > "$actual_grants"
diff -u "$expected_grants" "$actual_grants" > "$evidence_dir/grant-diff.txt"

if grep -Eiq '^[[:space:]]*(ALTER[[:space:]]+POLICY|CREATE[[:space:]]+POLICY|DROP[[:space:]]+POLICY|DISABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY|ALTER[[:space:]]+TABLE|ALTER[[:space:]]+ROLE|GRANT[[:space:]]+.*[[:space:]]+TO[[:space:]]+(service_role|anon))' "$migration"; then
  echo "prohibited policy/RLS/owner/role statement found" >&2
  exit 1
fi

psql "$FINANCIAL_SAFETY_DB_URL" -At -F $'\t' -v ON_ERROR_STOP=1 <<'SQL' > "$evidence_dir/catalog-snapshot.tsv"
SELECT 'policy', tablename, policyname, cmd, COALESCE(qual, ''), COALESCE(with_check, '')
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles', 'tasks', 'habits', 'habit_logs', 'households', 'household_members')
UNION ALL
SELECT 'table', c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text, pg_get_userbyid(c.relowner), ''
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'tasks', 'habits', 'habit_logs', 'households', 'household_members')
UNION ALL
SELECT 'membership', parent.rolname, member.rolname, '', '', ''
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid = m.roleid JOIN pg_roles member ON member.oid = m.member
ORDER BY 1, 2, 3;
SQL

psql "$FINANCIAL_SAFETY_DB_URL" -At -F $'\t' -v ON_ERROR_STOP=1 <<'SQL' > "$evidence_dir/authenticated-grants.tsv"
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public'
  AND table_name IN ('profiles', 'tasks', 'habits', 'habit_logs', 'households', 'household_members')
ORDER BY table_name, privilege_type;
SQL

if grep -q $'^households\tSELECT$' "$evidence_dir/authenticated-grants.tsv"; then
  echo "households SELECT grant is prohibited" >&2
  exit 1
fi

psql "$FINANCIAL_SAFETY_DB_URL" -At -F $'\t' -v ON_ERROR_STOP=1 <<'SQL' > "$evidence_dir/initialize-my-household-catalog.tsv"
SELECT pg_get_userbyid(p.proowner), p.prosecdef::text, p.proconfig::text,
  has_function_privilege('public', p.oid, 'EXECUTE')::text,
  has_function_privilege('anon', p.oid, 'EXECUTE')::text,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'initialize_my_household' AND p.pronargs = 0;
SQL
grep -qx $'postgres\tfalse\t{search_path=pg_catalog, public}\tfalse\tfalse\ttrue' "$evidence_dir/initialize-my-household-catalog.tsv"
grep -qx 'ALTER FUNCTION public.initialize_my_household() OWNER TO postgres;' "$rpc_migration"
grep -qx 'REVOKE ALL ON FUNCTION public.initialize_my_household() FROM PUBLIC;' "$rpc_migration"
grep -qx 'GRANT EXECUTE ON FUNCTION public.initialize_my_household() TO authenticated;' "$rpc_migration"
