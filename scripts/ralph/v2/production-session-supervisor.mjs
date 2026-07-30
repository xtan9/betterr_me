import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDurableSessionSupervisorClient } from "./session-supervisor.mjs";

const HOST_PATH = fileURLToPath(
  new URL("./production-session-supervisor-host.mjs", import.meta.url),
);
const DEFAULT_POLL_INTERVAL_MILLISECONDS = 25;
const DEFAULT_WAIT_TIMEOUT_MILLISECONDS = 24 * 60 * 60 * 1000;
const SAFE_ENVIRONMENT_KEYS = [
  "ComSpec",
  "OS",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "WINDIR",
];

function assertAbsoluteDirectoryPath(value, description) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  fs.mkdirSync(value, { recursive: true });
  return fs.realpathSync.native(value);
}

function assertDuration(value, description, fallback) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new Error(`${description} failed integrity validation`);
  }
  return selected;
}

function assertSessionId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error("production session ID failed integrity validation");
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEnvironment() {
  return Object.fromEntries(
    SAFE_ENVIRONMENT_KEYS.flatMap((name) =>
      typeof process.env[name] === "string" ? [[name, process.env[name]]] : [],
    ),
  );
}

function writeConfig(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function createProductionSessionSupervisor({
  sessionRoot,
  containmentRoot,
  pollIntervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
  waitTimeoutMilliseconds = DEFAULT_WAIT_TIMEOUT_MILLISECONDS,
  ownerObservationTimeoutMilliseconds,
  trustedWslBridge = false,
}) {
  const sessions = assertAbsoluteDirectoryPath(
    sessionRoot,
    "production session root",
  );
  const containment = assertAbsoluteDirectoryPath(
    containmentRoot,
    "production containment root",
  );
  const pollMilliseconds = assertDuration(
    pollIntervalMilliseconds,
    "production supervisor poll interval",
    DEFAULT_POLL_INTERVAL_MILLISECONDS,
  );
  const waitMilliseconds = assertDuration(
    waitTimeoutMilliseconds,
    "production supervisor wait timeout",
    DEFAULT_WAIT_TIMEOUT_MILLISECONDS,
  );
  if (typeof trustedWslBridge !== "boolean") {
    throw new Error("production trusted WSL bridge policy failed integrity validation");
  }
  const client = createDurableSessionSupervisorClient({
    sessionRoot: sessions,
    pollIntervalMilliseconds: pollMilliseconds,
    waitTimeoutMilliseconds: waitMilliseconds,
    ownerObservationTimeoutMilliseconds,
  });

  function startTrustedHost(sessionIdInput) {
    const sessionId = assertSessionId(sessionIdInput);
    const supervisorId = `production-supervisor-${randomUUID()}`;
    const sessionKey = digest(sessionId);
    const launchRoot = path.join(sessions, "production-host-launches", sessionKey);
    const configPath = path.join(launchRoot, `${supervisorId}.json`);
    writeConfig(configPath, {
      schemaVersion: 1,
      sessionRoot: sessions,
      containmentRoot: path.join(containment, sessionKey),
      sessionId,
      supervisorId,
      pollIntervalMilliseconds: pollMilliseconds,
      trustedWslBridge,
    });
    const host = spawn(process.execPath, [HOST_PATH, configPath], {
      cwd: launchRoot,
      detached: true,
      env: safeEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    const completion = new Promise((resolve, reject) => {
      let settled = false;
      host.once("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      host.once("exit", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        if (exitCode === 0 && signal === null) {
          resolve();
          return;
        }
        reject(
          new Error(
            `trusted session host exited unsuccessfully (${exitCode ?? signal})`,
          ),
        );
      });
    });
    host.unref();
    return completion;
  }

  async function runWithTrustedHost(sessionId, operation) {
    if (await client.terminalReceipt(sessionId)) return operation();
    const hostCompletion = startTrustedHost(sessionId);
    const result = await operation();
    await hostCompletion;
    return result;
  }

  return {
    containmentRootFor(sessionIdInput) {
      const sessionId = assertSessionId(sessionIdInput);
      return path.join(containment, digest(sessionId));
    },
    plan(input) {
      return client.plan(input);
    },
    authorize(input) {
      return client.authorize(input);
    },
    inspect(sessionId) {
      return client.inspect(sessionId);
    },
    startOrAttach({ sessionId }) {
      return runWithTrustedHost(sessionId, () =>
        client.startOrAttach({ sessionId }),
      );
    },
    terminate(input) {
      return runWithTrustedHost(input.sessionId, () => client.terminate(input));
    },
    closeUnstarted(input) {
      return client.closeUnstarted(input);
    },
  };
}
