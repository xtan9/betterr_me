import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_VERIFICATION_TIMEOUT_SECONDS = 3600;

function assertIssueNumber(value, context) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer`);
  }
}

export function validateQueueState(queue, state) {
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error("queue must contain at least one issue");
  }

  if (!state || !Array.isArray(state.completed)) {
    throw new Error("progress must contain a completed array");
  }

  const issueNumbers = new Set();
  for (const issue of queue) {
    assertIssueNumber(issue.issueNumber, "issueNumber");
    if (issueNumbers.has(issue.issueNumber)) {
      throw new Error(`queue contains duplicate issue #${issue.issueNumber}`);
    }
    issueNumbers.add(issue.issueNumber);

    if (!Array.isArray(issue.blockers)) {
      throw new Error(`issue #${issue.issueNumber} must contain a blockers array`);
    }
  }

  for (const issue of queue) {
    for (const blocker of issue.blockers) {
      assertIssueNumber(blocker, `blocker for issue #${issue.issueNumber}`);
      if (!issueNumbers.has(blocker)) {
        throw new Error(
          `issue #${issue.issueNumber} references unknown blocker #${blocker}`,
        );
      }
    }
  }

  const seenCompleted = new Set();
  for (const completedIssue of state.completed) {
    assertIssueNumber(completedIssue, "completed issue");
    if (!issueNumbers.has(completedIssue)) {
      throw new Error(`progress references unknown issue #${completedIssue}`);
    }
    if (seenCompleted.has(completedIssue)) {
      throw new Error(`duplicate completed issue #${completedIssue}`);
    }
    const completedQueueIssue = queue.find(
      (issue) => issue.issueNumber === completedIssue,
    );
    for (const blocker of completedQueueIssue.blockers) {
      if (!seenCompleted.has(blocker)) {
        throw new Error(
          `completed issue #${completedIssue} appears before blocker #${blocker}`,
        );
      }
    }
    seenCompleted.add(completedIssue);
  }
}

export function selectNextIssue(queue, state) {
  validateQueueState(queue, state);

  const completed = new Set(state.completed);
  const incomplete = queue.filter((issue) => !completed.has(issue.issueNumber));
  if (incomplete.length === 0) {
    return null;
  }

  const nextIssue = incomplete.find(
    (issue) =>
      !isIssueParked(state.issues?.[String(issue.issueNumber)]) &&
      issue.blockers.every((blocker) => completed.has(blocker)),
  );

  if (!nextIssue) {
    const waiting = incomplete
      .map((issue) => `#${issue.issueNumber}`)
      .join(", ");
    throw new Error(`no runnable issues remain; blocked queue: ${waiting}`);
  }

  return nextIssue;
}

export function selectNextLiveIssueStatus(queue, state, liveIssues, actor) {
  validateQueueState(queue, state);
  const completed = new Set(state.completed);
  const incomplete = queue.filter((issue) => !completed.has(issue.issueNumber));
  if (incomplete.length === 0) return { status: "complete" };

  const frontier = incomplete.filter(
    (issue) =>
      !isIssueParked(state.issues?.[String(issue.issueNumber)]) &&
      issue.blockers.every((blocker) => completed.has(blocker)),
  );
  if (frontier.length === 0) {
    return {
      status: "blocked",
      issueNumbers: incomplete.map((issue) => issue.issueNumber),
    };
  }

  const liveByNumber = new Map(
    liveIssues.map((issue) => [issue.issueNumber, issue]),
  );

  const selected = frontier.find((issue) => {
      const live = liveByNumber.get(issue.issueNumber);
      if (!live || live.state !== "OPEN") {
        return false;
      }
      if (!live.labels.includes("ready-for-agent")) {
        return false;
      }
      return (
        live.assignees.length === 0 ||
        live.assignees.every((assignee) => assignee === actor)
      );
    });
  if (selected) return { status: "selected", issue: selected };
  return {
    status: "unavailable",
    issueNumbers: frontier.map((issue) => issue.issueNumber),
  };
}

export function selectNextLiveIssue(queue, state, liveIssues, actor) {
  const result = selectNextLiveIssueStatus(queue, state, liveIssues, actor);
  return result.status === "selected" ? result.issue : null;
}

