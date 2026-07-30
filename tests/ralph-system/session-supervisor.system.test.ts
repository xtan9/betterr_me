import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";
import { computeSessionPlanDigest } from "../../scripts/ralph/v2/session-supervisor.mjs";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";

/*
 * Proposed production seam (scripts/ralph/v2/session-supervisor.mjs):
 *
 *   createDurableSessionSupervisorClient({ sessionRoot, pollIntervalMilliseconds })
 *     .plan({ sessionId, planDigest, child })
 *     .authorize({ sessionId, authorizationId, planDigest })
 *     .inspect(sessionId)
 *     .startOrAttach({ sessionId })
 *     .terminate({ sessionId, operationId, reason })
 *     .closeUnstarted({ sessionId, operationId, reason })
 *
 *   runDurableSessionSupervisor({
 *     sessionRoot, sessionId, supervisorId, containment,
 *     pollIntervalMilliseconds,
 *   })
 *
 * Controllers only publish commands and observe durable results. A separate,
 * trusted supervisor process owns launch/containment. Multiple inert supervisor
 * wrappers are permitted; only the durable owner may launch Codex.
 */

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SUPERVISOR_MODULE_URL = pathToFileURL(
  path.join(REPOSITORY_ROOT, "scripts", "ralph", "v2", "session-supervisor.mjs"),
).href;
const SUPERVISOR_HOST_PATH = fileURLToPath(
  new URL("./fixtures/durable-session-supervisor-host.mjs", import.meta.url),
);
const CONTROLLER_HOST_PATH = fileURLToPath(
  new URL("./fixtures/session-supervisor-controller-host.mjs", import.meta.url),
);
const MOCK_CODEX_PATH = fileURLToPath(
  new URL("./fixtures/hostile-mock-codex.mjs", import.meta.url),
);
const roots: string[] = [];
const hosts: HostProcess[] = [];

type HostProcess = {
  child: ChildProcess;
  completion: Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }>;
};

type SupervisorCase = ReturnType<typeof createSupervisorCase>;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMilliseconds = 10_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await sleep(10);
  }
}

function readRecords(directory: string) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8")),
    );
}

function sameProcessIsAlive(record: {
  processId: number;
  processIdentity: string;
}) {
  return readProcessIdentity(record.processId) === record.processIdentity;
}

async function waitForRecordsToDie(
  records: Array<{ processId: number; processIdentity: string }>,
  description: string,
) {
  await waitUntil(
    () => records.every((record) => !sameProcessIsAlive(record)),
    description,
  );
}

function touch(filePath: string) {
  fs.writeFileSync(filePath, "release\n");
}

