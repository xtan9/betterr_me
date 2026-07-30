import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isolatedCodexFilesystemConfig } from "../worker-isolation.mjs";
import { createExhaustiveReviewExecutor } from "./review-executor.mjs";
import { createReviewBrokerProtocol } from "./review-broker-protocol.mjs";
import { createVerificationCommandExecutor } from "./verification-executor.mjs";
import { createVerificationPipeline } from "./verification-pipeline.mjs";
import { createVerificationSessionProtocol } from "./verification-session-protocol.mjs";
import { createVerificationWorkspace } from "./verification-workspace.mjs";

const [configPath, expectedConfigSha256] = process.argv.slice(2);
const MAX_COMMAND_OUTPUT_BYTES = 10 * 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertLinuxPath(value, description) {
  if (
    typeof value !== "string" ||
    !path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.includes("\0")
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function readConfig() {
  if (
    !configPath ||
    !path.posix.isAbsolute(configPath) ||
    !/^[a-f0-9]{64}$/.test(expectedConfigSha256 ?? "")
  ) {
    throw new Error("verification runner launch failed integrity validation");
  }
  const bytes = fs.readFileSync(configPath);
  const config = JSON.parse(bytes.toString("utf8"));
  if (
    sha256(bytes) !== expectedConfigSha256 ||
    config?.schemaVersion !== 1 ||
    config.kind !== "verification-session" ||
    typeof config.sessionId !== "string" ||
    !config.sessionId ||
    typeof config.codexExecutable !== "string"
  ) {
    throw new Error("verification runner configuration failed integrity validation");
  }
  for (const [value, description] of [
    [config.protocolRoot, "verification protocol root"],
    [config.reviewerBrokerRoot, "review broker root"],
    [config.repositoryPath, "verification repository path"],
    [config.workspaceRoot, "verification workspace root"],
    [config.gateArtifactRoot, "verification gate artifact root"],
    [config.reviewArtifactRoot, "verification review artifact root"],
    [config.verificationMaterialsPath, "verification materials path"],
    [config.trustedDependencyRoot, "verification dependency root"],
    [config.workerHome, "verification worker home"],
    [config.codexHome, "verification Codex home"],
    [config.codexExecutable, "verification Codex executable"],
  ]) {
    assertLinuxPath(value, description);
  }
  return config;
}

function runSandboxedCommand(config, {
  executable,
  args,
  cwd,
  deadlineEpochMilliseconds,
}) {
  if (Date.now() >= deadlineEpochMilliseconds) {
    throw new Error("verification command deadline expired before sandbox launch");
  }
  const profile = "ralph-v2-verifier";
  const sandboxArguments = [
    "sandbox",
    "-c",
    `default_permissions=${JSON.stringify(profile)}`,
    "-c",
    `permissions.${profile}.extends=":workspace"`,
    "-c",
    `permissions.${profile}.filesystem=${isolatedCodexFilesystemConfig([
      config.trustedDependencyRoot,
      config.workerHome,
    ])}`,
    "-c",
    `permissions.${profile}.network.enabled=false`,
    "-P",
    profile,
    "-C",
    cwd,
    "--",
    executable,
    ...args,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(config.codexExecutable, sandboxArguments, {
      cwd,
      env: {
        CODEX_HOME: config.codexHome,
        HOME: config.workerHome,
        LANG: "C.UTF-8",
        NO_COLOR: "1",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const collect = (target) => (chunk) => {
      const bytes = Buffer.from(chunk);
      outputBytes += bytes.length;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("verification sandbox output exceeded limit")));
        return;
      }
      target.push(bytes);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, signal) =>
      finish(() =>
        resolve({
          exitCode: exitCode ?? (signal ? -1 : 1),
          signal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }),
      ),
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("verification sandbox deadline expired")));
    }, Math.max(1, deadlineEpochMilliseconds - Date.now()));
  });
}

function createBrokeredReviewerSessions(protocol) {
  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  return {
    async startOrAttach(input) {
      protocol.publishRequest(input);
      while (true) {
        const response = protocol.readResponse(input.sessionId);
        if (response?.status === "completed") return response.receipt;
        if (response?.status === "failed") {
          throw new Error(`brokered review failed: ${response.message}`);
        }
        if (Date.now() >= input.deadlineEpochMilliseconds) {
          throw new Error("brokered review deadline expired");
        }
        await sleep(25);
      }
    },
  };
}

let config;
try {
config = readConfig();
if (process.getuid?.() !== 65534 || process.getgid?.() !== 65534) {
  throw new Error("verification runner did not enter the unprivileged identity");
}
const protocol = createVerificationSessionProtocol({
  sessionRoot: config.protocolRoot,
});
const request = protocol.readRequest();
if (request.sessionId !== config.sessionId) {
  throw new Error("verification request refers to another session");
}
const reviewBroker = createReviewBrokerProtocol({
  root: config.reviewerBrokerRoot,
});
const pipeline = createVerificationPipeline({
  commandExecutor: createVerificationCommandExecutor({
    artifactRoot: config.gateArtifactRoot,
    commandRunner: (input) => runSandboxedCommand(config, input),
  }),
  reviewExecutor: createExhaustiveReviewExecutor({
    artifactRoot: config.reviewArtifactRoot,
    reviewerSessions: createBrokeredReviewerSessions(reviewBroker),
  }),
  verificationWorkspace: createVerificationWorkspace({
    repositoryPath: config.repositoryPath,
    workspaceRoot: config.workspaceRoot,
    trustedDependencyRoot: config.trustedDependencyRoot,
  }),
});
const verifierReceipt = await pipeline.execute({
  sessionId: request.sessionId,
  baseSha: request.baseSha,
  candidateTreeSha: request.candidateTreeSha,
  changedPaths: request.changedPaths,
  requirements: request.requirements,
  verificationPlan: request.verificationPlan,
  verificationPlanSha256: request.verificationPlanSha256,
  deadlineEpochMilliseconds: request.deadline,
  repositoryPath: config.verificationMaterialsPath,
});
protocol.publishResult({
  requestSha256: request.requestSha256,
  verifierReceipt,
});
} catch (error) {
  if (config?.protocolRoot) {
    try {
      fs.writeFileSync(
        path.join(config.protocolRoot, "runner-error.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack ?? "" : "",
          },
          null,
          2,
        )}\n`,
        { flag: "wx", mode: 0o600 },
      );
    } catch {
      // Preserve the first immutable diagnostic or the original exception.
    }
  }
  throw error;
}
