import crypto from "node:crypto";

import { shouldPreserveBlockedPullRequestRepair } from "./queue.mjs";

const CONTROLLER_OWNED_CHECKS = new Set(["release-scope-evidence"]);
const RECOVERY_POLICY_VERSION = 2;
const REVERIFYABLE_DRAFT_FAILURES = new Set([
  "worker-blocked",
  "ticket-infrastructure",
  "review-ticket-infrastructure",
]);

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
    checksAvailable: snapshot.checksAvailable !== false,
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
  if (["kill-switch", "safety", "infrastructure"].includes(failureKind)) {
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
    result?.blockerKind !== "ticket-infrastructure" ||
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
    consumesCodingAttempt: action === "code-repair",
    ...details,
  };
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
  if (
    snapshot.expectedHeadSha &&
    snapshot.expectedHeadSha !== snapshot.headSha
  ) {
    return recoveryPlan(snapshot, "refresh", {
      reason: "pull request head changed since durable state was recorded",
    });
  }
  if (snapshot.mergeStateStatus === "DIRTY") {
    return recoveryPlan(snapshot, "human-gate", {
      reason: "pull request has merge conflicts",
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

  if (snapshot.isDraft) {
    if (
      REVERIFYABLE_DRAFT_FAILURES.has(snapshot.originalFailureKind) &&
      snapshot.repairAttempts < snapshot.maximumRepairAttempts
    ) {
      return recoveryPlan(snapshot, "reverify-draft");
    }
    return recoveryPlan(snapshot, "human-gate", {
      reason:
        REVERIFYABLE_DRAFT_FAILURES.has(snapshot.originalFailureKind) &&
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
