import { describe, expect, it } from "vitest";

import { planPreviewDeployment } from "../../scripts/ci/preview-deployment-policy.mjs";

describe("preview deployment policy", () => {
  it.each([
    "docs/deployment.md",
    "tests/app/page.test.tsx",
    "scripts/ci/preview-deployment-policy.mjs",
    ".github/workflows/ci.yml",
    "supabase/migrations/20260803000000_change.sql",
  ])("does not request a preview for %s", (file) => {
    expect(planPreviewDeployment({ changedFiles: [file] })).toMatchObject({
      action: "skip",
      reason: "Only non-runtime files changed; a preview is not requested by default.",
      runtimeFiles: [],
    });
  });

  it("requests a preview for runtime application changes", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["components/habits/habit-card.tsx"],
      }),
    ).toMatchObject({
      action: "request",
      reason: "Runtime application changes warrant a preview.",
      runtimeFiles: ["components/habits/habit-card.tsx"],
    });
  });

  it("does not authorize a different commit than the one tested", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["app/page.tsx"],
        requestedSha: "head-2",
        testedSha: "head-1",
      }),
    ).toMatchObject({
      action: "skip",
      reason: "The requested preview commit must exactly match the tested commit.",
    });
  });

  it("requires commit identity when dispatch authorization is requested", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["app/page.tsx"],
        ciStatus: "success",
        e2eStatus: "success",
      }),
    ).toMatchObject({
      action: "skip",
      reason: "The requested preview commit must exactly match the tested commit.",
    });
  });

  it("requires successful exact-commit checks before dispatch", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["app/page.tsx"],
        requestedSha: "head-1",
        testedSha: "head-1",
        ciStatus: "success",
        e2eStatus: "in_progress",
      }),
    ).toMatchObject({
      action: "skip",
      reason: "The exact commit must pass CI Gate and E2E Gate before preview dispatch.",
    });
  });

  it("requires explicit authorization for fork previews", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["app/page.tsx"],
        requestedSha: "head-1",
        testedSha: "head-1",
        ciStatus: "success",
        e2eStatus: "success",
        fork: true,
      }),
    ).toMatchObject({
      action: "skip",
      reason: "Fork pull requests require explicit preview authorization.",
    });
  });

  it("dispatches at most one preview for a commit", () => {
    expect(
      planPreviewDeployment({
        changedFiles: ["app/page.tsx"],
        requestedSha: "head-1",
        testedSha: "head-1",
        ciStatus: "success",
        e2eStatus: "success",
        alreadyDispatched: true,
      }),
    ).toMatchObject({
      action: "skip",
      reason: "A preview has already been dispatched for this commit.",
    });
  });
});