export function chooseClaimWinner(claims, now = new Date()) {
  const nowTime = now.getTime();
  return (
    claims
      .filter((claim) => new Date(claim.expiresAt).getTime() > nowTime)
      .sort((left, right) => {
        const timeDifference =
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return timeDifference || left.commentId - right.commentId;
      })[0] ?? null
  );
}

export const ISSUE_STAGES = [
  "selected",
  "claimed",
  "worktree-ready",
  "implementing",
  "implemented",
  "verified",
  "committed",
  "pushed",
  "pr-open",
  "checks-passed",
  "pr-repairing",
  "manual-review",
  "failure-publishing",
  "parking",
  "failed",
  "merged",
];

export function isIssueParked(issueState) {
  return ["manual-review", "failed"].includes(issueState?.stage);
}

export function isIssueActive(issueState) {
  return Boolean(issueState?.stage) &&
    issueState.stage !== "merged" &&
    !isIssueParked(issueState);
}

export function issueStageAtLeast(issueState, stage) {
  const currentIndex = ISSUE_STAGES.indexOf(issueState?.stage);
  const targetIndex = ISSUE_STAGES.indexOf(stage);
  if (currentIndex === -1 || targetIndex === -1) {
    throw new Error(`unknown issue stage ${issueState?.stage ?? stage}`);
  }
  return currentIndex >= targetIndex;
}

export function transitionIssue(state, issueNumber, nextStage, patch, now) {
  assertIssueNumber(issueNumber, "issueNumber");
  const nextIndex = ISSUE_STAGES.indexOf(nextStage);
  if (nextIndex === -1) {
    throw new Error(`unknown issue stage ${nextStage}`);
  }

  const current = state.issues?.[String(issueNumber)];
  if (current) {
    const currentIndex = ISSUE_STAGES.indexOf(current.stage);
    if (nextIndex < currentIndex) {
      throw new Error(`cannot move issue #${issueNumber} backward`);
    }
  }

  return {
    ...state,
    issues: {
      ...(state.issues ?? {}),
      [String(issueNumber)]: {
        ...(current ?? {}),
        ...patch,
        stage: nextStage,
        updatedAt: now,
      },
    },
    updatedAt: now,
  };
}

export function selectRecoveryBase(recordedBase, currentBase, worktreeExists) {
  if (worktreeExists) {
    if (!recordedBase) {
      throw new Error("existing worktree has no recorded base");
    }
    return recordedBase;
  }
  return currentBase;
}

export function failureDisposition(stage, pullRequestMerged, failureKind) {
  if (pullRequestMerged) return "merged";
  if (
    [
      "kill-switch",
      "timeout",
      "network",
      "rate-limit",
      "check-poll",
      "pending-pr-repair",
    ].includes(failureKind)
  ) {
    return "interrupted";
  }
  if (["safety", "infrastructure"].includes(failureKind)) {
    return "fatal";
  }
  if (
    ["pr-open", "checks-passed", "pr-repairing", "manual-review"].includes(
      stage,
    )
  ) {
    return "manual-review";
  }
  return "failed";
}

export function shouldPreserveBlockedPullRequestRepair(stage, failureKind) {
  return (
    stage === "pr-repairing" &&
    ["ticket-infrastructure", "review-ticket-infrastructure"].includes(failureKind)
  );
}

