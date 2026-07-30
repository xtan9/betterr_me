import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGitWorkspace } from "./git-workspace.mjs";
import { createStateStore } from "./state-store.mjs";
import {
  WORKER_POLICY_SHA256,
  workerChangePolicyViolation,
  workerProtectedPath,
} from "../worker-path-policy.mjs";
import { createGenerationIntentStore } from "./generation-intent.mjs";
import {
  createRequirementsSnapshot,
  assertRepositoryVerificationRecipe,
  createVerificationPlan,
  createRepositoryVerificationRecipe,
  isNonblank,
  requirementsSnapshotSha256,
} from "./verification-plan.mjs";
import { reviewReportViolations } from "../review-protocol.mjs";
import { assertVerificationArtifacts } from "./verification-artifacts.mjs";
import { planPullRequestRecovery } from "../pull-request-recovery.mjs";
import {
  buildInternalPullRequestBody,
  classifyChangeRisk,
  evaluateMergeGate,
} from "../queue.mjs";
import { classifyQueueAudit } from "./queue-audit.mjs";

const TERMINAL_DISPOSITIONS = new Set([
  "merged",
  "stopped",
  "safety_blocked",
  "verification_failed",
]);
const STOP_POLL_MILLISECONDS = 20;
const COOPERATIVE_STOP_MILLISECONDS = 250;
const FORCED_STOP_MILLISECONDS = 2_000;
const DEFAULT_IMPLEMENTATION_TIMEOUT_MILLISECONDS = 14_400_000;
const DEFAULT_VERIFICATION_TIMEOUT_MILLISECONDS = 3_600_000;
const CLAIM_HEARTBEAT_INTERVAL_MILLISECONDS = 6 * 60 * 60 * 1_000;
const DEFAULT_VERIFICATION_MATERIALS_PATH = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const VERIFICATION_STOP_REASONS = new Set([
  "stop_requested",
  "timeout",
  "invalid_receipt",
  "verifier_error",
]);

function operationId(issueNumber, operation, generation = 1) {
  return `ralph-v2:issue-${issueNumber}:generation-${generation}:${operation}`;
}

function isTerminalIssue(record) {
  return (
    TERMINAL_DISPOSITIONS.has(record.disposition) ||
    (record.disposition === "published" && record.deliveryMode !== "AutoMerge")
  );
}

function publicStatus(state, stopRequested) {
  return {
    stopRequested,
    workerLease: state.workerLease,
    issues: Object.values(state.issues)
      .sort((left, right) => left.number - right.number)
      .map((issue) => ({
        number: issue.number,
        disposition: issue.disposition,
        baseSha: issue.baseSha,
        headSha: issue.headSha,
        pullRequestNumber: issue.pullRequestNumber,
        artifactPath: issue.artifactPath,
        blocker: issue.blocker,
        ...(issue.disposition === "publishing"
          ? { headBranch: issue.branch }
          : {}),
      })),
  };
}

function validateReadyIssue(issue) {
  if (
    !issue ||
    !Number.isSafeInteger(issue.number) ||
    issue.number <= 0 ||
    typeof issue.title !== "string" ||
    typeof issue.body !== "string"
  ) {
    throw new Error("GitHub returned an invalid ready issue");
  }
  return issue;
}

function pullRequestTitle(issue) {
  const oneLineTitle = issue.title.replace(/[\r\n]+/g, " ").trim();
  return `Resolve #${issue.number}: ${oneLineTitle}`;
}

function pullRequestBody(issue, record) {
  const risk = classifyChangeRisk(record.changedPaths ?? [], {
    title: issue.title,
    whatToBuild: issue.whatToBuild ?? issue.body,
  });
  return buildInternalPullRequestBody({
    issueNumber: issue.number,
    issueUrl: issue.url ?? `Approved GitHub issue #${issue.number}`,
    summary:
      record.implementationSummary ??
      issue.whatToBuild ??
      `Implemented the approved requirements for issue #${issue.number}.`,
    risk,
  });
}

function validateClaimReceipt(receipt, record) {
  if (
    !receipt?.claimed ||
    (receipt.issueNumber !== undefined && receipt.issueNumber !== record.number) ||
    (receipt.operationId !== undefined &&
      receipt.operationId !== record.claimOperationId)
  ) {
    throw new Error(`claim receipt is invalid for issue #${record.number}`);
  }
}

async function refreshIssueClaimIfDue({
  github,
  record,
  stateStore,
  state,
  clock,
}) {
  if (typeof github.refreshClaim !== "function") return;
  const now = clock.now();
  const observedAt = Date.parse(record.claimHeartbeatAt ?? "");
  if (
    Number.isFinite(observedAt) &&
    now.getTime() - observedAt < CLAIM_HEARTBEAT_INTERVAL_MILLISECONDS &&
    !record.pendingClaimHeartbeat
  ) return;
  if (!record.pendingClaimHeartbeat) {
    const claimedAt = now.toISOString();
    record.pendingClaimHeartbeat = {
      heartbeatId: operationId(
        record.number,
        `claim-heartbeat:${claimedAt}`,
        record.generation,
      ),
      claimedAt,
    };
    stateStore.save(state);
  }
  const pending = record.pendingClaimHeartbeat;
  const refreshed = await runAdmittedEffect(
    stateStore,
    "refresh-issue-claim",
    () => github.refreshClaim({
      issueNumber: record.number,
      operationId: record.claimOperationId,
      heartbeatId: pending.heartbeatId,
      claimedAt: pending.claimedAt,
    }),
  );
  if (!refreshed.admitted) return;
  if (
    refreshed.value?.claimed !== true ||
    refreshed.value.operationId !== record.claimOperationId ||
    refreshed.value.heartbeatId !== pending.heartbeatId
  ) throw new Error(`claim heartbeat lost ownership for issue #${record.number}`);
  record.claimHeartbeatAt = pending.claimedAt;
  record.pendingClaimHeartbeat = null;
  stateStore.save(state);
}

async function checkpoint(lifecycle, point, record) {
  await lifecycle.checkpoint({
    point,
    issueNumber: record.number,
    generation: record.generation,
  });
}

async function runAdmittedEffect(stateStore, effect, action) {
  const admission = stateStore.acquireEffectAdmission(effect);
  if (!admission) return { admitted: false };
  try {
    return { admitted: true, value: await action() };
  } finally {
    admission.release();
  }
}

function saveWorkerLease(state, stateStore, record) {
  state.workerLease = {
    kind: "implementation",
    issueNumber: record.number,
    sessionId: record.sessionId,
    worktreePath: record.worktreePath,
  };
  stateStore.save(state);
}

function saveVerifierLease(state, stateStore, record) {
  state.workerLease = {
    kind: "verification",
    issueNumber: record.number,
    sessionId: record.verificationSessionId,
    worktreePath: record.worktreePath,
    candidateTreeSha: record.candidateTreeSha,
  };
  stateStore.save(state);
}

function parkIssue({
  state,
  stateStore,
  workspace,
  record,
  disposition,
}) {
  const { artifactPath } = workspace.park({
    issueNumber: record.number,
    branch: record.branch,
    expectedHead: record.headSha ?? record.baseSha,
  });
  Object.assign(record, { disposition, artifactPath });
  state.workerLease = null;
  stateStore.save(state);
}

function observe(promise) {
  return promise.then(
    (value) => ({ kind: "fulfilled", value }),
    (error) => ({ kind: "rejected", error }),
  );
}

