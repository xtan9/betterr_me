import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertPathWithin,
  runGit as git,
  writeFileDurably,
} from "./test-primitives.mjs";

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

function recordEffect(config, kind, payload) {
  fs.mkdirSync(config.effectLedgerPath, { recursive: true });
  const recordPath = path.join(
    config.effectLedgerPath,
    `${kind}-${process.pid}-${Date.now()}-${randomUUID()}.json`,
  );
  writeFileDurably(
    recordPath,
    `${JSON.stringify({ kind, ...payload }, null, 2)}\n`,
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function assertNoCheckoutBeforeClaim(config, issueNumber) {
  if (fs.existsSync(path.join(config.runtimePath, "worktrees", "current"))) {
    throw new Error("Ralph populated the reusable worktree before claiming");
  }
  const issueBranch = git(
    config.repositoryPath,
    [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/codex/issue-${issueNumber}`,
    ],
    true,
  );
  if (issueBranch.status === 0) {
    throw new Error("Ralph created an issue branch before claiming the issue");
  }
}

function issueSetting(config, setting, issueNumber) {
  return config[`${setting}ByIssue`]?.[String(issueNumber)] ?? config[setting];
}

function assertExpectedCandidate(config, candidateTreeSha, issueNumber) {
  const expectedChanges = issueSetting(
    config,
    "expectedChanges",
    issueNumber,
  );
  const expectedNames = expectedChanges
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

  for (const change of expectedChanges) {
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
      assertNoCheckoutBeforeClaim(config, input.issueNumber);
      if (
        !config.issues.some((issue) => issue.number === input.issueNumber) ||
        typeof input.operationId !== "string" ||
        !input.operationId.includes(`issue-${input.issueNumber}`)
      ) {
        throw new Error("Ralph claimed an issue outside the ready generation");
      }
      recordEffect(config, "claim-request", input);
      appendEvent(config, {
        kind: "issue-claimed",
        issueNumber: input.issueNumber,
        operationId: input.operationId,
      });
      return changeState(config, (state) => {
        state.claimRequests.push(input);
        if (!state.claims.some((claim) => claim.operationId === input.operationId)) {
          state.claims.push({ ...input, claimed: true });
        }
        return { ...input, claimed: true };
      });
    },
    async findClaim(input) {
      return (
        readState(config).claims.find(
          (claim) =>
            claim.issueNumber === input.issueNumber &&
            claim.operationId === input.operationId,
        ) ?? null
      );
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
      recordEffect(config, "pull-request-request", {
        issueNumber: input.issueNumber,
        operationId: input.operationId,
        headBranch: input.headBranch,
        headSha: input.headSha,
      });
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
    async findResult(input) {
      const session = readState(config).sessions.find(
        (candidate) => candidate.sessionId === input.sessionId,
      );
      return session?.resultKind
        ? { kind: session.resultKind, sessionId: session.sessionId }
        : null;
    },
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
      recordEffect(config, "worker-request", {
        issueNumber: input.issue.number,
        sessionId: input.sessionId,
      });
      const activeWorkerDirectory = path.join(
        config.effectLedgerPath,
        "active-workers",
      );
      fs.mkdirSync(activeWorkerDirectory, { recursive: true });
      const activeWorkerPath = path.join(
        activeWorkerDirectory,
        `${process.pid}-${randomUUID()}`,
      );
      writeFileDurably(activeWorkerPath, `${input.sessionId}\n`);
      if (fs.readdirSync(activeWorkerDirectory).length > 1) {
        recordEffect(config, "worker-overlap", {
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
        });
      }
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
        for (const change of issueSetting(
          config,
          "workerChanges",
          input.issue.number,
        )) {
          const destination = assertPathWithin(
            input.worktreePath,
            path.join(input.worktreePath, change.path),
            "worker change",
          );
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, change.content);
        }
        if (config.workerStartedPath) {
          fs.writeFileSync(config.workerStartedPath, `${input.sessionId}\n`);
          while (!fs.existsSync(config.workerReleasePath)) {
            if (input.signal?.aborted) {
              appendEvent(config, {
                kind: "worker-aborted",
                issueNumber: input.issue.number,
                sessionId: input.sessionId,
              });
              changeState(config, (state) => {
                const session = state.sessions.find(
                  (candidate) => candidate.sessionId === input.sessionId,
                );
                if (session) session.resultKind = "aborted";
              });
              return { kind: "aborted", sessionId: input.sessionId };
            }
            await sleep(20);
          }
        }
        appendEvent(config, {
          kind: "worker-completed",
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
        });
        changeState(config, (state) => {
          const session = state.sessions.find(
            (candidate) => candidate.sessionId === input.sessionId,
          );
          if (session) session.resultKind = "completed";
        });
        return { kind: "completed", sessionId: input.sessionId };
      } finally {
        fs.rmSync(activeWorkerPath, { force: true });
        changeState(config, (state) => {
          state.activeWorkers -= 1;
        });
      }
    },
  };
  worker.startOrAttach = async (input) => {
    const completed = await worker.findResult({
      issueNumber: input.issue.number,
      sessionId: input.sessionId,
    });
    return completed ?? worker.implement(input);
  };
  worker.terminate = async (input) => {
    changeState(config, (state) => {
      const session = state.sessions.find(
        (candidate) => candidate.sessionId === input.sessionId,
      );
      if (session && !session.resultKind) session.resultKind = "aborted";
      state.activeWorkers = 0;
    });
    return {
      kind: "terminated",
      sessionId: input.sessionId,
      processTreeTerminated: true,
    };
  };

  const verifier = {
    async findReceipt(input) {
      const receipt = readState(config).verificationRequests.find(
        (candidate) =>
          candidate.issueNumber === input.issue.number &&
          candidate.candidateTreeSha === input.candidateTreeSha,
      );
      return receipt
        ? {
            kind: receipt.kind,
            candidateTreeSha: receipt.candidateTreeSha,
            evidence: receipt.evidence,
          }
        : null;
    },
    async verify(input) {
      recordEffect(config, "verification-request", {
        issueNumber: input.issue.number,
        candidateTreeSha: input.candidateTreeSha,
      });
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
      assertExpectedCandidate(config, observedTreeSha, input.issue.number);
      const verificationSetting = issueSetting(
        config,
        "verification",
        input.issue.number,
      );
      changeState(config, (state) => {
        state.verificationRequests.push({
          issueNumber: input.issue.number,
          candidateTreeSha: observedTreeSha,
          kind: verificationSetting === "fail" ? "failed" : "passed",
          evidence:
            verificationSetting === "fail"
              ? "scripted verification failure"
              : undefined,
        });
      });
      appendEvent(config, {
        kind: "candidate-verified",
        issueNumber: input.issue.number,
        treeSha: observedTreeSha,
      });
      if (verificationSetting === "fail") {
        return {
          kind: "failed",
          candidateTreeSha: observedTreeSha,
          evidence: "scripted verification failure",
        };
      }
      return { kind: "passed", candidateTreeSha: observedTreeSha };
    },
  };

  const lifecycle = {
    async checkpoint(input) {
      if (
        config.crashPoint === input.point &&
        !fs.existsSync(config.crashMarkerPath)
      ) {
        writeFileDurably(config.crashMarkerPath, `${input.point}\n`);
        recordEffect(config, "crash-checkpoint", input);
        appendEvent(config, {
          kind: "crash-injected",
          point: input.point,
          issueNumber: input.issueNumber,
        });
        process.kill(process.pid, "SIGKILL");
      }
    },
  };

  return {
    github,
    worker,
    verifier,
    lifecycle,
    clock: { now: () => new Date(config.now) },
  };
}