const SENSITIVE_PATHS = [
  /^\.github\/(?:workflows|actions)\//,
  /^(?:\.circleci\/|\.gitlab-ci\.|azure-pipelines\.|\.buildkite\/|ci\/)/,
  /^scripts\/ralph\//,
  /^scripts\/(?:ci|build|release|deploy)\//,
  /(?:^|\/)migrations?\//,
  /\.sql$/,
  /(?:^|\/)(?:security|secure|crypto|cryptography)(?:\/|[-.])/,
  /(?:^|\/)(?:schema|schemas)(?:\/|[-.])/,
  /(?:^|\/)(?:auth|oauth|authentication|authorization)(?:\/|[-.])/,
  /(?:^|\/)(?:password|passkey|api[-_]?keys?|session|csrf|mfa|2fa)(?:\/|[-.])/,
  /(?:^|\/)(?:admin|administration|administrative|privileged)(?:\/|[-.])/,
  /(?:^|\/)(?:secret|token|credential|permission)s?(?:\/|[-.])/,
  /(?:^|\/)(?:billing|finance|financial|payment)s?(?:\/|[-.])/,
  /(?:^|\/)(?:stripe|paypal|paddle)(?:\/|[-.])/,
  /(?:^|\/)(?:delete|deletion|purge|erase|destroy|truncate|drop)(?:\/|[-.])/,
  /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?)$/,
  /(?:^|\/)(?:config|configuration)\//,
  /^(?:tsconfig(?:\.[^/]+)?\.json|vercel\.json|turbo\.json)$/,
  /(?:^|\/)[^/]+\.config\.(?:js|cjs|mjs|ts|json)$/,
  /^(?:dockerfile|docker-compose\.[^/]+|netlify\.toml|fly\.toml|render\.yaml|railway\.json|wrangler\.toml|serverless\.ya?ml|jenkinsfile)$/,
  /\.ya?ml$/,
  /^\.[^/]+$/,
  /(?:^|\/)\.env(?:\.|$)/,
];
const ORDINARY_CHANGE_PATH = /^(?:app|components|lib|tests)\//;
const HIGH_RISK_WORDS =
  /\b(auth|oauth|authentication|authorization|authorize|security|password|passkey|api[- ]?keys?|credential|secret|token|permission|privileged|admin|administration|migration|schema|finance|financial|billing|payment|stripe|paypal|paddle|destructive|delete|deletion|purge|erase|destroy|truncate|drop|dependency|dependencies|compiler|configuration|deployment|deploy|continuous integration|ci)\b/i;

export function classifyChangeRisk(paths, issue = {}) {
  const normalizedPaths = paths
    .map((file) => file.replaceAll("\\", "/").toLowerCase())
    .sort();
  const sensitivePaths = normalizedPaths.filter(
    (file) => SENSITIVE_PATHS.some((pattern) => pattern.test(file)),
  );
  const nonOrdinaryPaths = normalizedPaths.filter(
    (file) => !ORDINARY_CHANGE_PATH.test(file),
  );
  const issueText = `${issue.title ?? ""}\n${issue.whatToBuild ?? ""}`;
  const issueRisk = HIGH_RISK_WORDS.test(issueText);

  if (
    normalizedPaths.length === 0 ||
    nonOrdinaryPaths.length > 0 ||
    sensitivePaths.length > 0 ||
    issueRisk
  ) {
    return {
      level: "high",
      reasons: [
        ...(normalizedPaths.length === 0 ? ["no changed files to classify"] : []),
        ...nonOrdinaryPaths.map(
          (file) => `path is outside ordinary application code: ${file}`,
        ),
        ...sensitivePaths.map((file) => `sensitive change path: ${file}`),
        ...(issueRisk ? ["high-risk issue language"] : []),
      ],
    };
  }

  return { level: "low", reasons: [] };
}

export function evaluateMergeGate(gate) {
  const fail = (reason) => ({ canMerge: false, reason });
  if (gate.mode !== "AutoMerge") {
    return fail(`mode is ${gate.mode}`);
  }
  if (gate.risk !== "low") {
    return fail(`change is ${gate.risk} risk`);
  }
  if (gate.ambiguous) {
    return fail("requirements are ambiguous");
  }
  if (!gate.checksPassed) {
    return fail("required checks did not pass");
  }
  if (gate.reviewDecision === "CHANGES_REQUESTED") {
    return fail("review changes were requested");
  }
  if (gate.mergeState !== "CLEAN") {
    return fail(
      gate.mergeState === "DIRTY"
        ? "pull request has conflicts"
        : `pull request merge state is ${gate.mergeState || "unknown"}`,
    );
  }
  if (gate.reviewRequired && gate.reviewDecision !== "APPROVED") {
    return fail("required review approval is missing");
  }
  return { canMerge: true, reason: "all merge gates passed" };
}

export function shouldRetry(failureKind, attempt, maximumAttempts) {
  return (
    ["network", "rate-limit", "check-poll"].includes(failureKind) &&
    attempt < maximumAttempts
  );
}

