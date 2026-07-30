import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionGitHubAdapter } from "./production-github-adapter.mjs";
import { createProductionReviewerSessions } from "./production-reviewer-sessions.mjs";
import { createProductionSessionSupervisor } from "./production-session-supervisor.mjs";
import { createProductionVerificationSupervisor } from "./production-verification-supervisor.mjs";
import { createProductionWorkerSessions } from "./production-worker-sessions.mjs";
import { createRalphRuntimeCore } from "./runtime.mjs";

const DEFAULT_VERIFICATION_MATERIALS_PATH = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const DEFAULT_REVIEW_SCHEMA_PATH = fileURLToPath(
  new URL("../review.schema.json", import.meta.url),
);
const DEFAULT_RESULT_SCHEMA_PATH = fileURLToPath(
  new URL("../result.schema.json", import.meta.url),
);

function optionalObject(value, description) {
  if (value !== undefined) {
    throw new Error(`production Ralph does not accept an injected ${description}`);
  }
}

export function createRalphRuntime({
  repositoryPath,
  runtimePath,
  github,
  worker,
  githubRepository,
  queuePath = path.join(repositoryPath ?? "", "scripts", "ralph", "architecture-queue.json"),
  githubActor,
  trustedDependencyRoot,
  implementationTimeoutMilliseconds,
  verificationTimeoutMilliseconds,
  verificationRecipe,
  verificationMaterialsPath = DEFAULT_VERIFICATION_MATERIALS_PATH,
  reviewSchemaPath = DEFAULT_REVIEW_SCHEMA_PATH,
  reviewerCodexExecutable,
  reviewerCodexPrefixArguments,
  workerCodexExecutable,
  workerCodexPrefixArguments,
  verifierCodexExecutable,
  resultSchemaPath = DEFAULT_RESULT_SCHEMA_PATH,
  linuxVerificationWorkspaceRoot,
  lifecycle,
  clock,
  verifier,
  reviewerSessions,
  verificationSupervisor,
}) {
  optionalObject(github, "GitHub adapter");
  optionalObject(worker, "worker adapter");
  optionalObject(verifier, "raw verifier adapter");
  optionalObject(reviewerSessions, "reviewer-session adapter");
  optionalObject(verificationSupervisor, "verification supervisor");
  optionalObject(lifecycle, "lifecycle");
  optionalObject(clock, "clock");
  const productionLifecycle = { checkpoint: async () => {} };
  if (
    typeof repositoryPath !== "string" ||
    !path.win32.isAbsolute(repositoryPath) ||
    typeof runtimePath !== "string" ||
    !path.win32.isAbsolute(runtimePath) ||
    typeof githubRepository !== "string" ||
    !/^[^/\s]+\/[^/\s]+$/.test(githubRepository) ||
    typeof queuePath !== "string" ||
    !path.win32.isAbsolute(queuePath) ||
    typeof trustedDependencyRoot !== "string" ||
    !path.posix.isAbsolute(trustedDependencyRoot) ||
    typeof verificationMaterialsPath !== "string" ||
    !path.win32.isAbsolute(verificationMaterialsPath) ||
    typeof reviewSchemaPath !== "string" ||
    !path.win32.isAbsolute(reviewSchemaPath) ||
    !fs.statSync(reviewSchemaPath).isFile() ||
    typeof resultSchemaPath !== "string" ||
    !path.win32.isAbsolute(resultSchemaPath) ||
    !fs.statSync(resultSchemaPath).isFile()
  ) {
    throw new Error(
      "production Ralph requires Windows repository/runtime/material paths, a trusted review schema, and Linux dependencies",
    );
  }

  const productionGitHub = createProductionGitHubAdapter({
    repository: githubRepository,
    queuePath,
    actor: githubActor,
  });

  const workerSessionSupervisor = createProductionSessionSupervisor({
    sessionRoot: path.join(runtimePath, "worker-supervision"),
    containmentRoot: path.join(runtimePath, "worker-containment"),
    trustedWslBridge: true,
  });
  const workerOptions = {
    repositoryPath,
    runtimePath,
    sessionSupervisor: workerSessionSupervisor,
    resultSchemaPath,
    dependencyRoot: trustedDependencyRoot,
  };
  if (workerCodexExecutable !== undefined) {
    workerOptions.codexExecutable = workerCodexExecutable;
  }
  if (workerCodexPrefixArguments !== undefined) {
    workerOptions.codexPrefixArguments = workerCodexPrefixArguments;
  }
  const productionWorker = createProductionWorkerSessions(workerOptions);

  const reviewSessionSupervisor = createProductionSessionSupervisor({
    sessionRoot: path.join(runtimePath, "review-supervision"),
    containmentRoot: path.join(runtimePath, "review-containment"),
    trustedWslBridge: true,
  });
  const reviewerOptions = {
    runtimePath,
    artifactRoot: path.join(runtimePath, "verification-reviews"),
    sessionSupervisor: reviewSessionSupervisor,
    reviewSchemaPath,
    dependencyRoot: trustedDependencyRoot,
  };
  if (reviewerCodexExecutable !== undefined) {
    reviewerOptions.codexExecutable = reviewerCodexExecutable;
  }
  if (reviewerCodexPrefixArguments !== undefined) {
    reviewerOptions.codexPrefixArguments = reviewerCodexPrefixArguments;
  }
  if (linuxVerificationWorkspaceRoot !== undefined) {
    reviewerOptions.linuxWorkspaceRoot = linuxVerificationWorkspaceRoot;
  }
  const productionReviewerSessions =
    createProductionReviewerSessions(reviewerOptions);

  const verifierSessionSupervisor = createProductionSessionSupervisor({
    sessionRoot: path.join(runtimePath, "verification-supervision"),
    containmentRoot: path.join(runtimePath, "verification-containment"),
    trustedWslBridge: true,
  });
  const verifierOptions = {
    runtimePath,
    repositoryPath,
    verificationMaterialsPath,
    trustedDependencyRoot,
    sessionSupervisor: verifierSessionSupervisor,
    reviewerSessions: productionReviewerSessions,
    lifecycle: productionLifecycle,
  };
  if (verifierCodexExecutable !== undefined) {
    verifierOptions.codexExecutable = verifierCodexExecutable;
  }
  if (linuxVerificationWorkspaceRoot !== undefined) {
    verifierOptions.linuxWorkspaceRoot = linuxVerificationWorkspaceRoot;
  }
  const productionVerifier =
    createProductionVerificationSupervisor(verifierOptions);

  return createRalphRuntimeCore({
    repositoryPath,
    runtimePath,
    github: productionGitHub,
    worker: productionWorker,
    verifier: productionVerifier,
    implementationTimeoutMilliseconds,
    verificationTimeoutMilliseconds,
    verificationRecipe,
    verificationMaterialsPath,
    lifecycle: productionLifecycle,
    clock: { now: () => new Date() },
  });
}
