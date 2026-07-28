import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const nextIssue = incomplete.find((issue) =>
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

export function selectNextLiveIssue(queue, state, liveIssues, actor) {
  validateQueueState(queue, state);
  const completed = new Set(state.completed);
  const liveByNumber = new Map(
    liveIssues.map((issue) => [issue.issueNumber, issue]),
  );

  return (
    queue.find((issue) => {
      if (
        completed.has(issue.issueNumber) ||
        !issue.blockers.every((blocker) => completed.has(blocker))
      ) {
        return false;
      }

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
    }) ?? null
  );
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

const ISSUE_STAGES = [
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
  "manual-review",
  "merged",
  "failed",
];

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

const HIGH_RISK_PATHS = [
  /^scripts\/ralph\//,
  /^\.github\//,
  /^supabase\/migrations\//,
  /^agents\.md$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
  /(^|\/)(vitest|eslint|next|playwright)\.config\./,
  /(^|\/)oauth(\/|$)/,
  /(^|\/)auth(\/|$)/,
  /(^|\/)(permission|credential|secret|token)s?(\/|\.)/,
  /(^|\/)middleware\.[^/]+$/,
  /(^|\/)instrumentation\.[^/]+$/,
];
const HIGH_RISK_WORDS =
  /\b(auth|oauth|authorization|credential|secret|token|permission|migration|schema|finance|payment|destructive|delete|deletion)\b/i;

export function classifyChangeRisk(paths, issue = {}) {
  const normalizedPaths = paths.map((file) => file.replaceAll("\\", "/").toLowerCase());
  const riskyPaths = normalizedPaths.filter((file) =>
    HIGH_RISK_PATHS.some((pattern) => pattern.test(file)),
  );
  const issueText = `${issue.title ?? ""}\n${issue.whatToBuild ?? ""}`;
  const issueRisk = HIGH_RISK_WORDS.test(issueText);

  if (riskyPaths.length > 0 || issueRisk) {
    return {
      level: "high",
      reasons: [
        ...riskyPaths.map((file) => `high-risk path: ${file}`),
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

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
