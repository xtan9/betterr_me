import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCheckoutCleaned,
  assertPublishedCandidate,
  deliveryGitMutations,
} from "./support/assertions";
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

const CRASH_POINTS = [
  "claim-applied",
  "worktree-created",
  "worker-completed",
  "candidate-verified",
  "candidate-committed",
  "branch-pushed",
  "draft-pr-created",
  "checkout-cleaned",
] as const;

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
    throw new AggregateError(failures, "failed to clean recovery worlds");
  }
});

function createRecoveryScenario(options: {
  crashPoint?: (typeof CRASH_POINTS)[number];
  holdWorker?: boolean;
  raceControllers?: boolean;
} = {}) {
  const world = createGitWorld();
  worlds.push(world);
  const expectedChanges = [
    {
      path: "src/recovered-issue.txt",
      content: "one durable generation\n",
      mode: "100644",
      status: "A",
    },
  ];
  const scenario = createSystemScenario(world, {
    issues: [
      {
        number: 601,
        title: "Exercise durable delivery",
        body: "Create the exact recovery fixture.",
      },
    ],
    workerChanges: expectedChanges.map(({ path: changePath, content }) => ({
      path: changePath,
      content,
    })),
    expectedChanges,
    ...options,
  });
  return { world, scenario, expectedChanges };
}

function assertOneRecoveredDelivery(
  world: ReturnType<typeof createGitWorld>,
  scenario: ReturnType<typeof createSystemScenario>,
  expectedChanges: Array<{
    path: string;
    content: string;
    mode: string;
    status: string;
  }>,
) {
  const externalState = scenario.inspectExternalState();
  expect(externalState).toMatchObject({
    activeWorkers: 0,
    maximumActiveWorkers: 1,
  });
  expect(externalState.claimRequests).toHaveLength(1);
  expect(externalState.claims).toHaveLength(1);
  expect(externalState.sessions).toHaveLength(1);
  expect(externalState.verificationRequests).toHaveLength(1);
  expect(externalState.pullRequestRequests).toHaveLength(1);
  expect(externalState.pullRequests).toHaveLength(1);
  const effectKinds = scenario
    .inspectEffectLedger()
    .map((effect) => effect.kind);
  expect(effectKinds.filter((kind) => kind === "claim-request")).toHaveLength(1);
  expect(effectKinds.filter((kind) => kind === "worker-request")).toHaveLength(1);
  expect(effectKinds.filter((kind) => kind === "verification-request")).toHaveLength(
    1,
  );
  expect(
    effectKinds.filter((kind) => kind === "pull-request-request"),
  ).toHaveLength(1);
  expect(effectKinds).not.toContain("worker-overlap");
  const deliveryMutations = deliveryGitMutations(scenario.inspectGitTrace());
  expect(
    deliveryMutations.filter((effect) => effect === "worktree-add"),
  ).toHaveLength(1);
  expect(deliveryMutations.filter((effect) => effect === "commit")).toHaveLength(
    1,
  );
  expect(deliveryMutations.filter((effect) => effect === "push")).toHaveLength(1);
  expect(
    deliveryMutations.filter((effect) => effect === "worktree-remove"),
  ).toHaveLength(1);
  expect(
    scenario
      .inspectEvents()
      .filter((event) => event.kind === "remote-ref-updated"),
  ).toHaveLength(1);

  const pullRequest = externalState.pullRequests[0];
  const status = scenario.run(["status", "--json"]);
  expect(status.exitCode, status.stderr.join("\n")).toBe(0);
  expect(status.stderr).toEqual([]);
  expect(JSON.parse(status.stdout.at(-1) ?? "null")).toEqual({
    stopRequested: false,
    workerLease: null,
    issues: [
      {
        number: 601,
        disposition: "published",
        baseSha: world.mainSha,
        headSha: pullRequest.headSha,
        pullRequestNumber: pullRequest.number,
      },
    ],
  });
  assertPublishedCandidate({
    remotePath: world.remotePath,
    mainSha: world.mainSha,
    headBranch: pullRequest.headBranch,
    headSha: pullRequest.headSha,
    verifiedTreeShas: externalState.verificationRequests.map(
      (verification: { candidateTreeSha: string }) =>
        verification.candidateTreeSha,
    ),
    expectedChanges,
  });
  assertCheckoutCleaned({
    controllerPath: world.controllerPath,
    runtimePath: world.runtimePath,
    controllerHeadSha: world.staleMainSha,
    issueBranch: pullRequest.headBranch,
    workerPath: externalState.sessions[0].worktreePath,
  });
}