export function shouldRepairFailure(
  failureKind,
  completedRepairAttempts,
  maximumRepairAttempts,
) {
  return (
    [
      "tests",
      "typecheck",
      "review",
      "review-security",
      "pr-checks",
      "tests-timeout",
      // Backward compatibility for durable gates created before security and
      // controller-safety findings were split into separate kinds.
      "review-safety",
    ].includes(failureKind) &&
    completedRepairAttempts < maximumRepairAttempts
  );
}

export function shouldParkIssueFailure(failureKind) {
  return [
    "tests",
    "typecheck",
    "review",
    "review-nonrepairable",
    "review-security-nonrepairable",
    "review-ticket-infrastructure",
    "pr-checks",
    "tests-timeout",
    "merge-conflict",
    // Legacy repairable product-security gates used this name. Under the old
    // contract, secrets and non-repairable safety findings mapped to `safety`.
    "review-safety",
    "ambiguous",
    "worker-blocked",
    "ticket-infrastructure",
  ].includes(failureKind);
}

export function shouldContinueQueue(status) {
  return ["merged", "awaiting-human", "failed"].includes(status);
}

export function externalRepairDisposition(
  request,
  completedRepairAttempts,
  maximumRepairAttempts,
) {
  if (!request) return "none";
  if (request.controllerManagedExternalGate !== true) return "unsafe";
  return shouldRepairFailure(
    request.failureKind,
    completedRepairAttempts,
    maximumRepairAttempts,
  )
    ? "repair"
    : "exhausted";
}

export function createExternalVerificationGate(request, now, gateId) {
  return {
    gateId,
    status: "repairing",
    controllerManagedExternalGate: true,
    failureKind: request.failureKind,
    stopReason: request.stopReason,
    requestedAt: now,
  };
}

export function externalVerificationReceiptMatches(gate, receipt, treeSha) {
  return Boolean(
    gate?.status === "awaiting-verification" &&
      gate.gateId &&
      gate.treeSha &&
      receipt?.passed === true &&
      receipt.gateId === gate.gateId &&
      receipt.treeSha === gate.treeSha &&
      treeSha === gate.treeSha,
  );
}

export function preserveExternalFailureKind(gate, failureKind) {
  return gate &&
    ["review-security", "review-safety", "safety"].includes(gate.failureKind)
    ? gate.failureKind
    : failureKind;
}

export function workerResultFailureKind(result) {
  if (result?.blockerKind === "infrastructure") return "infrastructure";
  if (result?.blockerKind === "ticket-infrastructure") {
    return "ticket-infrastructure";
  }
  if (result?.blockerKind === "protected-scope") return "worker-blocked";
  if (result?.blockerKind === "safety") return "safety";
  if (result?.ambiguous || result?.blockerKind === "requirements") {
    return "ambiguous";
  }
  return "worker-blocked";
}

export function buildFailedAttemptPullRequestBody({
  issueNumber,
  issueUrl,
  failureKind,
  failureSummary,
  repairAttempts,
}) {
  return `## Delivery classification

- [ ] User-visible product delivery
- [x] Internal, operational, or infrastructure-only change

## Status

**Draft failed attempt — do not merge.** Ralph preserved this branch for supervised recovery after an automated gate stopped the issue.

## Issue

${issueUrl}

## Failure

- Gate: **${failureKind}**
- Repair attempts: **${repairAttempts}**

${failureSummary}

## Recovery

- [ ] Address the blocking finding.
- [ ] Run the full required test and typecheck gates.
- [ ] Complete independent review.
- [ ] Mark this PR ready only after every gate passes.

Closes #${issueNumber}
`;
}

export function reopenIssueForPullRequestRecovery(
  state,
  issueNumber,
  patch,
  now,
) {
  const current = state.issues?.[String(issueNumber)];
  if (
    !current ||
    !["pr-open", "checks-passed", "pr-repairing", "manual-review", "failed"].includes(
      current.stage,
    ) ||
    !current.prNumber ||
    !current.branch
  ) {
    throw new Error(
      `issue #${issueNumber} is not eligible for pull-request recovery`,
    );
  }
  return {
    ...state,
    updatedAt: now,
    issues: {
      ...state.issues,
      [String(issueNumber)]: {
        ...current,
        ...patch,
        stage: "pr-repairing",
        prRecoveryOriginalStage:
          current.prRecoveryOriginalStage ?? current.stage,
        updatedAt: now,
      },
    },
  };
}

