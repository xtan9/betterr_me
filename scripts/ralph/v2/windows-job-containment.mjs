import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProcessIdentity } from "./state-store.mjs";

const SCHEMA_VERSION = 1;
const GUARANTEE = "windows-job-object-kill-on-close-no-breakaway";
const DEFAULT_POLL_INTERVAL_MILLISECONDS = 25;
const DEFAULT_OPERATION_TIMEOUT_MILLISECONDS = 30_000;
const PROCESS_IDENTITY_PATTERN = /^windows-start-ticks:\d+$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const HOST_SOURCE_PATH = fileURLToPath(
  new URL("./windows-job-host.cs", import.meta.url),
);
const HOST_BUILD_PATH = fileURLToPath(
  new URL("./build-windows-job-host.ps1", import.meta.url),
);
const SAFE_ENVIRONMENT_KEYS = [
  "ComSpec",
  "OS",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
];

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function writeDurably(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content, "utf8");
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
    return { created: true, value };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return { created: false, value: readJson(filePath) };
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Windows Job Object fact failed integrity validation at ${filePath}`, {
      cause: error,
    });
  }
}

function optionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function assertIdentifier(value, description) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertDuration(value, description, fallback) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new Error(`${description} failed integrity validation`);
  }
  return selected;
}

function processRecord(value, description) {
  if (
    !plainObject(value) ||
    !Number.isSafeInteger(value.processId) ||
    value.processId <= 0 ||
    typeof value.processIdentity !== "string" ||
    !PROCESS_IDENTITY_PATTERN.test(value.processIdentity)
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return {
    processId: value.processId,
    processIdentity: value.processIdentity,
  };
}

function sameProcessIsAlive(record) {
  return readProcessIdentity(record.processId) === record.processIdentity;
}

function trustedWslExecutablePath() {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) {
    throw new Error("Windows Job Object containment cannot locate wsl.exe");
  }
  const executable = path.join(systemRoot, "System32", "wsl.exe");
  if (!fs.existsSync(executable)) {
    throw new Error("trusted WSL bridge requires WSL2");
  }
  return path.resolve(executable);
}

function assertChild(child, trustedWslBridge) {
  const environmentNames = plainObject(child?.environment)
    ? Object.keys(child.environment)
    : [];
  const normalizedEnvironmentNames = environmentNames.map((name) =>
    name.toUpperCase(),
  );
  if (
    !plainObject(child) ||
    typeof child.executable !== "string" ||
    !path.isAbsolute(child.executable) ||
    !fs.statSync(child.executable).isFile() ||
    typeof child.cwd !== "string" ||
    !path.isAbsolute(child.cwd) ||
    !fs.statSync(child.cwd).isDirectory() ||
    !Array.isArray(child.args) ||
    child.args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length > 32_768 ||
        argument.includes("\0"),
    ) ||
    !plainObject(child.environment) ||
    Object.entries(child.environment).some(
      ([name, value]) =>
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
        name.toUpperCase().startsWith("RALPH_V2_") ||
        typeof value !== "string" ||
        value.length > 32_768 ||
        value.includes("\0"),
    ) ||
    new Set(normalizedEnvironmentNames).size !==
      normalizedEnvironmentNames.length ||
    typeof child.holdBeforeSpawn !== "boolean" ||
    !new Set(["low-integrity", "trusted-wsl-bridge"]).has(
      child.tokenMode ?? "low-integrity",
    )
  ) {
    throw new Error("Windows Job Object child plan failed integrity validation");
  }
  const tokenMode = child.tokenMode ?? "low-integrity";
  const executable = path.resolve(child.executable);
  if (
    tokenMode === "trusted-wsl-bridge" &&
    (!trustedWslBridge ||
      executable.toUpperCase() !== trustedWslExecutablePath().toUpperCase())
  ) {
    throw new Error("trusted WSL bridge authorization failed integrity validation");
  }
  return {
    executable,
    args: [...child.args],
    cwd: path.resolve(child.cwd),
    environment: { ...child.environment },
    holdBeforeSpawn: child.holdBeforeSpawn,
    tokenMode,
  };
}

function exactSame(left, right) {
  return serialize(left) === serialize(right);
}

function windowsPowerShellPath() {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) {
    throw new Error("Windows Job Object containment cannot locate PowerShell");
  }
  const executable = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (!fs.existsSync(executable)) {
    throw new Error("Windows Job Object containment requires Windows PowerShell");
  }
  return executable;
}

function setIntegrityLevel(targetPath, level, recursive) {
  if (!new Set(["L", "M"]).has(level)) {
    throw new Error("Windows integrity level failed integrity validation");
  }
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) {
    throw new Error("Windows Job Object containment cannot locate icacls.exe");
  }
  const executable = path.join(systemRoot, "System32", "icacls.exe");
  const result = spawnSync(
    executable,
    [
      targetPath,
      "/setintegritylevel",
      `(OI)(CI)${level}`,
      ...(recursive ? ["/T", "/C", "/Q"] : []),
    ],
    {
      encoding: "utf8",
      env: brokerEnvironment(),
      windowsHide: true,
      timeout: 30_000,
    },
  );
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `Windows integrity label could not be applied to ${targetPath}: ${String(
        result.stderr || result.stdout || result.error?.message || result.status,
      ).trim()}`,
      { cause: result.error },
    );
  }
}

function ensureHostExecutable(containmentRoot) {
  const sourceDigest = hashFile(HOST_SOURCE_PATH);
  const toolRoot = path.join(containmentRoot, "host", sourceDigest.slice(0, 16));
  const executablePath = path.join(toolRoot, "job-host.exe");
  const receiptPath = path.join(toolRoot, "build-receipt.json");
  fs.mkdirSync(toolRoot, { recursive: true });
  const existingReceipt = optionalJson(receiptPath);
  if (existingReceipt) {
    if (
      existingReceipt.schemaVersion !== SCHEMA_VERSION ||
      existingReceipt.sourceDigest !== sourceDigest ||
      existingReceipt.executableDigest !== hashFile(executablePath)
    ) {
      throw new Error("Windows Job Object host binary failed integrity validation");
    }
    return { executablePath, sourceDigest, executableDigest: existingReceipt.executableDigest };
  }

  if (fs.existsSync(executablePath)) {
    throw new Error(
      "Windows Job Object host executable was pre-seeded without a trusted receipt",
    );
  }

  const candidatePath = path.join(
    toolRoot,
    `candidate-${process.pid}-${randomUUID().slice(0, 8)}.exe`,
  );
  const build = spawnSync(
    windowsPowerShellPath(),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      HOST_BUILD_PATH,
      "-SourcePath",
      HOST_SOURCE_PATH,
      "-OutputPath",
      candidatePath,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    },
  );
  if (build.error || build.signal || build.status !== 0 || !fs.existsSync(candidatePath)) {
    fs.rmSync(candidatePath, { force: true });
    throw new Error(
      `Windows Job Object host build failed: ${[
        build.error?.message,
        build.stdout,
        build.stderr,
      ]
        .filter(Boolean)
        .join(" | ")}`,
      { cause: build.error },
    );
  }
  try {
    fs.linkSync(candidatePath, executablePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    sourceDigest,
    executableDigest: hashFile(executablePath),
  };
  const publication = publishOnce(receiptPath, receipt);
  if (!exactSame(publication.value, receipt)) {
    throw new Error("Windows Job Object host build receipt conflicts");
  }
  return { executablePath, sourceDigest, executableDigest: receipt.executableDigest };
}

function createManifest(containmentRoot, sessionId, host) {
  const manifestPath = path.join(containmentRoot, "manifest.json");
  const existing = optionalJson(manifestPath);
  if (existing) {
    if (
      existing.schemaVersion !== SCHEMA_VERSION ||
      existing.sessionId !== sessionId ||
      existing.guarantee !== GUARANTEE ||
      typeof existing.capability !== "string" ||
      !DIGEST_PATTERN.test(existing.capability) ||
      typeof existing.jobName !== "string" ||
      !/^Local\\RalphV2-[a-f0-9]{48}$/.test(existing.jobName) ||
      existing.hostSourceDigest !== host.sourceDigest ||
      existing.hostExecutableDigest !== host.executableDigest
    ) {
      throw new Error("Windows Job Object manifest failed integrity validation");
    }
    return existing;
  }
  const capability = randomBytes(32).toString("hex");
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    guarantee: GUARANTEE,
    capability,
    jobName: `Local\\RalphV2-${sha256(`${sessionId}\0${capability}`).slice(0, 48)}`,
    hostSourceDigest: host.sourceDigest,
    hostExecutableDigest: host.executableDigest,
  };
  const publication = publishOnce(manifestPath, manifest);
  if (!exactSame(publication.value, manifest)) {
    throw new Error("Windows Job Object manifest publication conflicts");
  }
  return manifest;
}

function childEnvironment(child, sessionId, authorization) {
  const values = new Map();
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (typeof process.env[key] === "string") {
      values.set(key.toUpperCase(), [key, process.env[key]]);
    }
  }
  for (const [key, value] of Object.entries(child.environment)) {
    values.set(key.toUpperCase(), [key, value]);
  }
  for (const [key, value] of Object.entries({
    RALPH_V2_SESSION_ID: sessionId,
    RALPH_V2_AUTHORIZATION_ID: authorization.authorizationId,
    RALPH_V2_PLAN_DIGEST: authorization.planDigest,
  })) {
    values.set(key, [key, value]);
  }
  return Object.fromEntries(values.values());
}

function brokerEnvironment() {
  return Object.fromEntries(
    SAFE_ENVIRONMENT_KEYS.flatMap((key) =>
      typeof process.env[key] === "string" ? [[key, process.env[key]]] : [],
    ),
  );
}

function normalizeAuthorization(value) {
  if (
    !plainObject(value) ||
    typeof value.authorizationId !== "string" ||
    !value.authorizationId.trim() ||
    typeof value.planDigest !== "string" ||
    !DIGEST_PATTERN.test(value.planDigest)
  ) {
    throw new Error("Windows Job Object authorization failed integrity validation");
  }
  return {
    authorizationId: value.authorizationId,
    planDigest: value.planDigest,
  };
}

function normalizeObservation(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.guarantee !== GUARANTEE ||
    !Array.isArray(value.knownProcesses) ||
    !Array.isArray(value.liveProcesses)
  ) {
    throw new Error("Windows Job Object observation failed integrity validation");
  }
  const knownProcesses = value.knownProcesses.map((record) =>
    processRecord(record, "known Job Object process"),
  );
  const claimedLive = value.liveProcesses.map((record) =>
    processRecord(record, "live Job Object process"),
  );
  const liveProcesses = claimedLive.filter(sameProcessIsAlive);
  return {
    guarantee: GUARANTEE,
    knownProcesses,
    liveProcesses,
    liveProcessCount: liveProcesses.length,
  };
}

async function waitForFact({ filePath, failurePath, timeoutMilliseconds, description }) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!fs.existsSync(filePath)) {
    if (fs.existsSync(failurePath)) {
      const failure = readJson(failurePath);
      throw new Error(`Windows Job Object host failed: ${failure.message}`);
    }
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`);
    await sleep(20);
  }
  return readJson(filePath);
}

