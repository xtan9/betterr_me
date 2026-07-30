import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const RUN_ARGUMENTS = [
  "run",
  "--mode",
  "PrOnly",
  "--max-issues",
  "1",
  "--json",
];
const STOP_BOUND_MS = 3_000;
const ISSUE_NUMBER = 710;
const ISSUE_BRANCH = `codex/issue-${ISSUE_NUMBER}`;
const STOP_CRASH_POINTS = [
  "claim-applied",
  "worktree-created",
  "worker-completed",
  "candidate-verified",
  "candidate-committed",
  "branch-pushed",
  "draft-pr-created",
  "checkout-cleaned",
] as const;
const WORKER_CHANGE = {
  path: "src/stop-boundary.txt",
  content: "private stop-boundary work\n",
};
const UNTRUSTED_ABORT_CASES = [
  {
    workerMode: "wrong-session-abort-process",
    outcome: "a wrong-session aborted result",
  },
  {
    workerMode: "reject-on-abort-process",
    outcome: "an abort rejection",
  },
] as const;

type World = ReturnType<typeof createGitWorld>;
type Scenario = ReturnType<typeof createSystemScenario>;
type HostResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string[];
  stderr: string[];
};
type StartedHost = {
  child: ChildProcess;
  completion: Promise<HostResult>;
};

const worlds: World[] = [];
const hosts: StartedHost[] = [];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function processAlive(processId: number) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
}

function terminateProcessTree(processId: number) {
  if (!processAlive(processId)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(processId), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 5_000,
    });
    return;
  }
  try {
    process.kill(-processId, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMilliseconds = 10_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) return false;
    await sleep(20);
  }
  return true;
}

async function resultWithin(
  completion: Promise<HostResult>,
  timeoutMilliseconds: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMilliseconds);
  });
  const result = await Promise.race([completion, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

async function stopHost(started: StartedHost) {
  if (started.child.pid && processAlive(started.child.pid)) {
    terminateProcessTree(started.child.pid);
  }
  await resultWithin(started.completion, 5_000);
}

afterEach(async () => {
  for (const started of hosts.splice(0)) await stopHost(started);
  for (const world of worlds.splice(0)) {
    const treePath = path.join(world.root, "stop-process-tree.json");
    if (fs.existsSync(treePath)) {
      const tree = JSON.parse(fs.readFileSync(treePath, "utf8"));
      for (const processId of [tree.workerPid, tree.grandchildPid]) {
        if (Number.isSafeInteger(processId) && processAlive(processId)) {
          terminateProcessTree(processId);
        }
      }
      await waitUntil(
        () =>
          [tree.workerPid, tree.grandchildPid].every(
            (processId: number) => !processAlive(processId),
          ),
        5_000,
      );
    }
    world.cleanup();
  }
});

function createStopScenario(options: {
  holdPoint?: "verifier-held" | "branch-pushed" | "draft-pr-effect";
  workerMode?:
    | "noncooperative-process"
    | "wrong-session-abort-process"
    | "reject-on-abort-process";
  crashPoint?: (typeof STOP_CRASH_POINTS)[number];
}) {
  const world = createGitWorld();
  worlds.push(world);
  const expectedChanges = [
    {
      ...WORKER_CHANGE,
      mode: "100644",
      status: "A",
    },
  ];
  const scenario = createSystemScenario(world, {
    issues: [
      {
        number: ISSUE_NUMBER,
        title: "Exercise stop boundaries",
        body: "Create the exact private stop-boundary fixture.",
      },
    ],
    workerChanges: [WORKER_CHANGE],
    expectedChanges,
    crashPoint: options.crashPoint,
  });
  const configPath = path.join(world.root, "system-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  Object.assign(config, {
    stopTest: {
      ...options,
      reachedPath: path.join(world.root, "stop-boundary-reached.json"),
      releasePath: path.join(world.root, "stop-boundary-release.txt"),
      processTreePath: path.join(world.root, "stop-process-tree.json"),
      workerOutcomePath: path.join(world.root, "stop-worker-outcome.json"),
      terminationStartedPath: path.join(
        world.root,
        "stop-termination-started.json",
      ),
      processTreeDeadPath: path.join(world.root, "stop-process-tree-dead.json"),
      terminationReceiptReleasePath: path.join(
        world.root,
        "stop-termination-receipt-release.txt",
      ),
      workerChange: WORKER_CHANGE,
    },
  });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return {
    world,
    scenario,
    configPath,
    reachedPath: config.stopTest.reachedPath as string,
    releasePath: config.stopTest.releasePath as string,
    processTreePath: config.stopTest.processTreePath as string,
    workerOutcomePath: config.stopTest.workerOutcomePath as string,
    terminationStartedPath: config.stopTest.terminationStartedPath as string,
    processTreeDeadPath: config.stopTest.processTreeDeadPath as string,
    terminationReceiptReleasePath:
      config.stopTest.terminationReceiptReleasePath as string,
    artifactPath: path.join(
      world.runtimePath,
      "worktrees",
      "parked",
      `issue-${ISSUE_NUMBER}`,
    ),
  };
}

function startControlledHost(world: World, configPath: string) {
  const hostPath = fileURLToPath(
    new URL("./fixtures/stop-boundary-host.mjs", import.meta.url),
  );
  const child = spawn(
    process.execPath,
    [hostPath, configPath, "--", ...RUN_ARGUMENTS],
    {
      cwd: world.controllerPath,
      detached: process.platform !== "win32",
      env: createSafeEnvironment(process.env, {
        GIT_TRACE2_EVENT: world.gitTracePath,
        HOME: world.root,
        USERPROFILE: world.root,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => (stdout += chunk));
  child.stderr?.on("data", (chunk) => (stderr += chunk));
  const completion = new Promise<HostResult>((resolve) => {
    child.once("error", (error) => {
      resolve({
        exitCode: null,
        signal: null,
        stdout: [],
        stderr: [error.message],
      });
    });
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: stdout.trim().split(/\r?\n/).filter(Boolean),
        stderr: stderr.trim().split(/\r?\n/).filter(Boolean),
      });
    });
  });
  const started = { child, completion };
  hosts.push(started);
  return started;
}

