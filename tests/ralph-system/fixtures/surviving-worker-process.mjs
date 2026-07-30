import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertPathWithin,
  writeFileDurably,
} from "./test-primitives.mjs";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";

const [configPath, sessionId, worktreePath] = process.argv.slice(2);
if (!configPath || !sessionId || !worktreePath) {
  throw new Error(
    "usage: surviving-worker-process.mjs <config> <session> <worktree>",
  );
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const fixtureRoot = path.join(path.dirname(config.externalStatePath), "surviving-worker");
const activeDirectory = path.join(fixtureRoot, "active");
const spawnedDirectory = path.join(fixtureRoot, "spawned");
const startDirectory = path.join(fixtureRoot, "starts");
const mutationDirectory = path.join(fixtureRoot, "mutations");
const attachmentDirectory = path.join(fixtureRoot, "attachments");
const receiptDirectory = path.join(fixtureRoot, "receipts");
const errorDirectory = path.join(fixtureRoot, "errors");
const releasePath = path.join(fixtureRoot, "release");
const ownershipReleasePath = path.join(fixtureRoot, "ownership-release");
const mutationReleasePath = path.join(fixtureRoot, "mutation-release");
const sessionKey = createHash("sha256").update(sessionId).digest("hex");
const workerId = `${process.pid}-${randomUUID()}`;
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
  const expectedWorktree = path.join(config.runtimePath, "worktrees", "current");
  if (path.resolve(worktreePath) !== path.resolve(expectedWorktree)) {
    throw new Error("surviving worker received the wrong checkout");
  }

  record(spawnedDirectory, {
    workerId,
    processId: process.pid,
    parentProcessId: process.ppid,
    sessionId,
  });
  if (config.survivingWorker?.holdBeforeOwnership) {
    await waitForRelease(ownershipReleasePath, "execution ownership release");
  }

  const ownership = sessionRegistry.claim({
    sessionId,
    workerId,
    processIdentity: `fixture-process:${process.pid}`,
  });
  if (!ownership.acquired) {
    record(attachmentDirectory, {
      processId: process.pid,
      sessionId,
      workerId,
      ownerWorkerId: ownership.owner.workerId,
    });
    await waitForRelease(releasePath, "the execution owner's completion");
    process.exit(0);
  }

  fs.mkdirSync(activeDirectory, { recursive: true });
  writeFileDurably(
    activePath,
    `${JSON.stringify({ workerId, processId: process.pid, sessionId }, null, 2)}\n`,
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
