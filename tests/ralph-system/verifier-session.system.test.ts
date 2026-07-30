import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { deliveryGitMutations } from "./support/assertions";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";

const RUN_ARGUMENTS = [
  "run",
  "--mode",
  "PrOnly",
  "--max-issues",
  "1",
  "--json",
];
const REQUIRED_TEST_GATES = ["related", "typescript", "full-suite"];
const REQUIRED_REVIEW_AXES = ["standards", "spec", "security", "tests"];

type HostResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string[];
  stderr: string[];
};

const worlds: Array<ReturnType<typeof createGitWorld>> = [];
const controllers: ChildProcess[] = [];

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

function validProcessIdentity(processIdentity: unknown) {
  return (
    typeof processIdentity === "string" &&
    (/^windows-start-ticks:\d+$/.test(processIdentity) ||
      /^linux-boot-start:[0-9a-f-]{36}:\d+$/i.test(processIdentity))
  );
}

function sameProcessIsAlive(processId: number, processIdentity: string) {
  if (!validProcessIdentity(processIdentity)) {
    throw new Error("tracked verifier process identity is invalid");
  }
  return (
    processIsAlive(processId) &&
    readProcessIdentity(processId) === processIdentity
  );
}

async function forceKillTree(processId: number, processIdentity: string) {
  if (!sameProcessIsAlive(processId, processIdentity)) return;
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) throw new Error("cannot locate taskkill.exe");
    await new Promise<void>((resolve, reject) => {
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
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function fixtureRoot(world: ReturnType<typeof createGitWorld>) {
  return path.join(world.root, "durable-verifier");
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

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMilliseconds = 10_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function parseHostResult(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  signal: NodeJS.Signals | null = null,
): HostResult {
  return {
    exitCode,
    signal,
    stdout: stdout.trim().split(/\r?\n/).filter(Boolean),
    stderr: stderr.trim().split(/\r?\n/).filter(Boolean),
  };
}

function createVerifierScenario(input: {
  behavior:
    | "immediate"
    | "held-success"
    | "hung"
    | "reject-with-live-tree"
    | "invalid-live-receipt"
    | "passed-live-receipt"
    | "failed-live-receipt";
  receiptVariant?:
    | "valid"
    | "wrong-session"
    | "wrong-tree"
    | "missing-full-suite"
    | "incomplete-review"
    | "wrong-plan-digest"
    | "wrong-test-command"
    | "blank-axis-evidence"
    | "placeholder-coverage-evidence"
    | "missing-path-coverage"
    | "duplicate-path-coverage"
    | "failed-missing-evidence"
    | "failed-wrong-evidence-session"
    | "failed-wrong-evidence-tree"
    | "failed-wrong-plan-digest"
    | "failed-unstable-finding-ids";
  verificationTimeoutMilliseconds?: number;
  crashAfterTerminate?: boolean;
  holdBeforeOwnership?: boolean;
  holdTermination?: boolean;
}) {
  const world = createGitWorld();
  worlds.push(world);
  const expectedChanges = [
    {
      path: "src/durable-verifier.txt",
      content: "verified by one durable session\n",
      mode: "100644",
      status: "A",
    },
    {
      path: "tests/durable-verifier.test.ts",
      content: "export const durableVerifierCovered = true;\n",
      mode: "100644",
      status: "A",
    },
  ];
  const scenario = createSystemScenario(world, {
    issues: [
      {
        number: 604,
        title: "Prove durable verification",
        body: "Bind complete test and review evidence to this exact candidate.",
      },
    ],
    workerChanges: expectedChanges.map(({ path: changePath, content }) => ({
      path: changePath,
      content,
    })),
    expectedChanges,
  });
  const configPath = path.join(world.root, "system-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.durableVerifier = {
    behavior: input.behavior,
    receiptVariant: input.receiptVariant ?? "valid",
    crashAfterTerminate: input.crashAfterTerminate ?? false,
    holdBeforeOwnership: input.holdBeforeOwnership ?? false,
    holdTermination: input.holdTermination ?? false,
  };
  if (input.verificationTimeoutMilliseconds !== undefined) {
    config.verificationTimeoutMilliseconds =
      input.verificationTimeoutMilliseconds;
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const hostPath = fileURLToPath(
    new URL("./fixtures/durable-verifier-host.mjs", import.meta.url),
  );
  const environment = () =>
    createSafeEnvironment(process.env, {
      GIT_TRACE2_EVENT: world.gitTracePath,
      HOME: world.root,
      USERPROFILE: world.root,
    });
  const hostArguments = (args: string[]) => [
    hostPath,
    configPath,
    "--",
    ...args,
  ];

  return {
    world,
    scenario,
    expectedChanges,
    start(args = RUN_ARGUMENTS) {
      const child = spawn(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        env: environment(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      controllers.push(child);
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      const completion = new Promise<HostResult>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => {
          resolve(parseHostResult(exitCode, stdout, stderr, signal));
        });
      });
      return { child, completion };
    },
    run(args = RUN_ARGUMENTS) {
      const result = spawnSync(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        env: environment(),
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      });
      if (result.error) throw result.error;
      return parseHostResult(
        result.status,
        result.stdout,
        result.stderr,
        result.signal,
      );
    },
  };
}

function fixtureRecords(
  world: ReturnType<typeof createGitWorld>,
  name: string,
) {
  return readRecords(path.join(fixtureRoot(world), name));
}

function releaseVerifier(world: ReturnType<typeof createGitWorld>) {
  fs.mkdirSync(fixtureRoot(world), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot(world), "release"), "release\n");
}

function releaseVerifierOwnership(world: ReturnType<typeof createGitWorld>) {
  fs.mkdirSync(fixtureRoot(world), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot(world), "ownership-release"),
    "release\n",
  );
}

