import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeWslSystemdConfig,
  wslSystemdProtocol,
} from "./wsl-systemd-containment.mjs";

const POLL_INTERVAL_MILLISECONDS = 25;
const ACTIVE_STATES = new Set([
  "active",
  "activating",
  "reloading",
  "deactivating",
]);

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

function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${description} failed integrity validation`, { cause: error });
  }
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
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, serialize(value));
  try {
    fs.linkSync(candidatePath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = readJson(filePath, "existing WSL systemd fact");
    if (serialize(existing) !== serialize(value)) {
      throw new Error(`WSL systemd fact conflicts at ${filePath}`);
    }
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function unifiedCgroupPath(processId = "self") {
  const line = fs
    .readFileSync(`/proc/${processId}/cgroup`, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("0::"));
  if (!line) throw new Error("Linux process is not in the unified cgroup hierarchy");
  const cgroupPath = line.slice(3);
  if (!path.posix.isAbsolute(cgroupPath)) {
    throw new Error("Linux cgroup path failed integrity validation");
  }
  return cgroupPath;
}

function verifyHostIdentity(config) {
  if (process.getuid?.() !== 0 || process.getgid?.() !== 0) {
    throw new Error("WSL systemd session host must run as root");
  }
  const cgroupPath = unifiedCgroupPath();
  if (cgroupPath !== `/system.slice/${config.unitName}`) {
    throw new Error("WSL systemd session host is outside its expected service cgroup");
  }
  return cgroupPath;
}

function readManifest(controlRoot, config) {
  const manifest = readJson(
    path.join(controlRoot, "manifest.json"),
    "Windows Job Object manifest",
  );
  if (
    !plainObject(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.sessionId !== config.sessionId ||
    typeof manifest.capability !== "string" ||
    !wslSystemdProtocol.digestPattern.test(manifest.capability)
  ) {
    throw new Error("Windows Job Object manifest failed integrity validation");
  }
  return manifest;
}

function brokerMarkerIsValid(controlRoot, config, manifest) {
  try {
    const actual = fs.readFileSync(path.join(controlRoot, "broker-live"), "utf8");
    const expected = `${sha256(`${config.sessionId}\0${manifest.capability}`)}\n`;
    return actual === expected;
  } catch {
    return false;
  }
}

function terminationRequest(controlRoot, config, manifest) {
  const requestPath = path.join(controlRoot, "termination-request.json");
  if (!fs.existsSync(requestPath)) return null;
  const request = readJson(requestPath, "Windows Job Object termination request");
  if (
    !plainObject(request) ||
    request.schemaVersion !== 1 ||
    typeof request.operationId !== "string" ||
    !request.operationId ||
    typeof request.reason !== "string" ||
    !request.reason ||
    request.capability !== manifest.capability
  ) {
    throw new Error("Windows Job Object termination request failed integrity validation");
  }
  return request;
}

function parseSystemctlFields(output) {
  return new Map(
    String(output)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? [line, ""]
          : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function cgroupIsPopulated(controlGroup) {
  if (!controlGroup || !path.posix.isAbsolute(controlGroup)) return false;
  try {
    const events = new Map(
      fs
        .readFileSync(
          path.posix.join("/sys/fs/cgroup", controlGroup, "cgroup.events"),
          "utf8",
        )
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.trim().split(/\s+/, 2)),
    );
    return events.get("populated") === "1";
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function inspectUnit(unitName) {
  if (
    typeof unitName !== "string" ||
    !wslSystemdProtocol.unitPattern.test(unitName)
  ) {
    throw new Error("WSL systemd unit name failed integrity validation");
  }
  const result = spawnSync(
    "/usr/bin/systemctl",
    [
      "show",
      unitName,
      "--no-pager",
      "--property=LoadState,ActiveState,SubState,ControlGroup,MainPID,Result",
    ],
    {
      encoding: "utf8",
      env: { LANG: "C.UTF-8", PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
      timeout: 5_000,
    },
  );
  const fields = parseSystemctlFields(result.stdout);
  const loadState = fields.get("LoadState") ?? "not-found";
  if (
    (result.error || result.signal || result.status !== 0) &&
    loadState !== "not-found"
  ) {
    throw new Error(
      `systemctl inspection failed: ${String(
        result.stderr || result.error?.message || result.status,
      ).trim()}`,
      { cause: result.error },
    );
  }
  const activeState = fields.get("ActiveState") ?? "inactive";
  const controlGroup = fields.get("ControlGroup") ?? "";
  const mainProcessId = Number(fields.get("MainPID") ?? 0);
  if (!Number.isSafeInteger(mainProcessId) || mainProcessId < 0) {
    throw new Error("systemd MainPID failed integrity validation");
  }
  return {
    schemaVersion: wslSystemdProtocol.schemaVersion,
    unitName,
    unitExists: loadState !== "not-found",
    active: ACTIVE_STATES.has(activeState),
    populated: cgroupIsPopulated(controlGroup),
    loadState,
    activeState,
    subState: fields.get("SubState") ?? "dead",
    controlGroup,
    mainProcessId,
    result: fields.get("Result") ?? "",
  };
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function host(configPath) {
  if (!path.posix.isAbsolute(configPath)) {
    throw new Error("WSL systemd configuration path must be absolute");
  }
  const controlRoot = path.posix.dirname(configPath);
  const config = normalizeWslSystemdConfig(
    readJson(configPath, "WSL systemd launch configuration"),
  );
  const cgroupPath = verifyHostIdentity(config);
  const manifest = readManifest(controlRoot, config);
  const exitIntentPath = path.join(controlRoot, "linux-exit-intent.json");
  if (!brokerMarkerIsValid(controlRoot, config, manifest)) {
    publishOnce(exitIntentPath, {
      schemaVersion: 1,
      sessionId: config.sessionId,
      planDigest: config.planDigest,
      reason: "broker-liveness-lost",
    });
    return 70;
  }

  let signal = null;
  for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(name, () => {
      signal ??= name;
    });
  }
  let childOutcome = null;
  const child = spawn(config.child.executable, config.child.args, {
    cwd: config.child.cwd,
    detached: false,
    env: {
      LANG: "C.UTF-8",
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      ...config.child.environment,
    },
    stdio: "ignore",
  });
  child.once("error", (error) => {
    childOutcome = { kind: "error", message: error.message };
  });
  child.once("exit", (code, childSignal) => {
    childOutcome = { kind: "exit", code, signal: childSignal };
  });
  publishOnce(path.join(controlRoot, "linux-ready.json"), {
    schemaVersion: 1,
    sessionId: config.sessionId,
    planDigest: config.planDigest,
    unitName: config.unitName,
    cgroupPath,
    hostProcessId: process.pid,
    childProcessId: child.pid,
  });

  while (!childOutcome) {
    if (!brokerMarkerIsValid(controlRoot, config, manifest)) {
      publishOnce(exitIntentPath, {
        schemaVersion: 1,
        sessionId: config.sessionId,
        planDigest: config.planDigest,
        reason: "broker-liveness-lost",
      });
      return 70;
    }
    const request = terminationRequest(controlRoot, config, manifest);
    if (request) {
      publishOnce(exitIntentPath, {
        schemaVersion: 1,
        sessionId: config.sessionId,
        planDigest: config.planDigest,
        reason: "termination-requested",
        operationId: request.operationId,
      });
      return 0;
    }
    if (signal) {
      publishOnce(exitIntentPath, {
        schemaVersion: 1,
        sessionId: config.sessionId,
        planDigest: config.planDigest,
        reason: "host-signal",
        signal,
      });
      return 128;
    }
    await sleep(POLL_INTERVAL_MILLISECONDS);
  }

  publishOnce(path.join(controlRoot, "linux-result.json"), {
    schemaVersion: 1,
    sessionId: config.sessionId,
    planDigest: config.planDigest,
    outcome: childOutcome,
  });
  if (childOutcome.kind === "error") return 70;
  if (childOutcome.signal) return 128;
  return Number.isSafeInteger(childOutcome.code) ? childOutcome.code : 70;
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === "inspect" && argument && process.argv.length === 4) {
    fs.writeSync(1, `${JSON.stringify(inspectUnit(argument))}\n`, null, "utf8");
    return 0;
  }
  if (command === "host" && argument && process.argv.length === 4) {
    return host(argument);
  }
  throw new Error("usage: wsl-systemd-session-host.mjs <host CONFIG|inspect UNIT>");
}

try {
  process.exit(await main());
} catch (error) {
  const [command, configPath] = process.argv.slice(2);
  if (command === "host" && configPath && path.posix.isAbsolute(configPath)) {
    try {
      publishOnce(path.join(path.posix.dirname(configPath), "linux-failure.json"), {
        schemaVersion: 1,
        message: error?.message ?? String(error),
      });
    } catch {
      // The original error remains authoritative.
    }
  }
  fs.writeSync(2, `${error?.stack ?? error}\n`, null, "utf8");
  process.exit(70);
}
