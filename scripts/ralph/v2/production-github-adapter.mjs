import fs from "node:fs";
import { spawnSync } from "node:child_process";

function defaultExecute(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  const pendingChecks =
    result.status === 8 && args[0] === "pr" && args[1] === "checks";
  if (result.error || result.signal || (result.status !== 0 && !pendingChecks)) {
    throw new Error(`gh ${args.join(" ")} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout.trim();
}

function labels(issue) {
  return (issue.labels ?? []).map((label) => label.name ?? label);
}

function assignees(issue) {
  return (issue.assignees ?? []).map((assignee) => assignee.login ?? assignee);
}

function runId(check) {
  return String(check.detailsUrl ?? check.link ?? "").match(/\/actions\/runs\/(\d+)/)?.[1] ?? null;
}

function normalizedCheck(check) {
  const state = String(check.conclusion ?? check.state ?? check.status ?? "").toUpperCase();
  const bucket = state === "SUCCESS"
    ? "pass"
    : ["CANCELLED", "TIMED_OUT"].includes(state)
      ? "cancel"
      : ["FAILURE", "ACTION_REQUIRED", "STARTUP_FAILURE", "NEUTRAL", "SKIPPED"].includes(state)
        ? "fail"
        : "pending";
  return {
    name: String(check.name ?? check.context ?? check.workflowName ?? "unknown"),
    state,
    bucket,
    provider: runId(check) ? "github-actions" : "unknown",
    runId: runId(check),
  };
}

function claimMarker(operationId) {
  return `<!-- betterr-ralph-v2-claim:${operationId} -->`;
}

function claimHeartbeatMarker(heartbeatId) {
  return `<!-- betterr-ralph-v2-claim-heartbeat:${heartbeatId} -->`;
}

function activeClaims(comments, now = Date.now()) {
  const oldestAllowed = now - 24 * 60 * 60 * 1000;
  return comments.flatMap((comment) => {
    const operationId = String(comment.body ?? "").match(
      /<!-- betterr-ralph-v2-claim:([^>]+) -->/,
    )?.[1];
    const createdAt = Date.parse(comment.created_at ?? comment.createdAt ?? "");
    return operationId && Number.isFinite(createdAt) && createdAt >= oldestAllowed
      ? [{ operationId, createdAt, commentId: comment.id }]
      : [];
  }).sort((left, right) =>
    left.createdAt - right.createdAt ||
    String(left.commentId).localeCompare(String(right.commentId)),
  );
}

export function createProductionGitHubAdapter({
  repository,
  queuePath,
  actor,
  execute = defaultExecute,
}) {
  if (!/^[^/]+\/[^/]+$/.test(repository) || !fs.statSync(queuePath).isFile()) {
    throw new Error("production GitHub adapter requires a repository and queue file");
  }
  const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  const json = (args) => JSON.parse(execute(args));
  let resolvedActor = actor ?? null;
  const currentActor = () => {
    resolvedActor ??= json(["api", "user"]).login;
    return resolvedActor;
  };
  const issueComments = (number) =>
    json(["api", `repos/${repository}/issues/${number}/comments`, "--paginate"]);

  return {
    async auditApprovedQueue() {
      const issues = queue.map((approved) => {
        const issue = json([
          "issue", "view", String(approved.issueNumber), "--repo", repository,
          "--json", "number,state,closedByPullRequestsReferences",
        ]);
        if (issue.number !== approved.issueNumber || !["OPEN", "CLOSED"].includes(issue.state)) {
          throw new Error(`GitHub queue audit failed for issue #${approved.issueNumber}`);
        }
        return {
          number: issue.number,
          state: issue.state,
          pullRequests: (issue.closedByPullRequestsReferences ?? []).map((pr) => ({
            number: pr.number,
            state: pr.state,
            draft: pr.isDraft === true,
            url: pr.url,
          })),
        };
      });
      return { issues };
    },

    async listReadyIssues() {
      const live = json([
        "issue", "list", "--repo", repository, "--state", "all", "--limit", "500",
        "--json", "number,title,body,state,url,labels,assignees",
      ]);
      const byNumber = new Map(live.map((issue) => [issue.number, issue]));
      return queue.flatMap((approved) => {
        const issue = byNumber.get(approved.issueNumber);
        if (
          !issue || issue.state !== "OPEN" ||
          !labels(issue).includes("ready-for-agent") ||
          (assignees(issue).length > 0 &&
            !(assignees(issue).length === 1 && assignees(issue)[0] === currentActor())) ||
          approved.blockers.some((number) => byNumber.get(number)?.state !== "CLOSED")
        ) return [];
        return [{
          ...approved,
          number: approved.issueNumber,
          title: issue.title,
          body: issue.body,
          url: issue.url,
        }];
      });
    },

    async findClaim({ issueNumber, operationId }) {
      const claims = activeClaims(issueComments(issueNumber));
      const existing = claims.find((claim) => claim.operationId === operationId);
      if (!existing) return null;
      return {
        issueNumber,
        operationId,
        claimed: claims[0]?.operationId === operationId,
        commentId: existing.commentId,
      };
    },

    async claimIssue({ issueNumber, operationId, claimedAt }) {
      const existing = await this.findClaim({ issueNumber, operationId });
      if (existing) return existing;
      execute([
        "issue", "edit", String(issueNumber), "--repo", repository,
        "--add-assignee", currentActor(),
      ]);
      const created = json([
        "api", `repos/${repository}/issues/${issueNumber}/comments`, "--method", "POST",
        "-f", `body=${claimMarker(operationId)}\nRalph v2 claimed this issue at ${claimedAt}.`,
      ]);
      const winner = activeClaims(issueComments(issueNumber))[0];
      return winner?.operationId === operationId
        ? { issueNumber, operationId, claimed: true, commentId: created.id }
        : { issueNumber, operationId, claimed: false, commentId: created.id };
    },

    async refreshClaim({ issueNumber, operationId, heartbeatId, claimedAt }) {
      if (
        typeof operationId !== "string" ||
        typeof heartbeatId !== "string" ||
        !operationId ||
        !heartbeatId ||
        operationId.includes("-->") ||
        heartbeatId.includes("-->")
      ) throw new Error("claim heartbeat failed integrity validation");
      const heartbeatMarker = claimHeartbeatMarker(heartbeatId);
      let comments = issueComments(issueNumber);
      let created = comments.find((comment) =>
        String(comment.body ?? "").includes(heartbeatMarker),
      );
      if (!created) {
        created = json([
          "api", `repos/${repository}/issues/${issueNumber}/comments`, "--method", "POST",
          "-f",
          `body=${claimMarker(operationId)}\n${heartbeatMarker}\nRalph v2 refreshed this claim at ${claimedAt}.`,
        ]);
        comments = issueComments(issueNumber);
      }
      const winner = activeClaims(comments)[0];
      return {
        issueNumber,
        operationId,
        heartbeatId,
        claimed: winner?.operationId === operationId,
        commentId: created.id,
      };
    },

    async findPullRequest({ headBranch }) {
      const pr = json([
        "pr", "list", "--repo", repository, "--state", "all", "--head", headBranch,
        "--limit", "1", "--json", "number,headRefName,headRefOid,isDraft,state",
      ])[0];
      return pr
        ? {
            number: pr.number,
            headBranch: pr.headRefName,
            headSha: pr.headRefOid,
            draft: pr.isDraft,
            state: pr.state,
          }
        : null;
    },

    async createDraftPullRequest(input) {
      const url = execute([
        "pr", "create", "--repo", repository, "--draft", "--base", input.baseBranch,
        "--head", input.headBranch, "--title", input.title, "--body", input.body,
      ]);
      const number = Number(url.match(/\/(\d+)\/?$/)?.[1]);
      return {
        number,
        issueNumber: input.issueNumber,
        draft: true,
        headBranch: input.headBranch,
        headSha: input.headSha,
        baseBranch: input.baseBranch,
      };
    },

    async inspectPullRequest({ pullRequestNumber }) {
      const pr = json([
        "pr", "view", String(pullRequestNumber), "--repo", repository, "--json",
        "number,state,isDraft,headRefName,headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup,url",
      ]);
      const main = json(["api", `repos/${repository}/git/ref/heads/main`]).object.sha;
      const comparison = json(["api", `repos/${repository}/compare/${main}...${pr.headRefOid}`]);
      const checks = json([
        "pr", "checks", String(pullRequestNumber), "--repo", repository,
        "--required", "--json", "name,state,bucket,link",
      ]).map(normalizedCheck);
      return {
        number: pr.number,
        state: pr.state,
        draft: pr.isDraft,
        headBranch: pr.headRefName,
        headSha: pr.headRefOid,
        mergeStateStatus: pr.mergeStateStatus,
        reviewDecision: pr.reviewDecision,
        reviewRequired: pr.reviewDecision === "REVIEW_REQUIRED",
        requirementsAmbiguous: false,
        checksAvailable: true,
        checks,
        requiredCheckEvidenceReady: true,
        latestMainSha: main,
        headContainsLatestMain: ["ahead", "identical"].includes(comparison.status),
        url: pr.url,
      };
    },

    async markPullRequestReady(input) {
      execute(["pr", "ready", String(input.pullRequestNumber), "--repo", repository]);
      return { ready: true, operationId: input.operationId };
    },

    async retryPullRequestChecks(input) {
      for (const id of new Set(input.checks.map((check) => check.runId).filter(Boolean))) {
        execute(["run", "rerun", String(id), "--repo", repository, "--failed"]);
      }
      return { retried: true, operationId: input.operationId };
    },

    async repairControllerOwnedChecks(input) {
      if (
        typeof input.body !== "string" ||
        !input.body.includes("## Delivery classification") ||
        !input.body.includes(`Closes #${input.issueNumber}`)
      ) {
        throw new Error("controller-owned PR body failed integrity validation");
      }
      execute([
        "pr", "edit", String(input.pullRequestNumber), "--repo", repository,
        "--body", input.body,
      ]);
      for (const id of new Set(input.checks.map((check) => check.runId).filter(Boolean))) {
        execute(["run", "rerun", String(id), "--repo", repository, "--failed"]);
      }
      return { repaired: true, operationId: input.operationId };
    },

    async updatePullRequestBase(input) {
      json([
        "api", `repos/${repository}/pulls/${input.pullRequestNumber}/update-branch`,
        "--method", "PUT", "-f", `expected_head_sha=${input.expectedHeadSha}`,
      ]);
      return { requested: true, operationId: input.operationId };
    },

    async mergePullRequest(input) {
      execute([
        "pr", "merge", String(input.pullRequestNumber), "--repo", repository,
        "--merge", "--match-head-commit", input.expectedHeadSha,
      ]);
      return {
        merged: true,
        pullRequestNumber: input.pullRequestNumber,
        headSha: input.expectedHeadSha,
      };
    },
  };
}
