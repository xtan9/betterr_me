import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSafeEnvironment,
  writeFileDurably,
} from "./test-primitives.mjs";

const workerProgram = fileURLToPath(
  new URL("./surviving-worker-process.mjs", import.meta.url),
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const receiptDirectory = path.join(fixtureRoot, "receipts");
  const errorDirectory = path.join(fixtureRoot, "errors");
  const probeDirectory = path.join(fixtureRoot, "result-probes");
  const observationDirectory = path.join(fixtureRoot, "session-observations");
  const attachmentDirectory = path.join(fixtureRoot, "attachments");

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

    // These two methods model the process service behind the atomic
    // start-or-attach worker capability used by recovery.
    async findSession(input) {
      const completed = receipt(input.sessionId);
      if (completed) return completed;
      const running = records(activeDirectory).find(
        (candidate) => candidate.sessionId === input.sessionId,
      );
      record(observationDirectory, {
        processId: process.pid,
        sessionId: input.sessionId,
        kind: running ? "running" : "missing",
      });
      return running
        ? { kind: "running", sessionId: input.sessionId }
        : { kind: "missing", sessionId: input.sessionId };
    },

    async attach(input) {
      return waitForResult(input, { recordAttachment: true });
    },

    async implement(input) {
      const child = spawn(
        process.execPath,
        [workerProgram, configPath, input.sessionId, input.worktreePath],
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
      return waitForResult(input);
    },
  };
  worker.startOrAttach = async (input) => {
    const observed = await worker.findSession(input);
    if (observed.kind === "completed") return observed;
    if (observed.kind === "running") return worker.attach(input);
    if (observed.kind === "missing") return worker.implement(input);
    throw new Error(`unknown worker session state ${observed.kind}`);
  };
  worker.terminate = async (input) => {
    for (const active of records(activeDirectory).filter(
      (candidate) => candidate.sessionId === input.sessionId,
    )) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(active.processId), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
          timeout: 5_000,
        });
      } else {
        try {
          process.kill(active.processId, "SIGKILL");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
      fs.rmSync(
        path.join(activeDirectory, `${active.workerId}.json`),
        { force: true },
      );
    }
    return {
      kind: "terminated",
      sessionId: input.sessionId,
      processTreeTerminated: true,
    };
  };
  return worker;
}
