import { describe, expect, it } from "vitest";

import {
  formatGitHubOutputs,
  selectQualityChecks,
} from "../../scripts/ci/select-quality-checks.mjs";

describe("quality check selection", () => {
  it("skips quality checks for documentation-only changes", () => {
    expect(selectQualityChecks(["docs/ci.md"])).toEqual({
      quality: false,
      fullTests: false,
      fullLint: false,
      changedTests: false,
      smokeTests: [],
      label: "not needed",
    });
  });

  it("uses related tests and changed-file lint for product code", () => {
    expect(selectQualityChecks(["components/habits/habit-card.tsx"]))
      .toEqual({
        quality: true,
        fullTests: false,
        fullLint: false,
        changedTests: true,
        smokeTests: [],
        label: "changed code",
      });
  });

  it("runs the full suite for global test and lint configuration", () => {
    for (const file of [
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
    ]) {
      expect(selectQualityChecks([file])).toMatchObject({
        quality: true,
        fullTests: true,
        fullLint: true,
        label: "full suite",
      });
    }

    expect(selectQualityChecks(["vitest.config.ts"]))
      .toMatchObject({ fullTests: true, fullLint: false });
    expect(selectQualityChecks(["eslint.config.mjs"]))
      .toMatchObject({ fullTests: false, fullLint: true });
  });

  it("uses focused smoke tests for CI-only changes", () => {
    expect(selectQualityChecks([".github/workflows/ci.yml"]))
      .toMatchObject({
        quality: true,
        fullTests: false,
        fullLint: false,
        changedTests: false,
        smokeTests: [
          "tests/scripts/classify-changes.test.ts",
          "tests/scripts/detect-pull-request-validated-push.test.ts",
          "tests/scripts/github-actions-runtime-policy.test.ts",
          "tests/scripts/select-quality-checks.test.ts",
        ],
        label: "CI smoke",
      });

    expect(selectQualityChecks(["scripts/ci/classify-changes.sh"]))
      .toMatchObject({
        changedTests: false,
        smokeTests: [
          "tests/scripts/classify-changes.test.ts",
          "tests/scripts/select-e2e-tests.test.ts",
          "tests/scripts/select-quality-checks.test.ts",
        ],
        label: "CI smoke",
      });

    expect(selectQualityChecks([
      ".github/workflows/scheduled-failure-alerts.yml",
    ])).toMatchObject({
      changedTests: false,
      smokeTests: [
        "tests/scripts/github-actions-runtime-policy.test.ts",
        "tests/scripts/reconcile-scheduled-workflow-issue.test.ts",
      ],
      label: "CI smoke",
    });

    expect(selectQualityChecks([
      ".github/workflows/production-smoke.yml",
    ])).toMatchObject({
      changedTests: false,
      smokeTests: [
        "tests/scripts/github-actions-runtime-policy.test.ts",
        "tests/scripts/production-smoke.test.ts",
      ],
      label: "CI smoke",
    });
  });

  it("guards every workflow change with the action runtime policy", () => {
    for (const file of [
      ".github/workflows/db-migrate.yml",
      ".github/workflows/mutation-testing.yml",
      ".github/workflows/performance.yml",
      ".github/workflows/release-scope.yml",
      ".github/workflows/update-snapshots.yml",
    ]) {
      expect(selectQualityChecks([file])).toMatchObject({
        quality: true,
        changedTests: false,
        smokeTests: [
          "tests/scripts/github-actions-runtime-policy.test.ts",
        ],
        label: "CI smoke",
      });
    }
  });

  it("combines related tests with CI smoke tests for mixed changes", () => {
    expect(selectQualityChecks([
      ".github/workflows/ci.yml",
      "lib/habits/schedule.ts",
    ])).toMatchObject({
      changedTests: true,
      smokeTests: [
        "tests/scripts/classify-changes.test.ts",
        "tests/scripts/detect-pull-request-validated-push.test.ts",
        "tests/scripts/github-actions-runtime-policy.test.ts",
        "tests/scripts/select-quality-checks.test.ts",
      ],
      label: "changed code + CI smoke",
    });
  });

  it("normalizes Windows paths and emits GitHub outputs", () => {
    expect(formatGitHubOutputs(selectQualityChecks([
      "scripts\\ci\\classify-changes.sh",
    ]))).toBe([
      "quality=true",
      "full_tests=false",
      "full_lint=false",
      "changed_tests=false",
      "quality_smoke_tests=tests/scripts/classify-changes.test.ts,tests/scripts/select-e2e-tests.test.ts,tests/scripts/select-quality-checks.test.ts",
      "quality_label=CI smoke",
    ].join("\n"));
  });

  it("selects the pull-request validation test for its detector", () => {
    expect(selectQualityChecks([
      "scripts/ci/detect-pull-request-validated-push.mjs",
    ])).toMatchObject({
      changedTests: false,
      smokeTests: [
        "tests/scripts/detect-pull-request-validated-push.test.ts",
      ],
      label: "CI smoke",
    });
  });
});
