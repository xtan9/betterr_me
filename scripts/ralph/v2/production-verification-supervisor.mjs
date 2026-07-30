import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unprivilegedWslCommandArguments } from "../worker-isolation.mjs";
import { createReviewBrokerProtocol } from "./review-broker-protocol.mjs";
import { computeSessionPlanDigest } from "./session-supervisor.mjs";
import { createVerificationSessionProtocol } from "./verification-session-protocol.mjs";
import { createRequirementsSnapshot } from "./verification-plan.mjs";
import {
  createWslSystemdChildPlan,
  inspectWslSystemdUnit,
} from "./wsl-systemd-containment.mjs";
import {
  windowsToWslPath,
  wslToWindowsPath,
} from "./wsl-worker-sandbox.mjs";

const SCHEMA_VERSION = 1;
const DEFAULT_WORKER_HOME = "/var/lib/betterr-me-ralph/worker-home";
const DEFAULT_CODEX_HOME = "/var/lib/betterr-me-ralph/codex-runtime";
const DEFAULT_CODEX_EXECUTABLE = "/usr/local/bin/codex";
const DEFAULT_LINUX_WORKSPACE_ROOT =
  "/var/tmp/betterr-me-ralph/verification-workspaces";
const RUNNER_PATH = fileURLToPath(
  new URL("./verification-session-runner.mjs", import.meta.url),
);

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function serialize(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSame(left, right) {
  return serialize(left) === serialize(right);
}

function assertString(value, description, pattern = null, maximum = 32_768) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0") ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertWindowsDirectory(value, description) {
  if (typeof value !== "string" || !path.win32.isAbsolute(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  fs.mkdirSync(value, { recursive: true });
  return fs.realpathSync.native(value);
}

function assertLinuxPath(value, description) {
  const candidate = assertString(value, description);
  if (!path.posix.isAbsolute(candidate) || path.posix.normalize(candidate) !== candidate) {
    throw new Error(`${description} failed integrity validation`);
  }
  return candidate;
}

function writeDurably(filePath, bytes) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishOnce(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidate = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidate, Buffer.from(serialize(value), "utf8"));
  try {
    fs.linkSync(candidate, filePath);
    return value;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } finally {
    fs.rmSync(candidate, { force: true });
  }
}

function normalizeInput(input) {
  if (
    !plainObject(input) ||
    !plainObject(input.issue) ||
    !Number.isSafeInteger(input.deadlineEpochMilliseconds) ||
    input.deadlineEpochMilliseconds <= Date.now() ||
    !Array.isArray(input.changedPaths) ||
    input.changedPaths.length === 0 ||
    !plainObject(input.verificationPlan)
  ) {
    throw new Error("production verification input failed integrity validation");
  }
  return {
    ...input,
    sessionId: assertString(input.sessionId, "verification session ID", null, 500),
    worktreePath: assertWindowsDirectory(
      input.worktreePath,
      "verification candidate worktree",
    ),
    baseSha: assertString(input.baseSha, "verification base SHA", /^[a-f0-9]{40}$/),
    candidateTreeSha: assertString(
      input.candidateTreeSha,
      "verification candidate tree SHA",
      /^[a-f0-9]{40}$/,
    ),
    verificationPlanSha256: assertString(
      input.verificationPlanSha256,
      "verification plan digest",
      /^[a-f0-9]{64}$/,
    ),
    changedPaths: [...input.changedPaths],
  };
}

function safeFailureMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replaceAll("@", "@\u200b")
    .slice(0, 4_000) || "review session failed";
}

function normalizeReceiptPathsForWindows(receipt) {
  const normalized = structuredClone(receipt);
  for (const gate of normalized.evidence?.tests ?? []) {
    gate.outputArtifactPath = wslToWindowsPath(gate.outputArtifactPath);
  }
  for (const specialist of normalized.evidence?.review?.specialistReceipts ?? []) {
    specialist.resultPath = wslToWindowsPath(specialist.resultPath);
  }
  return normalized;
}

