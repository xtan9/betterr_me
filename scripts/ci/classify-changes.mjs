import { spawnSync } from "node:child_process";

import { planPreviewDeployment } from "./preview-deployment-policy.mjs";

const SPECS = {
  accessibility: "e2e/accessibility.spec.ts",
  completeHabit: "e2e/complete-habit.spec.ts",
  createHabit: "e2e/create-habit.spec.ts",
  crossBrowser: "e2e/cross-browser.spec.ts",
  dashboard: "e2e/dashboard.spec.ts",
  locale: "e2e/locale-verification.spec.ts",
  responsive: "e2e/responsive.spec.ts",
  taskDetail: "e2e/task-detail.spec.ts",
  tasksList: "e2e/tasks-list.spec.ts",
};

const HABIT_SPECS = [SPECS.completeHabit, SPECS.createHabit, SPECS.dashboard];
const TASK_SPECS = [SPECS.dashboard, SPECS.taskDetail, SPECS.tasksList];
const LAYOUT_SPECS = [SPECS.accessibility, SPECS.crossBrowser, SPECS.responsive];
const CLASSIFIER_TESTS = [
  "tests/scripts/classify-changes.test.ts",
  "tests/scripts/run-change-classifier.test.ts",
  "tests/scripts/stryker-changed.test.ts",
];
const CI_POLICY_TESTS = [
  ...CLASSIFIER_TESTS,
  "tests/scripts/detect-pull-request-validated-push.test.ts",
  "tests/scripts/gate-policy.test.ts",
  "tests/scripts/github-actions-runtime-policy.test.ts",
  "tests/scripts/production-deployment-policy.test.ts",
  "tests/scripts/production-smoke.test.ts",
  "tests/scripts/preview-deployment-policy.test.ts",
  "tests/scripts/quality-signal-contracts.test.ts",
  "tests/scripts/vercel-ignore-build.test.ts",
];

export const MUTATION_SCOPES = [
  {
    name: "database",
    implementationPatterns: [/^lib\/db\/(?!index\.ts$|types\.ts$).+\.ts$/],
    testPatterns: [/^tests\/lib\/db\/.+\.test\.ts$/],
    mutate: ["lib/db/**/*.ts", "!lib/db/index.ts", "!lib/db/types.ts"],
    testFiles: ["tests/lib/db/**/*.test.ts"],
  },
  {
    name: "recurring-tasks",
    implementationPatterns: [/^lib\/recurring-tasks\/(?!index\.ts$).+\.ts$/],
    testPatterns: [/^tests\/lib\/recurring-tasks\/.+\.test\.ts$/],
    mutate: ["lib/recurring-tasks/**/*.ts", "!lib/recurring-tasks/index.ts"],
    testFiles: ["tests/lib/recurring-tasks/**/*.test.ts"],
  },
  {
    name: "habits",
    implementationPatterns: [/^lib\/habits\/.+\.ts$/],
    testPatterns: [/^tests\/lib\/habits\/.+\.test\.ts$/],
    mutate: ["lib/habits/**/*.ts"],
    testFiles: ["tests/lib/habits/**/*.test.ts"],
  },
];

const MUTATION_INFRASTRUCTURE_PATTERNS = [
  /^tests\/helpers\/mock-supabase\.ts$/,
  /^tests\/setup\.ts$/,
  /^stryker\.config\.mjs$/,
  /^scripts\/stryker-changed\.mjs$/,
  /^scripts\/ci\/(?:classify-changes|mutation-selection|run-change-classifier)\.mjs$/,
  /^\.github\/workflows\/mutation-testing\.yml$/,
  /^package\.json$/,
  /^pnpm-workspace\.yaml$/,
];

