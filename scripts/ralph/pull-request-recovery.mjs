import crypto from "node:crypto";

import {
  draftFailurePolicy,
  shouldPreserveBlockedPullRequestRepair,
} from "./queue.mjs";

const CONTROLLER_OWNED_CHECKS = new Set(["release-scope-evidence"]);
const RECOVERY_POLICY_VERSION = 3;
function normalizedChecks(checks) {
  return [...(Array.isArray(checks) ? checks : [])]
    .map((check) => ({
      name: String(check.name ?? "unknown"),
      bucket: String(check.bucket ?? "").toLowerCase(),
      state: String(check.state ?? "").toUpperCase(),
      provider: String(check.provider ?? "unknown"),
      runId: check.runId == null ? null : String(check.runId),
      startedAt: check.startedAt == null ? null : String(check.startedAt),
      completedAt: check.completedAt == null ? null : String(check.completedAt),
    }))
    .sort((left, right) =>
      `${left.name}\0${left.runId ?? ""}`.localeCompare(
        `${right.name}\0${right.runId ?? ""}`,
      ),
    );
}

function failedCheck(check) {
  return (
    ["fail", "cancel"].includes(check.bucket) ||
    ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(
      check.state,
    )
  );
}

function pendingCheck(check) {
  return (
    ["pending", "queued"].includes(check.bucket) ||
    ["IN_PROGRESS", "PENDING", "QUEUED", "WAITING", "REQUESTED"].includes(
      check.state,
    )
  );
}

function transientCheck(check) {
  return (
    check.bucket === "cancel" ||
    ["CANCELLED", "TIMED_OUT"].includes(check.state)
  );
}

export function pullRequestRecoveryFingerprint(snapshot) {
  const normalized = {
    recoveryPolicyVersion: RECOVERY_POLICY_VERSION,
    issueNumber: snapshot.issueNumber,
    prNumber: snapshot.prNumber,
    headSha: snapshot.headSha,
    expectedHeadSha: snapshot.expectedHeadSha ?? null,
    prState: snapshot.prState,
    isDraft: snapshot.isDraft === true,
    mergeStateStatus: snapshot.mergeStateStatus,
    reviewDecision: snapshot.reviewDecision ?? "",
    mode: snapshot.mode,
    risk: snapshot.risk,
    riskReasons: snapshot.riskReasons ?? [],
    stage: snapshot.stage,
    originalFailureKind: snapshot.originalFailureKind ?? null,
    conflictRepairAttempts: snapshot.conflictRepairAttempts ?? 0,
    checksAvailable: snapshot.checksAvailable !== false,
    requiredCheckEvidenceReady:
      snapshot.requiredCheckEvidenceReady !== false,
    latestMainSha: snapshot.latestMainSha ?? null,
    headContainsLatestMain: snapshot.headContainsLatestMain !== false,
    headContainsPendingBase: snapshot.headContainsPendingBase === true,
    headContainsPendingPreviousHead:
      snapshot.headContainsPendingPreviousHead === true,
    baseUpdateRequiresVerification:
      snapshot.baseUpdateRequiresVerification === true,
    baseUpdateBlockedByDirtyWorktree:
      snapshot.baseUpdateBlockedByDirtyWorktree === true,
    pendingBaseUpdate: snapshot.pendingBaseUpdate ?? null,
    pendingConflictRepair: snapshot.pendingConflictRepair ?? null,
    pendingPrRepair: snapshot.pendingPrRepair ?? null,
    baseUpdateRetryReady: snapshot.baseUpdateRetryReady !== false,
    checks: normalizedChecks(snapshot.checks),
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function pullRequestCheckRetryKey(snapshot) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        issueNumber: snapshot.issueNumber,
        prNumber: snapshot.prNumber,
        headSha: snapshot.headSha,
        checks: normalizedChecks(snapshot.checks).map(({ name, runId }) => ({
          name,
          runId,
        })),
      }),
    )
    .digest("hex");
}

