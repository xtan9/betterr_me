import { describe, expect, it, vi } from "vitest";

import {
  baseUpdateReviewResetPatch,
  blockedRepairPostPushDisposition,
  blockedRepairPreservationRecoveryAction,
  blockedRepairRecoveryReceipt,
  blockedRepairRecoveryReceiptMatches,
  canAdoptLegacyProtectedScopeRepair,
  completedConflictRepairPatch,
  mergedPullRequestFromRecoverySnapshot,
  planPullRequestRecovery,
  pullRequestBaseUpdateDisposition,
  pullRequestCheckRetryKey,
  pullRequestRecoveryErrorDisposition,
  pullRequestRecoveryFingerprint,
  reconcilePullRequestBacklog,
  requiredCheckEvidence,
  staleBlockedRepairPreservationPatch,
} from "../../scripts/ralph/pull-request-recovery.mjs";
import {
  selectPullRequestRecoveryCandidates,
} from "../../scripts/ralph/queue.mjs";

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
  it("waits for explicitly required external evidence to appear and pass", () => {
    expect(requiredCheckEvidence([], ["e2e-tests"])).toEqual({
      ready: false,
      missing: ["e2e-tests"],
      notPassed: [],
    });
    expect(
      requiredCheckEvidence(
        [{ name: "e2e-tests", bucket: "pending" }],
        ["e2e-tests"],
      ),
    ).toEqual({ ready: false, missing: [], notPassed: ["e2e-tests"] });
    expect(
      requiredCheckEvidence(
        [{ name: "e2e-tests", bucket: "skipping" }],
        ["e2e-tests"],
      ),
    ).toEqual({ ready: false, missing: [], notPassed: ["e2e-tests"] });
    expect(
      requiredCheckEvidence(
        [{ name: "e2e-tests", bucket: "pass" }],
        ["e2e-tests"],
      ),
    ).toEqual({ ready: true, missing: [], notPassed: [] });
  });

  it("handles every required E2E evidence state without hiding failures", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [],
          checksAvailable: false,
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("wait");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [{ name: "e2e-tests", bucket: "pending", state: "IN_PROGRESS" }],
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("wait");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            {
              name: "e2e-tests",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "201",
            },
          ],
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("code-repair");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            {
              name: "e2e-tests",
              bucket: "cancel",
              state: "CANCELLED",
              provider: "github-actions",
              runId: "202",
            },
          ],
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("retry-checks");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [{ name: "e2e-tests", bucket: "skipping", state: "SKIPPED" }],
          requiredCheckEvidenceReady: false,
        }),
      ),
    ).toMatchObject({
      action: "wait",
      reason: "required external verification evidence has not passed",
    });
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            {
              name: "quality",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "203",
            },
          ],
          checksAvailable: true,
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("code-repair");
    expect(
      planPullRequestRecovery(
        snapshot({
          checks: [
            {
              name: "quality",
              bucket: "cancel",
              state: "CANCELLED",
              provider: "github-actions",
              runId: "204",
            },
          ],
          checksAvailable: true,
          requiredCheckEvidenceReady: false,
        }),
      ).action,
    ).toBe("retry-checks");
  });

  it("preserves the exact merged head for final checkout cleanup", () => {
    expect(
      mergedPullRequestFromRecoverySnapshot(
        { prNumber: 521 },
        {
          headSha: "merged-head",
          url: "https://example.test/pull/521",
          mergedAt: "2026-07-29T20:00:00.000Z",
          mergeCommit: { oid: "merge-commit" },
        },
      ),
    ).toEqual({
      number: 521,
      url: "https://example.test/pull/521",
      mergedAt: "2026-07-29T20:00:00.000Z",
      mergeCommit: { oid: "merge-commit" },
      headRefOid: "merged-head",
    });
  });

  it("fails closed when merged recovery lacks the PR head", () => {
    expect(() =>
      mergedPullRequestFromRecoverySnapshot(
        { prNumber: 521 },
        { mergeCommit: { oid: "merge-commit" } },
      ),
    ).toThrow("merged pull-request recovery snapshot is missing its head SHA");
  });

  it("invalidates an old preservation receipt when new dirty repair work exists", () => {
    const issueState = {
      blockedPrRepairRecovery: { headSha: "old-head" },
      blockedPrRepairPushedAt: "2026-07-29T19:00:00.000Z",
      blockedPrCommentedAt: "2026-07-29T19:01:00.000Z",
      blockedPrDraftVerifiedAt: "2026-07-29T19:02:00.000Z",
    };
    expect(staleBlockedRepairPreservationPatch(issueState, false)).toBeNull();
    expect(staleBlockedRepairPreservationPatch(issueState, true)).toEqual({
      blockedPrRepairRecovery: null,
      blockedPrRepairPushedAt: null,
      blockedPrCommentedAt: null,
      blockedPrDraftVerifiedAt: null,
    });
  });

  it("archives and clears an active review repair when a new base is adopted", () => {
    expect(
      baseUpdateReviewResetPatch(
        {
          reviewFindingLedger: [{ id: "SEC-001", problem: "old finding" }],
          reviewBaselineTreeSha: "tree-before-repair",
          reviewRepairPending: false,
        },
        "2026-07-29T20:00:00.000Z",
      ),
    ).toEqual({
      reviewFindingLedger: null,
      reviewBaselineTreeSha: null,
      reviewRepairPending: null,
      blockedPrRepairRecovery: null,
      blockedPrRepairPushedAt: null,
      blockedPrCommentedAt: null,
      blockedPrDraftVerifiedAt: null,
      supersededReviewFindingLedgers: [
        {
          findingLedger: [{ id: "SEC-001", problem: "old finding" }],
          baselineTreeSha: "tree-before-repair",
          repairPending: false,
          supersededAt: "2026-07-29T20:00:00.000Z",
          reason: "pull-request base updated before forced exhaustive review",
        },
      ],
    });
  });

  it("adopts only an exact observable head from a durable base-update receipt", () => {
    const pending = { previousHead: "head-1", baseSha: "main-2" };
    expect(
      pullRequestBaseUpdateDisposition({
        pending,
        observedHead: "head-1",
        headContainsPendingBase: false,
        headContainsPendingPreviousHead: false,
      }),
    ).toEqual({ action: "wait" });
    expect(
      pullRequestBaseUpdateDisposition({
        pending,
        observedHead: "head-2",
        headContainsPendingBase: true,
        headContainsPendingPreviousHead: true,
      }),
    ).toEqual({ action: "adopt", headSha: "head-2", baseSha: "main-2" });
    expect(
      pullRequestBaseUpdateDisposition({
        pending,
        observedHead: "head-2",
        headContainsPendingBase: false,
        headContainsPendingPreviousHead: true,
      }),
    ).toEqual({ action: "unsafe" });
    expect(
      pullRequestBaseUpdateDisposition({
        pending,
        observedHead: "head-2",
        headContainsPendingBase: true,
        headContainsPendingPreviousHead: false,
      }),
    ).toEqual({ action: "unsafe" });
  });
  it("updates a clean stale Draft to latest main before repairing checks", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          checks: [
            {
              name: "e2e",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "123",
            },
          ],
        }),
      ),
    ).toMatchObject({
      action: "update-base",
      headSha: "head-1",
      latestMainSha: "main-2",
      consumesCodingAttempt: false,
    });
  });

  it("does not replace a dirty recovery checkout before preserving its work", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          baseUpdateBlockedByDirtyWorktree: true,
          checks: [
            {
              name: "e2e",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "123",
            },
          ],
        }),
      ).action,
    ).toBe("preserve-dirty-repair");
  });

  it("resumes the durable requested base even if main advances again", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-3",
          headContainsLatestMain: false,
          pendingBaseUpdate: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempts: 1,
          },
        }),
      ),
    ).toMatchObject({
      action: "update-base",
      headSha: "head-1",
      latestMainSha: "main-2",
    });
  });

  it("waits for an asynchronous base update before consuming another retry", () => {
    const pendingBaseUpdate = {
      previousHead: "head-1",
      baseSha: "main-2",
      attempts: 1,
      status: "requested",
      nextAttemptAt: "2026-07-29T20:00:00.000Z",
    };
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-3",
          headContainsLatestMain: false,
          pendingBaseUpdate,
          baseUpdateRetryReady: false,
        }),
      ).action,
    ).toBe("wait");
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-3",
          headContainsLatestMain: false,
          pendingBaseUpdate,
          baseUpdateRetryReady: true,
        }),
      ),
    ).toMatchObject({ action: "update-base", latestMainSha: "main-2" });
    expect(
      pullRequestRecoveryFingerprint(
        snapshot({ pendingBaseUpdate, baseUpdateRetryReady: false }),
      ),
    ).not.toBe(
      pullRequestRecoveryFingerprint(
        snapshot({ pendingBaseUpdate, baseUpdateRetryReady: true }),
      ),
    );
  });

  it("finishes a pending repair transaction before synchronizing main", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          pendingPrRepair: {
            previousCommit: "head-1",
            commit: "repair-head",
          },
        }),
      ).action,
    ).toBe("reconcile-pending-repair");
  });

  it("preserves a dirty interrupted repair before gating a base conflict", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          mergeStateStatus: "DIRTY",
          baseUpdateBlockedByDirtyWorktree: true,
        }),
      ).action,
    ).toBe("preserve-dirty-repair");
  });

  it("forces full verification after adopting a controller base update", () => {
    const passing = [
      {
        name: "lint-and-test",
        bucket: "pass",
        state: "SUCCESS",
        provider: "github-actions",
        runId: "base-update-check",
      },
    ];
    expect(
      planPullRequestRecovery(
        snapshot({
          isDraft: false,
          risk: "low",
          checks: passing,
          baseUpdateRequiresVerification: true,
        }),
      ),
    ).toMatchObject({
      action: "reverify-draft",
      promoteDraftAfterVerification: false,
    });
    expect(
      planPullRequestRecovery(
        snapshot({
          isDraft: true,
          checks: passing,
          originalFailureKind: "protected-scope",
          baseUpdateRequiresVerification: true,
        }),
      ),
    ).toMatchObject({
      action: "reverify-draft",
      promoteDraftAfterVerification: false,
    });
  });

  it("does not preserve dirty work over a stricter unresolved blocker", () => {
    for (const originalFailureKind of [
      "safety",
      "ambiguous",
      "review-nonrepairable",
    ]) {
      expect(
        planPullRequestRecovery(
          snapshot({
            latestMainSha: "main-2",
            headContainsLatestMain: false,
            baseUpdateBlockedByDirtyWorktree: true,
            originalFailureKind,
          }),
        ),
      ).toMatchObject({
        action: "human-gate",
        reason: "interrupted work retains a stricter unresolved draft blocker",
      });
    }
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          baseUpdateBlockedByDirtyWorktree: true,
          originalFailureKind: "protected-scope",
        }),
      ).action,
    ).toBe("preserve-dirty-repair");
  });

  it("repairs a stale PR that conflicts with latest main", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          mergeStateStatus: "DIRTY",
        }),
      ),
    ).toMatchObject({
      action: "resolve-conflict",
      reason: "pull request conflicts with the latest main branch",
      latestMainSha: "main-2",
      consumesCodingAttempt: true,
    });
  });

  it("converts a rejected durable base update into conflict repair", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          mergeStateStatus: "DIRTY",
          latestMainSha: "main-3",
          headContainsLatestMain: false,
          pendingBaseUpdate: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempts: 3,
            status: "requesting",
          },
        }),
      ),
    ).toMatchObject({
      action: "resolve-conflict",
      headSha: "head-1",
      latestMainSha: "main-3",
      consumesCodingAttempt: true,
    });
  });

  it("human-gates merge conflicts only after bounded conflict repairs are exhausted", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          mergeStateStatus: "DIRTY",
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          conflictRepairAttempts: 5,
          maximumRepairAttempts: 5,
        }),
      ),
    ).toMatchObject({
      action: "human-gate",
      reason:
        "pull request conflicts with the latest main branch; conflict repair exhausted its bounded retry budget",
      consumesCodingAttempt: false,
    });
  });

  it("resumes the exact durable conflict repair after a controller restart", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          mergeStateStatus: "DIRTY",
          latestMainSha: "main-2",
          headContainsLatestMain: false,
          baseUpdateBlockedByDirtyWorktree: true,
          pendingConflictRepair: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempt: 2,
            status: "prepared",
          },
        }),
      ),
    ).toMatchObject({
      action: "resolve-conflict",
      headSha: "head-1",
      latestMainSha: "main-2",
      conflictRepairAttempt: 2,
      consumesCodingAttempt: true,
    });
  });

  it("finishes an exact conflict transaction even when main advances again", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          latestMainSha: "main-3",
          pendingConflictRepair: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempt: 2,
            status: "prepared",
          },
        }),
      ),
    ).toMatchObject({
      action: "resolve-conflict",
      latestMainSha: "main-2",
      conflictRepairAttempt: 2,
    });
  });

  it("reconciles an interrupted conflict push before inspecting its old head", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          headSha: "repaired-head",
          expectedHeadSha: "head-1",
          pendingPrRepair: {
            previousCommit: "head-1",
            commit: "repaired-head",
          },
          pendingConflictRepair: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempt: 2,
            status: "verified",
          },
        }),
      ).action,
    ).toBe("reconcile-pending-repair");
  });
  it("waits for GitHub to observe an exact blocked-repair push", () => {
    expect(
      blockedRepairPostPushDisposition(
        { state: "OPEN", isDraft: true, headRefOid: "previous-head" },
        "preserved-head",
      ),
    ).toBe("wait-head");
    expect(
      blockedRepairPostPushDisposition(
        { state: "OPEN", isDraft: true, headRefOid: "preserved-head" },
        "preserved-head",
      ),
    ).toBe("verified");
  });

  it("preserves a dirty blocked repair discovered while re-verifying a draft", () => {
    expect(
      pullRequestRecoveryErrorDisposition({
        action: "reverify-draft",
        stage: "pr-repairing",
        failureKind: "ticket-infrastructure",
      }),
    ).toBe("preserve-blocked-repair");
    expect(
      pullRequestRecoveryErrorDisposition({
        action: "reverify-draft",
        stage: "pr-repairing",
        failureKind: "protected-scope",
      }),
    ).toBe("preserve-blocked-repair");
  });

  it.each(["network", "rate-limit", "check-poll"])(
    "stops without human-gating a durable recovery after exhausted %s retries",
    (failureKind) => {
      expect(
        pullRequestRecoveryErrorDisposition({
          action: "resolve-conflict",
          stage: "pr-repairing",
          failureKind,
        }),
      ).toBe("fatal");
    },
  );

  it("atomically completes a conflict repair after an exact push", () => {
    expect(
      completedConflictRepairPatch(
        {
          baseSha: "main-2",
          repairAttempts: 2,
          preConflictRepairAttempts: 5,
          pendingBaseUpdate: { baseSha: "main-2" },
          pendingConflictRepair: {
            previousHead: "head-1",
            baseSha: "main-2",
            attempt: 2,
          },
        },
        "head-1",
        "2026-07-29T12:00:00.000Z",
      ),
    ).toEqual({
      pendingConflictRepair: null,
      pendingBaseUpdate: null,
      baseUpdateRequiresVerification: false,
      conflictResolvedAt: "2026-07-29T12:00:00.000Z",
      repairAttempts: 5,
      preConflictRepairAttempts: null,
    });
    expect(
      completedConflictRepairPatch(
        {
          baseSha: "main-2",
          pendingConflictRepair: {
            previousHead: "different-head",
            baseSha: "main-2",
          },
        },
        "head-1",
        "2026-07-29T12:00:00.000Z",
      ),
    ).toEqual({});
  });

  it("adopts an exact blocked repair result left dirty by a controller crash", () => {
    expect(
      blockedRepairRecoveryReceipt({
        stage: "pr-repairing",
        issueNumber: 492,
        expectedHeadSha: "head-492",
        checkoutHeadSha: "head-492",
        checkoutDirty: true,
        worktreeFingerprint: "a".repeat(64),
        repairAttempt: 3,
        resultPath: "logs/issue-492/repair-3-result.json",
        result: {
          status: "blocked",
          issueNumber: 492,
          ambiguous: true,
          blockerKind: "ticket-infrastructure",
          summary: "PostgreSQL is unavailable for the ticket-specific fixture.",
        },
      }),
    ).toEqual({
      issueNumber: 492,
      headSha: "head-492",
      repairAttempt: 3,
      resultPath: "logs/issue-492/repair-3-result.json",
      worktreeFingerprint: "a".repeat(64),
      failureKind: "ticket-infrastructure",
      stopReason: "PostgreSQL is unavailable for the ticket-specific fixture.",
    });
  });

  it("adopts an exact protected-scope result left dirty by a controller crash", () => {
    expect(
      blockedRepairRecoveryReceipt({
        stage: "pr-repairing",
        issueNumber: 491,
        expectedHeadSha: "head-491",
        checkoutHeadSha: "head-491",
        checkoutDirty: true,
        worktreeFingerprint: "b".repeat(64),
        repairAttempt: 5,
        resultPath: "logs/issue-491/repair-5-result.json",
        result: {
          status: "blocked",
          issueNumber: 491,
          ambiguous: true,
          blockerKind: "protected-scope",
          summary: "The ticket requires a supervised workflow edit.",
        },
      }),
    ).toMatchObject({
      issueNumber: 491,
      failureKind: "protected-scope",
      stopReason: "The ticket requires a supervised workflow edit.",
    });
  });

  it("adopts only the exact legacy protected-scope result for the recorded PR head", () => {
    const issueState = {
      stage: "pr-repairing",
      failureKind: "worker-blocked",
      commit: "head-491",
      repairAttempts: 5,
      lastRepairResultPath: "logs/issue-491/repair-5-result.json",
      blockedPrRepairRecovery: null,
    };
    const receipt = {
      issueNumber: 491,
      headSha: "head-491",
      repairAttempt: 5,
      resultPath: "logs/issue-491/repair-5-result.json",
      worktreeFingerprint: "c".repeat(64),
      failureKind: "protected-scope",
      stopReason: "A supervised workflow edit is required.",
    };

    expect(canAdoptLegacyProtectedScopeRepair(issueState, receipt)).toBe(true);
    expect(
      canAdoptLegacyProtectedScopeRepair(issueState, {
        ...receipt,
        headSha: "different-head",
      }),
    ).toBe(false);
    expect(
      canAdoptLegacyProtectedScopeRepair(
        { ...issueState, blockedPrRepairRecovery: receipt },
        receipt,
      ),
    ).toBe(false);
  });

  it("rejects a blocked repair receipt when the checkout head changed", () => {
    expect(
      blockedRepairRecoveryReceipt({
        stage: "pr-repairing",
        issueNumber: 492,
        expectedHeadSha: "expected-head",
        checkoutHeadSha: "different-head",
        checkoutDirty: true,
        worktreeFingerprint: "a".repeat(64),
        repairAttempt: 3,
        resultPath: "logs/issue-492/repair-3-result.json",
        result: {
          status: "blocked",
          issueNumber: 492,
          ambiguous: true,
          blockerKind: "ticket-infrastructure",
          summary: "PostgreSQL is unavailable for the ticket-specific fixture.",
        },
      }),
    ).toBeNull();
  });

  it("rejects a blocked repair receipt without an exact content fingerprint", () => {
    expect(
      blockedRepairRecoveryReceipt({
        stage: "pr-repairing",
        issueNumber: 492,
        expectedHeadSha: "head-492",
        checkoutHeadSha: "head-492",
        checkoutDirty: true,
        repairAttempt: 3,
        resultPath: "logs/issue-492/repair-3-result.json",
        result: {
          status: "blocked",
          issueNumber: 492,
          ambiguous: true,
          blockerKind: "ticket-infrastructure",
          summary: "PostgreSQL is unavailable for the ticket-specific fixture.",
        },
      }),
    ).toBeNull();
  });

  it("rejects recovery when dirty content no longer matches its durable receipt", () => {
    const receipt = {
      issueNumber: 492,
      headSha: "head-492",
      repairAttempt: 3,
      resultPath: "logs/issue-492/repair-3-result.json",
      worktreeFingerprint: "a".repeat(64),
      failureKind: "ticket-infrastructure",
      stopReason: "PostgreSQL is unavailable for the ticket-specific fixture.",
    };
    expect(
      blockedRepairRecoveryReceiptMatches(receipt, {
        ...receipt,
        worktreeFingerprint: "b".repeat(64),
      }),
    ).toBe(false);
  });

  it("resumes a pending blocked preservation before restoring its checkout", () => {
    expect(
      blockedRepairPreservationRecoveryAction({
        stage: "pr-repairing",
        blockedPrFailureKind: "ticket-infrastructure",
        pendingPrRepair: { previousCommit: "old", commit: "new" },
      }),
    ).toBe("reconcile-pending");
  });

  it("finishes a verified blocked draft after checkout release", () => {
    expect(
      blockedRepairPreservationRecoveryAction({
        stage: "pr-repairing",
        blockedPrFailureKind: "ticket-infrastructure",
        blockedPrDraftVerifiedAt: "2026-07-29T19:30:00.000Z",
        worktreePath: null,
      }),
    ).toBe("finish-preservation");
  });

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

  it("human-gates drafts only after a reviewer explicitly requests changes", () => {
    expect(
      planPullRequestRecovery(
        snapshot({ reviewDecision: "CHANGES_REQUESTED" }),
      ),
    ).toMatchObject({
      action: "human-gate",
      reason: "a reviewer requested changes",
    });
    expect(
      planPullRequestRecovery(
        snapshot({ reviewDecision: "REVIEW_REQUIRED" }),
      ).action,
    ).toBe("reverify-draft");
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
      "protected-scope",
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
          originalFailureKind: "protected-scope",
          repairAttempts: 5,
          checks: passingChecks,
        }),
      ),
    ).toMatchObject({
      action: "reverify-draft",
      consumesCodingAttempt: false,
      promoteDraftAfterVerification: false,
    });

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
          latestMainSha: "main-2",
          checks: passingChecks,
        }),
      ),
    ).toMatchObject({
      action: "resolve-conflict",
      latestMainSha: "main-2",
      consumesCodingAttempt: true,
    });
  });

  it("repairs trusted failed checks on a recoverable draft", () => {
    expect(
      planPullRequestRecovery(
        snapshot({
          originalFailureKind: "ticket-infrastructure",
          checks: [
            {
              name: "e2e-tests",
              bucket: "fail",
              state: "FAILURE",
              provider: "github-actions",
              runId: "107",
            },
          ],
        }),
      ),
    ).toMatchObject({
      action: "code-repair",
      promoteDraftAfterVerification: true,
      failedChecks: ["e2e-tests"],
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
    const staleBase = pullRequestRecoveryFingerprint(
      snapshot({ latestMainSha: "main-2", headContainsLatestMain: false }),
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
    expect(staleBase).not.toBe(first);
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
  it("does not execute a later checkout while a waiting PR owns the worktree", async () => {
    const candidates = [
      snapshot({
        issueNumber: 491,
        checks: [{ name: "CI", state: "PENDING" }],
      }),
      snapshot({ issueNumber: 492, checks: [] }),
    ];
    const selected = selectPullRequestRecoveryCandidates(candidates, {
      "491": { worktreePath: "managed/current" },
      "492": { worktreePath: null },
    });
    const execute = vi.fn(async (plan) => ({ status: plan.action }));

    await reconcilePullRequestBacklog({
      candidates: selected,
      inspect: async (candidate) => candidate,
      readRecord: async () => null,
      writeRecord: async () => {},
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({
      issueNumber: 491,
      action: "wait",
    });
  });

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