function releaseVerifierTermination(world: ReturnType<typeof createGitWorld>) {
  fs.mkdirSync(fixtureRoot(world), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot(world), "termination-release"),
    "release\n",
  );
}

function readDurableIssueRecord(
  world: ReturnType<typeof createGitWorld>,
  issueNumber = 604,
) {
  const state = JSON.parse(
    fs.readFileSync(path.join(world.runtimePath, "state-v2.json"), "utf8"),
  );
  return state.issues[String(issueNumber)];
}

function assertNoCandidateDelivery(
  world: ReturnType<typeof createGitWorld>,
  scenario: ReturnType<typeof createSystemScenario>,
) {
  const externalState = scenario.inspectExternalState();
  expect(externalState.pullRequestRequests).toEqual([]);
  expect(externalState.pullRequests).toEqual([]);
  const mutations = deliveryGitMutations(scenario.inspectGitTrace());
  expect(mutations).not.toContain("commit");
  expect(mutations).not.toContain("push");
  expect(
    git(world.remotePath, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
    ]).stdout.trim(),
  ).toBe("main");
}

function candidateDeliveryObserved(
  scenario: ReturnType<typeof createSystemScenario>,
) {
  const externalState = scenario.inspectExternalState();
  const mutations = deliveryGitMutations(scenario.inspectGitTrace());
  return (
    externalState.pullRequestRequests.length > 0 ||
    externalState.pullRequests.length > 0 ||
    mutations.includes("commit") ||
    mutations.includes("push")
  );
}

function gitOperationWasAttempted(
  scenario: ReturnType<typeof createSystemScenario>,
  operation: string[],
) {
  return scenario.inspectGitTrace().some(
    (event: { event?: string; argv?: string[] }) =>
      event.event === "start" &&
      Array.isArray(event.argv) &&
      operation.every(
        (argument, index) =>
          event.argv?.[event.argv.indexOf(operation[0]) + index] === argument,
      ),
  );
}

async function completionWithin<T>(
  completion: Promise<T>,
  timeoutMilliseconds: number,
) {
  return Promise.race([
    completion,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMilliseconds),
    ),
  ]);
}

async function observeProcessTreeDeath(
  processTree: {
    processId: number;
    processIdentity: string;
    descendantProcessId: number;
    descendantProcessIdentity: string;
  },
  timeoutMilliseconds = 1_000,
) {
  if (
    !validProcessIdentity(processTree.processIdentity) ||
    !validProcessIdentity(processTree.descendantProcessIdentity)
  ) {
    throw new Error("verifier process tree identity is unavailable");
  }
  try {
    await waitUntil(
      () =>
        !sameProcessIsAlive(
          processTree.processId,
          processTree.processIdentity,
        ) &&
        !sameProcessIsAlive(
          processTree.descendantProcessId,
          processTree.descendantProcessIdentity,
        ),
      "the verifier process tree to die",
      timeoutMilliseconds,
    );
    return true;
  } catch {
    return false;
  }
}

function readPublicStatus(
  run: (args?: string[]) => HostResult,
) {
  const result = run(["status", "--json"]);
  expect(result.exitCode, result.stderr.join("\n")).toBe(0);
  expect(result.stderr).toEqual([]);
  return JSON.parse(result.stdout.at(-1) ?? "null");
}

function expectedParkedIssue(
  world: ReturnType<typeof createGitWorld>,
  input: {
    disposition: "stopped" | "verification_failed";
    blocker?: Record<string, unknown>;
  },
) {
  return {
    number: 604,
    disposition: input.disposition,
    baseSha: world.mainSha,
    artifactPath: path.join(
      world.runtimePath,
      "worktrees",
      "parked",
      "issue-604",
    ),
    ...(input.blocker ? { blocker: input.blocker } : {}),
  };
}