export function pullRequestRecoveryErrorDisposition({
  action,
  stage,
  failureKind,
}) {
  if (
    [
      "kill-switch",
      "safety",
      "infrastructure",
      "network",
      "rate-limit",
      "check-poll",
    ].includes(failureKind)
  ) {
    return "fatal";
  }
  if (action === "code-repair") return "code-repair";
  if (
    action === "reverify-draft" &&
    shouldPreserveBlockedPullRequestRepair(stage, failureKind)
  ) {
    return "preserve-blocked-repair";
  }
  return "human-gate";
}

export function mergedPullRequestFromRecoverySnapshot(plan, snapshot) {
  if (!snapshot.headSha) {
    throw new Error("merged pull-request recovery snapshot is missing its head SHA");
  }
  return {
    number: plan.prNumber,
    url: snapshot.url,
    mergedAt: snapshot.mergedAt,
    mergeCommit: snapshot.mergeCommit,
    headRefOid: snapshot.headSha,
  };
}

export function blockedRepairRecoveryReceipt(input) {
  const result = input?.result;
  if (
    input?.stage !== "pr-repairing" ||
    input?.checkoutDirty !== true ||
    !Number.isInteger(input?.issueNumber) ||
    !Number.isInteger(input?.repairAttempt) ||
    input.repairAttempt < 1 ||
    !input?.resultPath ||
    !input?.expectedHeadSha ||
    input.checkoutHeadSha !== input.expectedHeadSha ||
    !/^[a-f0-9]{64}$/.test(input?.worktreeFingerprint ?? "") ||
    result?.status !== "blocked" ||
    result?.issueNumber !== input.issueNumber ||
    result?.ambiguous !== true ||
    !["ticket-infrastructure", "protected-scope"].includes(
      result?.blockerKind,
    ) ||
    typeof result?.summary !== "string" ||
    !result.summary.trim()
  ) {
    return null;
  }
  return {
    issueNumber: input.issueNumber,
    headSha: input.expectedHeadSha,
    repairAttempt: input.repairAttempt,
    resultPath: input.resultPath,
    worktreeFingerprint: input.worktreeFingerprint,
    failureKind: result.blockerKind,
    stopReason: result.summary,
  };
}

export function blockedRepairRecoveryReceiptMatches(trusted, observed) {
  const fields = [
    "issueNumber",
    "headSha",
    "repairAttempt",
    "resultPath",
    "worktreeFingerprint",
    "failureKind",
    "stopReason",
  ];
  return Boolean(
    trusted &&
      observed &&
      fields.every((field) => trusted[field] === observed[field]),
  );
}

export function canAdoptLegacyProtectedScopeRepair(issueState, receipt) {
  return Boolean(
    issueState?.stage === "pr-repairing" &&
      issueState.failureKind === "worker-blocked" &&
      !issueState.blockedPrRepairRecovery &&
      issueState.commit === receipt?.headSha &&
      issueState.repairAttempts === receipt?.repairAttempt &&
      issueState.lastRepairResultPath === receipt?.resultPath &&
      receipt?.failureKind === "protected-scope" &&
      /^[a-f0-9]{64}$/.test(receipt?.worktreeFingerprint ?? ""),
  );
}

export function blockedRepairPreservationRecoveryAction(issueState) {
  if (
    issueState?.stage !== "pr-repairing" ||
    !shouldPreserveBlockedPullRequestRepair(
      issueState.stage,
      issueState.blockedPrFailureKind,
    )
  ) {
    return "inspect-receipt";
  }
  if (issueState.pendingPrRepair) return "reconcile-pending";
  if (
    issueState.blockedPrRepairPushedAt ||
    issueState.blockedPrDraftVerifiedAt
  ) {
    return "finish-preservation";
  }
  return "inspect-receipt";
}

export function blockedRepairPostPushDisposition(snapshot, expectedHead) {
  if (snapshot?.state !== "OPEN" || snapshot?.isDraft !== true) {
    return "unsafe";
  }
  return snapshot.headRefOid === expectedHead ? "verified" : "wait-head";
}

