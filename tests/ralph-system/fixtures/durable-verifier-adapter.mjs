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

const verifierProgram = fileURLToPath(
  new URL("./durable-verifier-process.mjs", import.meta.url),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sessionKey(sessionId, candidateTreeSha) {
  return createHash("sha256")
    .update(`${sessionId}\0${candidateTreeSha}`)
    .digest("hex");
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
    path.join(directory, `${process.pid}-${Date.now()}-${randomUUID()}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
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

function validProcessIdentity(processIdentity) {
  return (
    /^windows-start-ticks:\d+$/.test(processIdentity) ||
    /^linux-boot-start:[0-9a-f-]{36}:\d+$/i.test(processIdentity)
  );
}

function sameProcessIsAlive(processId, processIdentity) {
  return (
    processIsAlive(processId) &&
    readProcessIdentity(processId) === processIdentity
  );
}

async function terminateWindowsTree(processId, processIdentity) {
  if (!sameProcessIsAlive(processId, processIdentity)) return;
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("cannot locate taskkill.exe");
  await new Promise((resolve, reject) => {
    const killer = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(processId), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    const timeout = setTimeout(() => {
      killer.kill("SIGKILL");
      reject(new Error(`taskkill timed out for verifier process ${processId}`));
    }, 5_000);
    killer.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    killer.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function createDurableProcessVerifier(config, configPath) {
  const fixtureRoot = path.join(
    path.dirname(config.externalStatePath),
    "durable-verifier",
  );
  const activeDirectory = path.join(fixtureRoot, "active");
  const errorDirectory = path.join(fixtureRoot, "errors");
  const legacyCallDirectory = path.join(fixtureRoot, "legacy-calls");
  const receiptDirectory = path.join(fixtureRoot, "receipts");
  const spawnedDirectory = path.join(fixtureRoot, "spawned");
  const terminationDirectory = path.join(fixtureRoot, "terminations");
  const terminationStartDirectory = path.join(
    fixtureRoot,
    "termination-starts",
  );
  const terminationReceiptDirectory = path.join(
    fixtureRoot,
    "termination-receipts",
  );
  const terminationReuseDirectory = path.join(
    fixtureRoot,
    "termination-reuses",
  );
  const terminateCrashMarkerPath = path.join(fixtureRoot, "terminate-crash");
  const terminationReleasePath = path.join(
    fixtureRoot,
    "termination-release",
  );

  function receipt(input) {
    const receiptPath = path.join(
      receiptDirectory,
      `${sessionKey(input.sessionId, input.candidateTreeSha)}.json`,
    );
    return fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
  }

  function spawnVerifier(input) {
    const child = spawn(
      process.execPath,
      [
        verifierProgram,
        configPath,
        input.sessionId,
        input.worktreePath,
        input.candidateTreeSha,
        input.verificationPlanSha256,
        Buffer.from(JSON.stringify(input.verificationPlan), "utf8").toString(
          "base64url",
        ),
      ],
      {
        cwd: input.worktreePath,
        detached: true,
        env: createSafeEnvironment(process.env, {
          HOME: path.dirname(config.externalStatePath),
          USERPROFILE: path.dirname(config.externalStatePath),
        }),
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
  }

  async function waitForReceipt(input) {
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      if (input.signal?.aborted) {
        throw new Error("durable verifier wait aborted by controller");
      }
      const completed = receipt(input);
      if (completed) return completed;
      const failure = records(errorDirectory).find(
        (candidate) =>
          candidate.sessionId === input.sessionId &&
          candidate.candidateTreeSha === input.candidateTreeSha,
      );
      if (failure) {
        throw new Error(`durable verifier failed: ${failure.message}`);
      }
      if (
        config.durableVerifier?.behavior === "reject-with-live-tree" &&
        records(activeDirectory).some(
          (candidate) =>
            candidate.sessionId === input.sessionId &&
            candidate.candidateTreeSha === input.candidateTreeSha,
        )
      ) {
        throw new Error("durable verifier adapter rejected a live session");
      }
      await sleep(20);
    }
    throw new Error("timed out waiting for durable verifier receipt");
  }

  const verifier = {
    async findReceipt(input) {
      return receipt(input);
    },

    async startOrAttach(input) {
      const completed = receipt(input);
      if (completed) return completed;
      const terminationReceiptPath = path.join(
        terminationReceiptDirectory,
        `${sessionKey(input.sessionId, input.candidateTreeSha)}.json`,
      );
      if (fs.existsSync(terminationReceiptPath)) {
        throw new Error("cannot restart a terminated verifier session");
      }
      spawnVerifier(input);
      return waitForReceipt(input);
    },

    // This compatibility operation deliberately models the old unsafe seam.
    // A correct controller must use the atomic startOrAttach operation above.
    async verify(input) {
      record(legacyCallDirectory, {
        controllerProcessId: process.pid,
        sessionId: input.sessionId,
        candidateTreeSha: input.candidateTreeSha,
      });
      spawnVerifier(input);
      return waitForReceipt(input);
    },

    async terminate(input) {
      if (
        typeof input.sessionId !== "string" ||
        !input.sessionId ||
        typeof input.candidateTreeSha !== "string" ||
        !/^[0-9a-f]{40}$/.test(input.candidateTreeSha) ||
        typeof input.operationId !== "string" ||
        !input.operationId
      ) {
        throw new Error("verifier termination identity is incomplete");
      }
      const key = sessionKey(input.sessionId, input.candidateTreeSha);
      const terminationReceiptPath = path.join(
        terminationReceiptDirectory,
        `${key}.json`,
      );
      if (fs.existsSync(terminationReceiptPath)) {
        const durableReceipt = readJson(terminationReceiptPath);
        if (durableReceipt.operationId !== input.operationId) {
          throw new Error("verifier termination operation identity changed");
        }
        record(terminationReuseDirectory, {
          sessionId: input.sessionId,
          candidateTreeSha: input.candidateTreeSha,
          operationId: input.operationId,
        });
        return durableReceipt;
      }
      record(terminationStartDirectory, {
        sessionId: input.sessionId,
        candidateTreeSha: input.candidateTreeSha,
        operationId: input.operationId,
      });
      if (config.durableVerifier?.holdTermination === true) {
        const deadline = Date.now() + 10_000;
        while (!fs.existsSync(terminationReleasePath)) {
          if (Date.now() >= deadline) {
            throw new Error("verifier termination timed out waiting for release");
          }
          await sleep(20);
        }
      }
      const matching = records(spawnedDirectory).filter(
        (candidate) =>
          candidate.sessionId === input.sessionId &&
          candidate.candidateTreeSha === input.candidateTreeSha,
      );
      if (matching.length === 0) {
        throw new Error("verifier termination has no known session process set");
      }
      const activeRecords = records(activeDirectory).filter(
        (candidate) =>
          candidate.sessionId === input.sessionId &&
          candidate.candidateTreeSha === input.candidateTreeSha,
      );
      const trackedProcesses = new Map();
      for (const candidate of matching) {
        if (
          !Number.isSafeInteger(candidate.processId) ||
          candidate.processId <= 0 ||
          typeof candidate.processIdentity !== "string" ||
          !validProcessIdentity(candidate.processIdentity)
        ) {
          throw new Error("spawned verifier process identity is invalid");
        }
        trackedProcesses.set(
          `${candidate.processId}:${candidate.processIdentity}`,
          {
            processId: candidate.processId,
            processIdentity: candidate.processIdentity,
            treeRoot: true,
          },
        );
      }
      for (const active of activeRecords) {
        if (active.descendantProcessId === null) continue;
        if (
          !Number.isSafeInteger(active.descendantProcessId) ||
          active.descendantProcessId <= 0 ||
          typeof active.descendantProcessIdentity !== "string" ||
          !validProcessIdentity(active.descendantProcessIdentity)
        ) {
          throw new Error("active verifier descendant identity is invalid");
        }
        trackedProcesses.set(
          `${active.descendantProcessId}:${active.descendantProcessIdentity}`,
          {
            processId: active.descendantProcessId,
            processIdentity: active.descendantProcessIdentity,
            treeRoot: false,
          },
        );
      }
      const tracked = [...trackedProcesses.values()];
      const processIds = tracked.map((candidate) => candidate.processId);

      for (const active of tracked) {
        if (!sameProcessIsAlive(active.processId, active.processIdentity)) {
          continue;
        }
        if (process.platform === "win32") {
          await terminateWindowsTree(
            active.processId,
            active.processIdentity,
          );
        } else {
          try {
            process.kill(
              active.treeRoot ? -active.processId : active.processId,
              "SIGKILL",
            );
          } catch (error) {
            if (error?.code !== "ESRCH") throw error;
          }
        }
      }

      const deadline = Date.now() + 2_000;
      while (
        tracked.some((candidate) =>
          sameProcessIsAlive(
            candidate.processId,
            candidate.processIdentity,
          ),
        ) &&
        Date.now() < deadline
      ) {
        await sleep(20);
      }
      const processTreeTerminated = tracked.every(
        (candidate) =>
          !sameProcessIsAlive(
            candidate.processId,
            candidate.processIdentity,
          ),
      );
      if (!processTreeTerminated) {
        throw new Error("verifier process tree survived termination");
      }
      for (const active of activeRecords) {
        fs.rmSync(path.join(activeDirectory, `${active.verifierId}.json`), {
          force: true,
        });
      }
      const durableReceipt = {
        kind: "terminated",
        sessionId: input.sessionId,
        candidateTreeSha: input.candidateTreeSha,
        operationId: input.operationId,
        processIds,
        processes: tracked.map(({ processId, processIdentity }) => ({
          processId,
          processIdentity,
        })),
        processTreeTerminated,
      };
      record(terminationDirectory, durableReceipt);
      fs.mkdirSync(terminationReceiptDirectory, { recursive: true });
      writeFileDurably(
        terminationReceiptPath,
        `${JSON.stringify(durableReceipt, null, 2)}\n`,
      );
      if (
        processTreeTerminated &&
        config.durableVerifier?.crashAfterTerminate === true &&
        !fs.existsSync(terminateCrashMarkerPath)
      ) {
        writeFileDurably(terminateCrashMarkerPath, "crash after terminate\n");
        process.kill(process.pid, "SIGKILL");
      }
      return durableReceipt;
    },
  };

  return verifier;
}