function release(filePath: string) {
  fs.writeFileSync(filePath, "release\n");
}

function readStatus(scenario: Scenario) {
  const result = scenario.run(["status", "--json"]);
  expect(result.exitCode, result.stderr.join("\n")).toBe(0);
  return JSON.parse(result.stdout.at(-1) ?? "null");
}

function remoteBranches(world: World) {
  return git(world.remotePath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
}

function commitObjects(repositoryPath: string) {
  return git(repositoryPath, [
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objectname) %(objecttype)",
  ]).stdout.trim().split(/\r?\n/)
    .filter((line) => line.endsWith(" commit"))
    .map((line) => line.split(" ")[0])
    .sort();
}

function assertPrivateArtifact(artifactPath: string) {
  expect(fs.existsSync(artifactPath)).toBe(true);
  expect(
    fs.readFileSync(path.join(artifactPath, WORKER_CHANGE.path), "utf8"),
  ).toBe(WORKER_CHANGE.content);
}

describe("Ralph v2 STOP stage boundaries", () => {
  it.each(STOP_CRASH_POINTS)(
    "reconciles STOP after a controller crash at %s",
    (crashPoint) => {
      const setup = createStopScenario({ crashPoint });
      const crashed = setup.scenario.run(RUN_ARGUMENTS);
      expect(crashed.exitCode).not.toBe(0);
      const effectsBeforeStop = setup.scenario.inspectEffectLedger();
      const eventsBeforeStop = setup.scenario.inspectEvents();

      const stop = setup.scenario.run(["stop", "--json"]);
      expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
      const startup = setup.scenario.run(RUN_ARGUMENTS);
      expect(startup.exitCode, startup.stderr.join("\n")).toBe(0);

      expect(setup.scenario.inspectEffectLedger()).toEqual(effectsBeforeStop);
      expect(setup.scenario.inspectEvents()).toEqual(eventsBeforeStop);
      const status = readStatus(setup.scenario);
      expect(status.stopRequested).toBe(true);
      expect(status.workerLease).toBeNull();
      const issue = status.issues[0];
      expect(issue.number).toBe(ISSUE_NUMBER);

      if (
        [
          "worktree-created",
          "worker-completed",
          "candidate-verified",
          "candidate-committed",
        ].includes(crashPoint)
      ) {
        expect(issue).toMatchObject({
          disposition: "stopped",
          artifactPath: setup.artifactPath,
        });
        expect(fs.existsSync(setup.artifactPath)).toBe(true);
        if (crashPoint !== "worktree-created") {
          assertPrivateArtifact(setup.artifactPath);
        }
        expect(remoteBranches(setup.world)).toEqual(["main"]);
      } else if (crashPoint === "claim-applied") {
        expect(issue).toMatchObject({ disposition: "stopped" });
        expect(issue.artifactPath).toBeUndefined();
        expect(remoteBranches(setup.world)).toEqual(["main"]);
      } else {
        expect(issue).toMatchObject({
          disposition: "publishing",
          headBranch: ISSUE_BRANCH,
        });
        expect(remoteBranches(setup.world)).toEqual(
          ["main", ISSUE_BRANCH].sort(),
        );
      }
    },
  );

  it("force-terminates a non-cooperative worker process tree and parks private work", async () => {
    const setup = createStopScenario({
      workerMode: "noncooperative-process",
    });
    const active = startControlledHost(setup.world, setup.configPath);
    expect(await waitUntil(() => fs.existsSync(setup.processTreePath))).toBe(true);
    const processTree = JSON.parse(
      fs.readFileSync(setup.processTreePath, "utf8"),
    ) as { workerPid: number; grandchildPid: number };

    const stopDeadline = Date.now() + STOP_BOUND_MS;
    const stop = setup.scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    const boundedResult = await resultWithin(
      active.completion,
      Math.max(0, stopDeadline - Date.now()),
    );
    const treeGoneWithinBound = await waitUntil(
      () =>
        [processTree.workerPid, processTree.grandchildPid].every(
          (processId) => !processAlive(processId),
        ),
      Math.max(0, stopDeadline - Date.now()),
    );
    const status = readStatus(setup.scenario);
    const artifactWasParked = fs.existsSync(setup.artifactPath);

    if (!boundedResult) await stopHost(active);
    expect.soft(boundedResult, "controller exceeded the STOP bound").not.toBeNull();
    expect.soft(Date.now(), "STOP and worker-tree death exceeded the bound").toBeLessThanOrEqual(
      stopDeadline,
    );
    expect.soft(treeGoneWithinBound, "worker descendant tree survived STOP").toBe(
      true,
    );
    expect.soft(artifactWasParked).toBe(true);
    expect.soft(status).toMatchObject({
      stopRequested: true,
      workerLease: null,
      issues: [
        {
          number: ISSUE_NUMBER,
          disposition: "stopped",
          artifactPath: setup.artifactPath,
        },
      ],
    });
    expect.soft(remoteBranches(setup.world)).toEqual(["main"]);
    if (artifactWasParked) assertPrivateArtifact(setup.artifactPath);
  });

  it.each(UNTRUSTED_ABORT_CASES)(
    "requires authoritative termination after $outcome",
    async ({ workerMode }) => {
      const setup = createStopScenario({ workerMode });
      const active = startControlledHost(setup.world, setup.configPath);
      expect(await waitUntil(() => fs.existsSync(setup.processTreePath))).toBe(true);
      const processTree = JSON.parse(
        fs.readFileSync(setup.processTreePath, "utf8"),
      ) as { workerPid: number; grandchildPid: number };
      expect(
        [processTree.workerPid, processTree.grandchildPid].every(processAlive),
      ).toBe(true);
      const deadline = Date.now() + STOP_BOUND_MS;

      const stop = setup.scenario.run(["stop", "--json"]);
      expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);

      await waitUntil(
        () =>
          fs.existsSync(setup.processTreeDeadPath) ||
          active.child.exitCode !== null ||
          active.child.signalCode !== null,
        Math.max(0, deadline - Date.now()),
      );

      let resultBeforeTerminationReceipt: HostResult | null = null;
      let statusBeforeTerminationReceipt: ReturnType<typeof readStatus>;
      let activeCheckoutBeforeTerminationReceipt = false;
      let parkedArtifactBeforeTerminationReceipt = false;
      try {
        resultBeforeTerminationReceipt = await resultWithin(
          active.completion,
          Math.min(100, Math.max(0, deadline - Date.now())),
        );
        statusBeforeTerminationReceipt = readStatus(setup.scenario);
        activeCheckoutBeforeTerminationReceipt = fs.existsSync(
          path.join(setup.world.runtimePath, "worktrees", "current"),
        );
        parkedArtifactBeforeTerminationReceipt = fs.existsSync(setup.artifactPath);
      } finally {
        release(setup.terminationReceiptReleasePath);
      }

      const result = await resultWithin(
        active.completion,
        Math.max(0, deadline - Date.now()),
      );
      const treeGoneWithinBound = await waitUntil(
        () =>
          [processTree.workerPid, processTree.grandchildPid].every(
            (processId) => !processAlive(processId),
          ),
        Math.max(0, deadline - Date.now()),
      );

      expect.soft(fs.existsSync(setup.terminationStartedPath)).toBe(true);
      expect.soft(fs.existsSync(setup.processTreeDeadPath)).toBe(true);
      expect.soft(fs.existsSync(setup.workerOutcomePath)).toBe(true);
      const workerOutcome = JSON.parse(
        fs.readFileSync(setup.workerOutcomePath, "utf8"),
      );
      expect.soft(workerOutcome).toEqual(
        workerMode === "wrong-session-abort-process"
          ? {
              kind: "aborted",
              sessionId:
                "ralph-v2:issue-710:generation-1:implementation:wrong-session",
              processTreeAlive: true,
            }
          : {
              kind: "rejected",
              sessionId: "ralph-v2:issue-710:generation-1:implementation",
              processTreeAlive: true,
            },
      );
      expect
        .soft(
          resultBeforeTerminationReceipt,
          "controller parked or returned before authoritative termination receipt",
        )
        .toBeNull();
      expect.soft(statusBeforeTerminationReceipt).toMatchObject({
        stopRequested: true,
        workerLease: {
          issueNumber: ISSUE_NUMBER,
        },
        issues: [
          {
            number: ISSUE_NUMBER,
            disposition: "implementing",
          },
        ],
      });
      expect.soft(activeCheckoutBeforeTerminationReceipt).toBe(true);
      expect.soft(parkedArtifactBeforeTerminationReceipt).toBe(false);
      expect.soft(result, "controller exceeded the STOP bound").not.toBeNull();
      expect.soft(result?.exitCode, result?.stderr.join("\n")).toBe(0);
      expect.soft(treeGoneWithinBound, "worker descendant tree survived STOP").toBe(
        true,
      );
      expect.soft(Date.now()).toBeLessThanOrEqual(deadline);
      expect.soft(readStatus(setup.scenario)).toMatchObject({
        stopRequested: true,
        workerLease: null,
        issues: [
          {
            number: ISSUE_NUMBER,
            disposition: "stopped",
            artifactPath: setup.artifactPath,
          },
        ],
      });
    },
  );

  it("parks a verified candidate when STOP arrives while verification is held", async () => {
    const setup = createStopScenario({ holdPoint: "verifier-held" });
    const active = startControlledHost(setup.world, setup.configPath);
    expect(await waitUntil(() => fs.existsSync(setup.reachedPath))).toBe(true);

    const stop = setup.scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    release(setup.releasePath);
    const result = await resultWithin(active.completion, STOP_BOUND_MS);
    expect(result, "held verifier did not settle after STOP").not.toBeNull();
    expect(result?.exitCode, result?.stderr.join("\n")).toBe(0);

    const externalState = setup.scenario.inspectExternalState();
    expect(externalState.pullRequestRequests).toEqual([]);
    expect(externalState.pullRequests).toEqual([]);
    expect(remoteBranches(setup.world)).toEqual(["main"]);
    expect(commitObjects(setup.world.controllerPath)).toEqual(
      commitObjects(setup.world.remotePath),
    );
    expect(readStatus(setup.scenario)).toMatchObject({
      stopRequested: true,
      workerLease: null,
      issues: [
        {
          number: ISSUE_NUMBER,
          disposition: "stopped",
          artifactPath: setup.artifactPath,
        },
      ],
    });
    assertPrivateArtifact(setup.artifactPath);
  });

  it("does not start PR creation when STOP lands at the post-push checkpoint", async () => {
    const setup = createStopScenario({ holdPoint: "branch-pushed" });
    const active = startControlledHost(setup.world, setup.configPath);
    expect(await waitUntil(() => fs.existsSync(setup.reachedPath))).toBe(true);
    const pushedHead = git(setup.world.remotePath, [
      "rev-parse",
      `refs/heads/${ISSUE_BRANCH}`,
    ]).stdout.trim();

    const stop = setup.scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    release(setup.releasePath);
    const paused = await resultWithin(active.completion, STOP_BOUND_MS);
    expect(paused, "post-push controller did not honor STOP").not.toBeNull();
    expect(paused?.exitCode, paused?.stderr.join("\n")).toBe(0);

    const beforeResume = setup.scenario.inspectExternalState();
    const pausedStatus = readStatus(setup.scenario);
    const pausedIssue = pausedStatus.issues[0];
    expect.soft(beforeResume.pullRequestRequests).toEqual([]);
    expect.soft(beforeResume.pullRequests).toEqual([]);
    expect.soft(pausedStatus).toMatchObject({
      stopRequested: true,
      issues: [
        {
          number: ISSUE_NUMBER,
          disposition: "publishing",
          headSha: pushedHead,
        },
      ],
    });
    expect.soft(pausedIssue.headBranch ?? pausedIssue.branch).toBe(ISSUE_BRANCH);
    expect.soft(remoteBranches(setup.world)).toEqual(["main", ISSUE_BRANCH].sort());
    expect(
      setup.scenario
        .inspectEvents()
        .filter(
          (event) =>
            event.kind === "remote-ref-updated" &&
            event.ref === `refs/heads/${ISSUE_BRANCH}`,
        ),
    ).toHaveLength(1);

    fs.rmSync(path.join(setup.world.runtimePath, "STOP"));
    const resumed = setup.scenario.run(RUN_ARGUMENTS);
    expect(resumed.exitCode, resumed.stderr.join("\n")).toBe(0);
    const repeated = setup.scenario.run(RUN_ARGUMENTS);
    expect(repeated.exitCode, repeated.stderr.join("\n")).toBe(0);
    const finalState = setup.scenario.inspectExternalState();
    expect(finalState.pullRequestRequests).toHaveLength(1);
    expect(finalState.pullRequests).toEqual([
      expect.objectContaining({
        issueNumber: ISSUE_NUMBER,
        draft: true,
        headBranch: ISSUE_BRANCH,
        headSha: pushedHead,
      }),
    ]);
    expect(
      setup.scenario
        .inspectEvents()
        .filter(
          (event) =>
            event.kind === "remote-ref-updated" &&
            event.ref === `refs/heads/${ISSUE_BRANCH}`,
        ),
    ).toHaveLength(1);
    expect(readStatus(setup.scenario)).toMatchObject({
      stopRequested: false,
      workerLease: null,
      issues: [
        {
          number: ISSUE_NUMBER,
          disposition: "published",
          headSha: pushedHead,
          pullRequestNumber: 1,
        },
      ],
    });
  });

  it("does not perform a blocked draft PR effect after STOP returns", async () => {
    const setup = createStopScenario({ holdPoint: "draft-pr-effect" });
    const active = startControlledHost(setup.world, setup.configPath);
    expect(await waitUntil(() => fs.existsSync(setup.reachedPath))).toBe(true);
    expect(JSON.parse(fs.readFileSync(setup.reachedPath, "utf8"))).toMatchObject({
      point: "draft-pr-effect",
      issueNumber: ISSUE_NUMBER,
      headBranch: ISSUE_BRANCH,
    });
    expect(setup.scenario.inspectExternalState()).toMatchObject({
      pullRequestRequests: [],
      pullRequests: [],
    });

    let effectsWhenStopReturned:
      | ReturnType<Scenario["inspectEffectLedger"]>
      | undefined;
    let stateWhenStopReturned:
      | ReturnType<Scenario["inspectExternalState"]>
      | undefined;
    const stopping = setup.scenario.start(["stop", "--json"]);
    const stopCompletion = stopping.completion.then((result) => {
      effectsWhenStopReturned = setup.scenario.inspectEffectLedger();
      stateWhenStopReturned = setup.scenario.inspectExternalState();
      return result;
    });
    const stopPersisted = await waitUntil(() =>
      fs.existsSync(path.join(setup.world.runtimePath, "STOP")),
    );
    const stopWhileEffectHeld = stopPersisted
      ? await resultWithin(stopCompletion, STOP_BOUND_MS)
      : null;

    release(setup.releasePath);
    const stop =
      stopWhileEffectHeld ?? await resultWithin(stopCompletion, STOP_BOUND_MS);
    expect(stopPersisted, "STOP was not durably persisted").toBe(true);
    expect(stop, "stop did not return after the effect barrier was released").not.toBeNull();
    expect(stop?.exitCode, stop?.stderr.join("\n")).toBe(0);
    expect(effectsWhenStopReturned, "effects were not captured when stop returned").toBeDefined();
    expect(stateWhenStopReturned, "state was not captured when stop returned").toBeDefined();

    const result = await resultWithin(active.completion, STOP_BOUND_MS);
    expect(result, "controller did not settle after releasing the effect barrier").not.toBeNull();
    expect(result?.exitCode, result?.stderr.join("\n")).toBe(0);

    const finalState = setup.scenario.inspectExternalState();
    expect
      .soft(
        setup.scenario.inspectEffectLedger(),
        "an irreversible effect occurred after STOP returned",
      )
      .toEqual(effectsWhenStopReturned);
    expect
      .soft(
        finalState.pullRequestRequests,
        "draft PR creation was requested after STOP returned",
      )
      .toEqual(stateWhenStopReturned?.pullRequestRequests);
    expect(finalState.pullRequests, "a draft PR was created after STOP returned").toEqual(
      stateWhenStopReturned?.pullRequests,
    );
  });

  it("reconciles a stopped in-flight candidate on startup after controller crash", async () => {
    const setup = createStopScenario({ holdPoint: "verifier-held" });
    const crashed = startControlledHost(setup.world, setup.configPath);
    expect(await waitUntil(() => fs.existsSync(setup.reachedPath))).toBe(true);
    if (!crashed.child.pid) throw new Error("controller process has no pid");
    terminateProcessTree(crashed.child.pid);
    expect(await resultWithin(crashed.completion, 5_000)).not.toBeNull();

    const stop = setup.scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    const startup = setup.scenario.run(RUN_ARGUMENTS);
    expect(startup.exitCode, startup.stderr.join("\n")).toBe(0);

    expect(setup.scenario.inspectExternalState()).toMatchObject({
      pullRequestRequests: [],
      pullRequests: [],
      verificationRequests: [
        { issueNumber: ISSUE_NUMBER, kind: "passed" },
      ],
    });
    const activeCheckoutExists = fs.existsSync(
      path.join(setup.world.runtimePath, "worktrees", "current"),
    );
    const artifactExists = fs.existsSync(setup.artifactPath);
    const status = readStatus(setup.scenario);
    expect.soft(remoteBranches(setup.world)).toEqual(["main"]);
    expect.soft(activeCheckoutExists).toBe(false);
    expect.soft(status).toMatchObject({
      stopRequested: true,
      workerLease: null,
      issues: [
        {
          number: ISSUE_NUMBER,
          disposition: "stopped",
          artifactPath: setup.artifactPath,
        },
      ],
    });
    expect.soft(artifactExists).toBe(true);
    if (artifactExists) assertPrivateArtifact(setup.artifactPath);
  });
});