export function createWindowsJobContainment({
  containmentRoot,
  sessionId,
  pollIntervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
  operationTimeoutMilliseconds = DEFAULT_OPERATION_TIMEOUT_MILLISECONDS,
  nativeFaultPoint = null,
  trustedWslBridge = false,
  lifecycle = { checkpoint: async () => {} },
}) {
  if (process.platform !== "win32") {
    throw new Error("Windows Job Object containment is only available on Windows");
  }
  if (typeof containmentRoot !== "string" || !path.isAbsolute(containmentRoot)) {
    throw new Error("Windows Job Object containment root failed integrity validation");
  }
  assertIdentifier(sessionId, "Windows Job Object session ID");
  const pollMilliseconds = assertDuration(
    pollIntervalMilliseconds,
    "Windows Job Object poll interval",
    DEFAULT_POLL_INTERVAL_MILLISECONDS,
  );
  const timeoutMilliseconds = assertDuration(
    operationTimeoutMilliseconds,
    "Windows Job Object operation timeout",
    DEFAULT_OPERATION_TIMEOUT_MILLISECONDS,
  );
  if (
    nativeFaultPoint !== null &&
    nativeFaultPoint !== "after-atomic-create-before-ready"
  ) {
    throw new Error("Windows Job Object native fault point is invalid");
  }
  if (typeof trustedWslBridge !== "boolean") {
    throw new Error("trusted WSL bridge policy failed integrity validation");
  }
  if (!lifecycle || typeof lifecycle.checkpoint !== "function") {
    throw new Error("Windows Job Object lifecycle failed integrity validation");
  }
  fs.mkdirSync(containmentRoot, { recursive: true });
  const root = fs.realpathSync.native(containmentRoot);
  setIntegrityLevel(root, "M", false);
  const host = ensureHostExecutable(root);
  const manifest = createManifest(root, sessionId, host);
  const configPath = path.join(root, "launch-config.json");
  const readyPath = path.join(root, "ready.json");
  const observationPath = path.join(root, "observation.json");
  const completedPath = path.join(root, "completed.json");
  const failurePath = path.join(root, "failure.json");
  const brokerClaimPath = path.join(root, "broker-claim.json");
  const brokerReleasePath = path.join(root, "broker-release.json");
  const terminationRequestPath = path.join(root, "termination-request.json");
  const terminatedPath = path.join(root, "terminated.json");
  const faultChildPath = path.join(root, "fault-child.json");

  function validateBrokerClaim(value) {
    if (
      !plainObject(value) ||
      value.schemaVersion !== SCHEMA_VERSION ||
      value.sessionId !== sessionId ||
      value.capabilitySha256 !== sha256(manifest.capability)
    ) {
      throw new Error("Windows Job Object broker claim failed integrity validation");
    }
    return {
      ...value,
      broker: processRecord(value.broker, "Windows Job Object broker claim"),
    };
  }

  async function ensureBrokerStarted() {
    if (fs.existsSync(readyPath)) return;
    let claim = optionalJson(brokerClaimPath);
    if (!claim) {
      const broker = spawn(host.executablePath, ["host", configPath], {
        cwd: root,
        detached: true,
        env: brokerEnvironment(),
        stdio: "ignore",
        windowsHide: true,
      });
      broker.once("error", () => {});
      broker.unref();
      await lifecycle.checkpoint({
        point: "windows-job-broker-spawned",
        sessionId,
      });
      claim = await waitForFact({
        filePath: brokerClaimPath,
        failurePath,
        timeoutMilliseconds,
        description: "Job Object broker claim",
      });
    }
    const trustedClaim = validateBrokerClaim(claim);
    if (!sameProcessIsAlive(trustedClaim.broker)) {
      throw new Error("Windows Job Object broker died before child publication");
    }
    const release = {
      schemaVersion: SCHEMA_VERSION,
      sessionId,
      capability: manifest.capability,
      brokerProcessId: trustedClaim.broker.processId,
      brokerProcessIdentity: trustedClaim.broker.processIdentity,
    };
    const publication = publishOnce(brokerReleasePath, release);
    if (!exactSame(publication.value, release)) {
      throw new Error("Windows Job Object broker release conflicts");
    }
  }

  async function inspect() {
    const observation = optionalJson(observationPath);
    if (!observation) {
      if (fs.existsSync(configPath) && !fs.existsSync(terminatedPath)) {
        throw new Error(
          "Windows Job Object containment has no authoritative process observation",
        );
      }
      return {
        guarantee: GUARANTEE,
        knownProcesses: [],
        liveProcesses: [],
        liveProcessCount: 0,
      };
    }
    return normalizeObservation(observation);
  }

  function validateCompletion(completed) {
    if (
      !plainObject(completed) ||
      completed.schemaVersion !== SCHEMA_VERSION ||
      !Number.isSafeInteger(completed.exitCode) ||
      completed.exitCode < 0 ||
      completed.signal !== null
    ) {
      throw new Error("Windows Job Object completion failed integrity validation");
    }
    return { exitCode: completed.exitCode, signal: null };
  }

  async function brokerCrashEvidence(ready) {
    const broker = processRecord(ready.broker, "Windows Job Object broker");
    if (sameProcessIsAlive(broker)) return null;
    const rootRecord = processRecord(ready.root, "Windows Job Object root process");
    const observation = await inspect();
    const knownByIdentity = new Map();
    for (const record of [rootRecord, ...observation.knownProcesses]) {
      knownByIdentity.set(`${record.processId}:${record.processIdentity}`, record);
    }
    const knownProcesses = [...knownByIdentity.values()];
    if (knownProcesses.some(sameProcessIsAlive)) return null;
    return knownProcesses;
  }

  function completionFor(ready) {
    return (async () => {
      const broker = processRecord(ready.broker, "Windows Job Object broker");
      let brokerDeathDeadline = null;
      while (true) {
        const completed = optionalJson(completedPath);
        if (completed) return validateCompletion(completed);
        if (fs.existsSync(failurePath)) {
          const failure = readJson(failurePath);
          throw new Error(`Windows Job Object host failed: ${failure.message}`);
        }
        if (!sameProcessIsAlive(broker)) {
          brokerDeathDeadline ??= Date.now() + timeoutMilliseconds;
          const evidence = await brokerCrashEvidence(ready);
          if (evidence) {
            const synthetic = {
              schemaVersion: SCHEMA_VERSION,
              exitCode: 137,
              signal: null,
            };
            const publication = publishOnce(completedPath, synthetic);
            if (!exactSame(publication.value, synthetic)) {
              return validateCompletion(publication.value);
            }
            return validateCompletion(synthetic);
          }
          if (Date.now() >= brokerDeathDeadline) {
            throw new Error(
              "Windows Job Object broker died without proving its process tree empty",
            );
          }
        } else {
          brokerDeathDeadline = null;
        }
        await sleep(Math.max(pollMilliseconds, 100));
      }
    })();
  }

  async function existingHandle(expectedTokenMode) {
    const ready = await waitForFact({
      filePath: readyPath,
      failurePath,
      timeoutMilliseconds,
      description: "Job Object assignment receipt",
    });
    if (
      !plainObject(ready) ||
      ready.schemaVersion !== SCHEMA_VERSION ||
      ready.sessionId !== sessionId ||
      ready.guarantee !== GUARANTEE ||
      ready.limitFlags !== 0x2000 ||
      ready.breakawayAllowed !== false ||
      ready.tokenMode !== expectedTokenMode ||
      ready.jobNameDigest !== sha256(manifest.jobName)
    ) {
      throw new Error("Windows Job Object assignment receipt failed integrity validation");
    }
    const rootRecord = processRecord(ready.root, "Windows Job Object root process");
    processRecord(ready.broker, "Windows Job Object broker process");
    return {
      ...rootRecord,
      completion: completionFor(ready),
    };
  }

  return {
    guarantee: GUARANTEE,

    async launch({ authorization: authorizationInput, child: childInput }) {
      if (fs.existsSync(terminationRequestPath) || fs.existsSync(terminatedPath)) {
        throw new Error("terminated Windows Job Object session cannot launch");
      }
      const authorization = normalizeAuthorization(authorizationInput);
      const child = assertChild(childInput, trustedWslBridge);
      if (child.tokenMode === "low-integrity") {
        setIntegrityLevel(child.cwd, "L", true);
      }
      const config = {
        schemaVersion: SCHEMA_VERSION,
        sessionId,
        jobName: manifest.jobName,
        stateRoot: root,
        executable: child.executable,
        args: child.args,
        cwd: child.cwd,
        environment: childEnvironment(child, sessionId, authorization),
        authorizationId: authorization.authorizationId,
        planDigest: authorization.planDigest,
        capability: manifest.capability,
        holdBeforeSpawn: child.holdBeforeSpawn,
        tokenMode: child.tokenMode,
        observationIntervalMilliseconds: pollMilliseconds,
        nativeFaultPoint,
      };
      const publication = publishOnce(configPath, config);
      if (!exactSame(publication.value, config)) {
        throw new Error("Windows Job Object launch configuration conflicts");
      }
      if (publication.created) {
        await lifecycle.checkpoint({
          point: "windows-job-config-published",
          sessionId,
        });
      }
      await ensureBrokerStarted();
      return existingHandle(child.tokenMode);
    },

    inspect,

    async terminate({ operationId, reason }) {
      assertIdentifier(operationId, "Windows Job Object termination operation ID");
      assertIdentifier(reason, "Windows Job Object termination reason");
      const request = {
        schemaVersion: SCHEMA_VERSION,
        operationId,
        reason,
        capability: manifest.capability,
      };
      const publication = publishOnce(terminationRequestPath, request);
      if (!exactSame(publication.value, request)) {
        throw new Error("Windows Job Object termination operation conflicts");
      }

      if (!fs.existsSync(configPath)) {
        const empty = {
          schemaVersion: SCHEMA_VERSION,
          kind: "contained-processes-terminated",
          sessionId,
          operationId,
          reason,
          guarantee: GUARANTEE,
          processTreeTerminated: true,
          knownProcesses: [],
          liveProcesses: [],
          liveProcessCount: 0,
        };
        const terminal = publishOnce(terminatedPath, empty);
        if (!exactSame(terminal.value, empty)) {
          throw new Error("Windows Job Object empty termination conflicts");
        }
      }

      if (fs.existsSync(configPath) && !fs.existsSync(readyPath)) {
        const claimValue = optionalJson(brokerClaimPath);
        const release = optionalJson(brokerReleasePath);
        let knownProcesses = [];
        if (release) {
          if (!claimValue) {
            throw new Error("Windows Job Object release has no broker claim");
          }
          const claim = validateBrokerClaim(claimValue);
          if (sameProcessIsAlive(claim.broker)) {
            // The admitted broker owns finalization and will publish the receipt.
          } else {
            const fault = optionalJson(faultChildPath);
            if (fault) {
              const rootRecord = processRecord(
                fault.root,
                "faulted Job Object root process",
              );
              if (sameProcessIsAlive(rootRecord)) {
                throw new Error(
                  "faulted Job Object broker did not terminate its assigned root",
                );
              }
              knownProcesses = [rootRecord];
            }
            const recovered = {
              schemaVersion: SCHEMA_VERSION,
              kind: "contained-processes-terminated",
              sessionId,
              operationId,
              reason,
              guarantee: GUARANTEE,
              processTreeTerminated: true,
              knownProcesses,
              liveProcesses: [],
              liveProcessCount: 0,
            };
            publishOnce(terminatedPath, recovered);
          }
        } else {
          const empty = {
            schemaVersion: SCHEMA_VERSION,
            kind: "contained-processes-terminated",
            sessionId,
            operationId,
            reason,
            guarantee: GUARANTEE,
            processTreeTerminated: true,
            knownProcesses: [],
            liveProcesses: [],
            liveProcessCount: 0,
          };
          publishOnce(terminatedPath, empty);
        }
      }

      if (!fs.existsSync(terminatedPath)) {
        const ready = optionalJson(readyPath);
        const knownProcesses = ready ? await brokerCrashEvidence(ready) : null;
        if (knownProcesses) {
          const recovered = {
            schemaVersion: SCHEMA_VERSION,
            kind: "contained-processes-terminated",
            sessionId,
            operationId,
            reason,
            guarantee: GUARANTEE,
            processTreeTerminated: true,
            knownProcesses,
            liveProcesses: [],
            liveProcessCount: 0,
          };
          publishOnce(terminatedPath, recovered);
        }
      }

      const terminated = await waitForFact({
        filePath: terminatedPath,
        failurePath,
        timeoutMilliseconds,
        description: "Job Object termination receipt",
      });
      if (
        !plainObject(terminated) ||
        terminated.schemaVersion !== SCHEMA_VERSION ||
        terminated.kind !== "contained-processes-terminated" ||
        terminated.sessionId !== sessionId ||
        terminated.operationId !== operationId ||
        terminated.reason !== reason ||
        terminated.guarantee !== GUARANTEE ||
        terminated.processTreeTerminated !== true ||
        terminated.liveProcessCount !== 0 ||
        !Array.isArray(terminated.knownProcesses) ||
        !Array.isArray(terminated.liveProcesses) ||
        terminated.liveProcesses.length !== 0
      ) {
        throw new Error("Windows Job Object termination receipt failed integrity validation");
      }
      const knownProcesses = terminated.knownProcesses.map((record) =>
        processRecord(record, "terminated Job Object process"),
      );
      if (knownProcesses.some(sameProcessIsAlive)) {
        throw new Error("Windows Job Object termination did not prove zero live processes");
      }
      const observation = await inspect();
      if (observation.liveProcessCount !== 0) {
        throw new Error("Windows Job Object remained live after termination");
      }
      return {
        kind: "contained-processes-terminated",
        sessionId,
        operationId,
        reason,
        guarantee: GUARANTEE,
        processTreeTerminated: true,
        knownProcesses,
        liveProcesses: [],
        liveProcessCount: 0,
      };
    },
  };
}
