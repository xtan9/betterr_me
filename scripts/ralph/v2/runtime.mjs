import { createGitWorkspace } from "./git-workspace.mjs";
import { createStateStore } from "./state-store.mjs";

function operationId(issueNumber, operation, generation = 1) {
  return `ralph-v2:issue-${issueNumber}:generation-${generation}:${operation}`;
}

function publicStatus(state) {
  return {
    stopRequested: state.stopRequested,
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

async function deliverIssue({
  issue,
  state,
  stateStore,
  workspace,
  github,
  worker,
  verifier,
  clock,
}) {
  const generation = 1;
  const claimOperationId = operationId(issue.number, "claim", generation);
  state.issues[issue.number] = {
    number: issue.number,
    disposition: "claiming",
    generation,
    claimOperationId,
  };
  stateStore.save(state);

  const claim = await github.claimIssue({
    issueNumber: issue.number,
    operationId: claimOperationId,
    claimedAt: clock.now().toISOString(),
  });
  if (!claim?.claimed) {
    throw new Error(`issue #${issue.number} could not be claimed`);
  }
  state.issues[issue.number].disposition = "claimed";
  stateStore.save(state);

  const checkout = workspace.prepare(issue.number);
  Object.assign(state.issues[issue.number], checkout, {
    disposition: "implementing",
  });
  const sessionId = operationId(issue.number, "implementation", generation);
  state.workerLease = {
    issueNumber: issue.number,
    sessionId,
    worktreePath: checkout.worktreePath,
  };
  stateStore.save(state);

  const workerResult = await worker.implement({
    issue,
    sessionId,
    worktreePath: checkout.worktreePath,
    baseSha: checkout.baseSha,
  });
  if (
    workerResult?.kind !== "completed" ||
    workerResult.sessionId !== sessionId
  ) {
    throw new Error(`implementation worker failed for issue #${issue.number}`);
  }

  workspace.discardEmptySandboxPlaceholders({ baseSha: checkout.baseSha });
  const { candidateTreeSha } = workspace.buildCandidate();
  Object.assign(state.issues[issue.number], {
    disposition: "verifying",
    candidateTreeSha,
  });
  stateStore.save(state);

  const verification = await verifier.verify({
    issue,
    sessionId,
    worktreePath: checkout.worktreePath,
    baseSha: checkout.baseSha,
    headBranch: checkout.branch,
    candidateTreeSha,
  });
  if (
    verification?.kind !== "passed" ||
    verification.candidateTreeSha !== candidateTreeSha
  ) {
    const { artifactPath } = workspace.park({
      issueNumber: issue.number,
      branch: checkout.branch,
      baseSha: checkout.baseSha,
    });
    Object.assign(state.issues[issue.number], {
      disposition: "verification_failed",
      artifactPath,
    });
    state.workerLease = null;
    stateStore.save(state);
    return;
  }

  const { headSha } = workspace.commit({
    issueNumber: issue.number,
    candidateTreeSha,
  });
  Object.assign(state.issues[issue.number], {
    disposition: "publishing",
    headSha,
  });
  stateStore.save(state);

  workspace.push({ branch: checkout.branch, headSha });
  const pullRequestOperationId = operationId(
    issue.number,
    `pull-request:${headSha}`,
    generation,
  );
  let pullRequest = await github.findPullRequest({
    issueNumber: issue.number,
    headBranch: checkout.branch,
    headSha,
  });
  if (!pullRequest) {
    pullRequest = await github.createDraftPullRequest({
      issueNumber: issue.number,
      operationId: pullRequestOperationId,
      draft: true,
      title: pullRequestTitle(issue),
      body: `Closes #${issue.number}`,
      headBranch: checkout.branch,
      headSha,
      baseBranch: "main",
    });
  }
  if (
    !pullRequest ||
    pullRequest.headBranch !== checkout.branch ||
    pullRequest.headSha !== headSha ||
    pullRequest.draft !== true
  ) {
    throw new Error(`pull request receipt is invalid for issue #${issue.number}`);
  }

  workspace.cleanup({ branch: checkout.branch, headSha });
  Object.assign(state.issues[issue.number], {
    disposition: "published",
    pullRequestNumber: pullRequest.number,
  });
  state.workerLease = null;
  stateStore.save(state);
}

export function createRalphRuntime({
  repositoryPath,
  runtimePath,
  github,
  worker,
  verifier,
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
      const state = stateStore.load();
      if (state.stopRequested) return publicStatus(state);

      const readyIssues = await github.listReadyIssues();
      let delivered = 0;
      for (const candidate of readyIssues) {
        if (delivered >= maxIssues || state.stopRequested) break;
        const issue = validateReadyIssue(candidate);
        if (
          ["published", "verification_failed"].includes(
            state.issues[issue.number]?.disposition,
          )
        ) {
          continue;
        }
        await deliverIssue({
          issue,
          state,
          stateStore,
          workspace,
          github,
          worker,
          verifier,
          clock,
        });
        delivered += 1;
      }
      return publicStatus(state);
    },

    inspect() {
      return publicStatus(stateStore.load());
    },

    requestStop() {
      const state = stateStore.load();
      state.stopRequested = true;
      stateStore.save(state);
      return publicStatus(state);
    },
  };
}
