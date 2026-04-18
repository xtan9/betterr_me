// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  _comment:
    "Stryker mutation testing config. Scoped narrowly to lib/db — the most heavily tested area. " +
    "See docs/superpowers/specs/2026-04-12-mutation-testing.md for rationale and CI recipe.",
  packageManager: "pnpm",
  testRunner: "vitest",
  // Explicit plugin list — pnpm's isolated node_modules layout breaks Stryker's default
  // `@stryker-mutator/*` auto-discovery, so we must list plugins explicitly.
  plugins: [
    "@stryker-mutator/vitest-runner",
    // typescript-checker disabled by default — it runs against the entire project
    // tsconfig and surfaces pre-existing test-file type errors unrelated to the
    // mutated code. Re-enable by adding "@stryker-mutator/typescript-checker" here
    // and restoring the `checkers` + `tsconfigFile` options below, once a
    // narrowed tsconfig scoped to lib/db is introduced.
  ],
  // Exclude heavy / irrelevant directories from the sandbox copy. .claude contains
  // symlinked skill dirs that break Stryker's copyfile sandbox; .next / coverage /
  // playwright artifacts are large and not needed for unit-test mutation runs.
  ignorePatterns: [
    ".claude",
    ".next",
    "coverage",
    "playwright-report",
    "test-results",
    "e2e",
    "public",
    "docs",
    // NOTE: do NOT add a bare `supabase` pattern — it would also match
    // `lib/supabase/` (Supabase client code the DB tests import) and break
    // the sandbox with "Failed to resolve import @/lib/supabase/client".
    // The root `supabase/` dir (CLI config + migrations) contains no JS/TS
    // that Stryker would mutate, so there's no need to exclude it either.
    "emails",
    ".worktrees",
    ".github",
    ".vscode",
  ],
  coverageAnalysis: "all",
  // Restrict the initial test run to the scoped unit tests. Running the full
  // suite slows startup and pulls in tests for app/ API routes that depend on
  // files outside the mutated scope.
  testFiles: [
    "tests/lib/db/**/*.test.ts",
    "tests/lib/recurring-tasks/**/*.test.ts",
    "tests/lib/habits/**/*.test.ts",
    "tests/lib/money/**/*.test.ts",
  ],
  mutate: [
    "lib/db/**/*.ts",
    "!lib/db/index.ts",
    "!lib/db/types.ts",
    "lib/recurring-tasks/**/*.ts",
    "!lib/recurring-tasks/index.ts",
    "lib/habits/**/*.ts",
    "lib/money/**/*.ts",
  ],
  // checkers: ["typescript"],
  // tsconfigFile: "tsconfig.json",
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  timeoutMS: 60000,
  concurrency: 4,
  cleanTempDir: true,
  tempDirName: ".stryker-tmp",
  logLevel: "info",
};

export default config;
