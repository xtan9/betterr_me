import { createGitWorkspace } from "./git-workspace.mjs";
import { createStateStore } from "./state-store.mjs";
import {
  workerChangePolicyViolation,
  workerProtectedPath,
} from "../worker-path-policy.mjs";

const TERMINAL_DISPOSITIONS = new Set([
  "published",
  "stopped",
  "safety_blocked",
  "verification_failed",
]);

function operationId(issueNumber, operation, generation = 1) {
  return `ralph-v2:issue-${issueNumber}:generation-${generation}:${operation}`;
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

async function checkpoint(lifecycle, point, record) {
  await lifecycle.checkpoint({
    point,
    issueNumber: record.number,
    generation: record.generation,
  });
}

function saveWorkerLease(state, stateStore, record) {
  state.workerLease = {
    issueNumber: record.number,
    sessionId: record.sessionId,
    worktreePath: record.worktreePath,
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

async function runImplementation({ worker, input, stateStore }) {
  const cancellation = new AbortController();
  const poll = setInterval(() => {
    if (stateStore.isStopRequested()) cancellation.abort();
  }, 20);
  poll.unref?.();
  try {
    if (stateStore.isStopRequested()) cancellation.abort();
    return await worker.implement({ ...input, signal: cancellation.signal });
  } finally {
    clearInterval(poll);
  }
}

async function reconcileIssue({
  record,
  state,
  stateStore,
  workspace,
  github,
  worker,
  verifier,
  lifecycle,
  clock,
}) {
  const issue = validateReadyIssue(record.issue);
  if (issue.number !== record.number) {
    throw new Error("Ralph issue identity failed integrity validation");
  }

  if (record.disposition === "claiming") {
    let claim = await github.findClaim({
      issueNumber: record.number,
      operationId: record.claimOperationId,
    });
    if (!claim) {
      claim = await github.claimIssue({
        issueNumber: record.number,
        operationId: record.claimOperationId,
        claimedAt: clock.now().toISOString(),
      });
      await checkpoint(lifecycle, "claim-applied", record);
    }
    validateClaimReceipt(claim, record);
    record.disposition = "claimed";
    stateStore.save(state);
  }

  if (record.disposition === "claimed") {
    const plan = workspace.plan(record.number);
    Object.assign(record, plan, { disposition: "preparing" });
    stateStore.save(state);
  }

  if (record.disposition === "preparing") {
    workspace.ensureCheckout(record);
    await checkpoint(lifecycle, "worktree-created", record);
    record.sessionId ??= operationId(
      record.number,
      "implementation",
      record.generation,
    );
    record.disposition = "implementing";
    saveWorkerLease(state, stateStore, record);
  }

  if (record.disposition === "implementing") {
    saveWorkerLease(state, stateStore, record);
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
    let workerResult = await worker.findResult({
      issueNumber: record.number,
      sessionId: record.sessionId,
    });
    if (!workerResult) {
      workerResult = await runImplementation({
        worker,
        stateStore,
        input: {
          issue,
          sessionId: record.sessionId,
          worktreePath: record.worktreePath,
          baseSha: record.baseSha,
        },
      });
      if (workerResult?.kind === "completed") {
        await checkpoint(lifecycle, "worker-completed", record);
      }
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
    if (
      workerResult?.kind !== "completed" ||
      workerResult.sessionId !== record.sessionId
    ) {
      throw new Error(`implementation worker failed for issue #${record.number}`);
    }
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
    Object.assign(record, {
      disposition: "verifying",
      candidateTreeSha,
    });
    stateStore.save(state);
  }

  if (record.disposition === "verifying") {
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
    const verificationInput = {
      issue,
      sessionId: record.sessionId,
      worktreePath: record.worktreePath,
      baseSha: record.baseSha,
      headBranch: record.branch,
      candidateTreeSha: record.candidateTreeSha,
    };
    let verification = await verifier.findReceipt(verificationInput);
    if (!verification) {
      verification = await verifier.verify(verificationInput);
      await checkpoint(lifecycle, "candidate-verified", record);
    }
    if (
      verification?.candidateTreeSha !== record.candidateTreeSha ||
      !["passed", "failed"].includes(verification.kind)
    ) {
      throw new Error(`verification receipt is invalid for issue #${record.number}`);
    }
    if (verification.kind === "failed") {
      parkIssue({
        state,
        stateStore,
        workspace,
        record,
        disposition: "verification_failed",
      });
      return;
    }
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
      commit = workspace.commit({
        issueNumber: record.number,
        candidateTreeSha: record.candidateTreeSha,
      });
      await checkpoint(lifecycle, "candidate-committed", record);
    }
    Object.assign(record, {
      disposition: "publishing",
      headSha: commit.headSha,
    });
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
    const observedRemoteHead = workspace.remoteHead({
      issueNumber: record.number,
      branch: record.branch,
    });
    if (observedRemoteHead && observedRemoteHead !== record.headSha) {
      throw new Error(`remote issue branch changed for issue #${record.number}`);
    }
    if (!observedRemoteHead) {
      workspace.push({
        issueNumber: record.number,
        branch: record.branch,
        headSha: record.headSha,
      });
      await checkpoint(lifecycle, "branch-pushed", record);
    }

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
    if (!pullRequest) {
      pullRequest = await github.createDraftPullRequest({
        issueNumber: record.number,
        operationId: pullRequestOperationId,
        draft: true,
        title: pullRequestTitle(issue),
        body: `Closes #${record.number}`,
        headBranch: record.branch,
        headSha: record.headSha,
        baseBranch: "main",
      });
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

    workspace.cleanup({
      issueNumber: record.number,
      branch: record.branch,
      headSha: record.headSha,
    });
    await checkpoint(lifecycle, "checkout-cleaned", record);
    record.disposition = "published";
    state.workerLease = null;
    stateStore.save(state);
  }
}

export function createRalphRuntime({
  repositoryPath,
  runtimePath,
  github,
  worker,
  verifier,
  lifecycle = { checkpoint: async () => {} },
  clock,
}) {
  if (!github || !worker || !verifier || !clock) {
    throw new Error("Ralph requires GitHub, worker, verifier, and clock adapters");
  }
  const stateStore = createStateStore(runtimePath);
  const workspace = createGitWorkspace({ repositoryPath, runtimePath });

  return {
    async run({ mode, maxIssues }) {
      if (mode !== "PrOnly") {
        throw new Error(`Ralph v2 does not support ${mode} mode yet`);
      }
      if (!Number.isSafeInteger(maxIssues) || maxIssues <= 0) {
        throw new Error("maxIssues must be a positive integer");
      }

      const controllerLease = stateStore.acquireControllerLease();
      try {
        const state = stateStore.load();
        if (stateStore.isStopRequested()) {
          return publicStatus(state, true);
        }

        let processed = 0;
        const resumable = Object.values(state.issues).filter(
          (issue) => !TERMINAL_DISPOSITIONS.has(issue.disposition),
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
            lifecycle,
            clock,
          });
          processed += 1;
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
              lifecycle,
              clock,
            });
            processed += 1;
          }
        }
        return publicStatus(state, stateStore.isStopRequested());
      } finally {
        controllerLease.release();
      }
    },

    inspect() {
      const state = stateStore.load();
      return publicStatus(state, stateStore.isStopRequested());
    },

    requestStop() {
      stateStore.requestStop();
      return publicStatus(stateStore.load(), true);
    },
  };
}
