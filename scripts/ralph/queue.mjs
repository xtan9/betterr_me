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

  for (const completedIssue of state.completed) {
    assertIssueNumber(completedIssue, "completed issue");
    if (!issueNumbers.has(completedIssue)) {
      throw new Error(`progress references unknown issue #${completedIssue}`);
    }
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

  if (command === "gate") {
    const iteration = readJson(getOption(args, "--input"));
    process.stdout.write(`${JSON.stringify(evaluateIteration(iteration))}\n`);
    return;
  }

  throw new Error("usage: queue.mjs <next|gate> [options]");
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
