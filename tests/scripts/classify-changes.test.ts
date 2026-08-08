import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyChanges,
  classifyComparison,
  formatGitHubOutputs,
  parseNameStatus,
} from "../../scripts/ci/classify-changes.mjs";

const temporaryRepositories: string[] = [];
function git(repository: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function createRepositoryWithGlobalConfigChange(
  file = "package.json",
  initialContents = "{}\n",
  changedContents = '{"private":true}\n',
) {
  const repository = mkdtempSync(join(tmpdir(), "better-me-ci-classifier-"));
  temporaryRepositories.push(repository);

  cpSync(resolve("scripts/ci"), join(repository, "scripts/ci"), {
    recursive: true,
  });
  git(repository, "init", "--quiet");
  git(repository, "config", "user.email", "ci@example.test");
  git(repository, "config", "user.name", "CI Test");
  writeFileSync(join(repository, file), initialContents);
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "base");
  const baseSha = git(repository, "rev-parse", "HEAD");

  writeFileSync(join(repository, file), changedContents);
  git(repository, "add", file);
  git(repository, "commit", "--quiet", "-m", "change package config");

  return {
    repository,
    baseSha,
    headSha: git(repository, "rev-parse", "HEAD"),
  };
}

function classifyPush(
  validatedByPullRequest: boolean,
  file = "package.json",
  initialContents = "{}\n",
  changedContents = '{"private":true}\n',
) {
  const { repository, baseSha, headSha } =
    createRepositoryWithGlobalConfigChange(
      file,
      initialContents,
      changedContents,
    );
  const outputPath = join(repository, "github-output.txt");

  execFileSync(process.execPath, ["scripts/ci/run-change-classifier.mjs"], {
    cwd: repository,
    env: {
      ...process.env,
      BASE_SHA: baseSha,
      EVENT_NAME: "push",
      GITHUB_OUTPUT: outputPath,
      HEAD_SHA: headSha,
      VALIDATED_BY_PULL_REQUEST: String(validatedByPullRequest),
    },
  });

  return Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=", 2)),
  );
}

function classifyManualDispatch() {
  const repository = mkdtempSync(join(tmpdir(), "better-me-ci-classifier-"));
  temporaryRepositories.push(repository);

  cpSync(resolve("scripts/ci"), join(repository, "scripts/ci"), {
    recursive: true,
  });
  const outputPath = join(repository, "github-output.txt");

  execFileSync(process.execPath, ["scripts/ci/run-change-classifier.mjs"], {
    cwd: repository,
    env: {
      ...process.env,
      EVENT_NAME: "workflow_dispatch",
      GITHUB_OUTPUT: outputPath,
    },
  });

  return Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=", 2)),
  );
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

describe("CI change classification", () => {
  it("runs the full Chromium E2E suite for a manual dispatch", () => {
    expect(classifyManualDispatch()).toMatchObject({
      e2e: "true",
      e2e_full: "true",
      e2e_label: "full Chromium + finance + screenshot comparison",
      e2e_specs: "",
    });
  });

  it("skips duplicate quality checks for a push already validated by a pull request", () => {
    expect(classifyPush(true)).toMatchObject({
      quality: "false",
      full_tests: "false",
      full_lint: "false",
      changed_tests: "false",
      migrations: "false",
    });
  });

  it("retains full quality checks for a direct push", () => {
    expect(classifyPush(false)).toMatchObject({
      quality: "true",
      full_tests: "true",
      full_lint: "true",
    });
  });

  it("treats pnpm workspace policy as global CI and build configuration", () => {
    expect(classifyPush(
      false,
      "pnpm-workspace.yaml",
      "allowBuilds: {}\n",
      "allowBuilds:\n  esbuild: true\n",
    )).toMatchObject({
      quality: "true",
      full_tests: "true",
      full_lint: "true",
      e2e: "true",
      e2e_full: "true",
      performance: "true",
    });
  });
});