export function staleBlockedRepairPreservationPatch(
  issueState,
  checkoutDirty,
) {
  if (checkoutDirty !== true || !issueState?.blockedPrDraftVerifiedAt) {
    return null;
  }
  return {
    blockedPrRepairRecovery: null,
    blockedPrRepairPushedAt: null,
    blockedPrCommentedAt: null,
    blockedPrDraftVerifiedAt: null,
  };
}

export function pullRequestBaseUpdateDisposition({
  pending,
  observedHead,
  headContainsPendingBase,
  headContainsPendingPreviousHead,
}) {
  if (!pending) return { action: "none" };
  if (observedHead === pending.previousHead) return { action: "wait" };
  if (
    headContainsPendingBase === true &&
    headContainsPendingPreviousHead === true
  ) {
    return {
      action: "adopt",
      headSha: observedHead,
      baseSha: pending.baseSha,
    };
  }
  return { action: "unsafe" };
}

export function baseUpdateReviewResetPatch(issueState, at) {
  const findingLedger = Array.isArray(issueState?.reviewFindingLedger)
    ? issueState.reviewFindingLedger
    : [];
  const history = Array.isArray(issueState?.supersededReviewFindingLedgers)
    ? issueState.supersededReviewFindingLedgers
    : [];
  return {
    reviewFindingLedger: null,
    reviewBaselineTreeSha: null,
    reviewRepairPending: null,
    blockedPrRepairRecovery: null,
    blockedPrRepairPushedAt: null,
    blockedPrCommentedAt: null,
    blockedPrDraftVerifiedAt: null,
    ...(findingLedger.length > 0
      ? {
          supersededReviewFindingLedgers: [
            ...history.slice(-9),
            {
              findingLedger,
              baselineTreeSha: issueState.reviewBaselineTreeSha ?? null,
              repairPending: issueState.reviewRepairPending ?? null,
              supersededAt: at,
              reason: "pull-request base updated before forced exhaustive review",
            },
          ],
        }
      : {}),
  };
}

function recoveryPlan(snapshot, action, details = {}) {
  return {
    issueNumber: snapshot.issueNumber,
    prNumber: snapshot.prNumber,
    headSha: snapshot.headSha,
    fingerprint: pullRequestRecoveryFingerprint(snapshot),
    retryKey: pullRequestCheckRetryKey(snapshot),
    action,
    risk: snapshot.risk,
    riskReasons: snapshot.riskReasons ?? [],
    latestMainSha: snapshot.latestMainSha ?? null,
    headContainsLatestMain: snapshot.headContainsLatestMain !== false,
    headContainsPendingBase: snapshot.headContainsPendingBase === true,
    headContainsPendingPreviousHead:
      snapshot.headContainsPendingPreviousHead === true,
    baseUpdateRequiresVerification:
      snapshot.baseUpdateRequiresVerification === true,
    baseUpdateBlockedByDirtyWorktree:
      snapshot.baseUpdateBlockedByDirtyWorktree === true,
    pendingBaseUpdate: snapshot.pendingBaseUpdate ?? null,
    pendingConflictRepair: snapshot.pendingConflictRepair ?? null,
    pendingPrRepair: snapshot.pendingPrRepair ?? null,
    conflictRepairAttempts: snapshot.conflictRepairAttempts ?? 0,
    consumesCodingAttempt: action === "code-repair",
    ...details,
  };
}

export function requiredCheckEvidence(checks, requiredNames = []) {
  const byName = new Map(
    (checks ?? []).map((check) => [
      String(check.name),
      String(check.bucket ?? "").toLowerCase(),
    ]),
  );
  const missing = requiredNames.filter((name) => !byName.has(name));
  const notPassed = requiredNames.filter(
    (name) => byName.has(name) && byName.get(name) !== "pass",
  );
  return {
    ready: missing.length === 0 && notPassed.length === 0,
    missing,
    notPassed,
  };
}

