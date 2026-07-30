import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unprivilegedWslCommandArguments } from "../worker-isolation.mjs";
import { computeSessionPlanDigest } from "./session-supervisor.mjs";
import {
  createWslSystemdChildPlan,
  inspectWslSystemdUnit,
} from "./wsl-systemd-containment.mjs";
import { windowsToWslPath } from "./wsl-worker-sandbox.mjs";

const SCHEMA_VERSION = 1;
const DEFAULT_WORKER_HOME = "/var/lib/betterr-me-ralph/worker-home";
const DEFAULT_CODEX_HOME = "/var/lib/betterr-me-ralph/codex-runtime";
const DEFAULT_DEPENDENCY_ROOT =
  "/var/lib/betterr-me-ralph/deps-source/node_modules";
const DEFAULT_LINUX_WORKSPACE_ROOT =
  "/var/tmp/betterr-me-ralph/verification-workspaces";
const DEFAULT_CODEX_EXECUTABLE = "/usr/local/bin/codex";
const RUNNER_PATH = fileURLToPath(
  new URL("./reviewer-session-runner.mjs", import.meta.url),
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
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, serialize(value));
  try {
    fs.linkSync(candidatePath, filePath);
    return value;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function publishBytesOnce(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, bytes);
  try {
    fs.linkSync(candidatePath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
  const observed = fs.readFileSync(filePath);
  if (!observed.equals(Buffer.from(bytes))) {
    throw new Error("review session immutable input publication conflicts");
  }
}

function assertString(value, description, pattern = null) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 500_000 ||
    value.includes("\0") ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertLinuxPath(value, description) {
  const candidate = assertString(value, description);
  if (!path.posix.isAbsolute(candidate) || path.posix.normalize(candidate) !== candidate) {
    throw new Error(`${description} failed integrity validation`);
  }
  return candidate;
}

function assertWindowsDirectory(value, description) {
  if (typeof value !== "string" || !path.win32.isAbsolute(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  fs.mkdirSync(value, { recursive: true });
  return fs.realpathSync.native(value);
}

function assertWindowsFile(value, description) {
  if (
    typeof value !== "string" ||
    !path.win32.isAbsolute(value) ||
    !fs.statSync(value).isFile()
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return fs.realpathSync.native(value);
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function withinLinux(parent, candidate) {
  const relative = path.posix.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.posix.isAbsolute(relative))
  );
}

function normalizeInput(input, artifactRoot, linuxWorkspaceRoot) {
  if (
    !plainObject(input) ||
    input.readOnly !== true ||
    !Number.isSafeInteger(input.deadlineEpochMilliseconds) ||
    input.deadlineEpochMilliseconds <= Date.now()
  ) {
    throw new Error("review session input failed integrity validation");
  }
  let worktreePath;
  let linuxWorktreePath;
  if (
    typeof input.worktreePath === "string" &&
    /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(input.worktreePath)
  ) {
    worktreePath = assertWindowsDirectory(
      input.worktreePath,
      "review session worktree",
    );
    linuxWorktreePath = windowsToWslPath(worktreePath);
  } else {
    linuxWorktreePath = assertLinuxPath(
      input.worktreePath,
      "review session Linux worktree",
    );
    if (!withinLinux(linuxWorkspaceRoot, linuxWorktreePath)) {
      throw new Error("review session Linux worktree escaped its trusted root");
    }
    worktreePath = linuxWorktreePath;
  }
  if (typeof input.resultPath !== "string" || !path.win32.isAbsolute(input.resultPath)) {
    throw new Error("review session result path failed integrity validation");
  }
  const resultPath = path.win32.resolve(input.resultPath);
  if (!within(artifactRoot, resultPath)) {
    throw new Error("review session result path escaped its artifact root");
  }
  return {
    sessionId: assertString(input.sessionId, "review session ID"),
    axis: assertString(input.axis, "review session axis", /^[a-z][a-z0-9-]{0,63}$/),
    prompt: assertString(input.prompt, "review session prompt"),
    resultPath,
    worktreePath,
    linuxWorktreePath,
    candidateTreeSha: assertString(
      input.candidateTreeSha,
      "review candidate tree SHA",
      /^[a-f0-9]{40}$/,
    ),
    policySha256: assertString(
      input.policySha256,
      "review policy digest",
      /^[a-f0-9]{64}$/,
    ),
    skillSha256: assertString(
      input.skillSha256,
      "review skill digest",
      /^[a-f0-9]{64}$/,
    ),
    deadlineEpochMilliseconds: input.deadlineEpochMilliseconds,
    readOnly: true,
  };
}

function validateRegularBoundFile(filePath, expectedRoot, description) {
  let resolved;
  let bytes;
  try {
    const metadata = fs.lstatSync(filePath);
    resolved = fs.realpathSync.native(filePath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      !within(expectedRoot, resolved)
    ) {
      throw new Error(`${description} is not a trusted regular file`);
    }
    bytes = fs.readFileSync(resolved);
  } catch (error) {
    throw new Error(`${description} failed integrity validation`, { cause: error });
  }
  return { resolved, bytes };
}

export function createProductionReviewerSessions({
  runtimePath,
  artifactRoot,
  sessionSupervisor,
  reviewSchemaPath,
  workerHome = DEFAULT_WORKER_HOME,
  codexHome = DEFAULT_CODEX_HOME,
  dependencyRoot = DEFAULT_DEPENDENCY_ROOT,
  codexExecutable = DEFAULT_CODEX_EXECUTABLE,
  codexPrefixArguments = [],
  linuxWorkspaceRoot = DEFAULT_LINUX_WORKSPACE_ROOT,
}) {
  const runtime = assertWindowsDirectory(runtimePath, "review session runtime root");
  const artifacts = assertWindowsDirectory(
    artifactRoot,
    "review session artifact root",
  );
  if (!within(runtime, artifacts)) {
    throw new Error("review session artifacts escaped the runtime root");
  }
  const schemaPath = assertWindowsFile(reviewSchemaPath, "review output schema");
  const trustedLinuxWorkspaceRoot = assertLinuxPath(
    linuxWorkspaceRoot,
    "review Linux workspace root",
  );
  for (const [value, description] of [
    [workerHome, "review worker home"],
    [codexHome, "review Codex home"],
    [dependencyRoot, "review dependency root"],
    [codexExecutable, "review Codex executable"],
  ]) {
    assertLinuxPath(value, description);
  }
  if (
    !Array.isArray(codexPrefixArguments) ||
    codexPrefixArguments.some(
      (entry) => typeof entry !== "string" || entry.includes("\0") || entry.length > 32_768,
    )
  ) {
    throw new Error("review Codex prefix arguments failed integrity validation");
  }
  if (
    !sessionSupervisor ||
    !["plan", "authorize", "startOrAttach", "containmentRootFor"].every(
      (method) => typeof sessionSupervisor[method] === "function",
    )
  ) {
    throw new Error("review session supervisor failed integrity validation");
  }
  const requestRoot = path.join(runtime, "reviewer-session-requests");
  fs.mkdirSync(requestRoot, { recursive: true });

  return {
    async terminate({ sessionId, operationId, reason }) {
      assertString(sessionId, "review termination session ID");
      assertString(operationId, "review termination operation ID");
      assertString(reason, "review termination reason");
      const terminal = await sessionSupervisor.terminate({
        sessionId,
        operationId,
        reason,
      });
      const containment = terminal?.containment;
      if (
        terminal?.kind !== "terminated" ||
        terminal.sessionId !== sessionId ||
        terminal.operationId !== operationId ||
        terminal.processTreeTerminated !== true ||
        (containment &&
          (containment.processTreeTerminated !== true ||
            containment.liveProcessCount !== 0))
      ) {
        throw new Error("review termination receipt failed integrity validation");
      }
      return {
        kind: "terminated",
        sessionId,
        operationId,
        processTreeTerminated: true,
      };
    },
    async startOrAttach(rawInput) {
      const input = normalizeInput(
        rawInput,
        artifacts,
        trustedLinuxWorkspaceRoot,
      );
      const sessionKey = sha256(input.sessionId);
      const privateRoot = path.join(requestRoot, sessionKey);
      fs.mkdirSync(privateRoot, { recursive: true });
      const realPrivateRoot = fs.realpathSync.native(privateRoot);
      const promptPath = path.join(realPrivateRoot, "prompt.txt");
      publishBytesOnce(promptPath, Buffer.from(input.prompt, "utf8"));
      const configPath = path.join(realPrivateRoot, "config.json");
      const eventLogPath = path.join(realPrivateRoot, "events.jsonl");
      const runnerReceiptPath = path.join(realPrivateRoot, "runner-receipt.json");
      const stableConfig = {
        schemaVersion: SCHEMA_VERSION,
        kind: "reviewer-session",
        sessionId: input.sessionId,
        axis: input.axis,
        candidateTreeSha: input.candidateTreeSha,
        policySha256: input.policySha256,
        skillSha256: input.skillSha256,
        deadlineEpochMilliseconds: input.deadlineEpochMilliseconds,
        promptPath: windowsToWslPath(promptPath),
        promptSha256: sha256(input.prompt),
        resultPath: windowsToWslPath(input.resultPath),
        eventLogPath: windowsToWslPath(eventLogPath),
        runnerReceiptPath: windowsToWslPath(runnerReceiptPath),
        worktreePath: input.linuxWorktreePath,
        reviewSchemaPath: windowsToWslPath(schemaPath),
        workerHome,
        codexHome,
        dependencyRoot,
        codexExecutable,
        codexPrefixArguments: [...codexPrefixArguments],
      };
      let config;
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const { runtimeTimeoutSeconds: _storedTimeout, ...storedStable } = config;
        if (!exactSame(storedStable, stableConfig)) {
          throw new Error("review session configuration conflicts");
        }
      } else {
        const runtimeTimeoutSeconds = Math.max(
          1,
          Math.min(
            86_400,
            Math.ceil((input.deadlineEpochMilliseconds - Date.now()) / 1_000),
          ),
        );
        config = publishOnce(configPath, {
          ...stableConfig,
          runtimeTimeoutSeconds,
        });
      }
      if (
        !Number.isSafeInteger(config.runtimeTimeoutSeconds) ||
        config.runtimeTimeoutSeconds < 1 ||
        config.runtimeTimeoutSeconds > 86_400
      ) {
        throw new Error("review session timeout failed integrity validation");
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
          cwd: config.worktreePath,
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
        authorizationId: `review-${sha256(`${input.sessionId}\0${planDigest}`).slice(0, 48)}`,
      });
      const terminal = await sessionSupervisor.startOrAttach({
        sessionId: input.sessionId,
      });
      if (
        terminal?.kind !== "completed" ||
        terminal.sessionId !== input.sessionId ||
        terminal.launchCount !== 1 ||
        terminal.containment?.processTreeTerminated !== true ||
        terminal.containment?.liveProcessCount !== 0
      ) {
        throw new Error("review session did not complete inside durable containment");
      }
      const linuxInspection = await inspectWslSystemdUnit(systemd.unitName);
      if (linuxInspection.active || linuxInspection.populated) {
        throw new Error("review session Linux cgroup remained populated");
      }
      const result = validateRegularBoundFile(
        input.resultPath,
        artifacts,
        "review session result",
      );
      const runnerReceipt = JSON.parse(
        validateRegularBoundFile(
          runnerReceiptPath,
          realPrivateRoot,
          "review runner receipt",
        ).bytes.toString("utf8"),
      );
      if (
        runnerReceipt?.schemaVersion !== SCHEMA_VERSION ||
        runnerReceipt.sessionId !== input.sessionId ||
        runnerReceipt.axis !== input.axis ||
        runnerReceipt.configSha256 !== configSha256 ||
        runnerReceipt.resultSha256 !== sha256(result.bytes) ||
        runnerReceipt.freshSession !== true ||
        runnerReceipt.uid !== 65534 ||
        runnerReceipt.gid !== 65534 ||
        !Number.isSafeInteger(runnerReceipt.processId) ||
        runnerReceipt.processId <= 0
      ) {
        throw new Error("review runner receipt failed integrity validation");
      }
      return {
        kind: "completed",
        sessionId: input.sessionId,
        axis: input.axis,
        candidateTreeSha: input.candidateTreeSha,
        freshSession: true,
        readOnly: true,
        processTreeTerminated: true,
        resultPath: result.resolved,
        outputSha256: sha256(result.bytes),
      };
    },
  };
}