export function buildInternalPullRequestBody({
  issueNumber,
  issueUrl,
  summary,
  risk,
}) {
  const safeSummary = neutralizeClosingKeywords(String(summary)).replaceAll(
    "@",
    "@\u200b",
  );
  return `## Delivery classification

- [ ] User-visible product delivery
- [x] Internal, operational, or infrastructure-only change

## Product scope source

${issueUrl}

## Summary

${safeSummary}

## Verification

- Full Vitest suite passed locally.
- No new TypeScript diagnostics beyond the captured baseline.
- Independent Codex review passed.
- Risk classification: **${risk.level}**${risk.reasons.length ? ` — ${risk.reasons.join("; ")}` : ""}.

## Reviewer release-scope check

- [ ] I reconciled every approved user-visible capability in the scope source to a row above.
- [ ] Each mapped file is part of this PR, and each verification is runnable against this delivery.

Closes #${issueNumber}
`;
}

export function neutralizeClosingKeywords(value) {
  return String(value).replace(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?=(?:[\w.-]+\/[\w.-]+)?#\d+)/gi,
    "references ",
  );
}

export function redactCredentialPatterns(value) {
  return String(value)
    .replace(
      /-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
      "[REDACTED]",
    )
    .replace(
      /github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}/g,
      "[REDACTED]",
    );
}

export function recordCheckRetryAttempt(issueState, plan, kind) {
  if (!['controller', 'transient'].includes(kind)) {
    throw new Error(`unsupported check retry kind ${kind}`);
  }
  const attemptField = `${kind}CheckAttempt`;
  const retryField = `${kind}CheckRetry`;
  if (issueState[attemptField]?.fingerprint === plan.fingerprint) {
    return issueState;
  }
  return {
    ...issueState,
    [attemptField]: { fingerprint: plan.fingerprint },
    [retryField]: {
      key: plan.retryKey,
      attempts:
        issueState[retryField]?.key === plan.retryKey
          ? issueState[retryField].attempts + 1
          : 1,
    },
  };
}

export function isPullRequestRecoveryCandidate(issueState) {
  return Boolean(
    issueState?.prNumber &&
      [
        "pr-open",
        "checks-passed",
        "pr-repairing",
        "manual-review",
        "failed",
      ].includes(issueState.stage),
  );
}

export function testVerificationFailureKind(error) {
  if (error?.failureKind === "timeout") return "tests-timeout";
  if (error?.failureKind === "kill-switch") return "kill-switch";
  try {
    const report = JSON.parse(error?.result?.stdout ?? "");
    if (report.numFailedTests > 0 || report.numFailedTestSuites > 0) {
      return "tests";
    }
  } catch {
    // Missing or malformed reporter output is not evidence of a test finding.
  }
  return error?.failureKind ?? "command";
}

export function pullRequestCheckDisposition({
  checksPassed,
  completedRepairAttempts,
  maximumRepairAttempts,
  mode,
  risk,
}) {
  if (!checksPassed) {
    return completedRepairAttempts < maximumRepairAttempts
      ? "repair"
      : "awaiting-human";
  }
  if (mode !== "AutoMerge" || risk !== "low") return "awaiting-human";
  return "merge-gates";
}

export function findDuplicateMigrationPrefixes(paths) {
  const counts = new Map();
  for (const filePath of paths) {
    const match = String(filePath).match(
      /(?:^|\/)supabase\/migrations\/(\d{14})[^/]*\.sql$/,
    );
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([prefix]) => prefix)
    .sort();
}

export function vitestVerificationArguments(vitestPath) {
  return [vitestPath, "run", "--reporter=json", "--maxWorkers=4", "--no-cache"];
}