function waitForStop(stateStore) {
  let timer;
  let settled = false;
  const promise = new Promise((resolve) => {
    const poll = () => {
      if (settled) return;
      if (stateStore.isStopRequested()) {
        settled = true;
        resolve({ kind: "stop-requested" });
        return;
      }
      if (!settled) {
        timer = setTimeout(poll, STOP_POLL_MILLISECONDS);
      }
    };
    poll();
  });
  return {
    promise,
    cancel() {
      settled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function timeoutAfter(milliseconds) {
  let timer;
  return {
    promise: new Promise((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), milliseconds);
    }),
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}

function unwrapObserved(outcome) {
  if (outcome.kind === "rejected") throw outcome.error;
  return outcome.value;
}

function validateTerminationReceipt(receipt, sessionId) {
  if (
    receipt?.kind !== "terminated" ||
    receipt.sessionId !== sessionId ||
    receipt.processTreeTerminated !== true
  ) {
    throw new Error(`worker termination receipt is invalid for ${sessionId}`);
  }
  return receipt;
}

function validateVerifierTerminationReceipt(receipt, input) {
  if (
    receipt?.kind !== "terminated" ||
    receipt.sessionId !== input.sessionId ||
    receipt.candidateTreeSha !== input.candidateTreeSha ||
    receipt.operationId !== input.operationId ||
    receipt.processTreeTerminated !== true
  ) {
    throw new Error(
      `verifier termination receipt is invalid for ${input.sessionId}`,
    );
  }
  return receipt;
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function exactIds(items, expected) {
  return (
    Array.isArray(items) &&
    items.length === expected.length &&
    items.every((item, index) => item?.id === expected[index])
  );
}

function plannedOrAxisCoverageId(id, plan) {
  if (plan.review.coverage.some((coverage) => coverage.id === id)) return true;
  return plan.review.axes.some(
    (axis) =>
      id === `${axis}:NO-SURFACE` ||
      new RegExp(`^${axis}:SURFACE-\\d+$`).test(id),
  );
}

function validVerificationEvidence(evidence, input, receiptKind, runtimePath) {
  const plan = input.verificationPlan;
  if (
    !evidence ||
    evidence.schemaVersion !== 2 ||
    evidence.sessionId !== input.sessionId ||
    evidence.candidateTreeSha !== input.candidateTreeSha ||
    evidence.verificationPlanSha256 !== input.verificationPlanSha256 ||
    !plan ||
    !exactIds(evidence.tests, plan.tests.map((test) => test.id))
  ) {
    return false;
  }
  if (
    !evidence.tests.every((test, index) => {
      const planned = plan.tests[index];
      return (
        ["passed", "failed"].includes(test.status) &&
        test.candidateTreeSha === input.candidateTreeSha &&
        test.command === planned.command &&
        Number.isSafeInteger(test.exitCode) &&
        (test.status === "passed"
          ? test.exitCode === 0
          : test.exitCode !== 0) &&
        isSha256(test.outputSha256) &&
        isNonblank(test.outputArtifactPath) &&
        path.isAbsolute(test.outputArtifactPath)
      );
    })
  ) {
    return false;
  }

  const review = evidence.review;
  const reviewViolations = reviewReportViolations(review, {
    reviewKind: "exhaustive",
    requiredAxes: plan.review.axes,
    requiredCoverageIds: plan.review.coverage.map(({ id }) => id),
    requireSurfaceInventory: false,
  });
  if (
    !review ||
    review.reviewKind !== "exhaustive" ||
    !["pass", "findings"].includes(review.status) ||
    review.complete !== true ||
    review.sessionId !== plan.review.sessionId ||
    review.candidateTreeSha !== input.candidateTreeSha ||
    review.policySha256 !== plan.review.policySha256 ||
    review.skillSha256 !== plan.review.skillSha256 ||
    reviewViolations.length !== 0 ||
    !exactIds(review.axes, plan.review.axes) ||
    !review.coverage.every((coverage) =>
      plannedOrAxisCoverageId(coverage?.id, plan),
    ) ||
    !plan.review.coverage.every((plannedCoverage) => {
      const observed = review.coverage.find(
        (coverage) => coverage.id === plannedCoverage.id,
      );
      return observed?.subject === plannedCoverage.subject;
    }) ||
    !Array.isArray(review.specialistReceipts) ||
    review.specialistReceipts.length !== plan.review.axes.length ||
    !review.specialistReceipts.every(
      (receipt, index) =>
        receipt?.axis === plan.review.axes[index] &&
        receipt.sessionId ===
          `${plan.review.sessionId}:${plan.review.axes[index]}` &&
        receipt.freshSession === true &&
        receipt.readOnly === true &&
        receipt.processTreeTerminated === true &&
        isSha256(receipt.outputSha256) &&
        isNonblank(receipt.resultPath) &&
        path.isAbsolute(receipt.resultPath),
    )
  ) {
    return false;
  }

  try {
    assertVerificationArtifacts({
      runtimePath,
      evidence,
      verificationPlan: plan,
      verificationPlanSha256: input.verificationPlanSha256,
    });
  } catch {
    return false;
  }

  const failedTest = evidence.tests.some((test) => test.status === "failed");
  const failedReview =
    review.status === "findings" && review.blockingFindings.length > 0;
  if (receiptKind === "passed") {
    return !failedTest && review.status === "pass";
  }
  return failedTest || failedReview;
}

function validateVerificationReceipt(receipt, input, runtimePath) {
  if (
    !receipt ||
    receipt.sessionId !== input.sessionId ||
    receipt.candidateTreeSha !== input.candidateTreeSha ||
    !["passed", "failed"].includes(receipt.kind) ||
    !validVerificationEvidence(receipt.evidence, input, receipt.kind, runtimePath)
  ) {
    throw new Error(
      `verification receipt is invalid for issue #${input.issue.number}`,
    );
  }
  return receipt;
}

async function awaitWithin(observedPromise, milliseconds) {
  const timeout = timeoutAfter(milliseconds);
  try {
    return await Promise.race([observedPromise, timeout.promise]);
  } finally {
    timeout.cancel();
  }
}

async function runImplementation({
  worker,
  input,
  stateStore,
  deadlineEpochMilliseconds,
}) {
  const cancellation = new AbortController();
  const implementation = observe(
    Promise.resolve().then(() =>
      worker.startOrAttach({
        ...input,
        signal: cancellation.signal,
      }),
    ),
  );
  const stop = waitForStop(stateStore);
  const timeout = timeoutAfter(
    Math.max(0, deadlineEpochMilliseconds - Date.now()),
  );
  try {
    const first = await Promise.race([
      implementation,
      stop.promise,
      timeout.promise,
    ]);
    if (["fulfilled", "rejected"].includes(first.kind)) {
      return unwrapObserved(first);
    }

    const forcedStopDeadline = Date.now() + FORCED_STOP_MILLISECONDS;
    cancellation.abort();
    await awaitWithin(
      implementation,
      Math.min(
        COOPERATIVE_STOP_MILLISECONDS,
        Math.max(0, forcedStopDeadline - Date.now()),
      ),
    );
    if (typeof worker.terminate !== "function") {
      throw new Error(
        `implementation worker cannot prove process-tree termination for issue #${input.issue.number}`,
      );
    }

    const termination = observe(
      Promise.resolve().then(() =>
        worker.terminate({
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
          worktreePath: input.worktreePath,
        }),
      ),
    );
    const terminated = await awaitWithin(
      termination,
      Math.max(0, forcedStopDeadline - Date.now()),
    );
    if (terminated.kind === "timeout") {
      throw new Error(
        `implementation worker process tree exceeded the stop timeout for issue #${input.issue.number}`,
      );
    }
    validateTerminationReceipt(
      unwrapObserved(terminated),
      input.sessionId,
    );
    return {
      kind: first.kind === "timeout" ? "timed_out" : "aborted",
      sessionId: input.sessionId,
    };
  } finally {
    stop.cancel();
    timeout.cancel();
  }
}

function durableImplementationDeadline({
  record,
  state,
  stateStore,
  implementationTimeoutMilliseconds,
  runDeadlineEpochMilliseconds,
}) {
  if (record.implementationDeadlineSessionId !== record.sessionId) {
    const startedAt = Date.now();
    const effectiveTimeoutMilliseconds = Math.max(
      1,
      Math.min(
        implementationTimeoutMilliseconds,
        runDeadlineEpochMilliseconds - startedAt,
      ),
    );
    Object.assign(record, {
      implementationDeadlineSessionId: record.sessionId,
      implementationStartedAtEpochMilliseconds: startedAt,
      implementationTimeoutMilliseconds: effectiveTimeoutMilliseconds,
      implementationDeadlineEpochMilliseconds:
        startedAt + effectiveTimeoutMilliseconds,
    });
    saveWorkerLease(state, stateStore, record);
  }
  if (
    record.implementationDeadlineSessionId !== record.sessionId ||
    !Number.isSafeInteger(record.implementationStartedAtEpochMilliseconds) ||
    !Number.isSafeInteger(record.implementationTimeoutMilliseconds) ||
    record.implementationTimeoutMilliseconds <= 0 ||
    record.implementationTimeoutMilliseconds > implementationTimeoutMilliseconds ||
    !Number.isSafeInteger(record.implementationDeadlineEpochMilliseconds) ||
    record.implementationDeadlineEpochMilliseconds !==
      record.implementationStartedAtEpochMilliseconds +
        record.implementationTimeoutMilliseconds
  ) {
    throw new Error(
      `implementation deadline failed integrity validation for issue #${record.number}`,
    );
  }
  return record.implementationDeadlineEpochMilliseconds;
}

function boundedPhaseTiming(maximumTimeoutMilliseconds, runDeadlineEpochMilliseconds) {
  const startedAtEpochMilliseconds = Date.now();
  const timeoutMilliseconds = Math.max(
    1,
    Math.min(
      maximumTimeoutMilliseconds,
      runDeadlineEpochMilliseconds - startedAtEpochMilliseconds,
    ),
  );
  return {
    startedAtEpochMilliseconds,
    timeoutMilliseconds,
    deadlineEpochMilliseconds: startedAtEpochMilliseconds + timeoutMilliseconds,
  };
}

function boundedErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").trim().slice(0, 1_000);
}

function verificationBlocker(reason, record, error) {
  if (reason === "timeout") {
    return {
      kind: "verification_timeout",
      sessionId: record.verificationSessionId,
      deadlineEpochMilliseconds: record.verificationDeadlineEpochMilliseconds,
    };
  }
  if (reason === "invalid_receipt") {
    return {
      kind: "verification_receipt_invalid",
      sessionId: record.verificationSessionId,
      message: boundedErrorMessage(error),
    };
  }
  if (reason === "verifier_error") {
    return {
      kind: "verification_infrastructure_error",
      sessionId: record.verificationSessionId,
      message: boundedErrorMessage(error),
    };
  }
  return undefined;
}

function beginVerificationStopping({
  state,
  stateStore,
  record,
  reason,
  error,
}) {
  if (!VERIFICATION_STOP_REASONS.has(reason)) {
    throw new Error("verification stop reason failed integrity validation");
  }
  if (record.disposition === "verification_stopping") {
    if (record.verificationStopReason !== reason) {
      throw new Error(
        `verification stop reason changed for issue #${record.number}`,
      );
    }
    return;
  }
  record.disposition = "verification_stopping";
  record.verificationStopReason = reason;
  record.verificationTerminationOperationId = operationId(
    record.number,
    `terminate-verification:${record.verificationSessionId}:${reason}`,
    record.generation,
  );
  const blocker = verificationBlocker(reason, record, error);
  if (blocker) record.blocker = blocker;
  saveVerifierLease(state, stateStore, record);
}

function beginVerificationFinalizing({ state, stateStore, record, receipt }) {
  if (!receipt || !["passed", "failed"].includes(receipt.kind)) {
    throw new Error("verification finalization receipt failed integrity validation");
  }
  if (record.disposition === "verification_finalizing") {
    if (JSON.stringify(record.verificationReceipt) !== JSON.stringify(receipt)) {
      throw new Error(
        `verification result changed during finalization for issue #${record.number}`,
      );
    }
    return;
  }
  record.disposition = "verification_finalizing";
  record.verificationReceipt = receipt;
  record.verificationFinalizationKind = receipt.kind;
  record.verificationTerminationOperationId = operationId(
    record.number,
    `finalize-verification:${record.verificationSessionId}`,
    record.generation,
  );
  saveVerifierLease(state, stateStore, record);
}

function invalidateVerificationFinalization({
  state,
  stateStore,
  record,
  error,
}) {
  record.verificationFinalizationKind = "invalid";
  record.blocker = verificationBlocker("invalid_receipt", record, error);
  saveVerifierLease(state, stateStore, record);
}

async function waitForVerification({
  verifier,
  input,
  runtimePath,
  stateStore,
  deadlineEpochMilliseconds,
  onStopping,
}) {
  const cancellation = new AbortController();
  let verification;
  const stop = waitForStop(stateStore);
  const timeout = timeoutAfter(
    Math.max(0, deadlineEpochMilliseconds - Date.now()),
  );
  try {
    if (Date.now() >= deadlineEpochMilliseconds) {
      await onStopping("timeout");
      return { kind: "stopping" };
    }
    verification = observe(
      Promise.resolve().then(() =>
        verifier.startOrAttach({
          ...input,
          signal: cancellation.signal,
        }),
      ),
    );
    const first = await Promise.race([
      verification,
      stop.promise,
      timeout.promise,
    ]);
    if (first.kind === "fulfilled") {
      try {
        return {
          kind: "completed",
          receipt: validateVerificationReceipt(first.value, input, runtimePath),
        };
      } catch (error) {
        await onStopping("invalid_receipt", error);
      }
    } else if (first.kind === "rejected") {
      await onStopping("verifier_error", first.error);
    } else {
      await onStopping(
        first.kind === "stop-requested" ? "stop_requested" : "timeout",
      );
    }

    cancellation.abort();
    await awaitWithin(verification, COOPERATIVE_STOP_MILLISECONDS);
    return { kind: "stopping" };
  } finally {
    stop.cancel();
    timeout.cancel();
  }
}

async function terminateVerifier({
  verifier,
  record,
  state,
  stateStore,
  lifecycle,
}) {
  if (!record.verificationSessionId || !record.candidateTreeSha) {
    throw new Error(
      `cannot safely reconcile the active verifier for issue #${record.number}`,
    );
  }
  const input = {
    issueNumber: record.number,
    sessionId: record.verificationSessionId,
    worktreePath: record.worktreePath,
    candidateTreeSha: record.candidateTreeSha,
    operationId: record.verificationTerminationOperationId,
  };
  const termination = observe(
    Promise.resolve().then(() => verifier.terminate(input)),
  );
  const terminated = await awaitWithin(
    termination,
    FORCED_STOP_MILLISECONDS,
  );
  if (terminated.kind === "timeout") {
    throw new Error(
      `verifier process tree exceeded the stop timeout for issue #${record.number}`,
    );
  }
  const receipt = validateVerifierTerminationReceipt(
    unwrapObserved(terminated),
    input,
  );
  await checkpoint(lifecycle, "verifier-terminated", record);
  record.verificationTerminationReceipt = receipt;
  saveVerifierLease(state, stateStore, record);
  return receipt;
}

async function finishVerificationStopping({
  record,
  state,
  stateStore,
  workspace,
  verifier,
  lifecycle,
}) {
  if (
    record.disposition !== "verification_stopping" ||
    !VERIFICATION_STOP_REASONS.has(record.verificationStopReason) ||
    typeof record.verificationTerminationOperationId !== "string" ||
    record.verificationTerminationOperationId.length === 0
  ) {
    throw new Error(
      `verification stopping state failed integrity validation for issue #${record.number}`,
    );
  }
  await terminateVerifier({
    verifier,
    record,
    state,
    stateStore,
    lifecycle,
  });
  const committedCandidate = record.repairPreviousHeadSha
    ? null
    : workspace.findVerifiedCommit({
        issueNumber: record.number,
        branch: record.branch,
        baseSha: record.baseSha,
        candidateTreeSha: record.candidateTreeSha,
      });
  if (committedCandidate) record.headSha = committedCandidate.headSha;
  parkIssue({
    state,
    stateStore,
    workspace,
    record,
    disposition:
      record.verificationStopReason === "stop_requested"
        ? "stopped"
        : "verification_failed",
  });
}

async function finishVerificationFinalizing({
  record,
  state,
  stateStore,
  workspace,
  verifier,
  lifecycle,
}) {
  if (
    record.disposition !== "verification_finalizing" ||
    !["passed", "failed", "invalid"].includes(
      record.verificationFinalizationKind,
    ) ||
    typeof record.verificationTerminationOperationId !== "string" ||
    record.verificationTerminationOperationId.length === 0
  ) {
    throw new Error(
      `verification finalization state failed integrity validation for issue #${record.number}`,
    );
  }
  await terminateVerifier({
    verifier,
    record,
    state,
    stateStore,
    lifecycle,
  });

  if (stateStore.isStopRequested()) {
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "stopped",
    });
    return { kind: "parked" };
  }
  if (record.verificationFinalizationKind === "invalid") {
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "verification_failed",
    });
    return { kind: "parked" };
  }
  if (record.verificationFinalizationKind === "failed") {
    record.verificationFailureBatch = structuredClone(
      record.verificationReceipt.evidence,
    );
    record.blocker = {
      kind: "verification_gates_failed",
      sessionId: record.verificationSessionId,
      failedGateIds: record.verificationReceipt.evidence.tests
        .filter((test) => test.status === "failed")
        .map((test) => test.id),
      findingIds: [
        ...record.verificationReceipt.evidence.review.blockingFindings,
      ],
    };
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "verification_failed",
    });
    return { kind: "parked" };
  }

  await checkpoint(lifecycle, "candidate-verified", record);
  record.disposition = "verified";
  state.workerLease = null;
  stateStore.save(state);
  return { kind: "verified" };
}

