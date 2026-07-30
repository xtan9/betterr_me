import fs from "node:fs";
import path from "node:path";

function expectedIssueBranch(issueNumber) {
  return `codex/issue-${issueNumber}`;
}

function assertManagedBranch(issueNumber, branch) {
  const expected = expectedIssueBranch(issueNumber);
  if (branch !== expected) {
    throw new Error(
      `refusing local cleanup for unexpected branch ${branch ?? "<missing>"}; expected ${expected}`,
    );
  }
}

function assertManagedPath(worktreeRoot, worktreePath) {
  const resolvedRoot = `${path.resolve(worktreeRoot)}${path.sep}`;
  const resolvedWorktree = path.resolve(worktreePath);
  if (!resolvedWorktree.startsWith(resolvedRoot)) {
    throw new Error(`refusing local cleanup outside ${worktreeRoot}`);
  }
  return resolvedWorktree;
}

async function localBranchExists(repositoryRoot, branch, git) {
  try {
    await git([
      "-C",
      repositoryRoot,
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]);
    return true;
  } catch (error) {
    if (error?.result?.code === 1) return false;
    throw error;
  }
}

export function activeIssueWorktreePath(worktreeRoot) {
  return path.join(worktreeRoot, "current");
}

export async function recoverPreservationCommit({
  worktreePath,
  baseSha,
  expectedSubject,
  git,
}) {
  const head = (
    await git(["-C", worktreePath, "rev-parse", "HEAD"])
  ).stdout.trim();
  if (head === baseSha) return null;

  const status = (
    await git(["-C", worktreePath, "status", "--porcelain"])
  ).stdout.trim();
  const parent = (
    await git(["-C", worktreePath, "rev-parse", `${head}^`])
  ).stdout.trim();
  const subject = (
    await git(["-C", worktreePath, "log", "-1", "--format=%s"])
  ).stdout.trim();
  if (status || parent !== baseSha || subject !== expectedSubject) {
    throw new Error(
      "failed-attempt branch history changed outside the preservation transaction",
    );
  }

  const changedFiles = (
    await git([
      "-C",
      worktreePath,
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      baseSha,
      head,
    ])
  ).stdout
    .split("\0")
    .filter(Boolean);
  if (changedFiles.length === 0) {
    throw new Error("preservation commit contains no changes");
  }
  return { failureCommit: head, changedFiles };
}

export async function cleanupIssueCheckout({
  repositoryRoot,
  worktreeRoot,
  issueNumber,
  issueState,
  recoveryWorktreePath,
  expectedRecoveryHead,
  beforeWorktreeRemove,
  git,
}) {
  if (!issueState?.branch && !issueState?.worktreePath) {
    return { worktreeRemoved: false, branchDeleted: false };
  }
  assertManagedBranch(issueNumber, issueState.branch);

  let cleanupWorktreePath = issueState.worktreePath;
  let expectedHead = issueState.commit;
  if (
    !cleanupWorktreePath &&
    recoveryWorktreePath &&
    expectedRecoveryHead &&
    fs.existsSync(recoveryWorktreePath)
  ) {
    const candidatePath = assertManagedPath(worktreeRoot, recoveryWorktreePath);
    const candidateBranch = (
      await git(["-C", candidatePath, "branch", "--show-current"])
    ).stdout.trim();
    if (candidateBranch !== issueState.branch) {
      throw new Error(
        `refusing recovered cleanup for ${candidatePath}; it is on ${candidateBranch || "detached HEAD"}`,
      );
    }
    cleanupWorktreePath = candidatePath;
    expectedHead = expectedRecoveryHead;
  }

  let worktreeRemoved = false;
  if (cleanupWorktreePath) {
    const worktreePath = assertManagedPath(worktreeRoot, cleanupWorktreePath);
    if (fs.existsSync(worktreePath)) {
      const branch = (
        await git(["-C", worktreePath, "branch", "--show-current"])
      ).stdout.trim();
      if (branch !== issueState.branch) {
        throw new Error(`refusing to remove ${worktreePath}; it is on ${branch}`);
      }
      const status = (
        await git(["-C", worktreePath, "status", "--porcelain"])
      ).stdout.trim();
      if (status) {
        throw new Error(`refusing to remove dirty worktree ${worktreePath}`);
      }
      if (expectedHead) {
        const head = (
          await git(["-C", worktreePath, "rev-parse", "HEAD"])
        ).stdout.trim();
        if (head !== expectedHead) {
          throw new Error(`refusing to remove ${worktreePath}; HEAD changed`);
        }
      }
      await beforeWorktreeRemove?.(worktreePath);
      await git([
        "-C",
        repositoryRoot,
        "worktree",
        "remove",
        worktreePath,
      ]);
      worktreeRemoved = true;
    }
  }

  let branchDeleted = false;
  if (await localBranchExists(repositoryRoot, issueState.branch, git)) {
    await git([
      "-C",
      repositoryRoot,
      "branch",
      "--delete",
      "--force",
      issueState.branch,
    ]);
    branchDeleted = true;
  }
  await git(["-C", repositoryRoot, "worktree", "prune"]);
  return { worktreeRemoved, branchDeleted };
}

export async function parkFailedIssueCheckout({
  repositoryRoot,
  worktreeRoot,
  issueNumber,
  issueState,
  git,
}) {
  assertManagedBranch(issueNumber, issueState?.branch);
  const activePath = activeIssueWorktreePath(worktreeRoot);
  const recordedPath = assertManagedPath(worktreeRoot, issueState?.worktreePath);
  const parkedPath = path.join(worktreeRoot, "parked", `issue-${issueNumber}`);
  assertManagedPath(worktreeRoot, parkedPath);

  if (!fs.existsSync(recordedPath) && fs.existsSync(parkedPath)) {
    return parkedPath;
  }
  if (path.resolve(recordedPath) !== path.resolve(activePath)) {
    return recordedPath;
  }
  if (!fs.existsSync(recordedPath)) {
    throw new Error(`cannot park missing worktree ${recordedPath}`);
  }
  if (fs.existsSync(parkedPath)) {
    throw new Error(`parked worktree collision at ${parkedPath}`);
  }
  const branch = (
    await git(["-C", recordedPath, "branch", "--show-current"])
  ).stdout.trim();
  if (branch !== issueState.branch) {
    throw new Error(`refusing to park ${recordedPath}; it is on ${branch}`);
  }

  fs.mkdirSync(path.dirname(parkedPath), { recursive: true });
  await git([
    "-C",
    repositoryRoot,
    "worktree",
    "move",
    recordedPath,
    parkedPath,
  ]);
  return parkedPath;
}
