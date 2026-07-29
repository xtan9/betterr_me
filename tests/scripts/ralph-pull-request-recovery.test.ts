import { describe, expect, it, vi } from "vitest";

import {
  planPullRequestRecovery,
  pullRequestCheckRetryKey,
  pullRequestRecoveryFingerprint,
  reconcilePullRequestBacklog,
} from "../../scripts/ralph/pull-request-recovery.mjs";

const snapshot = (overrides = {}) => ({
  issueNumber: 521,
  prNumber: 521,
  stage: "failed",
  prState: "OPEN",
  isDraft: true,
  headSha: "head-1",
  mergeStateStatus: "CLEAN",
  risk: "high",
  mode: "AutoMerge",
  repairAttempts: 1,
  maximumRepairAttempts: 5,
  maximumTransientAttempts: 3,
  originalFailureKind: "ticket-infrastructure",
  checks: [],
  ...overrides,
});

describe("Ralph pull-request recovery planning", () => {
  it("repairs controller-owned failures before batching remaining code failures", () => {
    const plan = planPullRequestRecovery(
      snapshot({
        checks: [
          {
            name: "release-scope-evidence",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "100",
          },
          {
            name: "lint-and-test",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "101",
          },
        ],
      }),
    );

    expect(plan).toMatchObject({
      action: "controller-repair",
      failedChecks: ["release-scope-evidence"],
      remainingFailures: ["lint-and-test"],
      consumesCodingAttempt: false,
    });
  });

  it("routes all remaining code failures into one bounded repair", () => {
    const plan = planPullRequestRecovery(
      snapshot({
        isDraft: false,
        stage: "pr-open",
        checks: [
          {
            name: "lint-and-test",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "101",
          },
          {
            name: "check-migrations",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "102",
          },
        ],
      }),
    );

    expect(plan).toMatchObject({
      action: "code-repair",
      failedChecks: ["check-migrations", "lint-and-test"],
      consumesCodingAttempt: true,
    });
  });

  it("retries cancelled or transient checks without launching a coding worker", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            {
              name: "e2e-tests",
              bucket: "cancel",
              state: "CANCELLED",
              provider: "github-actions",
              runId: "103",
            },
          ],
        }),
      ),
    ).toMatchObject({
      action: "retry-checks",
      consumesCodingAttempt: false,
    });
  });

  it("never repairs or merges against pending checks or a stale head", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [{ name: "e2e-tests", bucket: "pending", state: "IN_PROGRESS" }],
        }),
      ).action,
    ).toBe("wait");
    expect(
      planPullRequestRecovery(
        snapshot({ expectedHeadSha: "different-head" }),
      ).action,
    ).toBe("refresh");
    expect(
      planPullRequestRecovery(snapshot({ checksAvailable: false })).action,
    ).toBe("wait");
  });

  it("merges only a ready low-risk PR with every required check passing", () => {
    const passing = [
      {
        name: "lint-and-test",
        bucket: "pass",
        state: "SUCCESS",
        provider: "github-actions",
        runId: "104",
      },
    ];
    expect(
      planPullRequestRecovery(
        snapshot({
          stage: "checks-passed",
          isDraft: false,
          risk: "low",
          riskReasons: [],
          checks: passing,
        }),
      ),
    ).toMatchObject({ action: "merge-gates", risk: "low", riskReasons: [] });
    expect(
      planPullRequestRecovery(
        snapshot({
          stage: "manual-review",
          isDraft: false,
          risk: "high",
          checks: passing,
        }),
      ).action,
    ).toBe("human-gate");
    expect(
      planPullRequestRecovery(
        snapshot({
          stage: "checks-passed",
          isDraft: false,
          risk: "low",
          mergeStateStatus: "BLOCKED",
          checks: passing,
        }),
      ).action,
    ).toBe("merge-gates");
    expect(
      planPullRequestRecovery(
        snapshot({
          stage: "checks-passed",
          isDraft: false,
          risk: "low",
          mergeStateStatus: "DIRTY",
          checks: passing,
        }),
      ).action,
    ).toBe("human-gate");
  });

  it("does not reset coding attempts across restarts", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          stage: "pr-open",
          isDraft: false,
          repairAttempts: 5,
          checks: [
            {
              name: "lint-and-test",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "105",
            },
          ],
        }),
      ).action,
    ).toBe("human-gate");
  });

  it("human-gates unknown or external failed checks", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          isDraft: false,
          checks: [
            { name: "external-security", bucket: "fail", state: "FAILURE" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            { name: "release-scope-evidence", bucket: "fail", state: "FAILURE" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
  });

  it("does not let a code-check repair override any unresolved draft blocker", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          originalFailureKind: "safety",
          checks: [
            { name: "lint-and-test", bucket: "fail", state: "FAILURE" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
    expect(
      planPullRequestRecovery(
        snapshot({
          originalFailureKind: "review-nonrepairable",
          checks: [
            { name: "lint-and-test", bucket: "fail", state: "FAILURE" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
  });

  it("reverifies a green draft only when its original blocker is bounded and repairable", () => {
    const passingChecks = [
      {
        name: "lint-and-test",
        bucket: "pass",
        state: "SUCCESS",
        provider: "github-actions",
        runId: "106",
      },
    ];

    for (const originalFailureKind of [
      "worker-blocked",
      "ticket-infrastructure",
      "review-ticket-infrastructure",
    ]) {
      expect(
        planPullRequestRecovery(
          snapshot({ originalFailureKind, checks: passingChecks }),
        ),
      ).toMatchObject({
        action: "reverify-draft",
        consumesCodingAttempt: false,
      });
    }

    for (const originalFailureKind of [
      "safety",
      "ambiguous",
      "review-nonrepairable",
      "review-security-nonrepairable",
      "infrastructure",
    ]) {
      expect(
        planPullRequestRecovery(
          snapshot({ originalFailureKind, checks: passingChecks }),
        ).action,
      ).toBe("human-gate");
    }

    expect(
      planPullRequestRecovery(
        snapshot({
          originalFailureKind: "worker-blocked",
          repairAttempts: 5,
          checks: passingChecks,
        }),
      ).action,
    ).toBe("human-gate");

    expect(
      planPullRequestRecovery(
        snapshot({
          originalFailureKind: "worker-blocked",
          mergeStateStatus: "DIRTY",
          checks: passingChecks,
        }),
      ),
    ).toMatchObject({
      action: "human-gate",
      reason: "pull request has merge conflicts",
    });
  });

  it("bounds controller and transient check retries independently of coding repairs", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          controllerRepairAttempts: 3,
          checks: [
            { name: "release-scope-evidence", bucket: "fail", state: "FAILURE" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
    expect(
      planPullRequestRecovery(
        snapshot({
          transientCheckAttempts: 3,
          checks: [
            { name: "e2e-tests", bucket: "cancel", state: "CANCELLED" },
          ],
        }),
      ).action,
    ).toBe("human-gate");
  });

  it("fingerprints the exact head and normalized check generation", () => {
    const first = pullRequestRecoveryFingerprint(
      snapshot({
        checks: [
          { name: "b", bucket: "fail", state: "FAILURE", runId: "2" },
          { name: "a", bucket: "pass", state: "SUCCESS", runId: "1" },
        ],
      }),
    );
    const reordered = pullRequestRecoveryFingerprint(
      snapshot({
        checks: [
          { name: "a", bucket: "pass", state: "SUCCESS", runId: "1" },
          { name: "b", bucket: "fail", state: "FAILURE", runId: "2" },
        ],
      }),
    );
    const newHead = pullRequestRecoveryFingerprint(
      snapshot({ headSha: "head-2" }),
    );
    const reconciledExpectation = pullRequestRecoveryFingerprint(
      snapshot({ expectedHeadSha: "head-1" }),
    );
    const rerun = pullRequestRecoveryFingerprint(
      snapshot({
        checks: [
          { name: "a", bucket: "pass", state: "SUCCESS", runId: "1" },
          {
            name: "b",
            bucket: "fail",
            state: "FAILURE",
            runId: "2",
            completedAt: "2026-07-29T10:00:00Z",
          },
        ],
      }),
    );

    expect(first).toBe(reordered);
    expect(newHead).not.toBe(first);
    expect(reconciledExpectation).not.toBe(first);
    expect(rerun).not.toBe(first);
    expect(
      pullRequestCheckRetryKey(
        snapshot({
          checks: [
            {
              name: "b",
              bucket: "fail",
              state: "FAILURE",
              runId: "2",
              completedAt: "later",
            },
            { name: "a", bucket: "pass", state: "SUCCESS", runId: "1" },
          ],
        }),
      ),
    ).toBe(pullRequestCheckRetryKey(snapshot({ checks: [
      { name: "a", bucket: "pass", state: "SUCCESS", runId: "1" },
      { name: "b", bucket: "fail", state: "FAILURE", runId: "2" },
    ] })));
  });

  it("invalidates completed recovery when mode, risk, or review gates change", () => {
    const base = pullRequestRecoveryFingerprint(snapshot());
    expect(pullRequestRecoveryFingerprint(snapshot({ mode: "PrOnly" }))).not.toBe(base);
    expect(pullRequestRecoveryFingerprint(snapshot({ risk: "low" }))).not.toBe(base);
    expect(
      pullRequestRecoveryFingerprint(snapshot({ reviewDecision: "APPROVED" })),
    ).not.toBe(base);
  });
});

describe("Ralph pull-request backlog reconciliation", () => {
  it("runs sequentially and skips an already completed idempotency key", async () => {
    const order: string[] = [];
    const records = new Map<string, { status: string }>();
    const candidates = [snapshot({ issueNumber: 521 }), snapshot({ issueNumber: 522 })];

    const outcomes = await reconcilePullRequestBacklog({
      candidates,
      inspect: async (candidate) => candidate,
      readRecord: async (key) => records.get(key),
      writeRecord: async (key, record) => {
        records.set(key, record);
      },
      execute: async (plan) => {
        order.push(`start-${plan.issueNumber}`);
        await Promise.resolve();
        order.push(`end-${plan.issueNumber}`);
        return { status: "done" };
      },
    });

    expect(order).toEqual(["start-521", "end-521", "start-522", "end-522"]);
    expect(outcomes).toHaveLength(2);

    order.length = 0;
    await reconcilePullRequestBacklog({
      candidates,
      inspect: async (candidate) => candidate,
      readRecord: async (key) => records.get(key),
      writeRecord: async (key, record) => {
        records.set(key, record);
      },
      execute: vi.fn(),
    });
    expect(order).toEqual([]);
  });

  it("resumes a pending action after a crash without creating another plan", async () => {
    const candidate = snapshot({ issueNumber: 523 });
    const key = pullRequestRecoveryFingerprint(candidate);
    const records = new Map([
      [key, { status: "pending", action: "human-gate" }],
    ]);
    const execute = vi.fn(async (_plan, context) => ({
      status: context.resume ? "resumed" : "new",
    }));

    const outcomes = await reconcilePullRequestBacklog({
      candidates: [candidate],
      inspect: async (value) => value,
      readRecord: async (recordKey) => records.get(recordKey),
      writeRecord: async (recordKey, record) => {
        records.set(recordKey, record);
      },
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][1]).toEqual({ resume: true });
    expect(outcomes[0].result).toEqual({ status: "resumed" });
    expect(records.get(key)?.status).toBe("completed");
  });

  it("isolates a handled PR failure and continues the sequential backlog", async () => {
    const completed: number[] = [];
    const records = new Map();
    await reconcilePullRequestBacklog({
      candidates: [snapshot({ issueNumber: 521 }), snapshot({ issueNumber: 522 })],
      inspect: async (candidate) => candidate,
      readRecord: async (key) => records.get(key),
      writeRecord: async (key, record) => {
        records.set(key, record);
      },
      execute: async (plan) => {
        if (plan.issueNumber === 521) throw new Error("one PR is blocked");
        completed.push(plan.issueNumber);
        return { status: "done" };
      },
      onError: async (error) => ({ status: "human-gate", reason: error.message }),
    });

    expect(completed).toEqual([522]);
    expect([...records.values()].every((record) => record.status === "completed")).toBe(true);
  });

  it("isolates a handled inspection failure and continues the backlog", async () => {
    const inspected: number[] = [];
    await reconcilePullRequestBacklog({
      candidates: [snapshot({ issueNumber: 521 }), snapshot({ issueNumber: 522 })],
      inspect: async (candidate) => {
        if (candidate.issueNumber === 521) throw new Error("temporary API failure");
        return candidate;
      },
      readRecord: async () => null,
      writeRecord: async () => {},
      execute: async (plan) => {
        inspected.push(plan.issueNumber);
        return { status: "done" };
      },
      onInspectError: async (error) => ({ status: "human-gate", reason: error.message }),
    });

    expect(inspected).toEqual([522]);
  });
});