async function reconcileRequestedStop({
  record,
  state,
  stateStore,
  workspace,
  worker,
  verifier,
  lifecycle,
  intentStore,
}) {
  if (record.generationIntentSha256) intentStore.assertRecord(record);

  if (record.disposition === "verification_finalizing") {
    await terminateVerifier({
      verifier,
      record,
      state,
      stateStore,
      lifecycle,
    });
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "stopped",
    });
    return;
  }
  if (record.disposition === "implementing") {
    if (typeof worker.terminate !== "function") {
      throw new Error(
        `cannot safely reconcile the active worker for issue #${record.number}`,
      );
    }
    const termination = observe(
      Promise.resolve().then(() =>
        worker.terminate({
          issueNumber: record.number,
          sessionId: record.sessionId,
          worktreePath: record.worktreePath,
        }),
      ),
    );
    const terminated = await awaitWithin(
      termination,
      FORCED_STOP_MILLISECONDS,
    );
    if (terminated.kind === "timeout") {
      throw new Error(
        `implementation worker process tree exceeded the stop timeout for issue #${record.number}`,
      );
    }
    validateTerminationReceipt(
      unwrapObserved(terminated),
      record.sessionId,
    );
  }

  if (
    record.disposition === "verification_planned" ||
    record.disposition === "verifying" ||
    record.disposition === "verification_finalizing"
  ) {
    beginVerificationStopping({
      state,
      stateStore,
      record,
      reason: "stop_requested",
    });
  }

  if (record.disposition === "verification_stopping") {
    await finishVerificationStopping({
      record,
      state,
      stateStore,
      workspace,
      verifier,
      lifecycle,
    });
    return;
  }

  if (record.disposition === "implementing") {
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "stopped",
    });
    return;
  }

  if (record.disposition === "verified") {
    const committedCandidate = workspace.findVerifiedCommit({
      issueNumber: record.number,
      branch: record.branch,
      baseSha: record.baseSha,
      candidateTreeSha: record.candidateTreeSha,
    });
    if (committedCandidate) record.headSha = committedCandidate.headSha;
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "stopped",
    });
    return;
  }

  if (
    record.disposition === "preparing" &&
    workspace.activeCheckoutExists(record)
  ) {
    parkIssue({
      state,
      stateStore,
      workspace,
      record,
      disposition: "stopped",
    });
    return;
  }

  if (record.disposition === "publishing") {
    state.workerLease = null;
    stateStore.save(state);
    return;
  }

  Object.assign(record, { disposition: "stopped" });
  state.workerLease = null;
  stateStore.save(state);
}

