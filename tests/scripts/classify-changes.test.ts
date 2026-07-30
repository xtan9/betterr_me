import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  classifyChanges,
  classifyComparison,
  formatGitHubOutputs,
  parseNameStatus,
} from "../../scripts/ci/classify-changes.mjs";

describe("conditional test classifier", () => {
  it("assigns every tracked path to an ownership rule", () => {
    const trackedPaths = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .trim().split(/\r?\n/).filter(Boolean);
    const unowned = trackedPaths.filter((path) =>
      classifyChanges([{ status: "M", path }]).ownershipMatches[0]?.owners.length === 0
    );

    expect(unowned).toEqual([]);
  });

  it.each([
    ["calendar", "components/calendar/month-grid.tsx"],
    ["journal", "app/journal/page.tsx"],
    ["workouts", "lib/db/workouts.ts"],
    ["chat", "app/api/chat/route.ts"],
    ["export", "app/api/export/route.ts"],
    ["settings", "components/settings/account-settings.tsx"],
    ["cron", "app/api/cron/dispatch-reminders/route.ts"],
    ["control-plane", "app/control-plane/page.tsx"],
  ])("selects browser validation for the %s product area", (owner, path) => {
    const result = classifyChanges([{ status: "M", path }]);

    expect(result.changedPaths).toEqual([path]);
    expect(result.ownershipMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ path, owners: [owner] })]),
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
      "tests/scripts/run-change-classifier.test.ts",
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
        "tests/scripts/run-change-classifier.test.ts",
      ],
    });

    const mixed = classifyChanges([
      { status: "M", path: "components/habits/habit-card.tsx" },
      { status: "M", path: "supabase/migrations/20260730000000_policy.sql" },
    ]);
    expect(mixed.suites).toMatchObject({ e2e: true, e2eFull: true, migrations: true });

    const docs = classifyChanges([{ status: "M", path: "docs/ci.md" }]);
    expect(docs.suites).toMatchObject({ quality: false, e2e: false, performance: false });
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
      "performance",
      "quality",
      "smokeTests",
    ]);
  });

  it("makes the structured report the workflow policy contract", () => {
    for (const workflow of ["ci.yml", "e2e.yml", "performance.yml"]) {
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
    });
  });
});
