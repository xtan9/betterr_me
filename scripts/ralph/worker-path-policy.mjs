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
  "supabase/tests/oauth_refresh_token_lifecycle.sql",
  "supabase/tests/oauth_refresh_token_upgrade.sql",
  "supabase/tests/ralph_ci_runner_security.sql",
  "AGENTS.md",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
]);

const SUPABASE_MIGRATION_ROOT = "supabase/migrations";
const NEW_SUPABASE_MIGRATION =
  /^supabase\/migrations\/\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

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

function repositoryPathWithOriginalCase(filePath) {
  return String(filePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

export function isSupabaseMigrationPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  return (
    normalized === SUPABASE_MIGRATION_ROOT ||
    normalized.startsWith(`${SUPABASE_MIGRATION_ROOT}/`)
  );
}

export function isTopLevelSupabaseSqlFixturePath(filePath) {
  return /^supabase\/tests\/[^/]+\.sql$/.test(
    repositoryPathWithOriginalCase(filePath),
  );
}

export function issueAllowsNewSupabaseMigration(issue) {
  return issue?.trustedWorkerPolicy?.newSupabaseMigrations === 1;
}

export function workerProtectedPathsForIssue(issue) {
  return issueAllowsNewSupabaseMigration(issue)
    ? WORKER_PROTECTED_PATHS.filter((entry) => entry !== SUPABASE_MIGRATION_ROOT)
    : [...WORKER_PROTECTED_PATHS];
}

export function workerChangePolicyViolation(changes, issue) {
  const normalized = changes.map(({ path, status }) => ({
    originalPath: repositoryPathWithOriginalCase(path),
    path: normalizeRepositoryPath(path),
    status: String(status ?? ""),
  }));
  const migrations = normalized.filter(({ path }) =>
    isSupabaseMigrationPath(path),
  );
  const protectedChange = normalized.find(
    ({ path }) =>
      workerProtectedPath(path) &&
      !path.startsWith(`${SUPABASE_MIGRATION_ROOT}/`),
  );
  if (protectedChange) {
    return `worker change reached controller-protected path ${protectedChange.path}`;
  }
  if (migrations.length === 0) return null;
  if (!issueAllowsNewSupabaseMigration(issue)) {
    return `worker change reached controller-protected path ${migrations[0].path}`;
  }
  if (migrations.length !== 1) {
    return "trusted ticket may add exactly one Supabase migration";
  }
  const [migration] = migrations;
  if (migration.status !== "A") {
    return `trusted ticket may only add, never modify, migration ${migration.path}`;
  }
  if (!NEW_SUPABASE_MIGRATION.test(migration.originalPath)) {
    return `new Supabase migration has an invalid path ${migration.originalPath}`;
  }
  return null;
}