function assertCrashPostcondition(
  crashPoint: (typeof CRASH_POINTS)[number],
  world: ReturnType<typeof createGitWorld>,
  scenario: ReturnType<typeof createSystemScenario>,
) {
  const externalState = scenario.inspectExternalState();
  const durableState = JSON.parse(
    fs.readFileSync(path.join(world.runtimePath, "state-v2.json"), "utf8"),
  );
  const precedingDisposition = {
    "claim-applied": "claiming",
    "worktree-created": "preparing",
    "worker-completed": "implementing",
    "candidate-verified": "verifying",
    "candidate-committed": "verifying",
    "branch-pushed": "publishing",
    "draft-pr-created": "publishing",
    "checkout-cleaned": "publishing",
  }[crashPoint];
  expect(durableState.issues["601"].disposition).toBe(precedingDisposition);
  const branch = "codex/issue-601";
  const activeWorktree = path.join(world.runtimePath, "worktrees", "current");
  const localHead = git(
    world.controllerPath,
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    true,
  );
  const remoteHead = git(
    world.remotePath,
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    true,
  );

  expect(externalState.claims).toHaveLength(1);
  if (crashPoint === "claim-applied") {
    expect(fs.existsSync(activeWorktree)).toBe(false);
    expect(localHead.status).not.toBe(0);
    expect(externalState.sessions).toHaveLength(0);
    return;
  }

  expect(fs.existsSync(activeWorktree)).toBe(
    crashPoint !== "checkout-cleaned",
  );
  if (crashPoint === "worktree-created") {
    expect(localHead.stdout.trim()).toBe(world.mainSha);
    expect(externalState.sessions).toHaveLength(0);
    return;
  }

  expect(externalState.sessions).toHaveLength(1);
  if (crashPoint === "worker-completed") {
    expect(git(activeWorktree, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      world.mainSha,
    );
    expect(git(activeWorktree, ["status", "--porcelain"]).stdout.trim()).toBe(
      "?? src/",
    );
    expect(externalState.verificationRequests).toHaveLength(0);
    return;
  }

  expect(externalState.verificationRequests).toHaveLength(1);
  if (crashPoint === "candidate-verified") {
    expect(git(activeWorktree, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      world.mainSha,
    );
    expect(remoteHead.status).not.toBe(0);
    return;
  }

  if (crashPoint === "checkout-cleaned") {
    expect(localHead.status).not.toBe(0);
    expect(remoteHead.status).toBe(0);
    expect(externalState.pullRequests).toEqual([
      expect.objectContaining({
        issueNumber: 601,
        draft: true,
        headSha: remoteHead.stdout.trim(),
      }),
    ]);
    expect(fs.existsSync(activeWorktree)).toBe(false);
    return;
  }

  expect(localHead.status).toBe(0);
  expect(localHead.stdout.trim()).not.toBe(world.mainSha);
  expect(
    git(world.controllerPath, [
      "rev-parse",
      `${localHead.stdout.trim()}^`,
    ]).stdout.trim(),
  ).toBe(world.mainSha);
  if (crashPoint === "candidate-committed") {
    expect(remoteHead.status).not.toBe(0);
    expect(externalState.pullRequests).toHaveLength(0);
    return;
  }

  expect(remoteHead.stdout.trim()).toBe(localHead.stdout.trim());
  if (crashPoint === "branch-pushed") {
    expect(externalState.pullRequests).toHaveLength(0);
    return;
  }

  expect(externalState.pullRequests).toHaveLength(1);
  expect(externalState.pullRequests[0]).toMatchObject({
    issueNumber: 601,
    draft: true,
    headSha: remoteHead.stdout.trim(),
  });
  if (crashPoint === "draft-pr-created") {
    expect(fs.existsSync(activeWorktree)).toBe(true);
    return;
  }

  throw new Error(`unhandled recovery crash point ${crashPoint}`);
}

describe("Ralph v2 recovery and serialization", () => {
  it.each(CRASH_POINTS)(
    "recovers exactly once after a crash at %s",
    (crashPoint) => {
      const { world, scenario, expectedChanges } = createRecoveryScenario({
        crashPoint,
      });

      const crashed = scenario.run(RUN_ARGUMENTS);
      expect(crashed.exitCode).not.toBe(0);
      expect(
        scenario
          .inspectEffectLedger()
          .some(
            (effect) =>
              effect.kind === "crash-checkpoint" &&
              effect.point === crashPoint,
          ),
      ).toBe(true);
      assertCrashPostcondition(crashPoint, world, scenario);

      const recovered = scenario.run(RUN_ARGUMENTS);
      expect(recovered.exitCode, recovered.stderr.join("\n")).toBe(0);
      expect(recovered.stderr).toEqual([]);
      const repeated = scenario.run(RUN_ARGUMENTS);
      expect(repeated.exitCode, repeated.stderr.join("\n")).toBe(0);
      expect(repeated.stderr).toEqual([]);

      expect(
        scenario
          .inspectEvents()
          .filter((event) => event.kind === "crash-injected"),
      ).toEqual([
        expect.objectContaining({ point: crashPoint, issueNumber: 601 }),
      ]);
      assertOneRecoveredDelivery(world, scenario, expectedChanges);
    },
  );

  it("rejects a merge commit injected after candidate verification", () => {
    const { world, scenario } = createRecoveryScenario({
      crashPoint: "candidate-committed",
    });
    const crashed = scenario.run(RUN_ARGUMENTS);
    expect(crashed.exitCode).not.toBe(0);
    assertCrashPostcondition("candidate-committed", world, scenario);

    const activeWorktree = path.join(
      world.runtimePath,
      "worktrees",
      "current",
    );
    const verifiedHead = git(activeWorktree, ["rev-parse", "HEAD"]).stdout.trim();
    const verifiedTree = git(activeWorktree, [
      "rev-parse",
      `${verifiedHead}^{tree}`,
    ]).stdout.trim();
    const baseTree = git(activeWorktree, [
      "rev-parse",
      `${world.mainSha}^{tree}`,
    ]).stdout.trim();
    const unverifiedParent = git(activeWorktree, [
      "commit-tree",
      baseTree,
      "-p",
      world.mainSha,
      "-m",
      "unverified history",
    ]).stdout.trim();
    const injectedMerge = git(activeWorktree, [
      "commit-tree",
      verifiedTree,
      "-p",
      world.mainSha,
      "-p",
      unverifiedParent,
      "-m",
      "tampered merge",
    ]).stdout.trim();
    git(activeWorktree, ["reset", "--hard", injectedMerge]);

    const recovery = scenario.run(RUN_ARGUMENTS);
    expect(recovery.exitCode).toBe(1);
    expect(recovery.stderr.join("\n")).toMatch(
      /local issue commit does not match its verified generation/,
    );
    expect(scenario.inspectExternalState().pullRequests).toEqual([]);
    expect(
      git(world.remotePath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]).stdout.trim(),
    ).toBe("main");
  });

  it("admits only one controller and one implementation worker", async () => {
    const { world, scenario, expectedChanges } = createRecoveryScenario({
      holdWorker: true,
      raceControllers: true,
    });
    const first = scenario.start(RUN_ARGUMENTS);
    const second = scenario.start(RUN_ARGUMENTS);
    let controllersReleased = false;
    let workerReleased = false;
    try {
      await scenario.waitForControllers(2);
      scenario.releaseControllers();
      controllersReleased = true;
      await scenario.waitForWorkerStart();
      const contender = await Promise.race([
        first.completion,
        second.completion,
      ]);
      expect(contender.exitCode).toBe(1);
      expect(contender.stderr.join("\n")).toMatch(/controller.*active|lock/i);
      scenario.releaseWorker();
      workerReleased = true;
      const results = await Promise.all([first.completion, second.completion]);
      expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
      expect(results.find((result) => result.exitCode === 0)?.stderr).toEqual([]);
    } finally {
      if (!controllersReleased) scenario.releaseControllers();
      if (!workerReleased) scenario.releaseWorker();
      await Promise.all([first.completion, second.completion]);
    }
    assertOneRecoveredDelivery(world, scenario, expectedChanges);
    const effectsBeforeRepeat = scenario.inspectEffectLedger();
    const eventsBeforeRepeat = scenario.inspectEvents();
    const repeated = scenario.run(RUN_ARGUMENTS);
    expect(repeated.exitCode, repeated.stderr.join("\n")).toBe(0);
    expect(scenario.inspectEffectLedger()).toEqual(effectsBeforeRepeat);
    expect(scenario.inspectEvents()).toEqual(eventsBeforeRepeat);
    expect(
      fs.existsSync(path.join(world.runtimePath, "controller-v2.lock")),
    ).toBe(false);
  });

  it("persists an active stop, cancels the worker, and preserves private work", async () => {
    const { world, scenario } = createRecoveryScenario({ holdWorker: true });
    const active = scenario.start(RUN_ARGUMENTS);
    await scenario.waitForWorkerStart();

    const stop = scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    expect(stop.stderr).toEqual([]);

    const boundedCompletion = await Promise.race([
      active.completion,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (boundedCompletion === null) {
      scenario.releaseWorker();
      await active.completion;
      throw new Error("active Ralph did not stop its implementation worker");
    }
    expect(boundedCompletion.exitCode, boundedCompletion.stderr.join("\n")).toBe(
      0,
    );
    expect(boundedCompletion.stderr).toEqual([]);

    const status = scenario.run(["status", "--json"]);
    expect(status.exitCode, status.stderr.join("\n")).toBe(0);
    expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
      stopRequested: true,
      workerLease: null,
      issues: [
        {
          number: 601,
          disposition: "stopped",
          artifactPath: path.join(
            world.runtimePath,
            "worktrees",
            "parked",
            "issue-601",
          ),
        },
      ],
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      activeWorkers: 0,
      maximumActiveWorkers: 1,
      pullRequests: [],
      pullRequestRequests: [],
      verificationRequests: [],
    });
    expect(
      scenario.inspectEvents().some((event) => event.kind === "worker-aborted"),
    ).toBe(true);
    expect(
      git(world.remotePath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]).stdout.trim(),
    ).toBe("main");
    const artifactPath = path.join(
      world.runtimePath,
      "worktrees",
      "parked",
      "issue-601",
    );
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(
      git(world.controllerPath, ["worktree", "list", "--porcelain"]).stdout,
    ).toContain(`worktree ${artifactPath.replaceAll("\\", "/")}`);
    expect(git(artifactPath, ["branch", "--show-current"]).stdout.trim()).toBe(
      "codex/issue-601",
    );
    expect(git(artifactPath, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      world.mainSha,
    );
    expect(git(artifactPath, ["status", "--porcelain"]).stdout.trim()).toBe(
      "?? src/",
    );
    expect(
      fs.readFileSync(path.join(artifactPath, "src", "recovered-issue.txt"), "utf8"),
    ).toBe("one durable generation\n");
  });
});