export function completedConflictRepairPatch(issueState, previousCommit, at) {
  if (
    issueState?.pendingConflictRepair?.previousHead !== previousCommit ||
    issueState.pendingConflictRepair.baseSha !== issueState.baseSha
  ) {
    return {};
  }
  return {
    pendingConflictRepair: null,
    pendingBaseUpdate: null,
    baseUpdateRequiresVerification: false,
    conflictResolvedAt: at,
    repairAttempts:
      issueState.preConflictRepairAttempts ?? issueState.repairAttempts ?? 0,
    preConflictRepairAttempts: null,
  };
}

function conflictRecoveryPlan(snapshot, reason) {
  if (!snapshot.latestMainSha) {
    return recoveryPlan(snapshot, "human-gate", {
      reason: `${reason}; latest main SHA is unavailable`,
    });
  }
  if (
    (snapshot.conflictRepairAttempts ?? 0) >=
    (snapshot.maximumRepairAttempts ?? 5)
  ) {
    return recoveryPlan(snapshot, "human-gate", {
      reason: `${reason}; conflict repair exhausted its bounded retry budget`,
    });
  }
  return recoveryPlan(snapshot, "resolve-conflict", {
    reason,
    latestMainSha: snapshot.latestMainSha,
    consumesCodingAttempt: true,
  });
}

