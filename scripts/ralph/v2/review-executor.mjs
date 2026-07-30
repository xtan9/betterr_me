import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  aggregateReviewReports,
  createReviewRequest,
  reviewReportViolations,
} from "../review-protocol.mjs";
import {
  createApprovedReviewIssue,
  createRepositoryVerificationRecipe,
  requirementsSnapshotSha256,
  verificationPlanDigest,
} from "./verification-plan.mjs";

const MAX_DIFF_BYTES = 500_000;
const GIT_TIMEOUT_MILLISECONDS = 10_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha1(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function safeEnvironment() {
  const allowedNames = [
    "ComSpec",
    "LANG",
    "LC_ALL",
    "PATH",
    "PATHEXT",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ];
  return Object.fromEntries(
    allowedNames.flatMap((name) =>
      typeof process.env[name] === "string" ? [[name, process.env[name]]] : [],
    ),
  );
}

function git(worktreePath, args) {
  const executable = process.platform === "win32" ? "git.exe" : "git";
  const result = spawnSync(executable, ["-C", worktreePath, ...args], {
    encoding: "utf8",
    env: safeEnvironment(),
    windowsHide: true,
    timeout: GIT_TIMEOUT_MILLISECONDS,
    maxBuffer: MAX_DIFF_BYTES + 128_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `review candidate Git inspection failed: ${String(
        result.stderr || result.error?.message || result.status,
      ).trim()}`,
    );
  }
  return result.stdout;
}

function assertCandidateUnchanged(worktreePath, candidateTreeSha) {
  const observed = git(worktreePath, ["write-tree"]).trim();
  if (observed !== candidateTreeSha) {
    throw new Error("review candidate tree changed after planning");
  }
  git(worktreePath, ["diff", "--quiet"]);
}

function validateInput(input) {
  if (
    !input ||
    !path.isAbsolute(input.repositoryPath) ||
    !path.isAbsolute(input.worktreePath) ||
    !nonblank(input.sessionId) ||
    !isSha1(input.baseSha) ||
    !isSha1(input.candidateTreeSha) ||
    !Array.isArray(input.changedPaths) ||
    input.changedPaths.length === 0 ||
    input.changedPaths.some((changedPath) => !nonblank(changedPath)) ||
    new Set(input.changedPaths).size !== input.changedPaths.length ||
    !input.verificationPlan ||
    input.verificationPlan.sessionId !== input.sessionId ||
    input.verificationPlan.candidateTreeSha !== input.candidateTreeSha ||
    input.verificationPlan.review?.kind !== "exhaustive" ||
    !Array.isArray(input.verificationPlan.review.axes) ||
    input.verificationPlan.review.axes.length === 0 ||
    !isSha256(input.verificationPlan.review.policySha256) ||
    !isSha256(input.verificationPlan.review.skillSha256) ||
    !isSha256(input.verificationPlanSha256) ||
    verificationPlanDigest(input.verificationPlan) !==
      input.verificationPlanSha256 ||
    requirementsSnapshotSha256(input.requirements) !==
      input.verificationPlan.requirementsSha256 ||
    !Number.isSafeInteger(input.deadlineEpochMilliseconds) ||
    input.deadlineEpochMilliseconds <= 0
  ) {
    throw new Error("exhaustive review input failed integrity validation");
  }
  return input;
}

function validateMaterialBindings(input) {
  const observed = createRepositoryVerificationRecipe({
    repositoryPath: input.repositoryPath,
  });
  if (
    observed.review.policySha256 !==
      input.verificationPlan.review.policySha256 ||
    observed.review.skillSha256 !== input.verificationPlan.review.skillSha256
  ) {
    throw new Error("review materials changed after planning");
  }
}

function validateTestEvidence(input) {
  const plannedTests = input.verificationPlan.tests;
  if (
    !Array.isArray(input.testEvidence) ||
    input.testEvidence.length !== plannedTests.length ||
    !input.testEvidence.every((gate, index) => {
      const planned = plannedTests[index];
      return (
        gate?.id === planned.id &&
        ["passed", "failed"].includes(gate.status) &&
        gate.candidateTreeSha === input.candidateTreeSha &&
        gate.command === planned.command &&
        Number.isSafeInteger(gate.exitCode) &&
        (gate.status === "passed" ? gate.exitCode === 0 : gate.exitCode !== 0) &&
        isSha256(gate.outputSha256) &&
        nonblank(gate.outputArtifactPath) &&
        path.isAbsolute(gate.outputArtifactPath)
      );
    })
  ) {
    throw new Error("review test evidence failed integrity validation");
  }
  return input.testEvidence.map(
    ({ id, status, candidateTreeSha, command, exitCode, outputSha256 }) => ({
      id,
      status,
      candidateTreeSha,
      command,
      exitCode,
      outputSha256,
    }),
  );
}

function exactAxes(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((axis, index) => axis === expected[index])
  );
}