export const OWNERSHIP_REGISTRY = [
  rule("calendar", [/^(?:app|components)\/calendar\//, /^app\/api\/(?:calendar|calendar-events)\//, /^hooks\/use-calendar/, /^lib\/hooks\/use-calendar-overlay-feed\./, /^lib\/(?:calendar\/|db\/calendar-events|validations\/(?:calendar-events|calendar-overlay-feed))/], fullE2E()),
  rule("journal", [/^(?:app|components)\/journal\//, /^app\/api\/journal\//, /^lib\/(?:journal\/|db\/journal|hooks\/use-journal|validations\/journal)/], fullE2E()),
  rule("workouts", [/^app\/(?:api\/)?(?:workouts|exercises|routines)\//, /^app\/api\/admin\/sync-exercise-media\//, /^components\/fitness\//, /^lib\/(?:db\/(?:exercise|routine|workout)|exercisedb\/|fitness\/|hooks\/use-(?:active-workout|exercise|fitness|routine|workout)|validations\/(?:exercise|exercise-media|routine|workout))/,], fullE2E()),
  rule("chat", [/^(?:app|components)\/chat\//, /^app\/api\/(?:chat|conversations)\//, /^lib\/(?:ai|chat|db\/(?:chat|conversation)|validations\/chat)/], fullE2E()),
  rule("export", [/^app\/api\/(?:export|csv-export)\//, /^components\/settings\/data-export\.tsx$/, /^lib\/(?:export|csv-export|validations\/csv-import)/], fullE2E()),
  // Retired paths remain classified so deletion-only diffs receive the same
  // settings/browser gates as the surviving owner modules.
  rule("settings", [/^components\/settings\//, /^app\/(?:dashboard\/settings|api\/(?:current-profile|preferences|profile(?:\/|$)|profile-details|user-time-zone))/, /^lib\/(?:current-profile\.ts|preferences|legacy-telemetry\.ts|profile-preference-cache\.ts|submit-profile-preference-intent\.ts|db\/(?:appearance|current-profile|fitness|localization|notifications|profile-details|profiles|user-time-zone)|hooks\/(?:use-appearance|use-current-profile|use-localization|use-notifications|use-profile-preferences|use-profile-theme|use-timezone)|validations\/(?:preferences|profile))/], fullE2E()),
  rule("cron", [/^app\/api\/(?:cron|email|push|reminder-defaults|reminders)\//, /^hooks\/use-push-notifications\./, /^lib\/cron\//, /^lib\/(?:reminders|push|email)\//, /^lib\/db\/notifications\./, /^lib\/(?:db|validations)\/(?:push-subscriptions|reminder-defaults|reminders)\./], fullE2E()),
  rule("admin", [/^app\/dashboard\/admin\//, /^components\/admin\//], fullE2E()),
  rule("habits", [/^app\/(?:api\/)?habits\//, /^components\/habits\//, /^lib\/(?:habits\/|db\/habit|hooks\/use-habit|validations\/habit)/], targetedE2E(HABIT_SPECS)),
  rule("tasks", [/^app\/(?:api\/)?(?:projects|recurring-tasks|tasks)\//, /^components\/(?:kanban|projects|tasks)\//, /^lib\/(?:projects|recurring-tasks|tasks)\//, /^lib\/(?:db|validations)\/(?:projects?|recurring-tasks?|tasks?)\./], targetedE2E(TASK_SPECS)),
  rule("dashboard", [/^app\/(?:api\/)?dashboard\//, /^components\/dashboard\//, /^lib\/dashboard\//, /^lib\/hooks\/use-dashboard\./], targetedE2E([SPECS.dashboard])),
  rule("finance", [/^app\/(?:api\/)?finance\//, /^components\/finance\//, /^lib\/(?:finance\/|validations\/finance-cushion)/, /^i18n\/household-runway-messages\.ts$/], product({ e2eRunway: true })),
  rule("localization", [/^i18n\//, /^components\/language-switcher\.tsx$/], targetedE2E([SPECS.locale])),
  rule("layout", [/^hooks\/use-mobile\.ts$/, /^lib\/sidebar-styles\.ts$/], targetedE2E(LAYOUT_SPECS)),
  rule("authentication", [/^app\/(?:auth|api\/auth|\.well-known)\//, /^components\/auth(?:\/|-)/, /^lib\/(?:auth|supabase)\//], fullE2E()),
  rule("shared-platform", [/^app\/(?:globals\.css|layout\.tsx|page\.tsx|favicon\.ico|mcp\/)/, /^components\/(?:categories|layouts|providers|shared|ui)\//, /^components\/[^/]+\.tsx$/, /^hooks\/(?:use-keyboard-shortcuts|use-swipe)\./, /^lib\/(?:db\/(?:categories|ensure-profile|index|types)|hooks\/(?:use-categories|use-debounce|use-projects|use-sidebar-counts|use-tasks-realtime|use-toggling-set)|logger|utils|fetcher|constants|types\/database)/], fullE2E()),
  rule("other-product", [/^app\/api\/(?:api-keys|categories|insights|mcp|oauth|sidebar)\//, /^emails\//, /^public\//, /^lib\/(?:categories\/|data\/|db\/(?:api-keys|categories|insights|journal-entry-links)|mcp\/|oauth\/|scheduling\/|validations\/(?:api|api-key|category|csv-import|oauth|push))/,], fullE2E()),
  rule("database-platform", [/^supabase\//], { ...fullE2E({ fullTests: true }), migrations: true }),
  rule("e2e-tests", [/^e2e\//], product({ directE2E: true })),
  ...MUTATION_SCOPES.map((scope) =>
    rule(
      `mutation-${scope.name}`,
      [...scope.implementationPatterns, ...scope.testPatterns],
      { mutationScopes: [scope.name] },
    )
  ),
  rule("mutation-infrastructure", MUTATION_INFRASTRUCTURE_PATTERNS, {
    mutationScopes: MUTATION_SCOPES.map(({ name }) => name),
  }),
  rule("unit-tests", [/^tests\//], { quality: true, changedTests: true }),
  rule("ci-workflows", [/^\.github\/(?:actions|workflows)\//], { quality: true, smokeTests: CI_POLICY_TESTS, e2eSpecs: [SPECS.dashboard], e2eSupabase: true }),
  rule("dependency-automation", [/^\.github\/dependabot\.yml$/], { quality: true, smokeTests: CLASSIFIER_TESTS }),
  rule("ci-policy", [/^scripts\/ci\//, /^\.github\/secret-expirations\.json$/], { quality: true, smokeTests: CI_POLICY_TESTS, e2eSpecs: [SPECS.dashboard], e2eSupabase: true }),
  rule("automation", [/^scripts\/(?!ci\/)/], { quality: true, changedTests: true }),
  rule("configuration", [/^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|next\.config\.ts|playwright\.config\.ts|playwright\.mcp-access-grant\.config\.ts|proxy\.ts|tailwind\.config\.ts|postcss\.config\.mjs|lighthouserc\.js|vercel\.json|stryker\.config\.mjs|components\.json|\.env\.example)$/], { ...fullE2E({ fullTests: true, fullLint: true }), performance: true }),
  rule("documentation", [/^(?:docs\/|README|CONTEXT\.md|AGENTS\.md|CLAUDE\.md|\.agents\/|\.claude\/|\.planning\/|\.superpowers\/|\.github\/(?:PULL_REQUEST_TEMPLATE|SETUP_SECRETS)|\.git(?:attributes|ignore)$|skills-lock\.json)/], {}),
];

function rule(owner, patterns, suites) {
  return { owner, patterns, suites };
}

function product(overrides = {}) {
  return { quality: true, changedTests: true, performance: true, ...overrides };
}

function fullE2E(overrides = {}) {
  return product({ e2eFull: true, e2eSupabase: true, ...overrides });
}

function targetedE2E(e2eSpecs) {
  return product({ e2eSpecs, e2eSupabase: true });
}

function normalizePath(path) {
  return String(path ?? "").trim().replaceAll("\\", "/");
}

function broadSelection(reason, changedPaths = []) {
  return finalize({
    changedPaths,
    ownershipMatches: changedPaths.map((path) => ({ path, owners: [] })),
    reasons: [`${reason}; running broad validation.`],
    fallback: true,
    suiteSeed: {
      quality: true,
      fullTests: true,
      fullLint: true,
      migrations: true,
      e2eFull: true,
      e2eRunway: true,
      e2eVisual: true,
      e2eSupabase: true,
      performance: true,
      architecture: true,
      mutationScopes: MUTATION_SCOPES.map(({ name }) => name),
    },
  });
}

export function parseNameStatus(raw) {
  const tokens = String(raw).split("\0").filter(Boolean);
  const records = [];
  for (let index = 0; index < tokens.length;) {
    let status = tokens[index++];
    let firstPath;
    if (status.includes("\t")) {
      [status, firstPath] = status.split("\t", 2);
    }
    const kind = status[0];
    if (!/^[ACDMRTUXB]$/.test(kind)) return [];
    if (kind === "R" || kind === "C") {
      const oldPath = firstPath ?? tokens[index++];
      const path = tokens[index++];
      if (!oldPath || !path) return [];
      records.push({ status, oldPath: normalizePath(oldPath), path: normalizePath(path) });
    } else {
      const path = firstPath ?? tokens[index++];
      if (!path) return [];
      records.push({ status, path: normalizePath(path) });
    }
  }
  return records;
}

export function classifyChanges(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return broadSelection("ambiguous diff");
  }

  const paths = [];
  for (const record of records) {
    if (!record || !/^[ACDMRTUXB]/.test(record.status ?? "") || !record.path) {
      return broadSelection("ambiguous diff");
    }
    if (/^[RC]/.test(record.status) && !record.oldPath) {
      return broadSelection("ambiguous diff");
    }
    if (record.oldPath) paths.push(normalizePath(record.oldPath));
    paths.push(normalizePath(record.path));
  }

  const changedPaths = [...new Set(paths)];
  const suiteSeed = { e2eSpecs: [], smokeTests: [], mutationScopes: [] };
  const ownershipMatches = [];
  const reasons = [];
  const unclassifiedPaths = [];

  for (const path of changedPaths) {
    const matches = OWNERSHIP_REGISTRY.filter(({ patterns }) =>
      patterns.some((pattern) => pattern.test(path))
    );
    const owners = matches.map(({ owner }) => owner);
    ownershipMatches.push({ path, owners });
    if (owners.length > 0) {
      reasons.push(`${path} matched ${owners.join(", ")}.`);
    } else {
      unclassifiedPaths.push(path);
    }

    for (const { suites } of matches) mergeSuites(suiteSeed, suites, path);
  }

  if (unclassifiedPaths.length > 0) {
    const path = unclassifiedPaths[0];
    const applicationPath = /^(?:app|components|emails|hooks|i18n|lib|public)\//.test(path);
    const reason = applicationPath
      ? `Unclassified application path ${path} requires broad validation.`
      : `Unclassified path ${path} requires broad validation.`;
    const fallback = broadSelection(reason.replace(/\.$/, ""), changedPaths);
    fallback.ownershipMatches = ownershipMatches;
    fallback.reasons = [...reasons, reason];
    return fallback;
  }

  return finalize({ changedPaths, ownershipMatches, reasons, fallback: false, suiteSeed });
}

function mergeSuites(target, source, path) {
  for (const [key, value] of Object.entries(source)) {
    if (key === "e2eSpecs" || key === "smokeTests" || key === "mutationScopes") {
      target[key].push(...value);
    } else if (key === "directE2E" && value) {
      if (/^e2e\/.+\.spec\.ts$/.test(path) && !/financial-cushion|visual-regression/.test(path)) target.e2eSpecs.push(path);
      else if (/financial-cushion/.test(path)) target.e2eRunway = true;
      else if (/visual-regression/.test(path)) target.e2eVisual = true;
      else target.e2eFull = true;
    } else if (value) {
      target[key] = true;
    }
  }
}

function finalize({ changedPaths, ownershipMatches, reasons, fallback, suiteSeed }) {
  const e2eSpecs = [...new Set(suiteSeed.e2eSpecs ?? [])].sort();
  const smokeTests = [...new Set(suiteSeed.smokeTests ?? [])].sort();
  const mutationScopes = [...new Set(suiteSeed.mutationScopes ?? [])].sort();
  const e2e = Boolean(suiteSeed.e2eFull || suiteSeed.e2eRunway || suiteSeed.e2eVisual || e2eSpecs.length);
  const quality = Boolean(suiteSeed.quality || suiteSeed.fullTests || suiteSeed.fullLint || smokeTests.length);
  const suites = {
    quality,
    fullTests: Boolean(suiteSeed.fullTests),
    fullLint: Boolean(suiteSeed.fullLint),
    changedTests: quality && !suiteSeed.fullTests && Boolean(suiteSeed.changedTests),
    smokeTests,
    migrations: Boolean(suiteSeed.migrations),
    e2e,
    e2eFull: Boolean(suiteSeed.e2eFull),
    e2eSpecs,
    e2eRunway: Boolean(suiteSeed.e2eRunway),
    e2eVisual: Boolean(suiteSeed.e2eVisual),
    e2eSupabase: Boolean(suiteSeed.e2eSupabase || suiteSeed.e2eFull || e2eSpecs.length),
    performance: Boolean(suiteSeed.performance),
    // The permanent delivery mutation guard is cheap, deterministic, and
    // protects the architecture even for documentation-only or migration-only diffs.
    architecture: suiteSeed.architecture !== false,
    mutation: mutationScopes.length > 0,
    mutationScopes,
  };
  const skipReasons = {};
  if (!quality) skipReasons.quality = "No changed path is owned by a quality-test surface.";
  if (!suites.fullTests) skipReasons.fullTests = "No changed path requires the complete unit-test suite.";
  if (!suites.fullLint) skipReasons.fullLint = "No changed path requires repository-wide lint.";
  if (!suites.changedTests) skipReasons.changedTests = suites.fullTests
    ? "The complete unit-test suite supersedes changed-test selection."
    : "No changed path requires related unit tests.";
  if (smokeTests.length === 0) skipReasons.smokeTests = suites.fullTests
    ? "The complete unit-test suite supersedes CI smoke tests."
    : "No changed path maps to a focused CI smoke test.";
  if (!suites.migrations) skipReasons.migrations = "No migration or database-platform path changed.";
  if (!e2e) skipReasons.e2e = "No changed path is owned by a browser-test surface.";
  if (!suites.e2eFull) skipReasons.e2eFull = "No changed path requires full Chromium coverage.";
  if (e2eSpecs.length === 0) skipReasons.e2eSpecs = suites.e2eFull
    ? "Full Chromium coverage supersedes individual Chromium spec selection."
    : "No changed path maps to an individual Chromium spec.";
  if (!suites.e2eRunway) skipReasons.e2eRunway = "No finance runway surface changed.";
  if (!suites.e2eVisual) skipReasons.e2eVisual = "No visual-regression surface changed.";
  if (!suites.e2eSupabase) skipReasons.e2eSupabase = "Selected browser checks do not require Supabase.";
  if (!suites.performance) skipReasons.performance = "No product or performance-sensitive path changed.";
  if (!suites.architecture) skipReasons.architecture = "This push was already validated by its pull request.";
  if (!suites.mutation) skipReasons.mutation = "No changed path is owned by a mutation-testing scope.";
  const labels = { quality: qualityLabel(suites), e2e: e2eLabel(suites) };
  return {
    changedPaths,
    ownershipMatches,
    suites,
    labels,
    previewPolicy: planPreviewDeployment({ changedFiles: changedPaths }),
    reasons,
    skipReasons,
    fallback,
  };
}

/**
 * @param {{ eventName?: string, baseSha?: string, headSha?: string, fallbackReason?: string, validatedByPullRequest?: boolean }} comparison
 */
export function classifyComparison({ eventName = "pull_request", baseSha, headSha, fallbackReason, validatedByPullRequest = false } = {}) {
  if (fallbackReason) return broadSelection(fallbackReason);
  if (!['pull_request', 'push'].includes(eventName)) return broadSelection("scheduled or manual run");
  if (eventName === "push" && validatedByPullRequest) return alreadyValidatedSelection();
  if (!baseSha || !headSha || /^0+$/.test(baseSha)) return broadSelection("missing comparison metadata");

  const diff = spawnSync("git", ["diff", "--name-status", "-z", "--find-renames", baseSha, headSha], { encoding: "utf8" });
  if (diff.error || diff.status !== 0) return broadSelection("classifier error");
  const records = parseNameStatus(diff.stdout);
  if (records.length === 0) return broadSelection("ambiguous diff");
  return classifyChanges(records);
}

function alreadyValidatedSelection() {
  const result = finalize({
    changedPaths: [],
    ownershipMatches: [],
    reasons: ["Push commit was already validated by its pull request."],
    fallback: false,
    suiteSeed: { architecture: false },
  });
  result.labels.quality = "already validated";
  return result;
}

function qualityLabel(suites) {
  if (!suites.quality) return "not needed";
  if (suites.fullTests || suites.fullLint) return "full suite";
  if (suites.changedTests && suites.smokeTests.length) return "changed code + CI smoke";
  if (suites.changedTests) return "changed code";
  return "CI smoke";
}

function e2eLabel(suites) {
  if (!suites.e2e) return "not needed";
  return [suites.e2eFull ? "full Chromium" : "", !suites.e2eFull && suites.e2eSpecs.length ? "selected Chromium" : "", suites.e2eRunway ? "finance" : "", suites.e2eVisual ? "screenshot comparison" : ""].filter(Boolean).join(" + ");
}

export function formatGitHubOutputs(result, baseSha = "") {
  const { suites } = result;
  return [
    `quality=${suites.quality}`,
    `full_tests=${suites.fullTests}`,
    `full_lint=${suites.fullLint}`,
    `changed_tests=${suites.changedTests}`,
    `quality_smoke_tests=${suites.smokeTests.join(",")}`,
    `quality_label=${qualityLabel(suites)}`,
    `migrations=${suites.migrations}`,
    `e2e=${suites.e2e}`,
    `e2e_full=${suites.e2eFull}`,
    `e2e_specs=${suites.e2eSpecs.join(",")}`,
    `e2e_runway=${suites.e2eRunway}`,
    `e2e_visual=${suites.e2eVisual}`,
    `e2e_supabase=${suites.e2eSupabase}`,
    `e2e_label=${e2eLabel(suites)}`,
    `preview_policy_action=${result.previewPolicy?.action ?? "skip"}`,
    `preview_policy_reason=${result.previewPolicy?.reason ?? "Preview policy unavailable."}`,
    `preview_policy_json=${JSON.stringify(result.previewPolicy ?? {})}`,
    `performance=${suites.performance}`,
    `architecture=${suites.architecture}`,
    `mutation=${suites.mutation}`,
    `mutation_scopes=${suites.mutationScopes.join(",")}`,
    `base_sha=${baseSha}`,
    `classification_json=${JSON.stringify(result)}`,
  ].join("\n");
}
