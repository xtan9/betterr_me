import { describe, expect, it, vi } from "vitest";

import {
  authorizeProductionDeployment,
  planProductionDeployment,
} from "../../scripts/ci/production-deployment-policy.mjs";

describe("production deployment policy", () => {
  it("skips a commit containing only non-runtime files", () => {
    expect(
      planProductionDeployment({
        triggerSha: "abc123",
        currentMainSha: "abc123",
        changedFiles: ["docs/deployment.md", "tests/app/page.test.tsx"],
        e2eStatus: "success",
      }),
    ).toEqual({
      action: "skip",
      reason: "Only non-runtime files changed.",
      changedFiles: ["docs/deployment.md", "tests/app/page.test.tsx"],
      runtimeFiles: [],
    });
  });

  it("skips a stale commit after a newer main commit arrives", () => {
    expect(
      planProductionDeployment({
        triggerSha: "older123",
        currentMainSha: "newer456",
        changedFiles: ["app/page.tsx"],
        e2eStatus: "success",
      }),
    ).toEqual({
      action: "skip",
      reason: "A newer main commit superseded this deployment.",
      changedFiles: ["app/page.tsx"],
      runtimeFiles: ["app/page.tsx"],
    });
  });

  it("fails closed when the exact-commit E2E gate did not succeed", () => {
    expect(() =>
      planProductionDeployment({
        triggerSha: "abc123",
        currentMainSha: "abc123",
        changedFiles: ["app/page.tsx"],
        e2eStatus: "failure",
      }),
    ).toThrow(
      "Production deployment requires E2E Gate to succeed; received failure",
    );
  });

  it("deploys a current runtime commit after every chained prerequisite succeeds", () => {
    expect(
      planProductionDeployment({
        triggerSha: "abc123",
        currentMainSha: "abc123",
        changedFiles: ["app/page.tsx", "tests/app/page.test.tsx"],
        e2eStatus: "success",
      }),
    ).toEqual({
      action: "deploy",
      reason:
        "Runtime changes passed CI, database migration, and E2E prerequisites.",
      changedFiles: ["app/page.tsx", "tests/app/page.test.tsx"],
      runtimeFiles: ["app/page.tsx"],
    });
  });

  it("waits only for the exact-commit E2E gate", async () => {
    const getCurrentMainSha = vi.fn().mockResolvedValue("abc123");
    const listCheckRuns = vi
      .fn()
      .mockResolvedValueOnce([{ name: "E2E Gate", status: "in_progress" }])
      .mockResolvedValue([
        { name: "E2E Gate", status: "completed", conclusion: "success" },
      ]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      authorizeProductionDeployment({
        sha: "abc123",
        changedFiles: ["app/page.tsx"],
        getCurrentMainSha,
        listCheckRuns,
        maxAttempts: 3,
        sleep,
      }),
    ).resolves.toMatchObject({ action: "deploy" });

    expect(listCheckRuns).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("fails open to deployment for an empty comparison", () => {
    expect(
      planProductionDeployment({
        triggerSha: "abc123",
        currentMainSha: "abc123",
        changedFiles: [],
        e2eStatus: "success",
      }),
    ).toMatchObject({ action: "deploy" });
  });
});