function validateReviewRequest(request, input, config) {
  const review = input.verificationPlan.review;
  const expectedAxis = review.axes.find(
    (axis) => request.sessionId === `${review.sessionId}:${axis}`,
  );
  if (
    !expectedAxis ||
    request.axis !== expectedAxis ||
    request.candidateTreeSha !== input.candidateTreeSha ||
    request.policySha256 !== review.policySha256 ||
    request.skillSha256 !== review.skillSha256 ||
    request.deadlineEpochMilliseconds !== input.deadlineEpochMilliseconds ||
    request.readOnly !== true ||
    !request.worktreePath.startsWith(`${config.workspaceRoot}/`) ||
    !request.resultPath.startsWith(`${config.reviewArtifactRoot}/`)
  ) {
    throw new Error("brokered review request escaped the verification plan");
  }
  return expectedAxis;
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createProductionVerificationSupervisor({
  runtimePath,
  repositoryPath,
  verificationMaterialsPath,
  trustedDependencyRoot,
  sessionSupervisor,
  reviewerSessions,
  workerHome = DEFAULT_WORKER_HOME,
  codexHome = DEFAULT_CODEX_HOME,
  codexExecutable = DEFAULT_CODEX_EXECUTABLE,
  linuxWorkspaceRoot = DEFAULT_LINUX_WORKSPACE_ROOT,
  lifecycle = { checkpoint: async () => {} },
}) {
  const runtime = assertWindowsDirectory(runtimePath, "verification runtime root");
  const repository = assertWindowsDirectory(
    repositoryPath,
    "verification repository root",
  );
  const materials = assertWindowsDirectory(
    verificationMaterialsPath,
    "verification materials root",
  );
  assertLinuxPath(trustedDependencyRoot, "verification dependency root");
  assertLinuxPath(workerHome, "verification worker home");
  assertLinuxPath(codexHome, "verification Codex home");
  assertLinuxPath(codexExecutable, "verification Codex executable");
  const trustedLinuxWorkspaceRoot = assertLinuxPath(
    linuxWorkspaceRoot,
    "verification Linux workspace root",
  );
  if (
    !sessionSupervisor ||
    !["plan", "authorize", "startOrAttach", "terminate", "containmentRootFor"].every(
      (name) => typeof sessionSupervisor[name] === "function",
    ) ||
    !reviewerSessions ||
    typeof reviewerSessions.startOrAttach !== "function" ||
    typeof reviewerSessions.terminate !== "function" ||
    !lifecycle ||
    typeof lifecycle.checkpoint !== "function"
  ) {
    throw new Error("production verification boundaries failed integrity validation");
  }
  const sessionsRoot = path.join(runtime, "verification-session-requests");
  fs.mkdirSync(sessionsRoot, { recursive: true });

  function rootsFor(sessionId) {
    const privateRoot = path.join(sessionsRoot, sha256(sessionId));
    fs.mkdirSync(privateRoot, { recursive: true });
    const realPrivateRoot = fs.realpathSync.native(privateRoot);
    const protocolRoot = path.join(realPrivateRoot, "protocol");
    const reviewerBrokerRoot = path.join(realPrivateRoot, "reviewer-broker");
    fs.mkdirSync(protocolRoot, { recursive: true });
    fs.mkdirSync(reviewerBrokerRoot, { recursive: true });
    return { privateRoot: realPrivateRoot, protocolRoot, reviewerBrokerRoot };
  }

  async function serviceReviews({ broker, input, config, inFlight }) {
    for (const request of broker.listRequests()) {
      if (broker.readResponse(request.sessionId) || inFlight.has(request.sessionId)) {
        continue;
      }
      validateReviewRequest(request, input, config);
      const operation = (async () => {
        try {
          const receipt = await reviewerSessions.startOrAttach({
            sessionId: request.sessionId,
            axis: request.axis,
            prompt: request.prompt,
            resultPath: wslToWindowsPath(request.resultPath),
            worktreePath: request.worktreePath,
            candidateTreeSha: request.candidateTreeSha,
            policySha256: request.policySha256,
            skillSha256: request.skillSha256,
            deadlineEpochMilliseconds: request.deadlineEpochMilliseconds,
            readOnly: true,
          });
          broker.publishSuccess(request.sessionId, {
            ...receipt,
            resultPath: request.resultPath,
          });
        } catch (error) {
          broker.publishFailure(request.sessionId, safeFailureMessage(error));
        }
      })().finally(() => inFlight.delete(request.sessionId));
      inFlight.set(request.sessionId, operation);
    }
  }

  return {
    async startOrAttach(rawInput) {
      const input = normalizeInput(rawInput);
      const roots = rootsFor(input.sessionId);
      const protocol = createVerificationSessionProtocol({
        sessionRoot: roots.protocolRoot,
      });
      protocol.publishRequest({
        sessionId: input.sessionId,
        baseSha: input.baseSha,
        candidateTreeSha: input.candidateTreeSha,
        changedPaths: input.changedPaths,
        requirements: createRequirementsSnapshot(input.issue),
        verificationPlan: input.verificationPlan,
        verificationPlanSha256: input.verificationPlanSha256,
        deadline: input.deadlineEpochMilliseconds,
      });
      const stableConfig = {
        schemaVersion: SCHEMA_VERSION,
        kind: "verification-session",
        sessionId: input.sessionId,
        protocolRoot: windowsToWslPath(roots.protocolRoot),
        reviewerBrokerRoot: windowsToWslPath(roots.reviewerBrokerRoot),
        repositoryPath: windowsToWslPath(repository),
        workspaceRoot: path.posix.join(
          trustedLinuxWorkspaceRoot,
          sha256(input.sessionId),
        ),
        gateArtifactRoot: windowsToWslPath(
          path.join(runtime, "verification-gates"),
        ),
        reviewArtifactRoot: windowsToWslPath(
          path.join(runtime, "verification-reviews"),
        ),
        verificationMaterialsPath: windowsToWslPath(materials),
        trustedDependencyRoot,
        workerHome,
        codexHome,
        codexExecutable,
      };
      const configPath = path.join(roots.privateRoot, "config.json");
      let config;
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const { runtimeTimeoutSeconds: _timeout, ...observedStable } = config;
        if (!exactSame(observedStable, stableConfig)) {
          throw new Error("verification session configuration conflicts");
        }
      } else {
        config = publishOnce(configPath, {
          ...stableConfig,
          runtimeTimeoutSeconds: Math.max(
            1,
            Math.min(
              86_400,
              Math.ceil((input.deadlineEpochMilliseconds - Date.now()) / 1_000),
            ),
          ),
        });
      }
      const configSha256 = sha256(serialize(config));
      const linuxLaunch = unprivilegedWslCommandArguments({
        home: workerHome,
        environment: [`CODEX_HOME=${codexHome}`],
        command: "/usr/local/bin/node",
        args: [
          windowsToWslPath(RUNNER_PATH),
          windowsToWslPath(configPath),
          configSha256,
        ],
      });
      const systemd = createWslSystemdChildPlan({
        containmentRoot: sessionSupervisor.containmentRootFor(input.sessionId),
        sessionId: input.sessionId,
        runtimeTimeoutSeconds: config.runtimeTimeoutSeconds,
        child: {
          executable: linuxLaunch[0],
          args: linuxLaunch.slice(1),
          cwd: windowsToWslPath(input.worktreePath),
          environment: {},
        },
      });
      const planDigest = computeSessionPlanDigest({
        sessionId: input.sessionId,
        child: systemd.windowsChild,
      });
      await sessionSupervisor.plan({
        sessionId: input.sessionId,
        planDigest,
        child: systemd.windowsChild,
      });
      await sessionSupervisor.authorize({
        sessionId: input.sessionId,
        planDigest,
        authorizationId: `verify-${sha256(`${input.sessionId}\0${planDigest}`).slice(0, 48)}`,
      });
      const broker = createReviewBrokerProtocol({ root: roots.reviewerBrokerRoot });
      const inFlight = new Map();
      let terminalSettled = false;
      let terminalValue;
      let terminalError;
      const terminalPromise = sessionSupervisor
        .startOrAttach({ sessionId: input.sessionId })
        .then((value) => {
          terminalValue = value;
          terminalSettled = true;
        })
        .catch((error) => {
          terminalError = error;
          terminalSettled = true;
        });
      while (!terminalSettled) {
        await serviceReviews({ broker, input, config, inFlight });
        if (rawInput.signal?.aborted) {
          throw new Error("verification wait aborted by controller");
        }
        await Promise.race([terminalPromise, sleep(25)]);
      }
      await terminalPromise;
      await Promise.allSettled([...inFlight.values()]);
      if (terminalError) throw terminalError;
      if (
        terminalValue?.kind !== "completed" ||
        terminalValue.sessionId !== input.sessionId ||
        terminalValue.launchCount !== 1 ||
        terminalValue.containment?.processTreeTerminated !== true ||
        terminalValue.containment?.liveProcessCount !== 0
      ) {
        const runnerErrorPath = path.join(roots.protocolRoot, "runner-error.json");
        const runnerError = fs.existsSync(runnerErrorPath)
          ? JSON.parse(fs.readFileSync(runnerErrorPath, "utf8"))
          : null;
        throw new Error(
          `verification session did not complete inside durable containment${
            runnerError?.message ? `: ${runnerError.message}` : ""
          }`,
        );
      }
      const linuxInspection = await inspectWslSystemdUnit(systemd.unitName);
      if (linuxInspection.active || linuxInspection.populated) {
        throw new Error("verification session Linux cgroup remained populated");
      }
      const verifierReceipt = protocol.readResult().verifierReceipt;
      await lifecycle.checkpoint({
        point: "production-verification-completed",
        sessionId: input.sessionId,
        candidateTreeSha: input.candidateTreeSha,
      });
      return normalizeReceiptPathsForWindows(verifierReceipt);
    },

    async terminate(input) {
      const sessionId = assertString(
        input?.sessionId,
        "verification termination session ID",
        null,
        500,
      );
      const candidateTreeSha = assertString(
        input?.candidateTreeSha,
        "verification termination tree",
        /^[a-f0-9]{40}$/,
      );
      const operationId = assertString(
        input?.operationId,
        "verification termination operation ID",
        null,
        500,
      );
      const roots = rootsFor(sessionId);
      const broker = createReviewBrokerProtocol({ root: roots.reviewerBrokerRoot });
      const reviewStops = broker.listRequests().map((request) =>
        reviewerSessions.terminate({
          sessionId: request.sessionId,
          operationId: `verify-stop-${sha256(`${operationId}\0${request.sessionId}`).slice(0, 40)}`,
          reason: "verification-session-finalization",
        }),
      );
      const mainStop = sessionSupervisor.terminate({
        sessionId,
        operationId,
        reason: "verification-session-finalization",
      });
      const [terminal, reviews] = await Promise.all([
        mainStop,
        Promise.allSettled(reviewStops),
      ]);
      const rejectedReview = reviews.find((result) => result.status === "rejected");
      if (rejectedReview) throw rejectedReview.reason;
      if (
        terminal?.kind !== "terminated" ||
        terminal.sessionId !== sessionId ||
        terminal.operationId !== operationId ||
        terminal.processTreeTerminated !== true
      ) {
        throw new Error("verification termination receipt failed integrity validation");
      }
      return {
        kind: "terminated",
        sessionId,
        candidateTreeSha,
        operationId,
        processTreeTerminated: true,
      };
    },
  };
}