async function reconcileIssue({
  record,
  state,
  stateStore,
  workspace,
  github,
  worker,
  verifier,
  implementationTimeoutMilliseconds,
  runDeadlineEpochMilliseconds,
  verificationTimeoutMilliseconds,
  verificationRecipe,
  lifecycle,
  clock,
  intentStore,
  runtimePath,
}) {
  const issue = validateReadyIssue(record.issue);
  if (issue.number !== record.number) {
    throw new Error("Ralph issue identity failed integrity validation");
  }
  const requirements = createRequirementsSnapshot(issue);
  const requirementsSha256 = requirementsSnapshotSha256(requirements);
  if (
    record.requirementsSha256 !== undefined &&
    record.requirementsSha256 !== requirementsSha256
  ) {
    throw new Error("Ralph issue requirements changed after generation planning");
  }
  if (
    record.workerPolicySha256 !== undefined &&
    record.workerPolicySha256 !== WORKER_POLICY_SHA256
  ) {
    throw new Error("Ralph worker policy changed after generation planning");
  }
  if (record.generationIntentSha256) intentStore.assertRecord(record);

  if (record.disposition !== "claiming" && !isTerminalIssue(record)) {
    await refreshIssueClaimIfDue({ github, record, stateStore, state, clock });
  }

  const continuePullRequestCodeRepair = async () => {
    workspace.restorePullRequestCheckout({
      issueNumber: record.number,
      branch: record.branch,
      headSha: record.repairPreviousHeadSha,
    });
    const implementationDeadlineEpochMilliseconds = durableImplementationDeadline({
      record,
      state,
      stateStore,
      implementationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
    });
    const repairResult = await runImplementation({
      worker,
      stateStore,
      deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      input: {
        issue,
        purpose:
          record.repairKind === "conflict" ? "conflict-repair" : "pr-repair",
        failedChecks: record.repairFailedChecks,
        sessionId: record.sessionId,
        worktreePath: record.worktreePath,
        baseSha: record.baseSha,
        checkoutHeadSha: record.repairPreviousHeadSha,
        deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      },
    });
    if (repairResult?.kind === "timed_out") {
      record.blocker = {
        kind: "implementation_timeout",
        sessionId: record.sessionId,
        deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      };
      parkIssue({ state, stateStore, workspace, record, disposition: "safety_blocked" });
      return;
    }
    if (
      ["blocked", "failed"].includes(repairResult?.kind) &&
      repairResult.sessionId === record.sessionId
    ) {
      record.blocker = repairResult.summary ||
        `${repairResult.blockerKind ?? repairResult.kind} repair result`;
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition:
          repairResult.kind === "blocked"
            ? "safety_blocked"
            : "verification_failed",
      });
      return;
    }
    if (
      repairResult?.kind !== "completed" ||
      repairResult.sessionId !== record.sessionId
    ) {
      throw new Error(`pull-request repair worker failed for issue #${record.number}`);
    }
    workspace.discardEmptySandboxPlaceholders({ baseSha: record.baseSha });
    const { candidateTreeSha } = workspace.buildCandidate();
    const candidateChanges = workspace.candidateChanges({
      baseSha: record.baseSha,
      candidateTreeSha,
    });
    if (workerChangePolicyViolation(candidateChanges, issue)) {
      throw new Error(`pull-request repair violated worker policy for issue #${record.number}`);
    }
    const changedPaths = candidateChanges.map((change) => change.path).sort();
    const verificationSessionId = operationId(
      record.number,
      `verification:${candidateTreeSha}`,
      record.generation,
    );
    const { plan: verificationPlan, sha256: verificationPlanSha256 } =
      createVerificationPlan({
        sessionId: verificationSessionId,
        candidateTreeSha,
        changedPaths,
        requirements,
        recipe: verificationRecipe,
      });
    const verificationTiming = boundedPhaseTiming(
      verificationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
    );
    const verificationStartedAtEpochMilliseconds =
      verificationTiming.startedAtEpochMilliseconds;
    const effectiveVerificationTimeoutMilliseconds =
      verificationTiming.timeoutMilliseconds;
    const verificationDeadlineEpochMilliseconds =
      verificationTiming.deadlineEpochMilliseconds;
    const candidateIntent = intentStore.bindCandidate({
      issueNumber: record.number,
      generation: record.generation,
      generationIntentSha256: record.generationIntentSha256,
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
    });
    Object.assign(record, {
      disposition: "verification_planned",
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlan,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
      candidateIntentSha256: candidateIntent.sha256,
    });
    saveVerifierLease(state, stateStore, record);
    return reconcileIssue({
      record,
      state,
      stateStore,
      workspace,
      github,
      worker,
      verifier,
      implementationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
      verificationTimeoutMilliseconds,
      verificationRecipe,
      lifecycle,
      clock,
      intentStore,
      runtimePath,
    });
  };

  if (record.disposition === "pr_repairing") {
    return continuePullRequestCodeRepair();
  }

  if (record.disposition === "claiming") {
    let claim = await github.findClaim({
      issueNumber: record.number,
      operationId: record.claimOperationId,
    });
    if (!claim) {
      const claimed = await runAdmittedEffect(
        stateStore,
        "claim-issue",
        () =>
          github.claimIssue({
            issueNumber: record.number,
            operationId: record.claimOperationId,
            claimedAt: clock.now().toISOString(),
          }),
      );
      if (!claimed.admitted) return;
      claim = claimed.value;
      await checkpoint(lifecycle, "claim-applied", record);
    }
    validateClaimReceipt(claim, record);
    record.disposition = "claimed";
    record.claimHeartbeatAt = clock.now().toISOString();
    stateStore.save(state);
    if (stateStore.isStopRequested()) return;
  }

  if (record.disposition === "claimed") {
    const plan = workspace.plan(record.number);
    const existingPullRequest = await github.findPullRequest({
      issueNumber: record.number,
      headBranch: plan.branch,
    });
    if (
      existingPullRequest &&
      ["MERGED", "CLOSED"].includes(existingPullRequest.state)
    ) {
      Object.assign(record, {
        disposition: "safety_blocked",
        pullRequestNumber: existingPullRequest.number,
        blocker: {
          kind: "existing_pull_request_not_open",
          state: existingPullRequest.state,
          pullRequestNumber: existingPullRequest.number,
        },
      });
      state.workerLease = null;
    } else if (existingPullRequest?.state === "OPEN") {
      const adoptionPlan = workspace.planPullRequestAdoption({
        issueNumber: record.number,
        expectedHeadSha: existingPullRequest.headSha,
      });
      Object.assign(record, adoptionPlan, {
        disposition: "adoption_planning",
        sessionId: operationId(record.number, "adoption", record.generation),
        pullRequestNumber: existingPullRequest.number,
        repairPreviousHeadSha: existingPullRequest.headSha,
        repairKind: "base-update",
        requirementsSha256,
        workerPolicySha256: WORKER_POLICY_SHA256,
      });
    } else if (!existingPullRequest) {
      const sessionId = operationId(
        record.number,
        "implementation",
        record.generation,
      );
      Object.assign(record, plan, {
        disposition: "planning",
        sessionId,
        requirementsSha256,
        workerPolicySha256: WORKER_POLICY_SHA256,
      });
    } else throw new Error(`existing pull request state failed integrity validation for issue #${record.number}`);
    stateStore.save(state);
    if (stateStore.isStopRequested()) {
      record.disposition = "stopped";
      state.workerLease = null;
      stateStore.save(state);
      return;
    }
  }

  if (record.disposition === "adoption_planning") {
    const generationIntent = intentStore.reserveGeneration({
      issueNumber: record.number,
      generation: record.generation,
      baseSha: record.baseSha,
      branch: record.branch,
      implementationSessionId: record.sessionId,
      requirementsSha256: record.requirementsSha256,
      workerPolicySha256: record.workerPolicySha256,
    });
    record.generationIntentSha256 = generationIntent.sha256;
    record.disposition = "adoption_preparing";
    stateStore.save(state);
  }

  if (record.disposition === "adoption_preparing") {
    const prepared = await runAdmittedEffect(
      stateStore,
      "adopt-pull-request-worktree",
      () => workspace.restorePullRequestCheckout({
        issueNumber: record.number,
        branch: record.branch,
        headSha: record.headSha,
      }),
    );
    if (!prepared.admitted) return;
    workspace.discardEmptySandboxPlaceholders({ baseSha: record.baseSha });
    const { candidateTreeSha } = workspace.buildCandidate();
    const candidateChanges = workspace.candidateChanges({
      baseSha: record.baseSha,
      candidateTreeSha,
    });
    const pathViolation = workerChangePolicyViolation(candidateChanges, issue);
    if (pathViolation) {
      record.blocker = pathViolation;
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "safety_blocked",
      });
      return;
    }
    const changedPaths = candidateChanges.map((change) => change.path).sort();
    const verificationSessionId = operationId(
      record.number,
      `verification:${candidateTreeSha}`,
      record.generation,
    );
    const { plan: verificationPlan, sha256: verificationPlanSha256 } =
      createVerificationPlan({
        sessionId: verificationSessionId,
        candidateTreeSha,
        changedPaths,
        requirements,
        recipe: verificationRecipe,
      });
    const verificationTiming = boundedPhaseTiming(
      verificationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
    );
    const verificationStartedAtEpochMilliseconds =
      verificationTiming.startedAtEpochMilliseconds;
    const effectiveVerificationTimeoutMilliseconds =
      verificationTiming.timeoutMilliseconds;
    const verificationDeadlineEpochMilliseconds =
      verificationTiming.deadlineEpochMilliseconds;
    const candidateIntent = intentStore.bindCandidate({
      issueNumber: record.number,
      generation: record.generation,
      generationIntentSha256: record.generationIntentSha256,
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
    });
    Object.assign(record, {
      disposition: "verification_planned",
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlan,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
      candidateIntentSha256: candidateIntent.sha256,
    });
    saveVerifierLease(state, stateStore, record);
  }

  if (record.disposition === "planning") {
    const generationIntent = intentStore.reserveGeneration({
      issueNumber: record.number,
      generation: record.generation,
      baseSha: record.baseSha,
      branch: record.branch,
      implementationSessionId: record.sessionId,
      requirementsSha256: record.requirementsSha256,
      workerPolicySha256: record.workerPolicySha256,
    });
    record.generationIntentSha256 = generationIntent.sha256;
    record.disposition = "preparing";
    stateStore.save(state);
    if (stateStore.isStopRequested()) {
      record.disposition = "stopped";
      state.workerLease = null;
      stateStore.save(state);
      return;
    }
  }

  if (record.disposition === "preparing") {
    const prepared = await runAdmittedEffect(
      stateStore,
      "create-worktree",
      () => workspace.ensureCheckout(record),
    );
    if (!prepared.admitted) return;
    await checkpoint(lifecycle, "worktree-created", record);
    record.disposition = "implementing";
    saveWorkerLease(state, stateStore, record);
  }

  if (record.disposition === "implementing") {
    saveWorkerLease(state, stateStore, record);
    if (stateStore.isStopRequested()) {
      await reconcileRequestedStop({
        record,
        state,
        stateStore,
        workspace,
        worker,
        verifier,
        lifecycle,
        intentStore,
      });
      return;
    }
    const implementationDeadlineEpochMilliseconds = durableImplementationDeadline({
      record,
      state,
      stateStore,
      implementationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
    });
    const workerResult = await runImplementation({
      worker,
      stateStore,
      deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      input: {
        issue,
        sessionId: record.sessionId,
        worktreePath: record.worktreePath,
        baseSha: record.baseSha,
        deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      },
    });
    if (workerResult?.kind === "completed") {
      await checkpoint(lifecycle, "worker-completed", record);
    }
    if (workerResult?.kind === "aborted" && stateStore.isStopRequested()) {
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "stopped",
      });
      return;
    }
    if (workerResult?.kind === "timed_out") {
      record.blocker = {
        kind: "implementation_timeout",
        sessionId: record.sessionId,
        deadlineEpochMilliseconds: implementationDeadlineEpochMilliseconds,
      };
      parkIssue({ state, stateStore, workspace, record, disposition: "safety_blocked" });
      return;
    }
    if (
      ["blocked", "failed"].includes(workerResult?.kind) &&
      workerResult.sessionId === record.sessionId
    ) {
      record.blocker = workerResult.summary ||
        `${workerResult.blockerKind ?? workerResult.kind} worker result`;
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition:
          workerResult.kind === "blocked"
            ? "safety_blocked"
            : "verification_failed",
      });
      return;
    }
    if (
      workerResult?.kind !== "completed" ||
      workerResult.sessionId !== record.sessionId
    ) {
      throw new Error(`implementation worker failed for issue #${record.number}`);
    }
    if (stateStore.isStopRequested()) {
      await reconcileRequestedStop({
        record,
        state,
        stateStore,
        workspace,
        worker,
        verifier,
        lifecycle,
        intentStore,
      });
      return;
    }

    workspace.discardEmptySandboxPlaceholders({ baseSha: record.baseSha });
    const { candidateTreeSha } = workspace.buildCandidate();
    const candidateChanges = workspace.candidateChanges({
      baseSha: record.baseSha,
      candidateTreeSha,
    });
    const pathViolation = workerChangePolicyViolation(candidateChanges, issue);
    if (pathViolation) {
      const protectedChanges = candidateChanges.filter((change) =>
        workerProtectedPath(change.path),
      );
      Object.assign(record, {
        candidateTreeSha,
        blocker: {
          kind: "protected_path",
          changes: protectedChanges,
        },
      });
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "safety_blocked",
      });
      return;
    }
    const verificationSessionId = operationId(
      record.number,
      `verification:${candidateTreeSha}`,
      record.generation,
    );
    const changedPaths = candidateChanges.map((change) => change.path).sort();
    const { plan: verificationPlan, sha256: verificationPlanSha256 } =
      createVerificationPlan({
        sessionId: verificationSessionId,
        candidateTreeSha,
        changedPaths,
        requirements,
        recipe: verificationRecipe,
      });
    const verificationTiming = boundedPhaseTiming(
      verificationTimeoutMilliseconds,
      runDeadlineEpochMilliseconds,
    );
    const verificationStartedAtEpochMilliseconds =
      verificationTiming.startedAtEpochMilliseconds;
    const effectiveVerificationTimeoutMilliseconds =
      verificationTiming.timeoutMilliseconds;
    const verificationDeadlineEpochMilliseconds =
      verificationTiming.deadlineEpochMilliseconds;
    const candidateIntent = intentStore.bindCandidate({
      issueNumber: record.number,
      generation: record.generation,
      generationIntentSha256: record.generationIntentSha256,
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
    });
    Object.assign(record, {
      disposition: "verification_planned",
      candidateTreeSha,
      changedPaths,
      verificationSessionId,
      verificationPlan,
      verificationPlanSha256,
      verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds,
      candidateIntentSha256: candidateIntent.sha256,
    });
    saveVerifierLease(state, stateStore, record);
  }

  if (
    record.disposition === "verification_planned" ||
    record.disposition === "verifying"
  ) {
    let integrityError;
    const expectedVerificationSessionId = operationId(
      record.number,
      `verification:${record.candidateTreeSha}`,
      record.generation,
    );
    const observedCandidateChanges = workspace.candidateChanges({
      baseSha: record.baseSha,
      candidateTreeSha: record.candidateTreeSha,
    });
    const observedChangedPaths = observedCandidateChanges
      .map((change) => change.path)
      .sort();
    const expectedPlan = createVerificationPlan({
      sessionId: expectedVerificationSessionId,
      candidateTreeSha: record.candidateTreeSha,
      changedPaths: observedChangedPaths,
      requirements,
      recipe: verificationRecipe,
    });
    if (record.verificationSessionId !== expectedVerificationSessionId) {
      integrityError = new Error(
        `verification session identity changed for issue #${record.number}`,
      );
    } else if (
      JSON.stringify(record.changedPaths) !==
      JSON.stringify(observedChangedPaths)
    ) {
      integrityError = new Error(
        `verification candidate paths changed for issue #${record.number}`,
      );
    } else if (
      record.verificationPlanSha256 !== expectedPlan.sha256 ||
      JSON.stringify(record.verificationPlan) !==
        JSON.stringify(expectedPlan.plan)
    ) {
      integrityError = new Error(
        `verification plan changed for issue #${record.number}`,
      );
    } else if (
      !Number.isSafeInteger(record.verificationStartedAtEpochMilliseconds) ||
      !Number.isSafeInteger(record.verificationTimeoutMilliseconds) ||
      record.verificationTimeoutMilliseconds <= 0 ||
      !Number.isSafeInteger(record.verificationDeadlineEpochMilliseconds) ||
      record.verificationDeadlineEpochMilliseconds !==
        record.verificationStartedAtEpochMilliseconds +
          record.verificationTimeoutMilliseconds
    ) {
      integrityError = new Error(
        `verification deadline changed for issue #${record.number}`,
      );
    } else if (
      workerChangePolicyViolation(observedCandidateChanges, issue)
    ) {
      integrityError = new Error(
        `verification candidate violates worker policy for issue #${record.number}`,
      );
    } else {
      try {
        intentStore.assertRecord(record);
      } catch (error) {
        integrityError = error;
      }
    }

    if (integrityError) {
      record.verificationSessionId = expectedVerificationSessionId;
      record.changedPaths = observedChangedPaths;
      record.verificationPlan = expectedPlan.plan;
      record.verificationPlanSha256 = expectedPlan.sha256;
      if (record.disposition === "verification_finalizing") {
        invalidateVerificationFinalization({
          state,
          stateStore,
          record,
          error: integrityError,
        });
      } else {
        beginVerificationStopping({
          state,
          stateStore,
          record,
          reason: "verifier_error",
          error: integrityError,
        });
      }
    } else if (
      stateStore.isStopRequested() &&
      record.disposition !== "verification_finalizing"
    ) {
      beginVerificationStopping({
        state,
        stateStore,
        record,
        reason: "stop_requested",
      });
    } else if (record.disposition === "verification_planned") {
      record.disposition = "verifying";
      saveVerifierLease(state, stateStore, record);
    }
  }

  if (record.disposition === "verification_stopping") {
    await finishVerificationStopping({
      record,
      state,
      stateStore,
      workspace,
      verifier,
      lifecycle,
    });
    return;
  }

  if (record.disposition === "verifying") {
    if (stateStore.isStopRequested()) {
      beginVerificationStopping({
        state,
        stateStore,
        record,
        reason: "stop_requested",
      });
      await finishVerificationStopping({
        record,
        state,
        stateStore,
        workspace,
        verifier,
        lifecycle,
      });
      return;
    }
    const verificationInput = {
      issue,
      purpose: record.repairPreviousHeadSha ? "pr-repair" : "implementation",
      checkoutHeadSha: record.repairPreviousHeadSha ?? record.baseSha,
      sessionId: record.verificationSessionId,
      worktreePath: record.worktreePath,
      baseSha: record.baseSha,
      headBranch: record.branch,
      candidateTreeSha: record.candidateTreeSha,
      changedPaths: record.changedPaths,
      verificationPlan: record.verificationPlan,
      verificationPlanSha256: record.verificationPlanSha256,
      deadlineEpochMilliseconds: record.verificationDeadlineEpochMilliseconds,
    };
    const verificationResult = await waitForVerification({
      verifier,
      input: verificationInput,
      runtimePath,
      stateStore,
      deadlineEpochMilliseconds: record.verificationDeadlineEpochMilliseconds,
      onStopping: async (reason, error) =>
        beginVerificationStopping({
          state,
          stateStore,
          record,
          reason,
          error,
        }),
    });
    if (verificationResult.kind === "stopping") {
      await finishVerificationStopping({
        record,
        state,
        stateStore,
        workspace,
        verifier,
        lifecycle,
      });
      return;
    }
    const verification = verificationResult.receipt;
    beginVerificationFinalizing({
      state,
      stateStore,
      record,
      receipt: verification,
    });
  }

  if (record.disposition === "verification_finalizing") {
    const verificationInput = {
      issue,
      purpose: record.repairPreviousHeadSha ? "pr-repair" : "implementation",
      checkoutHeadSha: record.repairPreviousHeadSha ?? record.baseSha,
      sessionId: record.verificationSessionId,
      worktreePath: record.worktreePath,
      baseSha: record.baseSha,
      headBranch: record.branch,
      candidateTreeSha: record.candidateTreeSha,
      changedPaths: record.changedPaths,
      verificationPlan: record.verificationPlan,
      verificationPlanSha256: record.verificationPlanSha256,
    };
    if (record.verificationFinalizationKind !== "invalid") {
      try {
        const receipt = validateVerificationReceipt(
          record.verificationReceipt,
          verificationInput,
          runtimePath,
        );
        if (receipt.kind !== record.verificationFinalizationKind) {
          throw new Error(
            `verification finalization kind changed for issue #${record.number}`,
          );
        }
      } catch (error) {
        invalidateVerificationFinalization({
          state,
          stateStore,
          record,
          error,
        });
      }
    }
    const finalization = await finishVerificationFinalizing({
      record,
      state,
      stateStore,
      workspace,
      verifier,
      lifecycle,
    });
    if (finalization.kind === "parked") return;
  }

  if (record.disposition === "verified" && record.repairPreviousHeadSha) {
    if (record.repairKind === "base-update") {
      workspace.cleanup({
        issueNumber: record.number,
        branch: record.branch,
        headSha: record.headSha,
      });
      Object.assign(record, {
        disposition: "pr_waiting",
        repairPreviousHeadSha: null,
        repairKind: null,
      });
      state.workerLease = null;
      stateStore.save(state);
      await checkpoint(lifecycle, "pull-request-base-update-reverified", record);
      return;
    }
    const previousHeadSha = record.repairPreviousHeadSha;
    const amended = await runAdmittedEffect(
      stateStore,
      record.repairKind === "conflict"
        ? "commit-pull-request-conflict-repair"
        : "amend-pull-request-repair",
      () =>
        record.repairKind === "conflict"
          ? workspace.commitConflictRepair({
              issueNumber: record.number,
              previousHeadSha,
              latestMainSha: record.repairMainSha,
              candidateTreeSha: record.candidateTreeSha,
            })
          : workspace.amendRepair({
              issueNumber: record.number,
              previousHeadSha,
              candidateTreeSha: record.candidateTreeSha,
            }),
    );
    if (!amended.admitted) return;
    const pushed = await runAdmittedEffect(
      stateStore,
      "push-pull-request-repair",
      () =>
        workspace.pushRepair({
          issueNumber: record.number,
          branch: record.branch,
          previousHeadSha,
          headSha: amended.value.headSha,
        }),
    );
    if (!pushed.admitted) return;
    const observedPullRequest = await github.inspectPullRequest({
      issueNumber: record.number,
      pullRequestNumber: record.pullRequestNumber,
      expectedHeadSha: amended.value.headSha,
    });
    if (observedPullRequest?.headSha !== amended.value.headSha) {
      throw new Error(`repaired PR head is not observable for issue #${record.number}`);
    }
    workspace.cleanup({
      issueNumber: record.number,
      branch: record.branch,
      headSha: amended.value.headSha,
    });
    Object.assign(record, {
      disposition: "pr_waiting",
      headSha: amended.value.headSha,
      repairPreviousHeadSha: null,
      repairKind: null,
      repairMainSha: null,
    });
    state.workerLease = null;
    stateStore.save(state);
    await checkpoint(lifecycle, "pull-request-code-repair-pushed", record);
    return;
  }

  if (record.disposition === "verified") {
    if (stateStore.isStopRequested()) {
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "stopped",
      });
      return;
    }
    let commit = workspace.findVerifiedCommit({
      issueNumber: record.number,
      branch: record.branch,
      baseSha: record.baseSha,
      candidateTreeSha: record.candidateTreeSha,
    });
    if (!commit) {
      const committed = await runAdmittedEffect(
        stateStore,
        "commit-candidate",
        () =>
          workspace.commit({
            issueNumber: record.number,
            candidateTreeSha: record.candidateTreeSha,
          }),
      );
      if (!committed.admitted) return;
      commit = committed.value;
      await checkpoint(lifecycle, "candidate-committed", record);
    }
    Object.assign(record, {
      disposition: "publishing",
      headSha: commit.headSha,
    });
    state.workerLease = null;
    stateStore.save(state);
    if (stateStore.isStopRequested()) {
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "stopped",
      });
      return;
    }
  }

  if (record.disposition === "publishing") {
    if (stateStore.isStopRequested()) return;
    const observedRemoteHead = workspace.remoteHead({
      issueNumber: record.number,
      branch: record.branch,
    });
    if (stateStore.isStopRequested()) return;
    if (observedRemoteHead && observedRemoteHead !== record.headSha) {
      throw new Error(`remote issue branch changed for issue #${record.number}`);
    }
    if (!observedRemoteHead) {
      const pushed = await runAdmittedEffect(
        stateStore,
        "push-branch",
        () =>
          workspace.push({
            issueNumber: record.number,
            branch: record.branch,
            headSha: record.headSha,
          }),
      );
      if (!pushed.admitted) return;
      await checkpoint(lifecycle, "branch-pushed", record);
    }
    if (stateStore.isStopRequested()) return;

    const pullRequestOperationId = operationId(
      record.number,
      `pull-request:${record.headSha}`,
      record.generation,
    );
    let pullRequest = await github.findPullRequest({
      issueNumber: record.number,
      headBranch: record.branch,
      headSha: record.headSha,
    });
    if (stateStore.isStopRequested()) return;
    if (!pullRequest) {
      const createdPullRequest = await runAdmittedEffect(
        stateStore,
        "create-draft-pr",
        () =>
          github.createDraftPullRequest({
            issueNumber: record.number,
            operationId: pullRequestOperationId,
            draft: true,
            title: pullRequestTitle(issue),
            body: pullRequestBody(issue, record),
            headBranch: record.branch,
            headSha: record.headSha,
            baseBranch: "main",
          }),
      );
      if (!createdPullRequest.admitted) return;
      pullRequest = createdPullRequest.value;
      await checkpoint(lifecycle, "draft-pr-created", record);
    }
    if (
      !pullRequest ||
      pullRequest.headBranch !== record.branch ||
      pullRequest.headSha !== record.headSha ||
      pullRequest.draft !== true
    ) {
      throw new Error(`pull request receipt is invalid for issue #${record.number}`);
    }
    record.pullRequestNumber = pullRequest.number;
    stateStore.save(state);
    if (stateStore.isStopRequested()) return;

    const cleaned = await runAdmittedEffect(
      stateStore,
      "cleanup-checkout",
      () =>
        workspace.cleanup({
          issueNumber: record.number,
          branch: record.branch,
          headSha: record.headSha,
        }),
    );
    if (!cleaned.admitted) return;
    await checkpoint(lifecycle, "checkout-cleaned", record);
    record.disposition =
      record.deliveryMode === "AutoMerge" ? "pr_waiting" : "published";
    state.workerLease = null;
    stateStore.save(state);
  }

  if (record.disposition === "pr_waiting") {
    if (
      typeof github.inspectPullRequest !== "function" ||
      typeof github.markPullRequestReady !== "function" ||
      typeof github.mergePullRequest !== "function"
    ) {
      throw new Error("AutoMerge requires inspect, ready, and merge GitHub capabilities");
    }
    let pullRequest = await github.inspectPullRequest({
      issueNumber: record.number,
      pullRequestNumber: record.pullRequestNumber,
      expectedHeadSha: record.headSha,
      pendingBaseUpdate: record.pendingBaseUpdate,
    });
    if (
      !pullRequest ||
      pullRequest.number !== record.pullRequestNumber
    ) {
      throw new Error(`pull request inspection is invalid for issue #${record.number}`);
    }
    if (pullRequest.headSha !== record.headSha) {
      const pending = record.pendingBaseUpdate;
      if (
        !pending ||
        pending.previousHeadSha !== record.headSha ||
        pullRequest.headContainsLatestMain !== true ||
        pullRequest.latestMainSha !== pending.latestMainSha
      ) {
        throw new Error(`pull request head changed outside Ralph for issue #${record.number}`);
      }
      const newHeadSha = pullRequest.headSha;
      const generation = record.generation + 1;
      const sessionId = operationId(
        record.number,
        `base-update-reverification:${newHeadSha}`,
        generation,
      );
      const restored = workspace.restorePullRequestCheckout({
        issueNumber: record.number,
        branch: record.branch,
        headSha: newHeadSha,
      });
      const generationIntent = intentStore.reserveGeneration({
        issueNumber: record.number,
        generation,
        baseSha: pending.latestMainSha,
        branch: record.branch,
        implementationSessionId: sessionId,
        requirementsSha256,
        workerPolicySha256: WORKER_POLICY_SHA256,
      });
      Object.assign(record, {
        generation,
        sessionId,
        baseSha: pending.latestMainSha,
        headSha: newHeadSha,
        worktreePath: restored.worktreePath,
        generationIntentSha256: generationIntent.sha256,
        candidateIntentSha256: undefined,
        repairPreviousHeadSha: newHeadSha,
        repairKind: "base-update",
        pendingBaseUpdate: null,
      });
      const { candidateTreeSha } = workspace.buildCandidate();
      const candidateChanges = workspace.candidateChanges({
        baseSha: record.baseSha,
        candidateTreeSha,
      });
      const changedPaths = candidateChanges.map((change) => change.path).sort();
      const verificationSessionId = operationId(
        record.number,
        `verification:${candidateTreeSha}`,
        generation,
      );
      const { plan: verificationPlan, sha256: verificationPlanSha256 } =
        createVerificationPlan({
          sessionId: verificationSessionId,
          candidateTreeSha,
          changedPaths,
          requirements,
          recipe: verificationRecipe,
        });
      const verificationTiming = boundedPhaseTiming(
        verificationTimeoutMilliseconds,
        runDeadlineEpochMilliseconds,
      );
      const verificationStartedAtEpochMilliseconds =
        verificationTiming.startedAtEpochMilliseconds;
      const effectiveVerificationTimeoutMilliseconds =
        verificationTiming.timeoutMilliseconds;
      const verificationDeadlineEpochMilliseconds =
        verificationTiming.deadlineEpochMilliseconds;
      const candidateIntent = intentStore.bindCandidate({
        issueNumber: record.number,
        generation,
        generationIntentSha256: generationIntent.sha256,
        candidateTreeSha,
        changedPaths,
        verificationSessionId,
        verificationPlanSha256,
        verificationStartedAtEpochMilliseconds,
        verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
        verificationDeadlineEpochMilliseconds,
      });
      Object.assign(record, {
        disposition: "verification_planned",
        candidateTreeSha,
        changedPaths,
        verificationSessionId,
        verificationPlan,
        verificationPlanSha256,
        verificationStartedAtEpochMilliseconds,
        verificationTimeoutMilliseconds: effectiveVerificationTimeoutMilliseconds,
        verificationDeadlineEpochMilliseconds,
        candidateIntentSha256: candidateIntent.sha256,
      });
      saveVerifierLease(state, stateStore, record);
      return reconcileIssue({
        record, state, stateStore, workspace, github, worker, verifier,
        implementationTimeoutMilliseconds,
        runDeadlineEpochMilliseconds,
        verificationTimeoutMilliseconds, verificationRecipe, lifecycle, clock,
        intentStore, runtimePath,
      });
    }

    if (pullRequest.state === "MERGED") {
      record.disposition = "merged";
      stateStore.save(state);
      return;
    }
    const risk = classifyChangeRisk(record.changedPaths ?? [], {
      title: issue.title,
      whatToBuild: issue.body,
    });
    const recoverySnapshot = (observedPullRequest, isDraft) => ({
      issueNumber: record.number,
      prNumber: record.pullRequestNumber,
      headSha: observedPullRequest.headSha,
      expectedHeadSha: record.headSha,
      prState: observedPullRequest.state,
      isDraft,
      mergeStateStatus: observedPullRequest.mergeStateStatus,
      reviewDecision: observedPullRequest.reviewDecision,
      mode: record.deliveryMode,
      risk: risk.level,
      riskReasons: risk.reasons,
      checksAvailable: observedPullRequest.checksAvailable,
      checks: observedPullRequest.checks,
      requiredCheckEvidenceReady: observedPullRequest.requiredCheckEvidenceReady,
      latestMainSha: observedPullRequest.latestMainSha,
      headContainsLatestMain: observedPullRequest.headContainsLatestMain,
      repairAttempts: record.repairAttempts ?? 0,
      transientCheckAttempts: record.transientCheckAttempts ?? 0,
      controllerRepairAttempts: record.controllerRepairAttempts ?? 0,
      maximumRepairAttempts: 5,
      maximumTransientAttempts: 3,
    });

    if (pullRequest.draft === true) {
      if (risk.level !== "low" || pullRequest.requirementsAmbiguous === true) {
        Object.assign(record, {
          disposition: "safety_blocked",
          blocker:
            risk.level !== "low"
              ? `automatic merge denied by risk policy: ${risk.reasons.join("; ")}`
              : "automatic merge denied because requirements are ambiguous",
        });
        stateStore.save(state);
        return;
      }
      const promotionPlan = planPullRequestRecovery(
        recoverySnapshot(pullRequest, false),
      );
      if (promotionPlan.action === "retry-checks") {
        if (typeof github.retryPullRequestChecks !== "function") {
          throw new Error("AutoMerge cannot retry transient PR checks");
        }
        const attempt = (record.transientCheckAttempts ?? 0) + 1;
        const retried = await runAdmittedEffect(
          stateStore,
          "retry-pull-request-checks",
          () =>
            github.retryPullRequestChecks({
              issueNumber: record.number,
              pullRequestNumber: record.pullRequestNumber,
              expectedHeadSha: record.headSha,
              checks: promotionPlan.checks,
              operationId: operationId(
                record.number,
                `retry-pull-request-checks:${record.headSha}:attempt-${attempt}`,
                record.generation,
              ),
            }),
        );
        if (!retried.admitted) return;
        record.transientCheckAttempts = attempt;
        stateStore.save(state);
        await checkpoint(lifecycle, "pull-request-checks-retried", record);
        return;
      }
      if (promotionPlan.action === "controller-repair") {
        if (typeof github.repairControllerOwnedChecks !== "function") {
          throw new Error("AutoMerge cannot repair controller-owned PR checks");
        }
        const attempt = (record.controllerRepairAttempts ?? 0) + 1;
        const repaired = await runAdmittedEffect(
          stateStore,
          "repair-controller-owned-checks",
          () =>
            github.repairControllerOwnedChecks({
              issueNumber: record.number,
              pullRequestNumber: record.pullRequestNumber,
              expectedHeadSha: record.headSha,
              checks: promotionPlan.checks,
              body: pullRequestBody(issue, record),
              operationId: operationId(
                record.number,
                `repair-controller-owned-checks:${record.headSha}:attempt-${attempt}`,
                record.generation,
              ),
            }),
        );
        if (!repaired.admitted) return;
        record.controllerRepairAttempts = attempt;
        stateStore.save(state);
        await checkpoint(lifecycle, "controller-owned-checks-repaired", record);
        return;
      }
      if (promotionPlan.action === "update-base") {
        if (
          typeof github.updatePullRequestBase !== "function" ||
          !promotionPlan.latestMainSha
        ) {
          throw new Error("AutoMerge cannot update the pull-request base safely");
        }
        const attempt = (record.baseUpdateAttempts ?? 0) + 1;
        if (attempt > 3) {
          Object.assign(record, {
            disposition: "safety_blocked",
            blocker: "pull-request base update exhausted its retry budget",
          });
          stateStore.save(state);
          return;
        }
        const updated = await runAdmittedEffect(
          stateStore,
          "update-pull-request-base",
          () =>
            github.updatePullRequestBase({
              issueNumber: record.number,
              pullRequestNumber: record.pullRequestNumber,
              expectedHeadSha: record.headSha,
              latestMainSha: promotionPlan.latestMainSha,
              operationId: operationId(
                record.number,
                `update-pull-request-base:${record.headSha}:${promotionPlan.latestMainSha}`,
                record.generation,
              ),
            }),
        );
        if (!updated.admitted) return;
        record.baseUpdateAttempts = attempt;
        record.pendingBaseUpdate = {
          previousHeadSha: record.headSha,
          latestMainSha: promotionPlan.latestMainSha,
        };
        stateStore.save(state);
        await checkpoint(lifecycle, "pull-request-base-update-requested", record);
        return;
      }
      if (promotionPlan.action === "resolve-conflict") {
        const attempt = (record.conflictRepairAttempts ?? 0) + 1;
        if (attempt > 5 || !promotionPlan.latestMainSha) {
          Object.assign(record, {
            disposition: "safety_blocked",
            blocker: "merge conflict exhausted its bounded repair budget",
          });
          stateStore.save(state);
          return;
        }
        const previousHeadSha = record.headSha;
        const repairGeneration = record.generation + 1;
        const repairSessionId = operationId(
          record.number,
          `conflict-repair:${previousHeadSha}:attempt-${attempt}`,
          repairGeneration,
        );
        const conflict = workspace.beginConflictRepair({
          issueNumber: record.number,
          branch: record.branch,
          headSha: previousHeadSha,
          latestMainSha: promotionPlan.latestMainSha,
        });
        const generationIntent = intentStore.reserveGeneration({
          issueNumber: record.number,
          generation: repairGeneration,
          baseSha: record.baseSha,
          branch: record.branch,
          implementationSessionId: repairSessionId,
          requirementsSha256,
          workerPolicySha256: WORKER_POLICY_SHA256,
        });
        Object.assign(record, {
          disposition: "pr_repairing",
          generation: repairGeneration,
          sessionId: repairSessionId,
          worktreePath: conflict.worktreePath,
          generationIntentSha256: generationIntent.sha256,
          candidateIntentSha256: undefined,
          conflictRepairAttempts: attempt,
          repairPreviousHeadSha: previousHeadSha,
          repairMainSha: promotionPlan.latestMainSha,
          repairKind: "conflict",
          repairFailedChecks: [],
        });
        saveWorkerLease(state, stateStore, record);
        await checkpoint(lifecycle, "pull-request-conflict-repair-planned", record);
        return continuePullRequestCodeRepair();
      }
      if (promotionPlan.action === "code-repair") {
        const attempt = (record.repairAttempts ?? 0) + 1;
        if (attempt > 5) {
          Object.assign(record, {
            disposition: "safety_blocked",
            blocker: "required checks failed after five verified repair attempts",
          });
          stateStore.save(state);
          return;
        }
        const previousHeadSha = record.headSha;
        const restored = workspace.restorePullRequestCheckout({
          issueNumber: record.number,
          branch: record.branch,
          headSha: previousHeadSha,
        });
        const repairGeneration = record.generation + 1;
        const repairSessionId = operationId(
          record.number,
          `pr-code-repair:${previousHeadSha}:attempt-${attempt}`,
          repairGeneration,
        );
        const generationIntent = intentStore.reserveGeneration({
          issueNumber: record.number,
          generation: repairGeneration,
          baseSha: record.baseSha,
          branch: record.branch,
          implementationSessionId: repairSessionId,
          requirementsSha256,
          workerPolicySha256: WORKER_POLICY_SHA256,
        });
        Object.assign(record, {
          disposition: "pr_repairing",
          generation: repairGeneration,
          sessionId: repairSessionId,
          worktreePath: restored.worktreePath,
          generationIntentSha256: generationIntent.sha256,
          candidateIntentSha256: undefined,
          repairAttempts: attempt,
          repairPreviousHeadSha: previousHeadSha,
          repairKind: "checks",
          repairFailedChecks: promotionPlan.failedChecks,
        });
        saveWorkerLease(state, stateStore, record);
        await checkpoint(lifecycle, "pull-request-code-repair-planned", record);
        return continuePullRequestCodeRepair();
      }
      if (promotionPlan.action !== "merge-gates") return;
      const promotionGate = evaluateMergeGate({
        mode: record.deliveryMode,
        risk: risk.level,
        ambiguous: false,
        checksPassed: true,
        reviewDecision: pullRequest.reviewDecision,
        reviewRequired: pullRequest.reviewRequired === true,
        mergeState: pullRequest.mergeStateStatus,
      });
      if (!promotionGate.canMerge) return;

      const ready = await runAdmittedEffect(stateStore, "ready-pull-request", () =>
        github.markPullRequestReady({
          issueNumber: record.number,
          pullRequestNumber: record.pullRequestNumber,
          expectedHeadSha: record.headSha,
          operationId: operationId(
            record.number,
            `ready-pull-request:${record.headSha}`,
            record.generation,
          ),
        }),
      );
      if (!ready.admitted) return;
      await checkpoint(lifecycle, "pull-request-ready", record);
      pullRequest = await github.inspectPullRequest({
        issueNumber: record.number,
        pullRequestNumber: record.pullRequestNumber,
        expectedHeadSha: record.headSha,
      });
    }

    const snapshot = recoverySnapshot(
      pullRequest,
      pullRequest.draft === true,
    );
    const plan = planPullRequestRecovery(snapshot);
    if (plan.action === "wait") return;
    if (plan.action === "finalize-merged") {
      record.disposition = "merged";
      stateStore.save(state);
      return;
    }
    if (plan.action !== "merge-gates") {
      Object.assign(record, {
        disposition: "safety_blocked",
        blocker: plan.reason ?? `pull-request recovery requires ${plan.action}`,
      });
      stateStore.save(state);
      return;
    }

    const gate = evaluateMergeGate({
      mode: record.deliveryMode,
      risk: risk.level,
      ambiguous: pullRequest.requirementsAmbiguous === true,
      checksPassed: true,
      reviewDecision: pullRequest.reviewDecision,
      reviewRequired: pullRequest.reviewRequired === true,
      mergeState:
        pullRequest.mergeStateStatus === "CLEAN" ? "CLEAN" : pullRequest.mergeStateStatus,
    });
    if (!gate.canMerge) {
      Object.assign(record, {
        disposition: "safety_blocked",
        blocker: gate.reason,
      });
      stateStore.save(state);
      return;
    }

    const merged = await runAdmittedEffect(stateStore, "merge-pull-request", () =>
      github.mergePullRequest({
        issueNumber: record.number,
        pullRequestNumber: record.pullRequestNumber,
        expectedHeadSha: record.headSha,
        operationId: operationId(
          record.number,
          `merge-pull-request:${record.headSha}`,
          record.generation,
        ),
      }),
    );
    if (!merged.admitted) return;
    if (
      merged.value?.merged !== true ||
      merged.value.pullRequestNumber !== record.pullRequestNumber ||
      merged.value.headSha !== record.headSha
    ) {
      throw new Error(`merge receipt is invalid for issue #${record.number}`);
    }
    const observedMain = workspace.remoteMainContains(record.headSha);
    if (!observedMain.contains) {
      throw new Error(
        `remote main ${observedMain.mainSha} does not contain merged head ${record.headSha}`,
      );
    }
    await checkpoint(lifecycle, "pull-request-merged", record);
    record.disposition = "merged";
    stateStore.save(state);
  }
}

