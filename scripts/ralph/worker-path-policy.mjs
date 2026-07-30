export const WORKER_PROTECTED_PATHS = Object.freeze([
  ".github",
  ".gitattributes",
  "scripts/ralph",
  "scripts/ci/ralph-sql-policy.mjs",
  "scripts/ci/run-ralph-sql-tests.sh",
  "supabase/migrations",
  "supabase/config.toml",
  "supabase/seed.sql",
  "supabase/tests/e2e_local_authenticated_grants.sql",
  "supabase/tests/finance_cushion_rls.sql",
  "AGENTS.md",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
]);

function normalizeRepositoryPath(filePath) {
  return String(filePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

export function workerProtectedPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  if (!normalized) return false;
  if (/(^|\/)agents\.md$/.test(normalized)) return true;
  if (/(^|\/)\.env(?:\.|$)/.test(normalized)) return true;
  if (
    /(^|\/)(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/\.(?:pem|key|p12|pfx)$/.test(normalized)) return true;
  return WORKER_PROTECTED_PATHS.some((protectedPath) => {
    const candidate = protectedPath.toLowerCase();
    return normalized === candidate || normalized.startsWith(`${candidate}/`);
  });
}
