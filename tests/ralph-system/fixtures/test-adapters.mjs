import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  assertPathWithin,
  runGit as git,
  writeFileDurably,
} from "./test-primitives.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ensureImmutableArtifact(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (fs.existsSync(filePath)) {
    if (!fs.readFileSync(filePath).equals(bytes)) {
      throw new Error("fixture verification artifact changed after publication");
    }
    return;
  }
  writeFileDurably(filePath, bytes);
}

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
  const repairing = ["pr-repair", "conflict-repair"].includes(input.purpose);
  const expectedBaseSha =
    repairing
      ? input.checkoutHeadSha
      : resolveRemoteHead(config, "main");
  const receivedCheckoutSha =
    repairing ? input.checkoutHeadSha : input.baseSha;
  if (
    normalizedPath(input.worktreePath) !== normalizedPath(expectedPath) ||
    receivedCheckoutSha !== expectedBaseSha
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
    matchingWorktree.HEAD !== expectedBaseSha ||
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

function advanceRemoteMain(config) {
  if (!config.advanceMainAfterPullRequest) return;
  const state = readState(config);
  if (state.mainAdvancedAfterPullRequest) return;
  const checkout = path.join(
    path.dirname(config.externalStatePath),
    `main-advance-${randomUUID()}`,
  );
  try {
    git(path.dirname(checkout), ["clone", config.remotePath, checkout]);
    git(checkout, ["config", "user.name", "Ralph Conflict Fixture"]);
    git(checkout, ["config", "user.email", "ralph-conflict@example.invalid"]);
    const destination = assertPathWithin(
      checkout,
      path.join(checkout, config.advanceMainAfterPullRequest.path),
      "main advance fixture",
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, config.advanceMainAfterPullRequest.content);
    git(checkout, ["add", "--all"]);
    git(checkout, ["commit", "-m", "test: advance conflicting main"]);
    git(checkout, ["push", "origin", "main"]);
    changeState(config, (current) => {
      current.mainAdvancedAfterPullRequest = true;
    });
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true, maxRetries: 5 });
  }
}

function issueSetting(config, setting, issueNumber) {
  return config[`${setting}ByIssue`]?.[String(issueNumber)] ?? config[setting];
}

