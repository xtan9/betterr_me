import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";
import { createWorkerSessionRegistry } from "../../scripts/ralph/v2/worker-session-registry.mjs";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";

const HOST_PATH = fileURLToPath(
  new URL("./fixtures/worker-session-registry-host.mjs", import.meta.url),
);
const TRANSFER_RACE_HOST_PATH = fileURLToPath(
  new URL("./fixtures/worker-session-transfer-race-host.mjs", import.meta.url),
);
const roots: string[] = [];
const children: Array<{
  child: ChildProcess;
  completion: Promise<HostResult>;
}> = [];

type HostResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

type RegistryCase = ReturnType<typeof createRegistryCase>;

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

function createRegistryCase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-worker-registry-"));
  roots.push(root);
  return {
    root,
    sessionRoot: path.join(root, "sessions"),
    sessionId: `ralph-v2:test-session:${randomUUID()}`,
    reachedPath: path.join(root, "reached.json"),
    releasePath: path.join(root, "release"),
  };
}

function hostConfig(
  testCase: RegistryCase,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const configPath = path.join(testCase.root, `config-${suffix}.json`);
  const resultPath = path.join(testCase.root, `result-${suffix}.json`);
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        sessionRoot: testCase.sessionRoot,
        sessionId: testCase.sessionId,
        workerId: `worker-${suffix}`,
        reachedPath: testCase.reachedPath,
        releasePath: testCase.releasePath,
        resultPath,
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
  return { configPath, resultPath };
}

function environment(testCase: RegistryCase) {
  return createSafeEnvironment(process.env, {
    HOME: testCase.root,
    USERPROFILE: testCase.root,
  });
}

function parseResult(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
): HostResult {
  return { exitCode, signal, stdout, stderr };
}

function startHost(
  testCase: RegistryCase,
  role: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const { configPath, resultPath } = hostConfig(testCase, suffix, overrides);
  const child = spawn(process.execPath, [HOST_PATH, configPath, role], {
    windowsHide: true,
    env: environment(testCase),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => (stdout += chunk));
  child.stderr?.on("data", (chunk) => (stderr += chunk));
  const completion = new Promise<HostResult>((resolve) => {
    child.once("error", (error) =>
      resolve(parseResult(null, null, stdout, `${stderr}${error.message}`)),
    );
    child.once("close", (exitCode, signal) =>
      resolve(parseResult(exitCode, signal, stdout, stderr)),
    );
  });
  const started = { child, completion };
  children.push(started);
  return { ...started, resultPath };
}

function runTransferRace(testCase: RegistryCase) {
  const { configPath, resultPath } = hostConfig(testCase, "transfer-race");
  const result = spawnSync(process.execPath, [TRANSFER_RACE_HOST_PATH, configPath], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    env: environment(testCase),
  });
  if (result.error) throw result.error;
  return {
    ...parseResult(result.status, result.signal, result.stdout, result.stderr),
    race: fs.existsSync(resultPath)
      ? JSON.parse(fs.readFileSync(resultPath, "utf8"))
      : null,
  };
}

function runClaim(testCase: RegistryCase, suffix: string) {
  const { configPath, resultPath } = hostConfig(testCase, suffix);
  const result = spawnSync(process.execPath, [HOST_PATH, configPath, "claim"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    env: environment(testCase),
  });
  if (result.error) throw result.error;
  return {
    ...parseResult(result.status, result.signal, result.stdout, result.stderr),
    claim: fs.existsSync(resultPath)
      ? JSON.parse(fs.readFileSync(resultPath, "utf8"))
      : null,
  };
}

async function killHost(started: ReturnType<typeof startHost>) {
  if (
    started.child.pid &&
    started.child.exitCode === null &&
    started.child.signalCode === null
  ) {
    started.child.kill("SIGKILL");
  }
  return started.completion;
}

