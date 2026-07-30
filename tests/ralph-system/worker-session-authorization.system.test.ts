import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkerSessionRegistry } from "../../scripts/ralph/v2/worker-session-registry.mjs";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";

const WORKER_PATH = fileURLToPath(
  new URL("./fixtures/surviving-worker-process.mjs", import.meta.url),
);
const roots: string[] = [];
const children: ChildProcess[] = [];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function processIsAlive(processId: number) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
}

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMilliseconds = 10_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`);
    await sleep(20);
  }
}

function readRecords(directory: string) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8")));
}

function differentValidIdentity(identity: string) {
  if (identity.startsWith("windows-start-ticks:")) {
    return `windows-start-ticks:${BigInt(identity.slice("windows-start-ticks:".length)) + 1n}`;
  }
  const separator = identity.lastIndexOf(":");
  return `${identity.slice(0, separator + 1)}${BigInt(identity.slice(separator + 1)) + 1n}`;
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.pid && processIsAlive(child.pid)) child.kill("SIGKILL");
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 implementation ownership authorization", () => {
  it("revalidates transferred process identity immediately before any worktree mutation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-worker-auth-"));
    roots.push(root);
    const runtimePath = path.join(root, "runtime");
    const worktreePath = path.join(runtimePath, "worktrees", "current");
    const fixtureRoot = path.join(root, "external", "surviving-worker");
    const spawnedPath = path.join(fixtureRoot, "spawned");
    const startsPath = path.join(fixtureRoot, "starts");
    const mutationsPath = path.join(fixtureRoot, "mutations");
    const errorsPath = path.join(fixtureRoot, "errors");
    const mutationReleasePath = path.join(fixtureRoot, "mutation-release");
    const completionReleasePath = path.join(fixtureRoot, "release");
    fs.mkdirSync(worktreePath, { recursive: true });
    fs.mkdirSync(fixtureRoot, { recursive: true });

    const configPath = path.join(root, "config.json");
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          externalStatePath: path.join(root, "external", "state.json"),
          runtimePath,
          workerChanges: [
            {
              path: "src/must-not-be-written.txt",
              content: "unauthorized mutation\n",
            },
          ],
          survivingWorker: { holdBeforeMutation: true },
        },
        null,
        2,
      )}\n`,
    );

    const sessionId = `ralph-v2:tamper:${randomUUID()}`;
    const supervisorId = `tamper-supervisor-${randomUUID()}`;
    const workerId = `tamper-worker-${randomUUID()}`;
    const registry = createWorkerSessionRegistry(fixtureRoot);
    const reservation = registry.claim({ sessionId, workerId: supervisorId });
    if (!reservation.acquired) throw new Error("test could not reserve ownership");

    const child = spawn(
      process.execPath,
      [WORKER_PATH, configPath, sessionId, worktreePath, workerId, supervisorId],
      {
        cwd: fixtureRoot,
        env: createSafeEnvironment(process.env, {
          HOME: root,
          USERPROFILE: root,
        }),
        stdio: "ignore",
        windowsHide: true,
      },
    );
    children.push(child);
    await waitUntil(
      () => readRecords(spawnedPath).length === 1 || child.exitCode !== null,
      "the inert wrapper to publish its process identity",
    );
    const wrapper = readRecords(spawnedPath)[0];
    expect(wrapper).toMatchObject({
      kind: "inert-wrapper",
      workerId,
      processId: child.pid,
      sessionId,
    });
    const processIdentity = wrapper.processIdentity;
    registry.transfer({
      sessionId,
      expectedOwner: reservation.owner,
      workerId,
      processId: child.pid!,
      processIdentity,
    });

    await waitUntil(
      () => readRecords(startsPath).length === 1,
      "the authorized worker to reach its mutation boundary",
    );
    expect(readRecords(mutationsPath)).toEqual([]);

    const ownerKey = createHash("sha256").update(sessionId).digest("hex");
    const transferPath = path.join(
      fixtureRoot,
      "execution-owners",
      `${ownerKey}.json.transfer-${reservation.owner.token}.json`,
    );
    const transferredOwner = JSON.parse(fs.readFileSync(transferPath, "utf8"));
    fs.writeFileSync(
      transferPath,
      `${JSON.stringify(
        {
          ...transferredOwner,
          processIdentity: differentValidIdentity(processIdentity),
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(mutationReleasePath, "release\n");
    await waitUntil(
      () =>
        readRecords(errorsPath).length > 0 ||
        readRecords(mutationsPath).length > 0 ||
        child.exitCode !== null,
      "the worker to reject tampered ownership",
    );
    fs.writeFileSync(completionReleasePath, "release\n");

    expect(readRecords(mutationsPath)).toEqual([]);
    expect(fs.existsSync(path.join(worktreePath, "src", "must-not-be-written.txt"))).toBe(
      false,
    );
    expect(readRecords(errorsPath)).toEqual([
      expect.objectContaining({
        workerId,
        sessionId,
        message: "surviving worker lost execution ownership before mutation",
      }),
    ]);
  });
});