function validateSessionReceipt(receipt, expected) {
  if (
    receipt?.kind !== "completed" ||
    receipt.sessionId !== expected.sessionId ||
    receipt.axis !== expected.axis ||
    receipt.candidateTreeSha !== expected.candidateTreeSha ||
    receipt.freshSession !== true ||
    receipt.readOnly !== true ||
    receipt.processTreeTerminated !== true ||
    receipt.resultPath !== expected.resultPath ||
    !isSha256(receipt.outputSha256)
  ) {
    throw new Error(
      `${expected.axis} specialist session receipt failed integrity validation`,
    );
  }
  return receipt;
}

function readBoundReport(receipt, artifactRoot) {
  let resolved;
  let output;
  try {
    const metadata = fs.lstatSync(receipt.resultPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("review artifact is not a regular file");
    }
    resolved = fs.realpathSync.native(receipt.resultPath);
    if (!within(artifactRoot, resolved)) {
      throw new Error("review artifact escaped its private root");
    }
    output = fs.readFileSync(resolved);
  } catch (error) {
    throw new Error("review artifact failed integrity validation", {
      cause: error,
    });
  }
  if (sha256(output) !== receipt.outputSha256) {
    throw new Error("review artifact failed integrity validation");
  }
  try {
    return JSON.parse(output.toString("utf8"));
  } catch (error) {
    throw new Error("review artifact failed integrity validation", {
      cause: error,
    });
  }
}