function ownerPath(testCase: RegistryCase) {
  const key = createHash("sha256").update(testCase.sessionId).digest("hex");
  return path.join(testCase.sessionRoot, "execution-owners", `${key}.json`);
}

function differentValidIdentity(identity: string) {
  if (identity.startsWith("windows-start-ticks:")) {
    const ticks = BigInt(identity.slice("windows-start-ticks:".length));
    return `windows-start-ticks:${ticks + 1n}`;
  }
  const separator = identity.lastIndexOf(":");
  return `${identity.slice(0, separator + 1)}${
    BigInt(identity.slice(separator + 1)) + 1n
  }`;
}

afterEach(async () => {
  for (const root of roots) {
    fs.writeFileSync(path.join(root, "release"), "release\n");
  }
  for (const started of children.splice(0)) await killHost(started);
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 worker-session ownership registry", () => {
  it("allows exactly one of two incompatible transfer publications to win", () => {
    const testCase = createRegistryCase();
    const result = runTransferRace(testCase);

    expect(result.exitCode, result.stderr).toBe(0);
    const winners = result.race.attempts.filter(
      (attempt: { status: string }) => attempt.status === "won",
    );
    const rejected = result.race.attempts.filter(
      (attempt: { status: string }) => attempt.status === "rejected",
    );
    expect(winners).toHaveLength(1);
    expect(rejected).toEqual([
      expect.objectContaining({
        status: "rejected",
        message: "worker session ownership was already transferred",
      }),
    ]);
    expect(result.race.owner).toEqual(winners[0].owner);
  });

  it("recovers a reservation when its publisher crashes before transfer publication", async () => {
    const testCase = createRegistryCase();
    const processIdentity = readProcessIdentity(process.pid);
    if (!processIdentity) throw new Error("test process identity is unavailable");
    const publisher = startHost(
      testCase,
      "crash-before-transfer-publication",
      "pre-transfer-crash",
      {
        transferWorkerId: "unpublished-transfer-target",
        transferProcessId: process.pid,
        transferProcessIdentity: processIdentity,
      },
    );
    await waitUntil(
      () => fs.existsSync(testCase.reachedPath),
      "the pre-transfer publication barrier",
    );
    expect(JSON.parse(fs.readFileSync(testCase.reachedPath, "utf8"))).toMatchObject({
      phase: "before-transfer-publication",
      processId: publisher.child.pid,
    });
    await killHost(publisher);

    const recovered = runClaim(testCase, "after-pre-transfer-crash");
    expect(recovered.exitCode, recovered.stderr).toBe(0);
    expect(recovered.claim).toMatchObject({
      acquired: true,
      owner: { workerId: "worker-after-pre-transfer-crash" },
    });
  });

  it("attaches to the transferred owner when its publisher crashes after publication", async () => {
    const testCase = createRegistryCase();
    const processIdentity = readProcessIdentity(process.pid);
    if (!processIdentity) throw new Error("test process identity is unavailable");
    const publisher = startHost(
      testCase,
      "crash-after-transfer-publication",
      "post-transfer-crash",
      {
        transferWorkerId: "published-transfer-target",
        transferProcessId: process.pid,
        transferProcessIdentity: processIdentity,
      },
    );
    await waitUntil(
      () => fs.existsSync(testCase.reachedPath),
      "the post-transfer publication barrier",
    );
    expect(JSON.parse(fs.readFileSync(testCase.reachedPath, "utf8"))).toMatchObject({
      phase: "after-transfer-publication",
      processId: publisher.child.pid,
    });
    await killHost(publisher);

    const contender = runClaim(testCase, "after-post-transfer-crash");
    expect(contender.exitCode, contender.stderr).toBe(0);
    expect(contender.claim).toMatchObject({
      acquired: false,
      owner: {
        workerId: "published-transfer-target",
        processId: process.pid,
        processIdentity,
      },
    });
  });

  it("rejects a syntactically valid transferred identity that does not belong to the target process", () => {
    const testCase = createRegistryCase();
    const registry = createWorkerSessionRegistry(testCase.sessionRoot);
    const reservation = registry.claim({
      sessionId: testCase.sessionId,
      workerId: "identity-validation-supervisor",
    });
    if (!reservation.acquired) throw new Error("test could not reserve ownership");
    const identity = readProcessIdentity(process.pid);
    if (!identity) throw new Error("test process identity is unavailable");

    expect(() =>
      registry.transfer({
        sessionId: testCase.sessionId,
        expectedOwner: reservation.owner,
        workerId: "tampered-transfer-target",
        processId: process.pid,
        processIdentity: differentValidIdentity(identity),
      }),
    ).toThrow("worker session transfer failed integrity validation");
    expect(registry.inspect(testCase.sessionId)).toEqual(reservation.owner);
  });

  it("rejects an invalid transfer PID before process inspection or side effects", () => {
    const testCase = createRegistryCase();
    const registry = createWorkerSessionRegistry(testCase.sessionRoot);
    const sideEffectPath = path.join(testCase.root, "invalid-pid-side-effect");
    const escapedSideEffectPath = sideEffectPath.replaceAll("'", "''");
    const hostileProcessId =
      `1); [IO.File]::WriteAllText('${escapedSideEffectPath}','owned'); ` +
      "[System.Diagnostics.Process]::GetProcessById(1";

    expect(() =>
      readProcessIdentity(hostileProcessId as unknown as number),
    ).toThrow("process ID failed integrity validation");
    expect(() =>
      registry.transfer({
        sessionId: testCase.sessionId,
        expectedOwner: null,
        workerId: "invalid-pid-target",
        processId: hostileProcessId as unknown as number,
      }),
    ).toThrow("worker session transfer failed integrity validation");
    expect(fs.existsSync(sideEffectPath)).toBe(false);
    expect(registry.inspect(testCase.sessionId)).toBeNull();
  });

  it("rejects a syntactically valid claimant identity that does not belong to the caller", () => {
    const testCase = createRegistryCase();
    const registry = createWorkerSessionRegistry(testCase.sessionRoot);
    const identity = readProcessIdentity(process.pid);
    if (!identity) throw new Error("test process identity is unavailable");

    expect(() =>
      registry.claim({
        sessionId: testCase.sessionId,
        workerId: "forged-identity-claimant",
        processIdentity: differentValidIdentity(identity),
      }),
    ).toThrow("worker process identity is unavailable");
    expect(registry.inspect(testCase.sessionId)).toBeNull();
  });

  it("rejects an invalid worker ID before publishing any session metadata", () => {
    const testCase = createRegistryCase();
    const registry = createWorkerSessionRegistry(testCase.sessionRoot);

    expect(() =>
      registry.claim({
        sessionId: testCase.sessionId,
        workerId: "   ",
      }),
    ).toThrow("worker ID failed integrity validation");
    expect(fs.existsSync(testCase.sessionRoot)).toBe(false);
    expect(registry.inspect(testCase.sessionId)).toBeNull();
  });

  it("recovers after a crash interrupts an unpublished owner record", async () => {
    const testCase = createRegistryCase();
    const interrupted = startHost(testCase, "crash-partial", "interrupted");
    await waitUntil(
      () => fs.existsSync(testCase.reachedPath),
      "the partial owner write",
    );
    expect(JSON.parse(fs.readFileSync(testCase.reachedPath, "utf8"))).toMatchObject({
      phase: "partial-owner-written",
      processId: interrupted.child.pid,
    });
    await killHost(interrupted);

    const recovered = runClaim(testCase, "recovered");
    expect(recovered.exitCode, recovered.stderr).toBe(0);
    expect(recovered.claim).toMatchObject({
      acquired: true,
      owner: {
        sessionId: testCase.sessionId,
        workerId: "worker-recovered",
      },
    });
    expect(JSON.parse(fs.readFileSync(ownerPath(testCase), "utf8"))).toEqual(
      recovered.claim.owner,
    );
  });

  it("publishes a complete owner atomically and reclaims it only after publisher death", async () => {
    const testCase = createRegistryCase();
    const publisher = startHost(
      testCase,
      "hold-after-publication",
      "publisher",
    );
    await waitUntil(
      () =>
        fs.existsSync(testCase.reachedPath) ||
        publisher.child.exitCode !== null ||
        publisher.child.signalCode !== null,
      "owner publication or publisher exit",
    );

    const publication = JSON.parse(
      fs.readFileSync(testCase.reachedPath, "utf8"),
    );
    expect.soft(publication).toMatchObject({
      phase: "owner-published",
      processId: publisher.child.pid,
    });
    expect.soft(processIsAlive(publisher.child.pid!)).toBe(true);

    const contender = runClaim(testCase, "live-contender");
    expect.soft(contender.exitCode, contender.stderr).toBe(0);
    expect.soft(contender.claim).toMatchObject({
      acquired: false,
      owner: {
        processId: publisher.child.pid,
        workerId: "worker-publisher",
      },
    });

    await killHost(publisher);
    const recovered = runClaim(testCase, "post-crash-recovery");
    expect.soft(recovered.exitCode, recovered.stderr).toBe(0);
    expect.soft(recovered.claim).toMatchObject({
      acquired: true,
      owner: {
        sessionId: testCase.sessionId,
        workerId: "worker-post-crash-recovery",
      },
    });
  });

  it("does not reclaim a live owner with the same process identity", async () => {
    const testCase = createRegistryCase();
    const owner = startHost(testCase, "hold-owner", "live-owner");
    await waitUntil(
      () => fs.existsSync(testCase.reachedPath),
      "the live owner claim",
    );

    const contender = runClaim(testCase, "live-owner-contender");
    expect(contender.exitCode, contender.stderr).toBe(0);
    expect(contender.claim).toMatchObject({
      acquired: false,
      owner: {
        processId: owner.child.pid,
        workerId: "worker-live-owner",
      },
    });
    expect(processIsAlive(owner.child.pid!)).toBe(true);
    fs.writeFileSync(testCase.releasePath, "release\n");
    expect((await owner.completion).exitCode).toBe(0);
  });

  it("reclaims an owner whose process died before completion", async () => {
    const testCase = createRegistryCase();
    const owner = startHost(testCase, "hold-owner", "dead-owner");
    await waitUntil(
      () => fs.existsSync(testCase.reachedPath),
      "the owner claim before death",
    );
    await killHost(owner);

    const recovered = runClaim(testCase, "dead-owner-recovery");
    expect(recovered.exitCode, recovered.stderr).toBe(0);
    expect(recovered.claim).toMatchObject({
      acquired: true,
      owner: {
        sessionId: testCase.sessionId,
        workerId: "worker-dead-owner-recovery",
      },
    });
  });

  it("reclaims a live PID whose process start identity no longer matches", () => {
    const testCase = createRegistryCase();
    const identity = readProcessIdentity(process.pid);
    if (!identity) throw new Error("test process identity is unavailable");
    fs.mkdirSync(path.dirname(ownerPath(testCase)), { recursive: true });
    fs.writeFileSync(
      ownerPath(testCase),
      `${JSON.stringify(
        {
          sessionId: testCase.sessionId,
          token: "55555555-5555-4555-8555-555555555555",
          workerId: "worker-reused-pid",
          processId: process.pid,
          processIdentity: differentValidIdentity(identity),
        },
        null,
        2,
      )}\n`,
    );

    const recovered = runClaim(testCase, "pid-reuse-recovery");
    expect(recovered.exitCode, recovered.stderr).toBe(0);
    expect(recovered.claim).toMatchObject({
      acquired: true,
      owner: {
        sessionId: testCase.sessionId,
        workerId: "worker-pid-reuse-recovery",
      },
    });
  });
});