describe("conditional test classifier", () => {
  it("assigns every tracked path to an ownership rule", () => {
    const trackedPaths = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .trim().split(/\r?\n/).filter(Boolean);
    const unowned = trackedPaths.filter((path) =>
      classifyChanges([{ status: "M", path }]).ownershipMatches[0]?.owners.length === 0
    );

    expect(unowned).toEqual([]);
  });

  it("treats secret expiration metadata as CI policy", () => {
    const result = classifyChanges([{
      status: "M",
      path: ".github/secret-expirations.json",
    }]);

    expect(result.fallback).toBe(false);
    expect(result.ownershipMatches[0]).toMatchObject({ owners: ["ci-policy"] });
    expect(result.suites).toMatchObject({
      quality: true,
      e2e: true,
      e2eFull: false,
      e2eSupabase: true,
    });
  });

  it.each([
    ["calendar", "components/calendar/month-grid.tsx"],
    ["journal", "app/journal/page.tsx"],
    ["workouts", "lib/db/workouts.ts"],
    ["chat", "app/api/chat/route.ts"],
    ["export", "app/api/export/route.ts"],
    ["settings", "components/settings/account-settings.tsx"],
    ["settings", "lib/db/current-profile.ts"],
    ["settings", "lib/db/appearance.ts"],
    ["settings", "lib/hooks/use-profile-theme.ts"],
    ["settings", "lib/hooks/use-notifications.ts"],
    ["settings", "lib/db/notifications.ts"],
    ["settings", "lib/db/profile-details.ts"],
    ["cron", "app/api/cron/dispatch-reminders/route.ts"],
    ["control-plane", "app/control-plane/page.tsx"],
    ["admin", "components/admin/admin-dashboard-content.tsx"],
  ])("selects browser validation for the %s product area", (owner, path) => {
    const result = classifyChanges([{ status: "M", path }]);

    expect(result.changedPaths).toEqual([path]);
    expect(result.ownershipMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path,
          owners: expect.arrayContaining([owner]),
        }),
      ]),
    );
    expect(result.suites.e2e).toBe(true);
  });

  it.each([
    ["habits", "components/habits/habit-card.tsx"],
    ["tasks", "app/tasks/page.tsx"],
    ["dashboard", "lib/dashboard/dashboard-snapshot.ts"],
    ["finance", "components/finance/household-runway.tsx"],
    ["localization", "i18n/messages/en.json"],
    ["layout", "hooks/use-mobile.ts"],
    ["authentication", "app/auth/login/page.tsx"],
    ["shared-platform", "components/ui/button.tsx"],
    ["other-product", "app/api/api-keys/route.ts"],
  ])("has an explicit registered owner for %s", (owner, path) => {
    const result = classifyChanges([{ status: "M", path }]);
    expect(result.ownershipMatches[0]).toMatchObject({ owners: [owner] });
    expect(result.suites.e2e).toBe(true);
  });

  it("routes the finance browser spec through the anonymous runway project", () => {
    const result = classifyChanges([{
      status: "M",
      path: "e2e/financial-cushion.spec.ts",
    }]);

    expect(result.suites).toMatchObject({
      e2e: true,
      e2eFull: false,
      e2eSpecs: [],
      e2eRunway: true,
      e2eSupabase: false,
    });
  });

  it("falls back to broad validation for unknown application code", () => {
    const result = classifyChanges([{ status: "M", path: "app/future/page.tsx" }]);

    expect(result.fallback).toBe(true);
    expect(result.suites).toMatchObject({
      quality: true,
      fullTests: true,
      fullLint: true,
      e2e: true,
      e2eFull: true,
      performance: true,
    });
    expect(result.reasons).toContain(
      "Unclassified application path app/future/page.tsx requires broad validation.",
    );
  });

  it.each([
    ["habit implementation", "lib/habits/absence.ts"],
    ["habit tests", "tests/lib/habits/absence.test.ts"],
  ])("selects the habits pull-request mutation scope for %s", (_kind, path) => {
    const result = classifyChanges([{ status: "M", path }]);

    expect(result.suites).toMatchObject({
      mutation: true,
      mutationScopes: expect.arrayContaining(["habits"]),
    });
  });

  it("does not select habits mutation work for unrelated changes", () => {
    const result = classifyChanges([
      { status: "M", path: "components/journal/journal-editor.tsx" },
    ]);

    expect(result.suites.mutationScopes).not.toContain("habits");
  });

  it("treats the central mutation policy as mutation infrastructure", () => {
    const result = classifyChanges([
      { status: "M", path: "scripts/ci/classify-changes.mjs" },
    ]);

    expect(result.suites.mutationScopes).toEqual([
      "database",
      "habits",
      "recurring-tasks",
    ]);
  });

  it.each(["missing comparison metadata", "classifier error", "ambiguous diff"])(
    "falls back to broad validation for %s",
    (reason) => {
      const result = classifyComparison({ fallbackReason: reason });
      expect(result.fallback).toBe(true);
      expect(result.suites).toMatchObject({
        fullTests: true,
        fullLint: true,
        e2eFull: true,
        migrations: true,
        performance: true,
      });
      expect(result.reasons).toContain(`${reason}; running broad validation.`);
    },
  );

  it("classifies both sides of renames and retains deletions", () => {
    const records = parseNameStatus(
      "R100\0components/calendar/old.tsx\0components/chat/new.tsx\0D\0app/journal/old.tsx\0",
    );
    const result = classifyChanges(records);

    expect(result.changedPaths).toEqual([
      "components/calendar/old.tsx",
      "components/chat/new.tsx",
      "app/journal/old.tsx",
    ]);
    expect(result.ownershipMatches.flatMap((match: { owners: string[] }) => match.owners)).toEqual([
      "calendar",
      "chat",
      "journal",
    ]);
  });

  it("covers test-only, workflow, mixed-risk, and intentional-skip diffs", () => {
    const unit = classifyChanges([{ status: "M", path: "tests/lib/utils.test.ts" }]);
    expect(unit.suites).toMatchObject({ quality: true, changedTests: true, e2e: false });
    expect(unit.skipReasons.e2e).toBeTruthy();

    const workflow = classifyChanges([{ status: "M", path: ".github/workflows/e2e.yml" }]);
    expect(workflow.suites.smokeTests).toEqual([
      "tests/scripts/classify-changes.test.ts",
      "tests/scripts/detect-pull-request-validated-push.test.ts",
      "tests/scripts/gate-policy.test.ts",
      "tests/scripts/github-actions-runtime-policy.test.ts",
      "tests/scripts/preview-deployment-policy.test.ts",
      "tests/scripts/production-deployment-policy.test.ts",
      "tests/scripts/production-smoke.test.ts",
      "tests/scripts/quality-signal-contracts.test.ts",
      "tests/scripts/run-change-classifier.test.ts",
      "tests/scripts/stryker-changed.test.ts",
      "tests/scripts/vercel-ignore-build.test.ts",
    ]);

    const classifier = classifyChanges([
      { status: "M", path: "scripts/ci/classify-changes.mjs" },
    ]);
    expect(classifier.suites).toMatchObject({
      e2e: true,
      e2eFull: false,
      e2eSpecs: ["e2e/dashboard.spec.ts"],
      smokeTests: [
        "tests/scripts/classify-changes.test.ts",
        "tests/scripts/detect-pull-request-validated-push.test.ts",
        "tests/scripts/gate-policy.test.ts",
        "tests/scripts/github-actions-runtime-policy.test.ts",
        "tests/scripts/preview-deployment-policy.test.ts",
        "tests/scripts/production-deployment-policy.test.ts",
        "tests/scripts/production-smoke.test.ts",
        "tests/scripts/quality-signal-contracts.test.ts",
        "tests/scripts/run-change-classifier.test.ts",
        "tests/scripts/stryker-changed.test.ts",
        "tests/scripts/vercel-ignore-build.test.ts",
      ],
    });

    const mixed = classifyChanges([
      { status: "M", path: "components/habits/habit-card.tsx" },
      { status: "M", path: "supabase/migrations/20260730000000_policy.sql" },
    ]);
    expect(mixed.suites).toMatchObject({ e2e: true, e2eFull: true, migrations: true });

    const docs = classifyChanges([{ status: "M", path: "docs/ci.md" }]);
    expect(docs.suites).toMatchObject({ quality: false, e2e: false, performance: false });
    expect(docs.previewPolicy).toMatchObject({
      action: "skip",
      reason: "Only non-runtime files changed; a preview is not requested by default.",
    });
    expect(Object.keys(docs.skipReasons).sort()).toEqual([
      "changedTests",
      "e2e",
      "e2eFull",
      "e2eRunway",
      "e2eSpecs",
      "e2eSupabase",
      "e2eVisual",
      "fullLint",
      "fullTests",
      "migrations",
      "mutation",
      "performance",
      "quality",
      "smokeTests",
    ]);
  });

  it("makes the structured report the workflow policy contract", () => {
    for (const workflow of ["ci.yml", "e2e.yml", "mutation-testing.yml", "performance.yml"]) {
      const source = readFileSync(`.github/workflows/${workflow}`, "utf8");
      expect(source).toContain("node scripts/ci/run-change-classifier.mjs");
      expect(source).toContain("fromJSON(needs.changes.outputs.classification_json)");
      expect(source).not.toMatch(/steps\.classify\.outputs\.(?:quality|e2e|performance)/);
    }
  });

  it("emits workflow outputs and a structured observable report", () => {
    const result = classifyChanges([{ status: "M", path: "app/calendar/page.tsx" }]);
    const outputs = formatGitHubOutputs(result);

    expect(outputs).toContain("classification_json=");
    const report = JSON.parse(
      outputs.split("\n").find((line) => line.startsWith("classification_json="))!
        .slice("classification_json=".length),
    );
    expect(report).toMatchObject({
      changedPaths: ["app/calendar/page.tsx"],
      ownershipMatches: [{ path: "app/calendar/page.tsx", owners: ["calendar"] }],
      suites: { e2e: true },
      previewPolicy: {
        action: "request",
        reason: "Runtime application changes warrant a preview.",
      },
    });
  });
});