export function independentReviewClassificationContract() {
  return `Before classifying a requirement as ambiguous or a finding as unrepairable, search the repository's authoritative design, policy, and domain documentation, including applicable AGENTS.md instructions and docs linked from them. A detail omitted from the issue is not ambiguous when established repository policy resolves it.
List every issue, design, policy, and implementation source consulted in evidenceReviewed. For status=findings with blockerKind=requirements or repairable=false, cite the exact repository paths and the unresolved decision in blockingFindings and summary. Passing reviews are exempt because they have no unresolved decision and must keep blockingFindings empty. Do not use repairable=false merely because the issue itself omits a detail, because the first repair is not obvious, or because the defect is security-sensitive.
Candidate changes beyond the approved ticket are repairable scope findings when the one safe repair is to remove or revert those extra changes to the issue base while preserving the in-scope implementation. Classify that case as blockerKind=scope and repairable=true; removing candidate changes does not itself require approval to broaden scope. Do not use blockerKind=scope when completing the ticket requires adding or modifying forbidden scope.
For findings, set blockerKind=code only when every finding is a concrete code or test defect inside the approved scope; set requirements for ambiguity or requirement conflict; set ticket-infrastructure when only ticket-specific verification infrastructure is unavailable but controller and ordinary worker infrastructure are healthy; set infrastructure for controller-wide or ordinary worker-runtime infrastructure failures; set security for a concrete product-code vulnerability whose repair stays inside the approved ticket scope; set scope for the removable candidate-diff case above; and set safety for secrets exposure, forbidden paths, scope that cannot be restored solely by removing or reverting candidate changes, controller-integrity concerns, or policy concerns that must stop the whole run. Use the most restrictive applicable kind (safety, then infrastructure, then ticket-infrastructure, then requirements, then scope, then security, then code).
Set repairable=true only when every finding is concrete, its exact repair is clear, and it can be safely repaired without broadening the approved ticket scope. Removing or reverting extra candidate changes to restore the approved scope qualifies. Product security defects may be repairable; unresolved non-repairable product security findings are preserved in a blocked draft PR. Always set repairable=false for safety findings, pass results, missing infrastructure, ambiguity, requirement conflicts, or any finding whose safe repair requires judgment outside the ticket.
Reserve repairable=false for a genuine unresolved product decision with materially different valid outcomes, secrets or controller-integrity risk, missing infrastructure, forbidden scope that cannot be restored solely by removing or reverting candidate changes, or a repair that necessarily exceeds the approved ticket scope. A concrete defect with an established repository policy is repairable.`;
}

export function reviewFailureKind(review) {
  if (review?.blockerKind === "infrastructure") return "infrastructure";
  if (review?.blockerKind === "ticket-infrastructure") {
    return "review-ticket-infrastructure";
  }
  if (review?.blockerKind === "security") {
    return review.repairable === true
      ? "review-security"
      : "review-security-nonrepairable";
  }
  if (review?.blockerKind === "scope") {
    return review.repairable === true ? "review" : "safety";
  }
  if (review?.blockerKind === "safety") return "safety";
  if (review?.blockerKind === "requirements") return "ambiguous";
  if (review?.blockerKind === "code") {
    return review.repairable === true ? "review" : "review-nonrepairable";
  }
  return "safety";
}

export function independentReviewFailureKind(review) {
  if (
    review?.status !== "findings" ||
    !Array.isArray(review.blockingFindings) ||
    review.blockingFindings.length === 0 ||
    !review.blockingFindings.every(
      (finding) => typeof finding === "string" && finding.trim().length > 0,
    ) ||
    review.blockerKind === "none" ||
    typeof review.repairable !== "boolean"
  ) {
    return "safety";
  }
  if (
    [
      "requirements",
      "infrastructure",
      "ticket-infrastructure",
      "safety",
    ].includes(review.blockerKind) &&
    review.repairable !== false
  ) {
    return "safety";
  }
  return reviewFailureKind(review);
}

export function frameInertData(label, payload) {
  let marker;
  do {
    marker = `RALPH_${label}_${crypto.randomBytes(24).toString("hex")}`;
  } while (payload.includes(marker));
  return { marker, framed: `${marker}\n${payload}\n${marker}` };
}