function createSupervisorCase(
  options: {
    mode?: string;
    holdTermination?: boolean;
    holdBeforeSpawn?: boolean;
    descendantIgnoresCompletionRelease?: boolean;
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-supervisor-"));
  roots.push(root);
  const fixtureRoot = path.join(root, "fixture");
  const sessionRoot = path.join(root, "sessions");
  const configPath = path.join(root, "config.json");
  const sessionId = "ralph-v2:supervisor-contract:604";
  const authorizationId = "authorization-604-generation-1";
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const child = {
    executable: process.execPath,
    args: [MOCK_CODEX_PATH, configPath],
    cwd: fixtureRoot,
    environment: {},
    holdBeforeSpawn: options.holdBeforeSpawn === true,
  };
  const planDigest = computeSessionPlanDigest({ sessionId, child });
  const plan = {
    sessionId,
    planDigest,
    child,
  };
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        repositoryRoot: REPOSITORY_ROOT,
        fixtureRoot,
        sessionRoot,
        sessionId,
        authorizationId,
        planDigest,
        plan,
        mode: options.mode ?? "complete",
        holdTermination: options.holdTermination === true,
        descendantIgnoresCompletionRelease:
          options.descendantIgnoresCompletionRelease === true,
      },
      null,
      2,
    )}\n`,
  );
  return {
    root,
    fixtureRoot,
    sessionRoot,
    configPath,
    sessionId,
    authorizationId,
    planDigest,
    plan,
    completionReleasePath: path.join(fixtureRoot, "completion-release"),
    terminationReleasePath: path.join(fixtureRoot, "termination-release"),
    launchReleasePath: path.join(fixtureRoot, "launch-release"),
    launchAttemptPath: path.join(fixtureRoot, "launch-attempt.json"),
    terminationRequestPath: path.join(
      fixtureRoot,
      "containment-termination-request.json",
    ),
    controllerAuthorizedPath: path.join(
      fixtureRoot,
      "controller-authorized.json",
    ),
    wrappersPath: path.join(fixtureRoot, "supervisor-wrappers"),
    launchesPath: path.join(fixtureRoot, "codex-launches"),
    mutationsPath: path.join(fixtureRoot, "codex-mutations"),
    containedProcessesPath: path.join(fixtureRoot, "contained-processes"),
    unauthorizedLaunchesPath: path.join(fixtureRoot, "unauthorized-launches"),
  };
}

async function loadContract() {
  return import(/* @vite-ignore */ SUPERVISOR_MODULE_URL);
}

async function createClient(testCase: SupervisorCase) {
  const { createDurableSessionSupervisorClient } = await loadContract();
  return createDurableSessionSupervisorClient({
    sessionRoot: testCase.sessionRoot,
    pollIntervalMilliseconds: 10,
  });
}

function spawnHost(program: string, args: string[], testCase: SupervisorCase) {
  const child = spawn(process.execPath, [program, ...args], {
    cwd: testCase.fixtureRoot,
    env: createSafeEnvironment(process.env, {
      HOME: testCase.root,
      USERPROFILE: testCase.root,
    }),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => (stderr += chunk));
  const completion = new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }>((resolve) => {
    child.once("error", (error) =>
      resolve({ exitCode: null, signal: null, stderr: `${stderr}${error.message}` }),
    );
    child.once("close", (exitCode, signal) =>
      resolve({ exitCode, signal, stderr }),
    );
  });
  const host = { child, completion };
  hosts.push(host);
  return host;
}

function startSupervisor(testCase: SupervisorCase, supervisorId: string) {
  return spawnHost(
    SUPERVISOR_HOST_PATH,
    [testCase.configPath, supervisorId],
    testCase,
  );
}

function startAuthorizingController(testCase: SupervisorCase) {
  return spawnHost(
    CONTROLLER_HOST_PATH,
    [testCase.configPath, "plan-authorize-hold"],
    testCase,
  );
}

async function killHost(host: HostProcess) {
  if (
    host.child.pid &&
    host.child.exitCode === null &&
    host.child.signalCode === null
  ) {
    host.child.kill("SIGKILL");
  }
  return host.completion;
}

async function planAndAuthorize(testCase: SupervisorCase, client: any) {
  await client.plan(testCase.plan);
  await client.authorize({
    sessionId: testCase.sessionId,
    authorizationId: testCase.authorizationId,
    planDigest: testCase.planDigest,
  });
}

afterEach(async () => {
  for (const root of roots) {
    for (const releaseName of [
      "completion-release",
      "termination-release",
      "launch-release",
    ]) {
      try {
        touch(path.join(root, "fixture", releaseName));
      } catch {
        // The fixture may already have been removed after an intended RED failure.
      }
    }
  }
  await sleep(30);
  for (const host of hosts.splice(0)) await killHost(host);
  for (const root of roots.splice(0)) {
    const processRecords = readRecords(
      path.join(root, "fixture", "contained-processes"),
    );
    for (const record of processRecords) {
      if (sameProcessIsAlive(record)) process.kill(record.processId, "SIGKILL");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 durable session supervisor", () => {
  it("rejects a child plan changed without a matching trusted digest", async () => {
    const testCase = createSupervisorCase();
    const client = await createClient(testCase);
    await expect(
      client.plan({
        ...testCase.plan,
        child: {
          ...testCase.plan.child,
          args: [...testCase.plan.child.args, "issue-controlled-extra-arg"],
          environment: { LEAK_CONTROLLER_TOKEN: "true" },
        },
      }),
    ).rejects.toThrow(/plan digest.*does not match|integrity validation/i);
    expect(await client.inspect(testCase.sessionId)).toBeNull();
  });

  it("lets contending inert supervisors exist but authorizes exactly one Codex launch", async () => {
    const testCase = createSupervisorCase();
    const client = await createClient(testCase);
    await client.plan(testCase.plan);
    startSupervisor(testCase, "supervisor-alpha");
    startSupervisor(testCase, "supervisor-beta");

    await waitUntil(
      () => readRecords(testCase.wrappersPath).length === 2,
      "both inert supervisor wrappers",
    );
    const planned = await client.inspect(testCase.sessionId);
    expect(planned.status).toBe("planned");
    expect(planned.owner).toMatchObject({ role: "trusted-supervisor" });
    expect(planned.owner.processId).not.toBe(process.pid);
    expect(readRecords(testCase.wrappersPath)).toContainEqual(
      expect.objectContaining({
        supervisorId: planned.owner.supervisorId,
        processId: planned.owner.processId,
        processIdentity: planned.owner.processIdentity,
      }),
    );
    await sleep(150);
    expect(readRecords(testCase.launchesPath)).toEqual([]);
    expect(readRecords(testCase.unauthorizedLaunchesPath)).toEqual([]);

    await client.authorize({
      sessionId: testCase.sessionId,
      authorizationId: testCase.authorizationId,
      planDigest: testCase.planDigest,
    });
    await waitUntil(
      () => readRecords(testCase.launchesPath).length === 1,
      "the single authorized Codex launch",
    );
    await sleep(150);
    expect(readRecords(testCase.launchesPath)).toEqual([
      expect.objectContaining({
        role: "mock-codex",
        sessionId: testCase.sessionId,
        authorizationId: testCase.authorizationId,
        planDigest: testCase.planDigest,
      }),
    ]);
    expect(readRecords(testCase.unauthorizedLaunchesPath)).toEqual([]);

    await client.terminate({
      sessionId: testCase.sessionId,
      operationId: "cleanup-single-launch",
      reason: "test-complete",
    });
    await waitForRecordsToDie(
      readRecords(testCase.containedProcessesPath),
      "the authorized Codex tree to terminate",
    );
  });

  it("attaches a replacement controller to the same supervisor after authorization", async () => {
    const testCase = createSupervisorCase();
    // Fail immediately at the proposed seam while its production module is absent.
    await loadContract();
    const firstController = startAuthorizingController(testCase);
    await waitUntil(
      () => fs.existsSync(testCase.controllerAuthorizedPath),
      "the first controller to persist authorization",
    );
    startSupervisor(testCase, "surviving-supervisor");
    const observer = await createClient(testCase);
    await waitUntil(
      () => readRecords(testCase.launchesPath).length === 1,
      "Codex to launch before controller death",
    );
    const ownerBeforeCrash = (await observer.inspect(testCase.sessionId)).owner;
    await killHost(firstController);

    const replacementController = await createClient(testCase);
    const completion = replacementController.startOrAttach({
      sessionId: testCase.sessionId,
    });
    expect((await replacementController.inspect(testCase.sessionId)).owner).toEqual(
      ownerBeforeCrash,
    );
    expect(readRecords(testCase.launchesPath)).toHaveLength(1);
    touch(testCase.completionReleasePath);
    const receipt = await completion;

    expect(receipt).toMatchObject({
      kind: "completed",
      sessionId: testCase.sessionId,
      supervisorId: "surviving-supervisor",
      containment: {
        processTreeTerminated: true,
        liveProcessCount: 0,
      },
    });
    expect(readRecords(testCase.launchesPath)).toHaveLength(1);
  });

  it("marks a launched session interrupted and never relaunches it after child death", async () => {
    const testCase = createSupervisorCase({
      mode: "crash-after-mutation-before-receipt",
    });
    const client = await createClient(testCase);
    await planAndAuthorize(testCase, client);
    startSupervisor(testCase, "interruption-supervisor");

    const interrupted = await client.startOrAttach({ sessionId: testCase.sessionId });
    expect(interrupted).toMatchObject({
      kind: "interrupted",
      sessionId: testCase.sessionId,
      relaunchAllowed: false,
      containment: { processTreeTerminated: true, liveProcessCount: 0 },
    });
    expect(readRecords(testCase.mutationsPath)).toHaveLength(1);
    expect(readRecords(testCase.launchesPath)).toHaveLength(1);

    startSupervisor(testCase, "must-not-relaunch-supervisor");
    const attached = await client.startOrAttach({ sessionId: testCase.sessionId });
    expect(attached).toEqual(interrupted);
    await sleep(150);
    expect(readRecords(testCase.launchesPath)).toHaveLength(1);
    expect(await client.inspect(testCase.sessionId)).toMatchObject({
      status: "interrupted",
      launchCount: 1,
      relaunchAllowed: false,
    });
    await waitForRecordsToDie(
      readRecords(testCase.containedProcessesPath),
      "the interrupted Codex tree to be contained",
    );
  });

  it("makes termination operation-keyed, idempotent, and conditional on zero live descendants", async () => {
    const testCase = createSupervisorCase({ holdTermination: true });
    const client = await createClient(testCase);
    await planAndAuthorize(testCase, client);
    startSupervisor(testCase, "termination-supervisor");
    await waitUntil(
      () => readRecords(testCase.containedProcessesPath).length >= 2,
      "the mock Codex child and descendant",
    );

    let firstSettled = false;
    let duplicateSettled = false;
    const first = client
      .terminate({
        sessionId: testCase.sessionId,
        operationId: "operator-stop-604",
        reason: "STOP",
      })
      .then((receipt: unknown) => {
        firstSettled = true;
        return receipt;
      });
    const duplicate = client
      .terminate({
        sessionId: testCase.sessionId,
        operationId: "operator-stop-604",
        reason: "STOP",
      })
      .then((receipt: unknown) => {
        duplicateSettled = true;
        return receipt;
      });
    await waitUntil(
      () => fs.existsSync(testCase.terminationRequestPath),
      "the containment termination request",
    );
    await sleep(100);
    expect(firstSettled).toBe(false);
    expect(duplicateSettled).toBe(false);
    expect(
      readRecords(testCase.containedProcessesPath).some(sameProcessIsAlive),
    ).toBe(true);

    touch(testCase.terminationReleasePath);
    const [firstReceipt, duplicateReceipt] = await Promise.all([first, duplicate]);
    expect(duplicateReceipt).toEqual(firstReceipt);
    expect(firstReceipt).toMatchObject({
      kind: "terminated",
      operationId: "operator-stop-604",
      processTreeTerminated: true,
      containment: {
        guarantee: "identity-ledger-contract-only",
        liveProcessCount: 0,
      },
    });
    expect(
      readRecords(testCase.containedProcessesPath).every(
        (record) => !sameProcessIsAlive(record),
      ),
    ).toBe(true);
    await expect(
      client.terminate({
        sessionId: testCase.sessionId,
        operationId: "different-stop-operation",
        reason: "STOP",
      }),
    ).rejects.toThrow(/already terminated.*operator-stop-604/i);
  });

  it("closes a planned but never-started session atomically and permanently", async () => {
    const testCase = createSupervisorCase();
    const client = await createClient(testCase);
    await client.plan(testCase.plan);
    const first = await client.closeUnstarted({
      sessionId: testCase.sessionId,
      operationId: "close-before-start-604",
      reason: "STOP",
    });
    const duplicate = await client.closeUnstarted({
      sessionId: testCase.sessionId,
      operationId: "close-before-start-604",
      reason: "STOP",
    });

    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({
      kind: "closed-unstarted",
      sessionId: testCase.sessionId,
      operationId: "close-before-start-604",
      launchCount: 0,
    });
    await expect(
      client.authorize({
        sessionId: testCase.sessionId,
        authorizationId: testCase.authorizationId,
        planDigest: testCase.planDigest,
      }),
    ).rejects.toThrow(/closed.*cannot.*authorize/i);
    startSupervisor(testCase, "too-late-supervisor");
    expect(await client.startOrAttach({ sessionId: testCase.sessionId })).toEqual(
      first,
    );
    await sleep(100);
    expect(readRecords(testCase.launchesPath)).toEqual([]);
    expect(await client.inspect(testCase.sessionId)).toMatchObject({
      status: "closed-unstarted",
      launchCount: 0,
    });
  });

  it("linearizes STOP racing the first launch without leaking or duplicating Codex", async () => {
    const testCase = createSupervisorCase({ holdBeforeSpawn: true });
    const client = await createClient(testCase);
    await planAndAuthorize(testCase, client);
    const supervisor = startSupervisor(testCase, "start-stop-race-supervisor");
    await waitUntil(
      () => fs.existsSync(testCase.launchAttemptPath),
      "the authorized launch admission",
    );

    const stopped = client.terminate({
      sessionId: testCase.sessionId,
      operationId: "stop-racing-first-start",
      reason: "STOP",
    });
    touch(testCase.launchReleasePath);
    const receipt = await stopped;
    const supervisorExit = await supervisor.completion;
    expect(supervisorExit.exitCode, supervisorExit.stderr).toBe(0);
    const launches = readRecords(testCase.launchesPath);

    expect(launches.length).toBeLessThanOrEqual(1);
    expect(receipt).toMatchObject({
      kind: "terminated",
      operationId: "stop-racing-first-start",
      processTreeTerminated: true,
      containment: { liveProcessCount: 0 },
    });
    expect(["not-started", "started-then-terminated"]).toContain(
      receipt.launchDisposition,
    );
    expect(receipt.launchDisposition).toBe(
      launches.length === 0 ? "not-started" : "started-then-terminated",
    );
    expect(readRecords(testCase.unauthorizedLaunchesPath)).toEqual([]);
    await waitForRecordsToDie(
      readRecords(testCase.containedProcessesPath),
      "the first-start race containment",
    );
  });

  it("publishes success only after the separate supervisor, Codex, and descendant are dead", async () => {
    const testCase = createSupervisorCase();
    const client = await createClient(testCase);
    await planAndAuthorize(testCase, client);
    const supervisor = startSupervisor(testCase, "successful-supervisor");
    await waitUntil(
      () =>
        readRecords(testCase.wrappersPath).length === 1 &&
        readRecords(testCase.containedProcessesPath).length >= 2,
      "separate supervisor, Codex, and descendant records",
    );
    const wrapper = readRecords(testCase.wrappersPath)[0];
    const contained = readRecords(testCase.containedProcessesPath);
    const mockCodex = contained.find((record) => record.role === "mock-codex");
    const descendant = contained.find((record) => record.role === "descendant");
    expect(wrapper.processId).not.toBe(mockCodex.processId);
    expect(wrapper.processId).not.toBe(descendant.processId);
    expect(mockCodex.processId).not.toBe(descendant.processId);
    expect(mockCodex.parentProcessId).toBe(wrapper.processId);
    expect(descendant.parentProcessId).toBe(mockCodex.processId);

    const completion = client.startOrAttach({ sessionId: testCase.sessionId });
    touch(testCase.completionReleasePath);
    const receipt = await completion;
    expect(receipt).toMatchObject({
      kind: "completed",
      sessionId: testCase.sessionId,
      containment: {
        processTreeTerminated: true,
        liveProcessCount: 0,
      },
    });
    const supervisorExit = await supervisor.completion;
    expect(supervisorExit.exitCode, supervisorExit.stderr).toBe(0);

    const everyRecordedProcess = [wrapper, ...contained];
    await waitForRecordsToDie(
      everyRecordedProcess,
      "all recorded session processes to die before fixture cleanup",
    );
    expect(everyRecordedProcess.every((record) => !sameProcessIsAlive(record))).toBe(
      true,
    );
  });

  it("authoritatively finalizes containment and accepts STOP after the root exits zero", async () => {
    const testCase = createSupervisorCase({
      descendantIgnoresCompletionRelease: true,
      holdTermination: true,
    });
    const client = await createClient(testCase);
    await planAndAuthorize(testCase, client);
    startSupervisor(testCase, "completion-stop-supervisor");
    await waitUntil(
      () => readRecords(testCase.containedProcessesPath).length >= 2,
      "the root and surviving descendant",
    );
    const processes = readRecords(testCase.containedProcessesPath);
    const root = processes.find((record) => record.role === "mock-codex");

    touch(testCase.completionReleasePath);
    await waitUntil(
      () => fs.existsSync(testCase.terminationRequestPath),
      "successful finalization to begin after the root exits zero",
    );
    expect(
      JSON.parse(fs.readFileSync(testCase.terminationRequestPath, "utf8")),
    ).toMatchObject({
      sessionId: testCase.sessionId,
      operationId: expect.stringMatching(/^complete-/),
      reason: "successful-session-finalization",
    });
    const stopping = client.terminate({
      sessionId: testCase.sessionId,
      operationId: "stop-during-success-finalization",
      reason: "STOP",
    });
    touch(testCase.terminationReleasePath);
    const receipt = await stopping;

    expect(receipt).toMatchObject({
      kind: "terminated",
      sessionId: testCase.sessionId,
      operationId: "stop-during-success-finalization",
      processTreeTerminated: true,
      containment: { liveProcessCount: 0 },
    });
    await waitForRecordsToDie(
      processes,
      "the zero-exit root and orphan descendant to be dead",
    );
    expect(sameProcessIsAlive(root)).toBe(false);
    expect(readRecords(testCase.launchesPath)).toHaveLength(1);
  });
});
