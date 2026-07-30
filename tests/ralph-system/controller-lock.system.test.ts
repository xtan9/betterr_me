import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const RUN_ARGUMENTS = [
  "run",
  "--mode",
  "PrOnly",
  "--max-issues",
  "1",
  "--json",
];

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  const failures: unknown[] = [];
  for (const world of worlds.splice(0)) {
    try {
      world.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "failed to clean controller-lock worlds");
  }
});

function createLockScenario() {
  const world = createGitWorld();
  worlds.push(world);
  const scenario = createSystemScenario(world, {
    issues: [],
    workerChanges: [],
    expectedChanges: [],
  });
  const lockPath = path.join(world.runtimePath, "controller-v2.lock");
  fs.mkdirSync(world.runtimePath, { recursive: true });
  return { world, scenario, lockPath };
}

function writeLock(
  lockPath: string,
  owner: {
    token: string;
    processId: number;
    processIdentity: string;
    createdAt: string;
  },
) {
  fs.writeFileSync(lockPath, `${JSON.stringify(owner)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function exitedProcessId() {
  const child = spawn(process.execPath, ["--eval", ""], {
    stdio: "ignore",
    windowsHide: true,
  });
  const processId = child.pid;
  if (processId === undefined) {
    throw new Error("failed to start the stale-lock fixture process");
  }
  const [exitCode, signal] = await once(child, "exit");
  if (exitCode !== 0 || signal !== null) {
    throw new Error("stale-lock fixture process did not exit cleanly");
  }
  try {
    process.kill(processId, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return processId;
    throw error;
  }
  throw new Error("stale-lock fixture PID was unexpectedly reused");
}

function expectSuccessfulIdleRun(
  scenario: ReturnType<typeof createSystemScenario>,
  lockPath: string,
) {
  const result = scenario.run(RUN_ARGUMENTS);
  expect(result.exitCode, result.stderr.join("\n")).toBe(0);
  expect(result.stderr).toEqual([]);
  expect(JSON.parse(result.stdout.at(-1) ?? "null")).toMatchObject({
    workerLease: null,
    issues: [],
  });
  expect(fs.existsSync(lockPath)).toBe(false);
  expect(scenario.inspectEffectLedger()).toEqual([]);
}

function differentValidIdentity(identity: string) {
  if (identity.startsWith("windows-start-ticks:")) {
    const ticks = BigInt(identity.slice("windows-start-ticks:".length));
    return `windows-start-ticks:${ticks + 1n}`;
  }
  if (identity.startsWith("linux-boot-start:")) {
    const separator = identity.lastIndexOf(":");
    return `${identity.slice(0, separator + 1)}${
      BigInt(identity.slice(separator + 1)) + 1n
    }`;
  }
  return `${identity} different`;
}

describe("Ralph v2 controller lock recovery", () => {
  it("reclaims a valid lock whose owner process has exited", async () => {
    const { scenario, lockPath } = createLockScenario();
    writeLock(lockPath, {
      token: "11111111-1111-4111-8111-111111111111",
      processId: await exitedProcessId(),
      processIdentity: readProcessIdentity(process.pid)!,
      createdAt: "2026-07-30T12:00:00.000Z",
    });

    expectSuccessfulIdleRun(scenario, lockPath);
  });

  it("ignores an unlinked candidate left by interrupted acquisition", () => {
    const { scenario, lockPath } = createLockScenario();
    const interruptedCandidatePath = `${lockPath}.candidate-interrupted`;
    fs.writeFileSync(interruptedCandidatePath, '{"token":"partial', "utf8");

    expectSuccessfulIdleRun(scenario, lockPath);
  });

  it("fails closed without replacing a malformed controller lock", () => {
    const { scenario, lockPath } = createLockScenario();
    const malformedLock = '{"token":"interrupted"';
    fs.writeFileSync(lockPath, malformedLock, "utf8");

    const result = scenario.run(RUN_ARGUMENTS);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toMatch(/lock failed integrity validation/i);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(malformedLock);
    expect(scenario.inspectEffectLedger()).toEqual([]);
  });

  it("reclaims a lock when a live PID belongs to a newer process identity", () => {
    const { scenario, lockPath } = createLockScenario();
    const currentIdentity = readProcessIdentity(process.pid);
    if (!currentIdentity) throw new Error("test process identity is unavailable");
    writeLock(lockPath, {
      token: "22222222-2222-4222-8222-222222222222",
      processId: process.pid,
      processIdentity: differentValidIdentity(currentIdentity),
      createdAt: "2000-01-01T00:00:00.000Z",
    });

    expectSuccessfulIdleRun(scenario, lockPath);
  });

  it("does not treat metadata without OS mutex ownership as authoritative", () => {
    const { scenario, lockPath } = createLockScenario();
    const currentIdentity = readProcessIdentity(process.pid);
    if (!currentIdentity) throw new Error("test process identity is unavailable");
    writeLock(lockPath, {
      token: "33333333-3333-4333-8333-333333333333",
      processId: process.pid,
      processIdentity: currentIdentity,
      createdAt: new Date().toISOString(),
    });

    expectSuccessfulIdleRun(scenario, lockPath);
  });
});