export function buildOvernightSummary(state) {
  const summary = {
    runId: state.runId,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    merged: [],
    awaitingHuman: [],
    failed: [],
    inProgress: [],
  };

  for (const [issueNumberText, issue] of Object.entries(state.issues ?? {})) {
    const item = {
      issueNumber: Number(issueNumberText),
      ...(issue.prNumber ? { prNumber: issue.prNumber } : {}),
    };
    if (issue.stage === "merged") {
      summary.merged.push(item);
    } else if (issue.stage === "manual-review" || issue.stage === "pr-open") {
      summary.awaitingHuman.push({
        ...item,
        reason: issue.stopReason ?? "awaiting human review",
      });
    } else if (issue.stage === "failed") {
      summary.failed.push({ ...item, reason: issue.stopReason ?? "failed" });
    } else {
      summary.inProgress.push({ ...item, stage: issue.stage });
    }
  }

  return summary;
}

function normalizeTypeScriptDiagnostic(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  if (
    /^WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted \(os error 1\)$/.test(
      trimmed,
    )
  ) {
    return null;
  }

  const located = trimmed.match(/^(.*)\(\d+,\d+\): (error TS\d+: .*)$/);
  if (located) {
    return `${located[1]} | ${located[2]}`;
  }

  if (/^error TS\d+: /.test(trimmed)) {
    return `GLOBAL | ${trimmed}`;
  }

  return `OUTPUT | ${trimmed}`;
}

function countDiagnostics(lines) {
  const counts = new Map();
  for (const line of lines) {
    const diagnostic = normalizeTypeScriptDiagnostic(line);
    if (diagnostic) {
      counts.set(diagnostic, (counts.get(diagnostic) ?? 0) + 1);
    }
  }
  return counts;
}

export function findNewTypeScriptDiagnostics(beforeLines, afterLines) {
  const before = countDiagnostics(beforeLines);
  const after = countDiagnostics(afterLines);
  const additions = [];

  for (const [diagnostic, afterCount] of after) {
    const addedCount = afterCount - (before.get(diagnostic) ?? 0);
    for (let index = 0; index < addedCount; index += 1) {
      additions.push(diagnostic);
    }
  }

  return additions.sort();
}

export function analyzeTypeScriptRun(lines, exitCode) {
  const signals = [...countDiagnostics(lines).entries()]
    .flatMap(([signal, count]) => Array.from({ length: count }, () => signal))
    .sort();
  const hasDiagnostic = signals.some(
    (signal) =>
      signal.startsWith("GLOBAL | error TS") || signal.includes(" | error TS"),
  );

  return {
    accountedFor: exitCode === 0 || hasDiagnostic,
    signals,
  };
}

export function evaluateIteration(iteration) {
  const fail = (reason) => ({ canAdvance: false, reason });
  const result = iteration.agentResult;
  const selected = iteration.selectedIssueNumber;

  if (!result || result.status !== "completed") {
    return fail(`agent reported ${result?.status ?? "no status"}`);
  }
  if (result.issueNumber !== selected) {
    return fail(`agent reported issue #${result.issueNumber}`);
  }
  if (!iteration.branchMatches) {
    return fail("agent left the integration branch");
  }
  if (!iteration.directParentMatches) {
    return fail("new commit does not directly extend the starting commit");
  }
  if (!iteration.headMatches) {
    return fail("final HEAD does not match the verified commit");
  }
  if (iteration.beforeSha === iteration.afterSha) {
    return fail("did not create a commit");
  }
  if (iteration.commitCount !== 1) {
    return fail(`created ${iteration.commitCount} commits`);
  }
  if (!iteration.worktreeClean) {
    return fail("worktree is not clean");
  }
  const issueReference = new RegExp(`(^|\\D)#${selected}(?!\\d)`);
  if (!issueReference.test(iteration.commitSubject ?? "")) {
    return fail(`commit subject does not reference #${selected}`);
  }
  if (result.testsPassed !== true) {
    return fail("did not report passing tests");
  }
  if (result.reviewCompleted !== true) {
    return fail("did not report a completed review");
  }
  if (iteration.verificationExitCode !== 0) {
    return fail("independent test suite failed");
  }
  if (
    !iteration.independentReview ||
    iteration.independentReview.status !== "pass" ||
    !Array.isArray(iteration.independentReview.blockingFindings) ||
    iteration.independentReview.blockingFindings.length > 0
  ) {
    return fail("independent code review did not pass");
  }

  return { canAdvance: true, reason: "completed" };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function getOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    throw new Error(`missing required option ${name}`);
  }
  return args[index + 1];
}

