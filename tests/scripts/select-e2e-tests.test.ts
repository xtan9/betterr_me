import { describe, expect, it } from "vitest";

import {
  formatGitHubOutputs,
  selectE2ETests,
} from "../../scripts/ci/select-e2e-tests.mjs";

describe("E2E test selection", () => {
  it("skips E2E when touched code has no matching browser coverage", () => {
    expect(selectE2ETests(["components/calendar/month-grid.tsx"])).toEqual({
      e2e: false,
      full: false,
      chromiumSpecs: [],
      runway: false,
      visual: false,
      supabase: false,
      label: "not needed",
    });
  });

  it("selects habit and dashboard coverage for habit changes", () => {
    const selection = selectE2ETests(["components/habits/habit-card.tsx"]);
    expect(selection.chromiumSpecs)
      .toEqual([
        "e2e/complete-habit.spec.ts",
        "e2e/create-habit.spec.ts",
        "e2e/dashboard.spec.ts",
      ]);
    expect(selection.label).toBe("habits + dashboard");
  });

  it("selects task and dashboard coverage for task changes", () => {
    const selection = selectE2ETests(["app/api/tasks/[id]/route.ts"]);
    expect(selection.chromiumSpecs)
      .toEqual([
        "e2e/dashboard.spec.ts",
        "e2e/task-detail.spec.ts",
        "e2e/tasks-list.spec.ts",
      ]);
    expect(selection.label).toBe("tasks + dashboard");
  });

  it("selects only the dashboard spec for dashboard-only changes", () => {
    expect(selectE2ETests(["lib/dashboard/dashboard-snapshot.ts"]).chromiumSpecs)
      .toEqual(["e2e/dashboard.spec.ts"]);
    expect(selectE2ETests(["lib/dashboard/dashboard-snapshot.ts"]).label)
      .toBe("dashboard");
  });

  it("uses the dedicated runway project for finance changes", () => {
    expect(selectE2ETests(["components/finance/household-runway.tsx"]))
      .toMatchObject({
        e2e: true,
        full: false,
        chromiumSpecs: [],
        runway: true,
        supabase: false,
        label: "finance",
      });
  });

  it("selects locale coverage without treating finance translations as global locale changes", () => {
    expect(selectE2ETests(["i18n/messages/zh.json"]).chromiumSpecs)
      .toEqual(["e2e/locale-verification.spec.ts"]);
    expect(selectE2ETests(["i18n/household-runway-messages.ts"]))
      .toMatchObject({ chromiumSpecs: [], runway: true });
  });

  it("runs responsive coverage for mobile and sidebar behavior", () => {
    expect(selectE2ETests(["hooks\\use-mobile.ts"]).chromiumSpecs)
      .toEqual([
        "e2e/accessibility.spec.ts",
        "e2e/cross-browser.spec.ts",
        "e2e/responsive.spec.ts",
      ]);
  });

  it("runs the full Chromium suite for shared infrastructure", () => {
    for (const file of [
      "playwright.config.ts",
      "components/ui/button.tsx",
      "e2e/auth.setup.ts",
      "supabase/migrations/20260729000000_change.sql",
    ]) {
      expect(selectE2ETests([file])).toMatchObject({ e2e: true, full: true });
      expect(selectE2ETests([file]).label).toBe("full Chromium");
    }
  });

  it("runs a dashboard pipeline smoke test for E2E workflow changes", () => {
    for (const file of [
      ".github/workflows/e2e.yml",
      "scripts/ci/classify-changes.sh",
      "scripts/ci/select-e2e-tests.mjs",
    ]) {
      expect(selectE2ETests([file])).toMatchObject({
        e2e: true,
        full: false,
        chromiumSpecs: ["e2e/dashboard.spec.ts"],
        supabase: true,
        label: "dashboard",
      });
    }
  });

  it("runs a directly changed Chromium spec", () => {
    expect(selectE2ETests([
      "e2e/tasks-list.spec.ts",
      "e2e/new-feature.spec.ts",
    ])).toMatchObject({
      e2e: true,
      full: false,
      chromiumSpecs: [
        "e2e/new-feature.spec.ts",
        "e2e/tasks-list.spec.ts",
      ],
    });
  });

  it("uses the visual project for visual spec or snapshot changes", () => {
    for (const file of [
      "e2e/visual-regression.spec.ts",
      "e2e/visual-regression.spec.ts-snapshots/dashboard-light-chromium-linux.png",
    ]) {
      expect(selectE2ETests([file])).toMatchObject({
        e2e: true,
        full: false,
        visual: true,
        supabase: true,
      });
    }
  });

  it("unions selections deterministically for mixed changes", () => {
    const selection = selectE2ETests([
      "app/tasks/page.tsx",
      "app/habits/page.tsx",
      "components/finance/household-runway.tsx",
    ]);

    expect(selection).toEqual({
      e2e: true,
      full: false,
      chromiumSpecs: [
        "e2e/complete-habit.spec.ts",
        "e2e/create-habit.spec.ts",
        "e2e/dashboard.spec.ts",
        "e2e/task-detail.spec.ts",
        "e2e/tasks-list.spec.ts",
      ],
      runway: true,
      visual: false,
      supabase: true,
      label: "habits + tasks + dashboard + finance",
    });
  });

  it("emits values that can be forwarded through GitHub job outputs", () => {
    expect(formatGitHubOutputs(selectE2ETests(["app/dashboard/page.tsx"])))
      .toBe([
        "e2e=true",
        "e2e_full=false",
        "e2e_specs=e2e/dashboard.spec.ts",
        "e2e_runway=false",
        "e2e_visual=false",
        "e2e_supabase=true",
        "e2e_label=dashboard",
      ].join("\n"));
  });
});