export function planPullRequestRecovery(snapshot) {
  if (!snapshot || !Number.isInteger(snapshot.issueNumber)) {
    throw new Error("pull-request recovery requires an issue snapshot");
  }
  if (!Number.isInteger(snapshot.prNumber) || !snapshot.headSha) {
    throw new Error("pull-request recovery requires a PR and exact head SHA");
  }
  if (snapshot.prState === "MERGED") {
    return recoveryPlan(snapshot, "finalize-merged");
  }
  if (snapshot.prState !== "OPEN") {
    return recoveryPlan(snapshot, "human-gate", {
      reason: `pull request state is ${snapshot.prState}`,
    });
  }
  if (snapshot.pendingPrRepair) {
    return recoveryPlan(snapshot, "reconcile-pending-repair", {
      reason: "finish the durable interrupted pull-request repair transaction",
    });
  }
  if (
    snapshot.expectedHeadSha &&
    snapshot.expectedHeadSha !== snapshot.headSha
  ) {
    return recoveryPlan(snapshot, "refresh", {
      reason: "pull request head changed since durable state was recorded",
    });
  }
  if (snapshot.pendingConflictRepair) {
    const pending = snapshot.pendingConflictRepair;
    if (
      pending.previousHead !== snapshot.headSha ||
      !Number.isInteger(pending.attempt) ||
      pending.attempt < 1
    ) {
      return recoveryPlan(snapshot, "human-gate", {
        reason: "durable conflict repair does not match the observed PR head and main",
      });
    }
    return recoveryPlan(snapshot, "resolve-conflict", {
      reason: "resume the durable pull-request conflict repair",
      latestMainSha: pending.baseSha,
      conflictRepairAttempt: pending.attempt,
      consumesCodingAttempt: true,
    });
  }
  if (
    snapshot.pendingBaseUpdate &&
    snapshot.headSha === snapshot.pendingBaseUpdate.previousHead
  ) {
    if (snapshot.mergeStateStatus === "DIRTY") {
      return conflictRecoveryPlan(
        snapshot,
        "pull-request base update requires conflict resolution",
      );
    }
    if (snapshot.baseUpdateRetryReady === false) {
      return recoveryPlan(snapshot, "wait", {
        reason: "waiting for GitHub to apply the pending base update",
      });
    }
    return recoveryPlan(snapshot, "update-base", {
      reason: "resume the durable pending pull-request base update",
      latestMainSha: snapshot.pendingBaseUpdate.baseSha,
    });
  }
  if (snapshot.headContainsLatestMain === false) {
    if (snapshot.baseUpdateBlockedByDirtyWorktree) {
      if (
        snapshot.originalFailureKind &&
        !draftFailurePolicy(snapshot.originalFailureKind).reverify
      ) {
        return recoveryPlan(snapshot, "human-gate", {
          reason:
            "interrupted work retains a stricter unresolved draft blocker",
        });
      }
      return recoveryPlan(snapshot, "preserve-dirty-repair", {
        reason: "preserve interrupted repair before updating the pull-request base",
      });
    }
    if (snapshot.mergeStateStatus === "DIRTY") {
      return conflictRecoveryPlan(
        snapshot,
        "pull request conflicts with the latest main branch",
      );
    }
    return recoveryPlan(snapshot, "update-base", {
      reason: "pull request does not contain the latest main branch",
      latestMainSha: snapshot.latestMainSha,
    });
  }
  if (snapshot.mergeStateStatus === "DIRTY") {
    return conflictRecoveryPlan(snapshot, "pull request has merge conflicts");
  }
  if (snapshot.reviewDecision === "CHANGES_REQUESTED") {
    return recoveryPlan(snapshot, "human-gate", {
      reason: "a reviewer requested changes",
    });
  }
  if (snapshot.checksAvailable === false) {
    return recoveryPlan(snapshot, "wait", {
      reason: "GitHub has not reported any PR checks yet",
    });
  }

  const checks = normalizedChecks(snapshot.checks);
  if (checks.some(pendingCheck)) {
    return recoveryPlan(snapshot, "wait");
  }
  const failures = checks.filter(failedCheck);
  const controllerFailures = failures.filter((check) =>
    CONTROLLER_OWNED_CHECKS.has(check.name) &&
    check.provider === "github-actions" &&
    check.runId,
  );
  if (controllerFailures.length > 0) {
    if (
      (snapshot.controllerRepairAttempts ?? 0) >=
      (snapshot.maximumTransientAttempts ?? 3)
    ) {
      return recoveryPlan(snapshot, "human-gate", {
        reason: "controller-owned check repair exhausted its bounded retry budget",
        failedChecks: controllerFailures.map((check) => check.name).sort(),
      });
    }
    return recoveryPlan(snapshot, "controller-repair", {
      failedChecks: controllerFailures.map((check) => check.name).sort(),
      remainingFailures: failures
        .filter((check) => !CONTROLLER_OWNED_CHECKS.has(check.name))
        .map((check) => check.name)
        .sort(),
      checks: controllerFailures,
    });
  }
  if (failures.length > 0 && failures.every(transientCheck)) {
    if (
      (snapshot.transientCheckAttempts ?? 0) >=
      (snapshot.maximumTransientAttempts ?? 3)
    ) {
      return recoveryPlan(snapshot, "human-gate", {
        reason: "transient check retries exhausted their bounded retry budget",
        failedChecks: failures.map((check) => check.name).sort(),
      });
    }
    return recoveryPlan(snapshot, "retry-checks", {
      failedChecks: failures.map((check) => check.name).sort(),
      checks: failures,
    });
  }
  if (failures.length > 0) {
    if (snapshot.isDraft) {
      const failurePolicy = draftFailurePolicy(snapshot.originalFailureKind);
      const untrustedFailures = failures.filter(
        (check) => check.provider !== "github-actions" || !check.runId,
      );
      if (
        failurePolicy.reverify &&
        untrustedFailures.length === 0 &&
        snapshot.repairAttempts < snapshot.maximumRepairAttempts
      ) {
        return recoveryPlan(snapshot, "code-repair", {
          failedChecks: failures.map((check) => check.name).sort(),
          checks: failures,
          promoteDraftAfterVerification:
            failurePolicy.promoteAfterVerification,
        });
      }
      return recoveryPlan(snapshot, "human-gate", {
        reason: `draft retains an unresolved ${snapshot.originalFailureKind ?? "original"} blocker`,
        failedChecks: failures.map((check) => check.name).sort(),
      });
    }
    const untrustedFailures = failures.filter(
      (check) => check.provider !== "github-actions" || !check.runId,
    );
    if (untrustedFailures.length > 0) {
      return recoveryPlan(snapshot, "human-gate", {
        reason: "failed checks do not expose trusted repository GitHub Actions evidence",
        failedChecks: untrustedFailures.map((check) => check.name).sort(),
      });
    }
    if (snapshot.repairAttempts < snapshot.maximumRepairAttempts) {
      return recoveryPlan(snapshot, "code-repair", {
        failedChecks: failures.map((check) => check.name).sort(),
        checks: failures,
      });
    }
    return recoveryPlan(snapshot, "human-gate", {
      reason: "required checks failed after the bounded coding repair budget",
      failedChecks: failures.map((check) => check.name).sort(),
    });
  }

  if (snapshot.requiredCheckEvidenceReady === false) {
    return recoveryPlan(snapshot, "wait", {
      reason: "required external verification evidence has not passed",
    });
  }

  if (snapshot.baseUpdateRequiresVerification) {
    const failurePolicy = draftFailurePolicy(snapshot.originalFailureKind);
    return recoveryPlan(snapshot, "reverify-draft", {
      promoteDraftAfterVerification:
        snapshot.isDraft === true && failurePolicy.promoteAfterVerification,
    });
  }

  if (snapshot.isDraft) {
    const failurePolicy = draftFailurePolicy(snapshot.originalFailureKind);
    if (
      failurePolicy.reverify &&
      (failurePolicy.reverifyWithoutRepairBudget ||
        snapshot.repairAttempts < snapshot.maximumRepairAttempts)
    ) {
      return recoveryPlan(snapshot, "reverify-draft", {
        promoteDraftAfterVerification:
          failurePolicy.promoteAfterVerification,
      });
    }
    return recoveryPlan(snapshot, "human-gate", {
      reason:
        failurePolicy.reverify &&
        snapshot.repairAttempts >= snapshot.maximumRepairAttempts
          ? "draft re-verification exhausted its bounded coding repair budget"
          : "draft pull request still has an unresolved original blocker",
    });
  }
  if (snapshot.mode === "AutoMerge" && snapshot.risk === "low") {
    return recoveryPlan(snapshot, "merge-gates");
  }
  return recoveryPlan(snapshot, "human-gate", {
    reason:
      snapshot.mode !== "AutoMerge"
        ? "automatic merge mode is disabled"
        : "automatic merge denied by risk policy",
  });
}