function runCli(args) {
  const command = args[0];
  if (command === "next") {
    const queue = readJson(getOption(args, "--queue"));
    const progress = readJson(getOption(args, "--progress"));
    const issue = selectNextIssue(queue, progress);
    process.stdout.write(
      `${JSON.stringify(issue ? { complete: false, issue } : { complete: true })}\n`,
    );
    return;
  }

  if (command === "live-next") {
    const queue = readJson(getOption(args, "--queue"));
    const progress = readJson(getOption(args, "--progress"));
    const liveIssues = readJson(getOption(args, "--live"));
    const actor = getOption(args, "--actor");
    const issue = selectNextLiveIssue(queue, progress, liveIssues, actor);
    process.stdout.write(
      `${JSON.stringify(issue ? { complete: false, issue } : { complete: true })}\n`,
    );
    return;
  }

  if (command === "transition") {
    const state = readJson(getOption(args, "--state"));
    const issueNumber = Number.parseInt(getOption(args, "--issue"), 10);
    const stage = getOption(args, "--stage");
    const patch = readJson(getOption(args, "--patch"));
    const now = getOption(args, "--now");
    process.stdout.write(
      `${JSON.stringify(transitionIssue(state, issueNumber, stage, patch, now))}\n`,
    );
    return;
  }

  if (command === "claim-winner") {
    const claims = readJson(getOption(args, "--claims"));
    const now = new Date(getOption(args, "--now"));
    process.stdout.write(`${JSON.stringify(chooseClaimWinner(claims, now))}\n`);
    return;
  }

  if (command === "risk") {
    const paths = readJson(getOption(args, "--paths"));
    const issue = readJson(getOption(args, "--issue"));
    process.stdout.write(`${JSON.stringify(classifyChangeRisk(paths, issue))}\n`);
    return;
  }

  if (command === "merge-gate") {
    const gate = readJson(getOption(args, "--input"));
    process.stdout.write(`${JSON.stringify(evaluateMergeGate(gate))}\n`);
    return;
  }

  if (command === "summary") {
    const state = readJson(getOption(args, "--state"));
    process.stdout.write(`${JSON.stringify(buildOvernightSummary(state))}\n`);
    return;
  }

  if (command === "gate") {
    const iteration = readJson(getOption(args, "--input"));
    process.stdout.write(`${JSON.stringify(evaluateIteration(iteration))}\n`);
    return;
  }

  if (command === "compare-diagnostics") {
    const before = fs
      .readFileSync(path.resolve(getOption(args, "--before")), "utf8")
      .split(/\r?\n/);
    const after = fs
      .readFileSync(path.resolve(getOption(args, "--after")), "utf8")
      .split(/\r?\n/);
    process.stdout.write(
      `${JSON.stringify({ newDiagnostics: findNewTypeScriptDiagnostics(before, after) })}\n`,
    );
    return;
  }

  if (command === "analyze-diagnostics") {
    const lines = fs
      .readFileSync(path.resolve(getOption(args, "--file")), "utf8")
      .split(/\r?\n/);
    const exitCode = Number.parseInt(getOption(args, "--exit-code"), 10);
    if (!Number.isInteger(exitCode) || exitCode < 0) {
      throw new Error("--exit-code must be a non-negative integer");
    }
    process.stdout.write(
      `${JSON.stringify(analyzeTypeScriptRun(lines, exitCode))}\n`,
    );
    return;
  }

  throw new Error(
    "usage: queue.mjs <next|live-next|transition|claim-winner|risk|merge-gate|summary|gate|compare-diagnostics|analyze-diagnostics> [options]",
  );
}

export function executeQueueCli(
  args,
  writeError = (message) => process.stderr.write(message),
) {
  try {
    runCli(args);
    return 0;
  } catch (error) {
    writeError(`${error.message}\n`);
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  process.exitCode = executeQueueCli(process.argv.slice(2));
}
