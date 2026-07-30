import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertPathWithin,
  writeFileDurably,
} from "./test-primitives.mjs";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";

const [configPath, sessionId, worktreePath, workerId, supervisorId] =
  process.argv.slice(2);
if (!configPath || !sessionId || !worktreePath || !workerId || !supervisorId) {
  throw new Error(
    "usage: surviving-worker-process.mjs <config> <session> <worktree> <worker-id> <supervisor-id>",
  );
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const fixtureRoot = path.join(path.dirname(config.externalStatePath), "surviving-worker");
const activeDirectory = path.join(fixtureRoot, "active");
const spawnedDirectory = path.join(fixtureRoot, "spawned");
const startDirectory = path.join(fixtureRoot, "starts");
const mutationDirectory = path.join(fixtureRoot, "mutations");
const receiptDirectory = path.join(fixtureRoot, "receipts");
const errorDirectory = path.join(fixtureRoot, "errors");
const releasePath = path.join(fixtureRoot, "release");
const ownershipReleasePath = path.join(fixtureRoot, "ownership-release");
const mutationReleasePath = path.join(fixtureRoot, "mutation-release");
const sessionKey = createHash("sha256").update(sessionId).digest("hex");
const activePath = path.join(activeDirectory, `${workerId}.json`);
const sessionRegistry = createWorkerSessionRegistry(fixtureRoot);

function record(directory, value) {
  fs.mkdirSync(directory, { recursive: true });
  writeFileDurably(
    path.join(directory, `${workerId}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRelease(filePath, description) {
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`surviving worker timed out waiting for ${description}`);
    }
    await sleep(20);
  }
}

try {
  const currentProcessIdentity = readProcessIdentity(process.pid);
  if (!currentProcessIdentity) {
    throw new Error("surviving worker process identity is unavailable");
  }
  record(spawnedDirectory, {
    kind: "inert-wrapper",
    workerId,
    processId: process.pid,
    processIdentity: currentProcessIdentity,
    parentProcessId: process.ppid,
    sessionId,
  });

  const expectedWorktree = path.join(config.runtimePath, "worktrees", "current");
  if (path.resolve(worktreePath) !== path.resolve(expectedWorktree)) {
    throw new Error("surviving worker received the wrong checkout");
  }

  const ownershipDeadline = Date.now() + 20_000;
  let owner;
  while (Date.now() < ownershipDeadline) {
    owner = sessionRegistry.inspect(sessionId);
    if (
      owner?.workerId === workerId &&
      owner.processId === process.pid
    ) {
      break;
    }
    if (
      owner &&
      owner.workerId !== supervisorId &&
      owner.workerId !== workerId
    ) {
      process.exit(0);
    }
    await sleep(20);
  }
  if (
    owner?.workerId !== workerId ||
    owner.processId !== process.pid ||
    owner.processIdentity !== readProcessIdentity(process.pid)
  ) {
    throw new Error("surviving worker never received execution ownership");
  }

  if (config.survivingWorker?.holdBeforeOwnership) {
    await waitForRelease(ownershipReleasePath, "execution ownership release");
  }

  fs.mkdirSync(activeDirectory, { recursive: true });
  writeFileDurably(
    activePath,
    `${JSON.stringify(
      {
        workerId,
        processId: process.pid,
        processIdentity: owner.processIdentity,
        sessionId,
      },
      null,
      2,
    )}\n`,
  );

  record(startDirectory, {
    workerId,
    processId: process.pid,
    parentProcessId: process.ppid,
    sessionId,
    activeWorkers: fs.readdirSync(activeDirectory).length,
  });
  if (config.survivingWorker?.holdBeforeMutation) {
    await waitForRelease(mutationReleasePath, "mutation release");
  } else {
    await waitForRelease(releasePath, "completion release");
  }

  const mutationOwner = sessionRegistry.inspect(sessionId);
  const mutationProcessIdentity = readProcessIdentity(process.pid);
  if (
    mutationOwner?.workerId !== workerId ||
    mutationOwner.processId !== process.pid ||
    mutationOwner.processIdentity !== mutationProcessIdentity
  ) {
    throw new Error("surviving worker lost execution ownership before mutation");
  }

  for (const change of config.workerChanges) {
    const destination = assertPathWithin(
      worktreePath,
      path.join(worktreePath, change.path),
      "surviving worker change",
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, change.content);
  }
  record(mutationDirectory, {
    workerId,
    processId: process.pid,
    sessionId,
  });

  if (config.survivingWorker?.holdBeforeMutation) {
    await waitForRelease(releasePath, "completion release");
  }

  fs.mkdirSync(receiptDirectory, { recursive: true });
  try {
    writeFileDurably(
      path.join(receiptDirectory, `${sessionKey}.json`),
      `${JSON.stringify(
        { kind: "completed", sessionId, workerId, processId: process.pid },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
} catch (error) {
  record(errorDirectory, {
    workerId,
    processId: process.pid,
    sessionId,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  fs.rmSync(activePath, { force: true });
}
