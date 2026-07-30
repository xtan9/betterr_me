import fs from "node:fs";
import path from "node:path";
import { assertPathWithin, runGit as git } from "./test-primitives.mjs";

function readState(config) {
  return JSON.parse(fs.readFileSync(config.externalStatePath, "utf8"));
}

function writeState(config, state) {
  const temporaryPath = `${config.externalStatePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporaryPath, config.externalStatePath);
}

function changeState(config, change) {
  const state = readState(config);
  const result = change(state);
  writeState(config, state);
  return result;
}

function appendEvent(config, event) {
  fs.appendFileSync(config.eventLogPath, `${JSON.stringify(event)}\n`);
}

function resolveRemoteHead(config, headBranch, allowMissing = false) {
  const result = git(
    config.remotePath,
    ["rev-parse", "--verify", `refs/heads/${headBranch}`],
    allowMissing,
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function normalizedPath(filePath) {
  const normalized = path.normalize(fs.realpathSync.native(filePath));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function commitObjectShas(repositoryPath) {
  return git(repositoryPath, [
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objectname) %(objecttype)",
  ]).stdout
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.endsWith(" commit"))
    .map((line) => line.split(" ")[0])
    .sort();
}

function assertWorkerCheckout(config, input) {
  const expectedPath = path.join(config.runtimePath, "worktrees", "current");
  if (
    normalizedPath(input.worktreePath) !== normalizedPath(expectedPath) ||
    input.baseSha !== config.mainSha
  ) {
    throw new Error("worker received the wrong checkout generation");
  }
  const matchingWorktree = git(config.repositoryPath, [
    "worktree",
    "list",
    "--porcelain",
  ]).stdout
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(
      block.split(/\r?\n/).map((line) => {
        const separator = line.indexOf(" ");
        return separator < 0
          ? [line, true]
          : [line.slice(0, separator), line.slice(separator + 1)];
      }),
    ))
    .find(
      (entry) =>
        typeof entry.worktree === "string" &&
        normalizedPath(entry.worktree) === normalizedPath(expectedPath),
    );
  if (
    !matchingWorktree ||
    matchingWorktree.HEAD !== config.mainSha ||
    matchingWorktree.branch !== `refs/heads/codex/issue-${input.issue.number}`
  ) {
    throw new Error("worker checkout is not the expected linked worktree");
  }
}

function assertNoCheckoutBeforeClaim(config) {
  const worktreeCount = (
    git(config.repositoryPath, ["worktree", "list", "--porcelain"])
      .stdout.match(/^worktree /gm) ?? []
  ).length;
  if (worktreeCount !== 1) {
    throw new Error("Ralph created a worktree before claiming the issue");
  }
  const localIssueBranches = git(config.repositoryPath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/codex/issue-",
  ]).stdout.trim();
  if (localIssueBranches) {
    throw new Error("Ralph created an issue branch before claiming the issue");
  }
  if (fs.existsSync(path.join(config.runtimePath, "worktrees", "current"))) {
    throw new Error("Ralph populated the reusable worktree before claiming");
  }
}

function assertExpectedCandidate(config, candidateTreeSha) {
  const expectedNames = config.expectedChanges
    .map((change) => `${change.status}\t${change.path}`)
    .sort();
  const actualNames = git(config.repositoryPath, [
    "diff-tree",
    "--no-commit-id",
    "--name-status",
    "-r",
    config.mainSha,
    candidateTreeSha,
  ]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `candidate diff mismatch: ${JSON.stringify(actualNames)} != ${JSON.stringify(expectedNames)}`,
    );
  }

  for (const change of config.expectedChanges) {
    const entry = git(config.repositoryPath, [
      "ls-tree",
      candidateTreeSha,
      "--",
      change.path,
    ]).stdout.trim();
    if (!entry.startsWith(`${change.mode} blob `)) {
      throw new Error(`unexpected tree entry for ${change.path}: ${entry}`);
    }
    const content = git(config.repositoryPath, [
      "show",
      `${candidateTreeSha}:${change.path}`,
    ]).stdout;
    if (content !== change.content) {
      throw new Error(`unexpected content for ${change.path}`);
    }
  }
}

export function createTestAdapters(config) {
  const github = {
    async listReadyIssues() {
      return structuredClone(config.issues);
    },
    async claimIssue(input) {
      assertNoCheckoutBeforeClaim(config);
      if (
        !config.issues.some((issue) => issue.number === input.issueNumber) ||
        typeof input.operationId !== "string" ||
        !input.operationId.includes(`issue-${input.issueNumber}`)
      ) {
        throw new Error("Ralph claimed an issue outside the ready generation");
      }
      appendEvent(config, {
        kind: "issue-claimed",
        issueNumber: input.issueNumber,
        operationId: input.operationId,
      });
      return changeState(config, (state) => {
        state.claimRequests.push(input);
        if (!state.claims.some((claim) => claim.operationId === input.operationId)) {
          state.claims.push(input);
        }
        return { claimed: true };
      });
    },
    async findPullRequest(input) {
      return (
        readState(config).pullRequests.find(
          (pullRequest) => pullRequest.headBranch === input.headBranch,
        ) ?? null
      );
    },
    async createDraftPullRequest(input) {
      if (!config.issues.some((issue) => issue.number === input.issueNumber)) {
        throw new Error("Ralph published the wrong issue");
      }
      const currentWorktree = path.join(config.runtimePath, "worktrees", "current");
      if (!fs.existsSync(currentWorktree)) {
        throw new Error("Ralph cleaned the worktree before creating the PR");
      }
      const localBranch = git(currentWorktree, ["branch", "--show-current"])
        .stdout.trim();
      const localHead = git(currentWorktree, ["rev-parse", "HEAD"]).stdout.trim();
      if (localBranch !== input.headBranch || localHead !== input.headSha) {
        throw new Error("local delivery checkout changed before PR creation");
      }
      const remoteHead = resolveRemoteHead(config, input.headBranch);
      appendEvent(config, {
        kind: "remote-head-observed",
        headBranch: input.headBranch,
        headSha: remoteHead,
      });
      if (remoteHead !== input.headSha) {
        throw new Error(
          `PR head ${input.headSha} does not match remote ${remoteHead}`,
        );
      }
      return changeState(config, (state) => {
        state.pullRequestRequests.push({
          issueNumber: input.issueNumber,
          operationId: input.operationId,
        });
        const existing = state.pullRequests.find(
          (pullRequest) => pullRequest.headBranch === input.headBranch,
        );
        if (existing) return existing;

        const pullRequest = {
          number: state.pullRequests.length + 1,
          issueNumber: input.issueNumber,
          draft: true,
          title: input.title,
          body: input.body,
          headBranch: input.headBranch,
          headSha: input.headSha,
          baseBranch: input.baseBranch,
        };
        state.pullRequests.push(pullRequest);
        appendEvent(config, {
          kind: "draft-pr-created",
          issueNumber: input.issueNumber,
          headSha: input.headSha,
        });
        return pullRequest;
      });
    },
  };

  const worker = {
    async implement(input) {
      const expectedIssue = config.issues.find(
        (issue) => issue.number === input.issue?.number,
      );
      if (
        !expectedIssue ||
        input.issue.title !== expectedIssue.title ||
        input.issue.body !== expectedIssue.body
      ) {
        throw new Error("worker received the wrong issue requirements");
      }
      assertWorkerCheckout(config, input);
      changeState(config, (state) => {
        state.activeWorkers += 1;
        state.maximumActiveWorkers = Math.max(
          state.maximumActiveWorkers,
          state.activeWorkers,
        );
        state.sessions.push({
          sessionId: input.sessionId,
          issueNumber: input.issue.number,
          issue: structuredClone(input.issue),
          worktreePath: input.worktreePath,
          baseSha: git(input.worktreePath, ["rev-parse", "HEAD"]).stdout.trim(),
        });
      });
      appendEvent(config, {
        kind: "worker-started",
        issueNumber: input.issue.number,
        sessionId: input.sessionId,
      });

      try {
        for (const change of config.workerChanges) {
          const destination = assertPathWithin(
            input.worktreePath,
            path.join(input.worktreePath, change.path),
            "worker change",
          );
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, change.content);
        }
        appendEvent(config, {
          kind: "worker-completed",
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
        });
        return { kind: "completed", sessionId: input.sessionId };
      } finally {
        changeState(config, (state) => {
          state.activeWorkers -= 1;
        });
      }
    },
  };

  const verifier = {
    async verify(input) {
      const preVerificationHead = git(input.worktreePath, ["rev-parse", "HEAD"])
        .stdout.trim();
      if (preVerificationHead !== config.mainSha) {
        throw new Error("candidate was committed before verification completed");
      }
      if (resolveRemoteHead(config, input.headBranch, true) !== null) {
        throw new Error("candidate was pushed before verification completed");
      }
      const expectedCommitObjects = commitObjectShas(config.remotePath);
      const actualCommitObjects = commitObjectShas(config.repositoryPath);
      if (JSON.stringify(actualCommitObjects) !== JSON.stringify(expectedCommitObjects)) {
        throw new Error("candidate commit object existed before verification completed");
      }
      const observedTreeSha = git(config.repositoryPath, [
        "rev-parse",
        `${input.candidateTreeSha}^{tree}`,
      ]).stdout.trim();
      assertExpectedCandidate(config, observedTreeSha);
      changeState(config, (state) => {
        state.verificationRequests.push({
          issueNumber: input.issue.number,
          candidateTreeSha: observedTreeSha,
        });
      });
      appendEvent(config, {
        kind: "candidate-verified",
        issueNumber: input.issue.number,
        treeSha: observedTreeSha,
      });
      if (config.verification === "fail") {
        return {
          kind: "failed",
          candidateTreeSha: observedTreeSha,
          evidence: "scripted verification failure",
        };
      }
      return { kind: "passed", candidateTreeSha: observedTreeSha };
    },
  };

  return {
    github,
    worker,
    verifier,
    clock: { now: () => new Date(config.now) },
  };
}