export function createRalphRuntimeCore({
  repositoryPath,
  runtimePath,
  github,
  worker,
  verifier,
  implementationTimeoutMilliseconds = DEFAULT_IMPLEMENTATION_TIMEOUT_MILLISECONDS,
  verificationTimeoutMilliseconds = DEFAULT_VERIFICATION_TIMEOUT_MILLISECONDS,
  verificationRecipe,
  verificationMaterialsPath = DEFAULT_VERIFICATION_MATERIALS_PATH,
  lifecycle = { checkpoint: async () => {} },
  clock,
}) {
  if (
    !github ||
    !worker ||
    typeof worker.startOrAttach !== "function" ||
    typeof worker.terminate !== "function" ||
    !verifier ||
    typeof verifier.startOrAttach !== "function" ||
    typeof verifier.terminate !== "function" ||
    !clock
  ) {
    throw new Error("Ralph requires GitHub, worker, verifier, and clock adapters");
  }
  if (
    !Number.isSafeInteger(implementationTimeoutMilliseconds) ||
    implementationTimeoutMilliseconds <= 0
  ) {
    throw new Error("implementationTimeoutMilliseconds must be a positive integer");
  }
  if (
    !Number.isSafeInteger(verificationTimeoutMilliseconds) ||
    verificationTimeoutMilliseconds <= 0
  ) {
    throw new Error("verificationTimeoutMilliseconds must be a positive integer");
  }
  const resolvedVerificationRecipe =
    verificationRecipe ??
    createRepositoryVerificationRecipe({
      repositoryPath: verificationMaterialsPath,
    });
  assertRepositoryVerificationRecipe({
    repositoryPath: verificationMaterialsPath,
    recipe: resolvedVerificationRecipe,
  });
  const stateStore = createStateStore(runtimePath);
  const intentStore = createGenerationIntentStore(runtimePath);
  const workspace = createGitWorkspace({ repositoryPath, runtimePath });

  return {
    async run({ mode, maxIssues, deadlineEpochMilliseconds }) {
      if (!["DryRun", "PrOnly", "AutoMerge"].includes(mode)) {
        throw new Error(`Ralph v2 does not support ${mode} mode yet`);
      }
      if (!Number.isSafeInteger(maxIssues) || maxIssues <= 0) {
        throw new Error("maxIssues must be a positive integer");
      }
      if (
        deadlineEpochMilliseconds !== undefined &&
        (!Number.isSafeInteger(deadlineEpochMilliseconds) ||
          deadlineEpochMilliseconds <= 0)
      ) {
        throw new Error("run deadline must be a positive integer");
      }
      const runDeadlineEpochMilliseconds =
        deadlineEpochMilliseconds ?? Number.MAX_SAFE_INTEGER;
      if (mode === "DryRun") {
        const readyIssues = await github.listReadyIssues();
        return {
          stopRequested: stateStore.isStopRequested(),
          workerLease: null,
          issues: readyIssues.slice(0, maxIssues).map((issue) => ({
            number: validateReadyIssue(issue).number,
            disposition: "ready",
          })),
        };
      }

      const controllerLease = await stateStore.acquireControllerLease();
      try {
        const state = stateStore.load();
        if (stateStore.isStopRequested()) {
          const resumable = Object.values(state.issues).filter(
            (issue) => !isTerminalIssue(issue),
          );
          if (resumable.length > 1) {
            throw new Error("Ralph state contains multiple resumable issues");
          }
          if (resumable.length === 1) {
            await reconcileRequestedStop({
              record: resumable[0],
              state,
              stateStore,
              workspace,
              worker,
              verifier,
              lifecycle,
              intentStore,
            });
          }
          return publicStatus(state, true);
        }

        let processed = 0;
        const resumable = Object.values(state.issues).filter(
          (issue) => !isTerminalIssue(issue),
        );
        if (resumable.length > 1) {
          throw new Error("Ralph state contains multiple resumable issues");
        }
        if (resumable.length === 1) {
          await reconcileIssue({
            record: resumable[0],
            state,
            stateStore,
            workspace,
            github,
            worker,
            verifier,
            implementationTimeoutMilliseconds,
            runDeadlineEpochMilliseconds,
            verificationTimeoutMilliseconds,
            verificationRecipe: resolvedVerificationRecipe,
            lifecycle,
            clock,
            intentStore,
            runtimePath,
          });
          processed += 1;
          if (!isTerminalIssue(resumable[0])) {
            return publicStatus(state, false);
          }
        }

        if (processed < maxIssues && !stateStore.isStopRequested()) {
          const readyIssues = await github.listReadyIssues();
          for (const candidate of readyIssues) {
            if (processed >= maxIssues || stateStore.isStopRequested()) break;
            const issue = validateReadyIssue(candidate);
            if (state.issues[issue.number]) continue;
            const generation = 1;
            const record = {
              number: issue.number,
              issue: structuredClone(issue),
              disposition: "claiming",
              deliveryMode: mode,
              generation,
              claimOperationId: operationId(issue.number, "claim", generation),
            };
            state.issues[issue.number] = record;
            stateStore.save(state);
            await reconcileIssue({
              record,
              state,
              stateStore,
              workspace,
              github,
              worker,
              verifier,
              implementationTimeoutMilliseconds,
              runDeadlineEpochMilliseconds,
              verificationTimeoutMilliseconds,
              verificationRecipe: resolvedVerificationRecipe,
              lifecycle,
              clock,
              intentStore,
              runtimePath,
            });
            processed += 1;
            if (!isTerminalIssue(record)) break;
          }
        }
        return publicStatus(state, stateStore.isStopRequested());
      } finally {
        await controllerLease.release();
      }
    },

    inspect() {
      const state = stateStore.load();
      return publicStatus(state, stateStore.isStopRequested());
    },

    async inspectQueue() {
      const state = stateStore.load();
      const readyIssues = await github.listReadyIssues();
      const readyIssueNumbers = readyIssues
        .map((issue) => validateReadyIssue(issue).number)
        .filter((number) => !state.issues[number])
        .sort((left, right) => left - right);
      if (typeof github.auditApprovedQueue !== "function") {
        return {
          queueComplete: readyIssueNumbers.length === 0,
          readyIssueNumbers,
          closedIssueNumbers: [],
          nonMergeableIssueNumbers: [],
          unresolvedIssueNumbers: [],
        };
      }
      return classifyQueueAudit({
        audit: await github.auditApprovedQueue(),
        issueRecords: state.issues,
        readyIssueNumbers,
      });
    },

    async requestStop() {
      await stateStore.requestStop();
      const controllerLease = await stateStore.acquireControllerLease({
        ifActiveReturnNull: true,
      });
      if (!controllerLease) {
        return publicStatus(stateStore.load(), true);
      }
      try {
        const state = stateStore.load();
        const resumable = Object.values(state.issues).filter(
          (issue) => !isTerminalIssue(issue),
        );
        if (resumable.length > 1) {
          throw new Error("Ralph state contains multiple resumable issues");
        }
        if (resumable.length === 1) {
          await reconcileRequestedStop({
            record: resumable[0],
            state,
            stateStore,
            workspace,
            worker,
            verifier,
            lifecycle,
            intentStore,
          });
        }
        return publicStatus(state, true);
      } finally {
        await controllerLease.release();
      }
    },
  };
}
