import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSafeEnvironment,
  writeFileDurably,
} from "./test-primitives.mjs";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";

const workerProgram = fileURLToPath(
  new URL("./surviving-worker-process.mjs", import.meta.url),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function sameProcessIsAlive(processId, processIdentity) {
  return (
    processIsAlive(processId) &&
    readProcessIdentity(processId) === processIdentity
  );
}

async function waitForSpawnedProcessIdentity(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("spawned worker process ID is unavailable");
  }
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const identity = readProcessIdentity(processId);
    if (identity) return identity;
    if (!processIsAlive(processId)) {
      throw new Error("spawned worker exited before publishing its identity");
    }
    await sleep(10);
  }
  throw new Error("spawned worker process identity was not observable in time");
}

async function terminateProcessTree(processId, processIdentity) {
  if (!sameProcessIsAlive(processId, processIdentity)) return;
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) throw new Error("cannot locate taskkill.exe");
    await new Promise((resolve, reject) => {
      const killer = spawn(
        path.join(systemRoot, "System32", "taskkill.exe"),
        ["/PID", String(processId), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      killer.once("error", reject);
      killer.once("close", (exitCode) => {
        if (
          exitCode !== 0 &&
          sameProcessIsAlive(processId, processIdentity)
        ) {
          reject(new Error(`taskkill failed for worker process ${processId}`));
        } else {
          resolve();
        }
      });
    });
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function sessionKey(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function records(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJson(path.join(directory, entry.name)));
}

function record(directory, value) {
  fs.mkdirSync(directory, { recursive: true });
  writeFileDurably(
    path.join(
      directory,
      `${process.pid}-${Date.now()}-${randomUUID()}.json`,
    ),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

export function createSurvivingProcessWorker(config, configPath) {
  const fixtureRoot = path.join(
    path.dirname(config.externalStatePath),
    "surviving-worker",
  );
  const activeDirectory = path.join(fixtureRoot, "active");
  const spawnedDirectory = path.join(fixtureRoot, "spawned");
  const receiptDirectory = path.join(fixtureRoot, "receipts");
  const errorDirectory = path.join(fixtureRoot, "errors");
  const probeDirectory = path.join(fixtureRoot, "result-probes");
  const observationDirectory = path.join(fixtureRoot, "session-observations");
  const attachmentDirectory = path.join(fixtureRoot, "attachments");
  const sessionRegistry = createWorkerSessionRegistry(fixtureRoot);
  fs.mkdirSync(fixtureRoot, { recursive: true });

  async function waitForPath(filePath, description) {
    const deadline = Date.now() + 20_000;
    while (!fs.existsSync(filePath)) {
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for ${description}`);
      }
      await sleep(20);
    }
  }

  function receipt(sessionId) {
    const receiptPath = path.join(
      receiptDirectory,
      `${sessionKey(sessionId)}.json`,
    );
    return fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
  }

  async function waitForResult(input, { recordAttachment = false } = {}) {
    if (recordAttachment) {
      record(attachmentDirectory, {
        processId: process.pid,
        sessionId: input.sessionId,
      });
    }
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const completed = receipt(input.sessionId);
      if (completed) return completed;
      const failure = records(errorDirectory).find(
        (candidate) => candidate.sessionId === input.sessionId,
      );
      if (failure) {
        throw new Error(`surviving worker failed: ${failure.message}`);
      }
      if (input.signal?.aborted) {
        return { kind: "aborted", sessionId: input.sessionId };
      }
      await sleep(20);
    }
    throw new Error("timed out waiting for surviving implementation worker");
  }

  const worker = {
    async findResult(input) {
      record(probeDirectory, {
        processId: process.pid,
        issueNumber: input.issueNumber,
        sessionId: input.sessionId,
      });
      return receipt(input.sessionId);
    },

    async findSession(input) {
      const completed = receipt(input.sessionId);
      if (completed) return completed;
      const owner = sessionRegistry.inspect(input.sessionId);
      record(observationDirectory, {
        processId: process.pid,
        sessionId: input.sessionId,
        kind: owner ? "running" : "missing",
      });
      return owner
        ? { kind: "running", sessionId: input.sessionId }
        : { kind: "missing", sessionId: input.sessionId };
    },

    async attach(input) {
      return waitForResult(input, { recordAttachment: true });
    },

    async implement(input) {
      const supervisorId = `supervisor-${process.pid}-${randomUUID()}`;
      const reservation = sessionRegistry.claim({
        sessionId: input.sessionId,
        workerId: supervisorId,
      });
      if (!reservation.acquired) {
        record(observationDirectory, {
          processId: process.pid,
          sessionId: input.sessionId,
          kind: "running",
          ownerWorkerId: reservation.owner.workerId,
        });
        return waitForResult(input, { recordAttachment: true });
      }

      const workerId = `worker-${randomUUID()}`;
      const child = spawn(
        process.execPath,
        [
          workerProgram,
          configPath,
          input.sessionId,
          input.worktreePath,
          workerId,
          supervisorId,
        ],
        {
          cwd: fixtureRoot,
          detached: true,
          env: createSafeEnvironment(process.env, {
            HOME: path.dirname(config.externalStatePath),
            USERPROFILE: path.dirname(config.externalStatePath),
          }),
          stdio: "ignore",
          windowsHide: true,
        },
      );
      try {
        const childIdentity = await waitForSpawnedProcessIdentity(child.pid);
        if (config.survivingWorker?.holdBeforeTransfer) {
          await waitForPath(
            path.join(spawnedDirectory, `${workerId}.json`),
            "the inert worker wrapper to report its process identity",
          );
          await waitForPath(
            path.join(fixtureRoot, "ownership-release"),
            "the worker ownership transfer release",
          );
        }
        sessionRegistry.transfer({
          sessionId: input.sessionId,
          expectedOwner: reservation.owner,
          workerId,
          processId: child.pid,
          processIdentity: childIdentity,
        });
      } catch (error) {
        child.kill("SIGKILL");
        throw error;
      }
      child.unref();
      return waitForResult(input);
    },
  };
  worker.startOrAttach = async (input) => {
    const completed = receipt(input.sessionId);
    if (completed) return completed;
    return worker.implement(input);
  };
  worker.terminate = async (input) => {
    const activeRecords = records(activeDirectory).filter(
      (candidate) => candidate.sessionId === input.sessionId,
    );
    const owner = sessionRegistry.inspect(input.sessionId);
    const trackedProcesses = new Map(
      activeRecords.map((active) => [
        `${active.processId}:${active.processIdentity}`,
        {
          processId: active.processId,
          processIdentity: active.processIdentity,
        },
      ]),
    );
    if (owner) {
      trackedProcesses.set(`${owner.processId}:${owner.processIdentity}`, {
        processId: owner.processId,
        processIdentity: owner.processIdentity,
      });
    }
    for (const tracked of trackedProcesses.values()) {
      await terminateProcessTree(
        tracked.processId,
        tracked.processIdentity,
      );
    }
    const deadline = Date.now() + 2_000;
    while (
      [...trackedProcesses.values()].some((tracked) =>
        sameProcessIsAlive(tracked.processId, tracked.processIdentity),
      ) &&
      Date.now() < deadline
    ) {
      await sleep(20);
    }
    const processTreeTerminated = [...trackedProcesses.values()].every(
      (tracked) =>
        !sameProcessIsAlive(tracked.processId, tracked.processIdentity),
    );
    if (processTreeTerminated) {
      for (const active of activeRecords) {
      fs.rmSync(
        path.join(activeDirectory, `${active.workerId}.json`),
        { force: true },
      );
      }
    }
    return {
      kind: "terminated",
      sessionId: input.sessionId,
      processTreeTerminated,
    };
  };
  return worker;
}