export function createExhaustiveReviewExecutor({
  artifactRoot,
  reviewerSessions,
  lifecycle = { checkpoint: async () => {} },
} = {}) {
  if (!nonblank(artifactRoot) || !path.isAbsolute(artifactRoot)) {
    throw new Error("review artifact root failed integrity validation");
  }
  if (
    !reviewerSessions ||
    typeof reviewerSessions.startOrAttach !== "function"
  ) {
    throw new Error("reviewer session boundary failed integrity validation");
  }
  if (!lifecycle || typeof lifecycle.checkpoint !== "function") {
    throw new Error("review lifecycle failed integrity validation");
  }
  const resolvedArtifactRoot = path.resolve(artifactRoot);

  return {
    async execute(rawInput) {
      const input = validateInput(rawInput);
      if (Date.now() >= input.deadlineEpochMilliseconds) {
        throw new Error("exhaustive review deadline expired before launch");
      }
      validateMaterialBindings(input);
      const verificationEvidence = validateTestEvidence(input);
      const worktreePath = fs.realpathSync.native(input.worktreePath);
      fs.mkdirSync(resolvedArtifactRoot, { recursive: true });
      const privateRoot = fs.realpathSync.native(resolvedArtifactRoot);
      if (within(worktreePath, privateRoot) || within(privateRoot, worktreePath)) {
        throw new Error("review artifacts and candidate checkout must be isolated");
      }
      assertCandidateUnchanged(worktreePath, input.candidateTreeSha);
      const stagedDiff = git(worktreePath, [
        "diff",
        "--no-ext-diff",
        "--binary",
        input.baseSha,
        input.candidateTreeSha,
        "--",
      ]);
      if (!stagedDiff.trim()) {
        throw new Error("exhaustive review received an empty candidate diff");
      }
      if (Buffer.byteLength(stagedDiff, "utf8") > MAX_DIFF_BYTES) {
        throw new Error("candidate diff is too large for exhaustive review");
      }
      const request = createReviewRequest({
        issue: createApprovedReviewIssue(input.requirements),
        stagedDiff,
        changedFiles: [...input.changedPaths].sort(),
        reviewKind: "exhaustive",
        verificationEvidence,
      });
      const plannedAxes = input.verificationPlan.review.axes;
      if (!exactAxes(request.requiredAxes, plannedAxes)) {
        throw new Error("exhaustive review axes changed after planning");
      }
      if (
        JSON.stringify(request.coverage) !==
        JSON.stringify(input.verificationPlan.review.coverage)
      ) {
        throw new Error("exhaustive review coverage changed after planning");
      }
      const executionKey = sha256(
        `${input.verificationPlan.review.sessionId}\0${input.candidateTreeSha}\0${input.verificationPlanSha256}`,
      );
      const executionRoot = path.join(privateRoot, executionKey);
      fs.mkdirSync(executionRoot, { recursive: true });

      const settlements = await Promise.allSettled(
        request.specialists.map(async ({ axis, prompt }) => {
          const sessionId = `${input.verificationPlan.review.sessionId}:${axis}`;
          const resultPath = path.join(executionRoot, `${axis}.report.json`);
          const receipt = validateSessionReceipt(
            await reviewerSessions.startOrAttach({
              sessionId,
              axis,
              prompt,
              resultPath,
              worktreePath,
              candidateTreeSha: input.candidateTreeSha,
              policySha256: input.verificationPlan.review.policySha256,
              skillSha256: input.verificationPlan.review.skillSha256,
              deadlineEpochMilliseconds: input.deadlineEpochMilliseconds,
              readOnly: true,
            }),
            {
              sessionId,
              axis,
              resultPath,
              candidateTreeSha: input.candidateTreeSha,
            },
          );
          const report = readBoundReport(receipt, privateRoot);
          const violations = reviewReportViolations(report, {
            reviewKind: "exhaustive",
            requiredAxes: [axis],
            requiredCoverageIds: request.requiredCoverageIds,
            requireSurfaceInventory: request.requireSurfaceInventory,
          });
          if (violations.length > 0) {
            throw new Error(
              `${axis} specialist returned incomplete evidence: ${violations.join("; ")}`,
            );
          }
          await lifecycle.checkpoint({
            point: "review-axis-completed",
            sessionId,
            axis,
          });
          return {
            report,
            receipt: {
              axis,
              sessionId,
              resultPath,
              outputSha256: receipt.outputSha256,
              freshSession: true,
              readOnly: true,
              processTreeTerminated: true,
            },
          };
        }),
      );
      const rejected = settlements.find(
        (settlement) => settlement.status === "rejected",
      );
      if (rejected) throw rejected.reason;
      const completed = settlements.map((settlement) => settlement.value);
      const aggregate = aggregateReviewReports(
        "exhaustive",
        completed.map(({ report }) => report),
      );
      const aggregateViolations = reviewReportViolations(aggregate, {
        reviewKind: "exhaustive",
        requiredAxes: plannedAxes,
        requiredCoverageIds: request.requiredCoverageIds,
        requireSurfaceInventory: false,
      });
      if (aggregateViolations.length > 0) {
        throw new Error(
          `exhaustive review aggregate is invalid: ${aggregateViolations.join("; ")}`,
        );
      }
      assertCandidateUnchanged(worktreePath, input.candidateTreeSha);
      validateMaterialBindings(input);
      return {
        ...aggregate,
        sessionId: input.verificationPlan.review.sessionId,
        candidateTreeSha: input.candidateTreeSha,
        policySha256: input.verificationPlan.review.policySha256,
        skillSha256: input.verificationPlan.review.skillSha256,
        specialistReceipts: completed.map(({ receipt }) => receipt),
      };
    },
  };
}