function assertExactParkedArtifact(
  world: ReturnType<typeof createGitWorld>,
  expectedChanges: Array<{ path: string; content: string }>,
) {
  const artifactPath = path.join(
    world.runtimePath,
    "worktrees",
    "parked",
    "issue-604",
  );
  expect(fs.existsSync(artifactPath)).toBe(true);
  expect(git(artifactPath, ["branch", "--show-current"]).stdout.trim()).toBe(
    "codex/issue-604",
  );
  expect(git(artifactPath, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
    world.mainSha,
  );
  expect(
    git(artifactPath, ["status", "--porcelain"])
      .stdout.trim()
      .split(/\r?\n/)
      .sort(),
  ).toEqual(
    expectedChanges.map((change) => `A  ${change.path}`).sort(),
  );
  for (const change of expectedChanges) {
    expect(fs.readFileSync(path.join(artifactPath, change.path), "utf8")).toBe(
      change.content,
    );
  }
}

afterEach(async () => {
  for (const controller of controllers.splice(0)) {
    if (controller.exitCode === null && controller.signalCode === null) {
      controller.kill("SIGKILL");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));

  const failures: unknown[] = [];
  for (const world of worlds.splice(0)) {
    try {
      releaseVerifierOwnership(world);
      releaseVerifierTermination(world);
      for (const spawnedVerifier of fixtureRecords(world, "spawned")) {
        if (
          Number.isSafeInteger(spawnedVerifier.processId) &&
          validProcessIdentity(spawnedVerifier.processIdentity)
        ) {
          await forceKillTree(
            spawnedVerifier.processId,
            spawnedVerifier.processIdentity,
          );
        } else {
          throw new Error("spawned verifier cleanup identity is invalid");
        }
      }
      world.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "failed to clean verifier system worlds");
  }
});

describe("Ralph v2 durable verifier sessions", () => {
  it("attaches to the same verifier execution after its controller crashes", async () => {
    const { world, scenario, start } = createVerifierScenario({
      behavior: "held-success",
    });
    const first = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the detached verifier to start",
    );
    const originalStart = fixtureRecords(world, "starts")[0];
    expect(
      sameProcessIsAlive(
        originalStart.processId,
        originalStart.processIdentity,
      ),
    ).toBe(true);

    expect(first.child.kill("SIGKILL")).toBe(true);
    const crashed = await first.completion;
    expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
    expect(
      sameProcessIsAlive(
        originalStart.processId,
        originalStart.processIdentity,
      ),
    ).toBe(true);

    const recovered = start();
    await waitUntil(
      () =>
        fixtureRecords(world, "starts").length >= 2 ||
        fixtureRecords(world, "attachments").length >= 1 ||
        recovered.child.exitCode !== null ||
        recovered.child.signalCode !== null,
      "recovery to attach or expose a duplicate verifier",
    );
    releaseVerifier(world);
    const recoveredResult = await recovered.completion;
    await waitUntil(
      () =>
        fixtureRecords(world, "starts").every(
          (record) =>
            !sameProcessIsAlive(record.processId, record.processIdentity),
        ),
      "all detached verifier processes to exit",
    );

    expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
    expect(recoveredResult.stderr).toEqual([]);
    const starts = fixtureRecords(world, "starts");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      sessionId: originalStart.sessionId,
      candidateTreeSha: originalStart.candidateTreeSha,
      processId: originalStart.processId,
    });
    expect(fixtureRecords(world, "attachments")).toEqual([
      expect.objectContaining({
        sessionId: originalStart.sessionId,
        candidateTreeSha: originalStart.candidateTreeSha,
      }),
    ]);
    expect(fixtureRecords(world, "legacy-calls")).toEqual([]);
    expect(fixtureRecords(world, "receipts")).toEqual([
      expect.objectContaining({
        kind: "passed",
        sessionId: originalStart.sessionId,
        candidateTreeSha: originalStart.candidateTreeSha,
      }),
    ]);
    expect(scenario.inspectExternalState().pullRequests).toHaveLength(1);
  });

  it("elects one execution owner when the controller dies before ownership", async () => {
    const { world, scenario, start } = createVerifierScenario({
      behavior: "held-success",
      holdBeforeOwnership: true,
    });
    const first = start();
    await waitUntil(
      () => fixtureRecords(world, "spawned").length === 1,
      "the first detached verifier wrapper before ownership",
    );
    expect(fixtureRecords(world, "starts")).toEqual([]);
    expect(first.child.kill("SIGKILL")).toBe(true);
    const crashed = await first.completion;
    expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);

    const recovered = start();
    await waitUntil(
      () => fixtureRecords(world, "spawned").length === 2,
      "the recovery verifier wrapper before ownership",
    );
    expect(fixtureRecords(world, "starts")).toEqual([]);
    releaseVerifierOwnership(world);
    await waitUntil(
      () =>
        fixtureRecords(world, "starts").length === 1 &&
        fixtureRecords(world, "attachments").length === 1,
      "one verifier execution owner and one inert wrapper",
    );
    releaseVerifier(world);
    const recoveredResult = await recovered.completion;
    await waitUntil(
      () =>
        fixtureRecords(world, "spawned").every(
          (wrapper) =>
            !sameProcessIsAlive(wrapper.processId, wrapper.processIdentity),
        ),
      "all verifier wrappers to exit",
    );

    expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
    expect(recoveredResult.stderr).toEqual([]);
    expect(fixtureRecords(world, "spawned")).toHaveLength(2);
    expect(fixtureRecords(world, "starts")).toHaveLength(1);
    expect(fixtureRecords(world, "attachments")).toHaveLength(1);
    expect(fixtureRecords(world, "receipts")).toHaveLength(1);
    expect(scenario.inspectExternalState().pullRequests).toHaveLength(1);
  });

  it("terminates a hung verifier process tree when STOP is requested", async () => {
    const { world, scenario, expectedChanges, start, run } =
      createVerifierScenario({
        behavior: "hung",
      });
    const active = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the hung verifier and descendant to start",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    expect(Number.isSafeInteger(processTree.descendantProcessId)).toBe(true);

    const stop = run(["stop", "--json"]);
    const boundedCompletion = await Promise.race([
      active.completion,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    const processTreeDied =
      boundedCompletion === null
        ? false
        : await observeProcessTreeDeath(processTree);

    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    expect(boundedCompletion).not.toBeNull();
    expect(boundedCompletion?.exitCode).toBe(0);
    expect(boundedCompletion?.stderr).toEqual([]);
    expect(processTreeDied).toBe(true);
    expect(fixtureRecords(world, "terminations")).toEqual([
      expect.objectContaining({
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        processTreeTerminated: true,
        processIds: expect.arrayContaining([
          processTree.processId,
          processTree.descendantProcessId,
        ]),
        processes: expect.arrayContaining([
          {
            processId: processTree.processId,
            processIdentity: processTree.processIdentity,
          },
          {
            processId: processTree.descendantProcessId,
            processIdentity: processTree.descendantProcessIdentity,
          },
        ]),
      }),
    ]);
    expect(readPublicStatus(run)).toEqual({
      stopRequested: true,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, { disposition: "stopped" }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });

  it("terminates a hung verifier process tree at the configured timeout", async () => {
    const { world, scenario, expectedChanges, start, run } =
      createVerifierScenario({
        behavior: "hung",
        verificationTimeoutMilliseconds: 400,
      });
    const active = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the timeout verifier and descendant to start",
    );
    const verifierObservedAt = Date.now();
    const processTree = fixtureRecords(world, "starts")[0];
    const boundedCompletion = await Promise.race([
      active.completion,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    const elapsedMilliseconds = Date.now() - verifierObservedAt;
    const processTreeDied =
      boundedCompletion === null
        ? false
        : await observeProcessTreeDeath(processTree);

    expect(boundedCompletion).not.toBeNull();
    expect(boundedCompletion?.exitCode).toBe(0);
    expect(boundedCompletion?.stderr).toEqual([]);
    expect(elapsedMilliseconds).toBeLessThan(3_000);
    expect(processTreeDied).toBe(true);
    expect(fixtureRecords(world, "terminations")).toEqual([
      expect.objectContaining({
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        processTreeTerminated: true,
      }),
    ]);
    expect(readPublicStatus(run)).toEqual({
      stopRequested: false,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, {
          disposition: "verification_failed",
          blocker: {
            kind: "verification_timeout",
            sessionId: processTree.sessionId,
            deadlineEpochMilliseconds: expect.any(Number),
          },
        }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });

  it("keeps one absolute verification deadline after the controller crashes", async () => {
    const { world, scenario, expectedChanges, start, run } =
      createVerifierScenario({
        behavior: "hung",
        verificationTimeoutMilliseconds: 4_000,
      });
    const first = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the verifier governed by the original deadline",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    expect(first.child.kill("SIGKILL")).toBe(true);
    const crashed = await first.completion;
    expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
    expect(
      sameProcessIsAlive(processTree.processId, processTree.processIdentity),
    ).toBe(true);

    const recoveryStartedAt = Date.now();
    const recovered = start();
    const recoveredResult = await completionWithin(
      recovered.completion,
      3_000,
    );
    const recoveryElapsedMilliseconds = Date.now() - recoveryStartedAt;
    expect(recoveredResult).not.toBeNull();
    if (recoveredResult === null) return;
    expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
    expect(recoveredResult.stderr).toEqual([]);
    expect(recoveryElapsedMilliseconds).toBeLessThan(3_000);
    expect(await observeProcessTreeDeath(processTree)).toBe(true);
    expect(fixtureRecords(world, "starts")).toHaveLength(1);
    expect(
      fixtureRecords(world, "attachments").length,
    ).toBeLessThanOrEqual(1);
    expect(fixtureRecords(world, "terminations")).toHaveLength(1);
    expect(readPublicStatus(run)).toEqual({
      stopRequested: false,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, {
          disposition: "verification_failed",
          blocker: {
            kind: "verification_timeout",
            sessionId: processTree.sessionId,
            deadlineEpochMilliseconds: expect.any(Number),
          },
        }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });

  it("recovers idempotently after crashing immediately after termination", async () => {
    const { world, scenario, expectedChanges, start, run } =
      createVerifierScenario({
        behavior: "hung",
        verificationTimeoutMilliseconds: 400,
        crashAfterTerminate: true,
      });
    const first = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the verifier that will crash at termination",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    const crashed = await completionWithin(first.completion, 5_000);
    expect(crashed).not.toBeNull();
    if (crashed === null) return;
    expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
    expect(fixtureRecords(world, "terminations")).toHaveLength(1);
    expect(await observeProcessTreeDeath(processTree)).toBe(true);

    const recovered = start();
    const recoveredResult = await completionWithin(
      recovered.completion,
      3_000,
    );
    expect(recoveredResult).not.toBeNull();
    if (recoveredResult === null) return;
    expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
    expect(recoveredResult.stderr).toEqual([]);
    expect(fixtureRecords(world, "starts")).toHaveLength(1);
    expect(fixtureRecords(world, "attachments")).toEqual([]);
    expect(fixtureRecords(world, "terminations")).toHaveLength(1);
    expect(fixtureRecords(world, "termination-reuses")).toHaveLength(1);
    expect(readPublicStatus(run)).toEqual({
      stopRequested: false,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, {
          disposition: "verification_failed",
          blocker: {
            kind: "verification_timeout",
            sessionId: processTree.sessionId,
            deadlineEpochMilliseconds: expect.any(Number),
          },
        }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });

  it.each([
    {
      name: "a rejected verifier operation",
      behavior: "reject-with-live-tree",
      receiptVariant: "valid",
      blockerKind: "verification_infrastructure_error",
      message: /adapter rejected a live session/i,
    },
    {
      name: "an invalid completion receipt",
      behavior: "invalid-live-receipt",
      receiptVariant: "missing-full-suite",
      blockerKind: "verification_receipt_invalid",
      message: /verification receipt.*invalid/i,
    },
  ] as const)(
    "authoritatively terminates and parks $name with a live descendant",
    async ({ behavior, receiptVariant, blockerKind, message }) => {
      const { world, scenario, expectedChanges, start, run } =
        createVerifierScenario({ behavior, receiptVariant });
      const active = start();
      await waitUntil(
        () => fixtureRecords(world, "starts").length === 1,
        "the failing verifier and its live descendant",
      );
      const processTree = fixtureRecords(world, "starts")[0];
      expect(Number.isSafeInteger(processTree.descendantProcessId)).toBe(true);
      const result = await completionWithin(active.completion, 3_000);
      expect(result).not.toBeNull();
      if (result === null) return;
      expect(result.exitCode, result.stderr.join("\n")).toBe(0);
      expect(result.stderr).toEqual([]);
      expect(await observeProcessTreeDeath(processTree)).toBe(true);
      expect(fixtureRecords(world, "terminations")).toHaveLength(1);
      expect(readPublicStatus(run)).toEqual({
        stopRequested: false,
        workerLease: null,
        issues: [
          expectedParkedIssue(world, {
            disposition: "verification_failed",
            blocker: {
              kind: blockerKind,
              sessionId: processTree.sessionId,
              message: expect.stringMatching(message),
            },
          }),
        ],
      });
      assertExactParkedArtifact(world, expectedChanges);
      assertNoCandidateDelivery(world, scenario);
    },
  );

  it("makes stop reconcile an orphaned verifier without another run command", async () => {
    const { world, scenario, expectedChanges, start, run } =
      createVerifierScenario({ behavior: "hung" });
    const active = start();
    await waitUntil(
      () => fixtureRecords(world, "starts").length === 1,
      "the verifier that will outlive its controller",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    expect(active.child.kill("SIGKILL")).toBe(true);
    const crashed = await active.completion;
    expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
    expect(
      sameProcessIsAlive(processTree.processId, processTree.processIdentity),
    ).toBe(true);
    expect(
      sameProcessIsAlive(
        processTree.descendantProcessId,
        processTree.descendantProcessIdentity,
      ),
    ).toBe(true);

    const stop = run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    expect(stop.stderr).toEqual([]);
    expect(await observeProcessTreeDeath(processTree)).toBe(true);
    expect(fixtureRecords(world, "attachments")).toEqual([]);
    expect(fixtureRecords(world, "terminations")).toHaveLength(1);
    expect(JSON.parse(stop.stdout.at(-1) ?? "null")).toEqual({
      stopRequested: true,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, { disposition: "stopped" }),
      ],
    });
    expect(readPublicStatus(run)).toEqual({
      stopRequested: true,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, { disposition: "stopped" }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });

  it("finalizes a passed receipt before allowing commit, push, or PR creation", async () => {
    const { world, scenario, start } = createVerifierScenario({
      behavior: "passed-live-receipt",
      holdTermination: true,
    });
    const active = start();
    await waitUntil(
      () =>
        fixtureRecords(world, "receipts").length === 1 &&
        fixtureRecords(world, "starts").length === 1,
      "the live verifier to publish its passed result",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    await waitUntil(
      () =>
        fixtureRecords(world, "termination-starts").length > 0 ||
        active.child.exitCode !== null ||
        active.child.signalCode !== null,
      "the controller to request finalization or incorrectly finish",
    );

    const completionBeforeTermination = await completionWithin(
      active.completion,
      100,
    );
    const treeWasAliveBeforeTermination =
      sameProcessIsAlive(
        processTree.processId,
        processTree.processIdentity,
      ) &&
      sameProcessIsAlive(
        processTree.descendantProcessId,
        processTree.descendantProcessIdentity,
      );
    const terminationReceiptsBeforeRelease = fixtureRecords(
      world,
      "termination-receipts",
    );
    const deliveryStartedBeforeTermination = candidateDeliveryObserved(scenario);
    const durableReceiptBeforeTermination =
      readDurableIssueRecord(world).verificationReceipt;

    releaseVerifierTermination(world);
    const completed =
      completionBeforeTermination ??
      (await completionWithin(active.completion, 4_000));
    const treeDied = await observeProcessTreeDeath(processTree);
    const terminationReceipts = fixtureRecords(
      world,
      "termination-receipts",
    );

    expect.soft(fixtureRecords(world, "termination-starts")).toHaveLength(1);
    expect.soft(completionBeforeTermination).toBeNull();
    expect.soft(treeWasAliveBeforeTermination).toBe(true);
    expect.soft(terminationReceiptsBeforeRelease).toEqual([]);
    expect.soft(deliveryStartedBeforeTermination).toBe(false);
    expect.soft(durableReceiptBeforeTermination).toMatchObject({
      kind: "passed",
      sessionId: processTree.sessionId,
      candidateTreeSha: processTree.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        verificationPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        tests: expect.arrayContaining(
          REQUIRED_TEST_GATES.map((id) => expect.objectContaining({ id })),
        ),
        review: expect.objectContaining({
          status: "pass",
          complete: true,
          findings: [],
          blockingFindings: [],
        }),
      },
    });
    expect.soft(completed).not.toBeNull();
    expect.soft(completed?.exitCode).toBe(0);
    expect.soft(completed?.stderr).toEqual([]);
    expect.soft(treeDied).toBe(true);
    expect.soft(terminationReceipts).toEqual([
      expect.objectContaining({
        kind: "terminated",
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        processTreeTerminated: true,
        processes: expect.arrayContaining([
          {
            processId: processTree.processId,
            processIdentity: processTree.processIdentity,
          },
          {
            processId: processTree.descendantProcessId,
            processIdentity: processTree.descendantProcessIdentity,
          },
        ]),
      }),
    ]);
    expect.soft(scenario.inspectExternalState().pullRequests).toHaveLength(1);

    const durableReceipt = readDurableIssueRecord(world).verificationReceipt;
    expect.soft(durableReceipt).toEqual(durableReceiptBeforeTermination);
    expect.soft(durableReceipt).toMatchObject({
      kind: "passed",
      sessionId: processTree.sessionId,
      candidateTreeSha: processTree.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        verificationPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        tests: expect.arrayContaining(
          REQUIRED_TEST_GATES.map((id) => expect.objectContaining({ id })),
        ),
        review: expect.objectContaining({
          status: "pass",
          complete: true,
          findings: [],
          blockingFindings: [],
        }),
      },
    });
  });

  it("finalizes a failed receipt before parking work or starting a repair", async () => {
    const { world, scenario, start } = createVerifierScenario({
      behavior: "failed-live-receipt",
      holdTermination: true,
    });
    const active = start();
    await waitUntil(
      () =>
        fixtureRecords(world, "receipts").length === 1 &&
        fixtureRecords(world, "starts").length === 1,
      "the live verifier to publish its failed result",
    );
    const processTree = fixtureRecords(world, "starts")[0];
    await waitUntil(
      () =>
        fixtureRecords(world, "termination-starts").length > 0 ||
        active.child.exitCode !== null ||
        active.child.signalCode !== null,
      "the controller to request failed-result finalization or incorrectly finish",
    );

    const completionBeforeTermination = await completionWithin(
      active.completion,
      100,
    );
    const parkedArtifactPath = path.join(
      world.runtimePath,
      "worktrees",
      "parked",
      "issue-604",
    );
    const parkedBeforeTermination = fs.existsSync(parkedArtifactPath);
    const parkingStartedBeforeTermination = gitOperationWasAttempted(
      scenario,
      ["worktree", "move"],
    );
    const workerSessionsBeforeTermination =
      scenario.inspectExternalState().sessions.length;
    const treeWasAliveBeforeTermination =
      sameProcessIsAlive(
        processTree.processId,
        processTree.processIdentity,
      ) &&
      sameProcessIsAlive(
        processTree.descendantProcessId,
        processTree.descendantProcessIdentity,
      );
    const terminationReceiptsBeforeRelease = fixtureRecords(
      world,
      "termination-receipts",
    );
    const durableReceiptBeforeTermination =
      readDurableIssueRecord(world).verificationReceipt;

    releaseVerifierTermination(world);
    const completed =
      completionBeforeTermination ??
      (await completionWithin(active.completion, 4_000));
    const treeDied = await observeProcessTreeDeath(processTree);
    const terminationReceipts = fixtureRecords(
      world,
      "termination-receipts",
    );

    expect.soft(fixtureRecords(world, "termination-starts")).toHaveLength(1);
    expect.soft(completionBeforeTermination).toBeNull();
    expect.soft(parkedBeforeTermination).toBe(false);
    expect.soft(parkingStartedBeforeTermination).toBe(false);
    expect.soft(workerSessionsBeforeTermination).toBe(1);
    expect.soft(treeWasAliveBeforeTermination).toBe(true);
    expect.soft(terminationReceiptsBeforeRelease).toEqual([]);
    expect.soft(durableReceiptBeforeTermination).toMatchObject({
      kind: "failed",
      sessionId: processTree.sessionId,
      candidateTreeSha: processTree.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        verificationPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        tests: expect.arrayContaining(
          REQUIRED_TEST_GATES.map((id) => expect.objectContaining({ id })),
        ),
        review: expect.objectContaining({
          status: "findings",
          complete: true,
          findings: expect.arrayContaining([
            expect.objectContaining({ id: "SEC-001" }),
          ]),
          blockingFindings: [
            "SEC-001: verifier process tree is still live",
          ],
        }),
      },
    });
    expect.soft(completed).not.toBeNull();
    expect.soft(completed?.exitCode).toBe(0);
    expect.soft(completed?.stderr).toEqual([]);
    expect.soft(treeDied).toBe(true);
    expect.soft(terminationReceipts).toEqual([
      expect.objectContaining({
        kind: "terminated",
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        processTreeTerminated: true,
      }),
    ]);
    assertNoCandidateDelivery(world, scenario);

    const durableReceipt = readDurableIssueRecord(world).verificationReceipt;
    expect.soft(durableReceipt).toEqual(durableReceiptBeforeTermination);
    expect.soft(durableReceipt).toMatchObject({
      kind: "failed",
      sessionId: processTree.sessionId,
      candidateTreeSha: processTree.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: processTree.sessionId,
        candidateTreeSha: processTree.candidateTreeSha,
        verificationPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        tests: expect.arrayContaining(
          REQUIRED_TEST_GATES.map((id) => expect.objectContaining({ id })),
        ),
        review: expect.objectContaining({
          status: "findings",
          complete: true,
          findings: [
            expect.objectContaining({
              id: "SEC-001",
              axis: "security",
              location: "fixture:1",
              problem: expect.stringMatching(/process tree/i),
              evidence: expect.stringMatching(/terminal result/i),
              safeRepair: expect.stringMatching(/terminate/i),
            }),
          ],
          blockingFindings: [
            "SEC-001: verifier process tree is still live",
          ],
        }),
      },
    });
  });

  it.each([
    ["missing structured evidence", "failed-missing-evidence"],
    ["a forged evidence session", "failed-wrong-evidence-session"],
    ["a forged candidate tree", "failed-wrong-evidence-tree"],
    ["a forged controller plan digest", "failed-wrong-plan-digest"],
    ["duplicate or dangling finding IDs", "failed-unstable-finding-ids"],
  ] as const)(
    "rejects failed verification with %s",
    async (_name, receiptVariant) => {
      const { world, scenario, expectedChanges, run } = createVerifierScenario({
        behavior: "failed-live-receipt",
        receiptVariant,
      });
      const result = run();
      expect(result.exitCode, result.stderr.join("\n")).toBe(0);
      expect(result.stderr).toEqual([]);
      const [start] = fixtureRecords(world, "starts");
      expect(fixtureRecords(world, "terminations")).toHaveLength(1);
      expect(readPublicStatus(run)).toEqual({
        stopRequested: false,
        workerLease: null,
        issues: [
          expectedParkedIssue(world, {
            disposition: "verification_failed",
            blocker: {
              kind: "verification_receipt_invalid",
              sessionId: start.sessionId,
              message: expect.stringMatching(/verification receipt.*invalid/i),
            },
          }),
        ],
      });
      assertExactParkedArtifact(world, expectedChanges);
      assertNoCandidateDelivery(world, scenario);
    },
  );

  it("publishes only with a receipt bound to complete test and review evidence", () => {
    const { world, scenario, expectedChanges, run } = createVerifierScenario({
      behavior: "immediate",
    });
    const result = run();
    expect(result.exitCode, result.stderr.join("\n")).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(fixtureRecords(world, "legacy-calls")).toEqual([]);

    const [start] = fixtureRecords(world, "starts");
    const [receipt] = fixtureRecords(world, "receipts");
    expect(receipt).toMatchObject({
      kind: "passed",
      sessionId: start.sessionId,
      candidateTreeSha: start.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: start.sessionId,
        candidateTreeSha: start.candidateTreeSha,
        verificationPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        review: {
          reviewKind: "exhaustive",
          status: "pass",
          complete: true,
          sessionId: `${start.sessionId}:review`,
          candidateTreeSha: start.candidateTreeSha,
          findings: [],
          blockingFindings: [],
        },
      },
    });
    expect(receipt.evidence.tests.map((test: { id: string }) => test.id)).toEqual(
      REQUIRED_TEST_GATES,
    );
    expect(
      receipt.evidence.review.axes.map((axis: { id: string }) => axis.id),
    ).toEqual(REQUIRED_REVIEW_AXES);
    expect(
      receipt.evidence.review.coverage
        .filter((row: { id: string }) => /^FILE-\d+$/.test(row.id))
        .map((row: { subject: string }) => row.subject),
    ).toEqual(expectedChanges.map((change) => change.path).sort());
    expect(scenario.inspectExternalState().pullRequests).toHaveLength(1);
  });

  it.each([
    ["wrong verifier session", "wrong-session"],
    ["wrong candidate tree", "wrong-tree"],
    ["missing full-suite evidence", "missing-full-suite"],
    ["incomplete exhaustive review", "incomplete-review"],
    ["wrong controller-owned plan digest", "wrong-plan-digest"],
    ["a command outside the controller plan", "wrong-test-command"],
    ["blank review-axis evidence", "blank-axis-evidence"],
    ["placeholder coverage evidence", "placeholder-coverage-evidence"],
    ["missing changed-path coverage", "missing-path-coverage"],
    ["duplicate changed-path coverage", "duplicate-path-coverage"],
  ] as const)("rejects a passed receipt with %s before commit", (_name, receiptVariant) => {
    const { world, scenario, expectedChanges, run } = createVerifierScenario({
      behavior: "immediate",
      receiptVariant,
    });
    const result = run();
    expect(result.exitCode, result.stderr.join("\n")).toBe(0);
    expect(result.stderr).toEqual([]);
    const [start] = fixtureRecords(world, "starts");
    expect(fixtureRecords(world, "terminations")).toHaveLength(1);
    expect(readPublicStatus(run)).toEqual({
      stopRequested: false,
      workerLease: null,
      issues: [
        expectedParkedIssue(world, {
          disposition: "verification_failed",
          blocker: {
            kind: "verification_receipt_invalid",
            sessionId: start.sessionId,
            message: expect.stringMatching(/verification receipt.*invalid/i),
          },
        }),
      ],
    });
    assertExactParkedArtifact(world, expectedChanges);
    assertNoCandidateDelivery(world, scenario);
  });
});