/**
 * @param {{
 *   candidates: any[],
 *   inspect: (candidate: any) => Promise<any>,
 *   readRecord: (key: string, plan: any) => Promise<any>,
 *   writeRecord: (key: string, record: any) => Promise<void>,
 *   execute: (plan: any, context: {resume: boolean}) => Promise<any>,
 *   onError?: (error: any, plan: any, context: {resume: boolean}) => Promise<any>,
 *   onInspectError?: (error: any, candidate: any) => Promise<any>
 * }} dependencies
 */
export async function reconcilePullRequestBacklog({
  candidates,
  inspect,
  readRecord,
  writeRecord,
  execute,
  onError = null,
  onInspectError = null,
}) {
  const outcomes = [];
  for (const candidate of candidates) {
    let snapshot;
    try {
      snapshot = await inspect(candidate);
    } catch (error) {
      if (!onInspectError) throw error;
      const result = await onInspectError(error, candidate);
      outcomes.push({ plan: null, candidate, skipped: false, result });
      continue;
    }
    const planned = planPullRequestRecovery(snapshot);
    const key = planned.fingerprint;
    const existing = await readRecord(key, planned);
    if (existing?.status === "completed") {
      outcomes.push({ plan: planned, skipped: true, result: existing.result });
      continue;
    }
    const resume = existing?.status === "pending";
    const plan = resume && existing.action
      ? { ...planned, action: existing.action }
      : planned;
    if (!resume) {
      await writeRecord(key, {
        status: "pending",
        action: plan.action,
        issueNumber: plan.issueNumber,
        prNumber: plan.prNumber,
        headSha: plan.headSha,
      });
    }
    let result;
    try {
      result = await execute(plan, { resume });
    } catch (error) {
      if (!onError) throw error;
      result = await onError(error, plan, { resume });
    }
    await writeRecord(key, {
      status: "completed",
      action: plan.action,
      issueNumber: plan.issueNumber,
      prNumber: plan.prNumber,
      headSha: plan.headSha,
      result,
    });
    outcomes.push({ plan, skipped: false, result });
  }
  return outcomes;
}