function assertExpectedCandidate(
  config,
  candidateTreeSha,
  issueNumber,
  baseSha,
  purpose,
) {
  const expectedChanges = ["pr-repair", "conflict-repair"].includes(purpose)
    ? issueSetting(config, "repairExpectedChanges", issueNumber)
    : issueSetting(config, "expectedChanges", issueNumber);
  const expectedNames = expectedChanges
    .map((change) => `${change.status}\t${change.path}`)
    .sort();
  const actualNames = git(config.repositoryPath, [
    "diff-tree",
    "--no-commit-id",
    "--name-status",
    "-r",
    baseSha,
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
    async refreshClaim(input) {
      return changeState(config, (state) => {
        const claim = state.claims.find(
          (candidate) => candidate.operationId === input.operationId,
        );
        if (!claim) return { ...input, claimed: false };
        if (!state.claimRefreshRequests.some(
          (request) => request.heartbeatId === input.heartbeatId,
        )) state.claimRefreshRequests.push(input);
        return { ...input, claimed: true };
      });
    },
    async findPullRequest(input) {
      return (
        readState(config).pullRequests.find(
          (pullRequest) => pullRequest.headBranch === input.headBranch,
        ) ?? null
      );
    },
    async inspectPullRequest(input) {
      const remoteHead = resolveRemoteHead(
        config,
        readState(config).pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        )?.headBranch,
      );
      const pullRequest = changeState(config, (state) => {
        const candidate = state.pullRequests.find(
          (entry) => entry.number === input.pullRequestNumber,
        );
        if (candidate && remoteHead && candidate.headSha !== remoteHead) {
          candidate.headSha = remoteHead;
          candidate.checkAttempt = (candidate.checkAttempt ?? 0) + 1;
        }
        return structuredClone(candidate);
      });
      const controlledBaseUpdate =
        input.pendingBaseUpdate?.previousHeadSha === input.expectedHeadSha &&
        pullRequest?.headSha !== input.expectedHeadSha;
      if (
        !pullRequest ||
        (pullRequest.headSha !== input.expectedHeadSha && !controlledBaseUpdate)
      ) {
        throw new Error("Ralph inspected an unexpected pull request generation");
      }
      const latestMainSha = resolveRemoteHead(config, "main");
      const containsMain = git(
        config.remotePath,
        ["merge-base", "--is-ancestor", latestMainSha, pullRequest.headSha],
        true,
      ).status === 0;
      return {
        ...structuredClone(pullRequest),
        mergeStateStatus: containsMain
          ? "CLEAN"
          : (config.pullRequestMergeStateStatusWhenBehind ?? "DIRTY"),
        reviewDecision: config.pullRequestReviewDecision ?? "APPROVED",
        reviewRequired: config.pullRequestReviewRequired ?? false,
        requirementsAmbiguous: false,
        checksAvailable: true,
        checks: config.pullRequestCheckSequence?.[
          pullRequest.checkAttempt ?? 0
        ] ?? config.pullRequestChecks ?? [
          {
            name: "fixture-required-check",
            bucket: "pass",
            state: "SUCCESS",
            provider: "github-actions",
            runId: "fixture-check-1",
          },
        ],
        requiredCheckEvidenceReady: true,
        latestMainSha,
        headContainsLatestMain: containsMain,
      };
    },
    async markPullRequestReady(input) {
      return changeState(config, (state) => {
        const pullRequest = state.pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        );
        if (!pullRequest || pullRequest.headSha !== input.expectedHeadSha) {
          throw new Error("Ralph readied an unexpected pull request generation");
        }
        if (!pullRequest.draft) return pullRequest;
        state.readyPullRequestRequests.push(input);
        pullRequest.draft = false;
        appendEvent(config, {
          kind: "pull-request-ready",
          issueNumber: input.issueNumber,
          headSha: input.expectedHeadSha,
        });
        return structuredClone(pullRequest);
      });
    },
    async retryPullRequestChecks(input) {
      return changeState(config, (state) => {
        const pullRequest = state.pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        );
        if (!pullRequest || pullRequest.headSha !== input.expectedHeadSha) {
          throw new Error("Ralph retried checks for an unexpected PR generation");
        }
        const existing = state.retryCheckRequests.find(
          (request) => request.operationId === input.operationId,
        );
        if (!existing) {
          state.retryCheckRequests.push(input);
          pullRequest.checkAttempt = (pullRequest.checkAttempt ?? 0) + 1;
        }
        return { retried: true, operationId: input.operationId };
      });
    },
    async repairControllerOwnedChecks(input) {
      return changeState(config, (state) => {
        const pullRequest = state.pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        );
        if (!pullRequest || pullRequest.headSha !== input.expectedHeadSha) {
          throw new Error("Ralph repaired checks for an unexpected PR generation");
        }
        const existing = state.controllerRepairRequests.find(
          (request) => request.operationId === input.operationId,
        );
        if (!existing) {
          state.controllerRepairRequests.push(input);
          pullRequest.body = input.body;
          pullRequest.checkAttempt = (pullRequest.checkAttempt ?? 0) + 1;
        }
        return { repaired: true, operationId: input.operationId };
      });
    },
    async updatePullRequestBase(input) {
      return changeState(config, (state) => {
        const pullRequest = state.pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        );
        if (!pullRequest || pullRequest.headSha !== input.expectedHeadSha) {
          throw new Error("Ralph updated an unexpected PR generation");
        }
        const existing = state.baseUpdateRequests.find(
          (request) => request.operationId === input.operationId,
        );
        if (existing) return { requested: true, operationId: input.operationId };
        const checkout = path.join(
          path.dirname(config.externalStatePath),
          `base-update-${randomUUID()}`,
        );
        try {
          git(path.dirname(checkout), ["clone", config.remotePath, checkout]);
          git(checkout, ["config", "user.name", "Ralph Base Update"]);
          git(checkout, ["config", "user.email", "ralph-base@example.invalid"]);
          git(checkout, ["checkout", pullRequest.headBranch]);
          git(checkout, ["merge", "--no-edit", input.latestMainSha]);
          git(checkout, ["push", "origin", pullRequest.headBranch]);
        } finally {
          fs.rmSync(checkout, { recursive: true, force: true, maxRetries: 5 });
        }
        state.baseUpdateRequests.push(input);
        return { requested: true, operationId: input.operationId };
      });
    },
    async mergePullRequest(input) {
      return changeState(config, (state) => {
        const pullRequest = state.pullRequests.find(
          (candidate) => candidate.number === input.pullRequestNumber,
        );
        if (!pullRequest || pullRequest.headSha !== input.expectedHeadSha) {
          throw new Error("Ralph merged an unexpected pull request generation");
        }
        if (pullRequest.state !== "MERGED") {
          if (config.mergeUpdatesMain !== false) {
            const currentMain = resolveRemoteHead(config, "main");
            git(config.remotePath, [
              "update-ref",
              "refs/heads/main",
              pullRequest.headSha,
              currentMain,
            ]);
          }
          state.mergeRequests.push(input);
          pullRequest.state = "MERGED";
          appendEvent(config, {
            kind: "pull-request-merged",
            issueNumber: input.issueNumber,
            headSha: input.expectedHeadSha,
          });
        }
        return {
          merged: true,
          pullRequestNumber: pullRequest.number,
          headSha: pullRequest.headSha,
        };
      });
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
      advanceRemoteMain(config);
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
          state: "OPEN",
          checkAttempt: 0,
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
        ? { ...(session.result ?? { kind: session.resultKind }), sessionId: session.sessionId }
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
          purpose: input.purpose ?? "implementation",
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
          ["pr-repair", "conflict-repair"].includes(input.purpose)
            ? "repairWorkerChanges"
            : "workerChanges",
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
        const configuredResult = (
          ["pr-repair", "conflict-repair"].includes(input.purpose)
            ? config.repairWorkerResultByIssue
            : config.workerResultByIssue
        )?.[input.issue.number] ?? {
          kind: "completed",
        };
        appendEvent(config, {
          kind: `worker-${configuredResult.kind}`,
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
        });
        changeState(config, (state) => {
          const session = state.sessions.find(
            (candidate) => candidate.sessionId === input.sessionId,
          );
          if (session) {
            session.resultKind = configuredResult.kind;
            session.result = structuredClone(configuredResult);
          }
        });
        return { ...configuredResult, sessionId: input.sessionId };
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

  function passedVerificationEvidence(input) {
    const gateExecutionKey = sha256(
      `${input.sessionId}\0${input.candidateTreeSha}\0${input.verificationPlanSha256}`,
    );
    const tests = input.verificationPlan.tests.map(({ id, command }) => {
      const output = Buffer.from(
        `fixture gate ${id} passed for ${input.candidateTreeSha}\n`,
        "utf8",
      );
      const outputArtifactPath = path.join(
        config.runtimePath,
        "verification-gates",
        gateExecutionKey,
        `${id}.output.log`,
      );
      ensureImmutableArtifact(outputArtifactPath, output);
      return {
        id,
        status: "passed",
        candidateTreeSha: input.candidateTreeSha,
        command,
        exitCode: 0,
        outputSha256: sha256(output),
        outputArtifactPath,
      };
    });
    const reviewExecutionKey = sha256(
      `${input.verificationPlan.review.sessionId}\0${input.candidateTreeSha}\0${input.verificationPlanSha256}`,
    );
    const specialistReceipts = input.verificationPlan.review.axes.map((axis) => {
      const output = Buffer.from(
        `${JSON.stringify({ axis, candidateTreeSha: input.candidateTreeSha })}\n`,
        "utf8",
      );
      const resultPath = path.join(
        config.runtimePath,
        "verification-reviews",
        reviewExecutionKey,
        `${axis}.report.json`,
      );
      ensureImmutableArtifact(resultPath, output);
      return {
        axis,
        sessionId: `${input.verificationPlan.review.sessionId}:${axis}`,
        resultPath,
        outputSha256: sha256(output),
        freshSession: true,
        readOnly: true,
        processTreeTerminated: true,
      };
    });
    return {
      schemaVersion: 2,
      sessionId: input.sessionId,
      candidateTreeSha: input.candidateTreeSha,
      verificationPlanSha256: input.verificationPlanSha256,
      tests,
      review: {
        reviewKind: "exhaustive",
        status: "pass",
        complete: true,
        sessionId: input.verificationPlan.review.sessionId,
        candidateTreeSha: input.candidateTreeSha,
        policySha256: input.verificationPlan.review.policySha256,
        skillSha256: input.verificationPlan.review.skillSha256,
        axes: input.verificationPlan.review.axes.map((id) => ({
          id,
          complete: true,
          evidenceReviewed: [`${id} evidence`],
          findingIds: [],
        })),
        coverage: input.verificationPlan.review.coverage.map(({ id, subject }) => ({
          id,
          subject,
          verdict: "pass",
          implementationEvidence: ["candidate diff inspected"],
          testEvidence: ["related and full suites passed"],
        })),
        findings: [],
        blockingFindings: [],
        repairable: false,
        blockerKind: "none",
        evidenceReviewed: ["issue requirements", "candidate diff", "tests"],
        summary: "All required axes and changed files passed.",
        specialistReceipts,
      },
    };
  }

  function failedVerificationEvidence(input) {
    const evidence = passedVerificationEvidence(input);
    const findingId = "SPEC-001";
    evidence.review.status = "findings";
    evidence.review.coverage[0].verdict = "findings";
    evidence.review.coverage[0].implementationEvidence = [
      "The scripted candidate does not satisfy its approved requirement.",
    ];
    evidence.review.findings = [
      {
        id: findingId,
        axis: "spec",
        location: "fixture:1",
        problem: "Scripted verification failure",
        evidence: "The deterministic verifier rejected the candidate.",
        safeRepair: "Repair the candidate and rerun verification.",
      },
    ];
    evidence.review.axes.find(({ id }) => id === "spec").findingIds = [findingId];
    evidence.review.blockingFindings = [
      `${findingId}: scripted verification failure`,
    ];
    evidence.review.repairable = true;
    evidence.review.blockerKind = "code";
    evidence.review.summary =
      "One blocking scripted finding requires a fresh repair attempt.";
    return evidence;
  }

  const verifier = {
    async findReceipt(input) {
      const receipt = readState(config).verificationRequests.find(
        (candidate) =>
          candidate.issueNumber === input.issue.number &&
          candidate.sessionId === input.sessionId &&
          candidate.candidateTreeSha === input.candidateTreeSha,
      );
      return receipt
        ? {
            kind: receipt.kind,
            sessionId: receipt.sessionId,
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
      if (preVerificationHead !== (input.checkoutHeadSha ?? input.baseSha)) {
        throw new Error("candidate was committed before verification completed");
      }
      const remoteCandidateHead = resolveRemoteHead(
        config,
        input.headBranch,
        true,
      );
      if (
        ["pr-repair", "conflict-repair"].includes(input.purpose)
          ? remoteCandidateHead !== input.checkoutHeadSha
          : remoteCandidateHead !== null
      ) {
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
      assertExpectedCandidate(
        config,
        observedTreeSha,
        input.issue.number,
        input.baseSha,
        input.purpose,
      );
      const verificationSetting = issueSetting(
        config,
        "verification",
        input.issue.number,
      );
      const passedEvidence = passedVerificationEvidence(input);
      const failedEvidence = failedVerificationEvidence(input);
      changeState(config, (state) => {
        state.verificationRequests.push({
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
          candidateTreeSha: observedTreeSha,
          kind: verificationSetting === "fail" ? "failed" : "passed",
          evidence:
            verificationSetting === "fail"
              ? failedEvidence
              : passedEvidence,
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
          sessionId: input.sessionId,
          candidateTreeSha: observedTreeSha,
          evidence: failedEvidence,
        };
      }
      return {
        kind: "passed",
        sessionId: input.sessionId,
        candidateTreeSha: observedTreeSha,
        evidence: passedEvidence,
      };
    },
  };
  verifier.startOrAttach = async (input) => {
    const receipt = await verifier.findReceipt(input);
    return receipt ?? verifier.verify(input);
  };
  verifier.terminate = async (input) => ({
    kind: "terminated",
    sessionId: input.sessionId,
    candidateTreeSha: input.candidateTreeSha,
    operationId: input.operationId,
    processTreeTerminated: true,
  });

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
