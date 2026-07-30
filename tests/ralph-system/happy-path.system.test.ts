import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCheckoutCleaned,
  assertPublishedCandidate,
  deliveryGitMutations,
} from "./support/assertions";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";

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
    throw new AggregateError(failures, "failed to clean Ralph system worlds");
  }
});

function createHappyPathScenario(
  options: {
    verification?: "pass" | "fail";
    extraWorkerChanges?: Array<{ path: string; content: string }>;
  } = {},
) {
  const world = createGitWorld();
  worlds.push(world);
  const expectedChanges = [
    {
      path: "src/issue-499.txt",
      content: "approved fixture\n",
      mode: "100644",
      status: "A",
    },
  ];
  const scenario = createSystemScenario(world, {
    issues: [
      {
        number: 499,
        title: "Add the system-test fixture",
        body: "Create src/issue-499.txt containing the approved fixture text.",
      },
    ],
    workerChanges: [
      ...expectedChanges.map(({ path: changePath, content }) => ({
        path: changePath,
        content,
      })),
      ...(options.extraWorkerChanges ?? []),
    ],
    expectedChanges,
    verification: options.verification,
  });
  return { world, scenario, expectedChanges };
}

function runImportProbe(world: ReturnType<typeof createGitWorld>, modules: string[]) {
  const fixtureDirectory = fileURLToPath(
    new URL("./fixtures", import.meta.url),
  );
  const fixturePath = path.join(fixtureDirectory, "import-purity.mjs");
  return spawnSync(
    process.execPath,
    [
      "--permission",
      `--allow-fs-read=${fixtureDirectory}`,
      `--allow-fs-read=${path.resolve("scripts/ralph")}`,
      fixturePath,
      ...modules,
    ],
    {
      cwd: world.controllerPath,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      env: createSafeEnvironment(process.env, {
        HOME: world.root,
        USERPROFILE: world.root,
      }),
    },
  );
}

function inspectLocalGitState(world: ReturnType<typeof createGitWorld>) {
  return {
    branch: git(world.controllerPath, ["branch", "--show-current"]).stdout,
    head: git(world.controllerPath, ["rev-parse", "HEAD"]).stdout,
    index: git(world.controllerPath, ["ls-files", "--stage"]).stdout,
    refs: git(world.controllerPath, ["show-ref", "--heads"]).stdout,
    status: git(world.controllerPath, ["status", "--porcelain"]).stdout,
    worktrees: git(world.controllerPath, [
      "worktree",
      "list",
      "--porcelain",
    ]).stdout,
  };
}

describe("Ralph v2 system delivery", () => {
  it("imports its public orchestration modules without side effects", () => {
    const world = createGitWorld();
    worlds.push(world);
    const result = runImportProbe(world, [
        path.resolve("scripts/ralph/v2/cli.mjs"),
        path.resolve("scripts/ralph/v2/production-runtime.mjs"),
        path.resolve("scripts/ralph/v2/runtime.mjs"),
    ]);
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("imports are inert\n");
  });

  it("rejects deliberately impure imports in every protected capability class", () => {
    const world = createGitWorld();
    worlds.push(world);
    const fixtureDirectory = fileURLToPath(
      new URL("./fixtures", import.meta.url),
    );
    for (const fixture of [
      "impure-fs-read.mjs",
      "impure-fs-obscure.mjs",
      "impure-fs-write.mjs",
      "impure-child.mjs",
      "impure-network.mjs",
    ]) {
      const result = runImportProbe(world, [path.join(fixtureDirectory, fixture)]);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status, fixture).not.toBe(0);
      expect(result.stderr).toMatch(/forbidden operation|ERR_ACCESS_DENIED/);
    }
    expect(
      git(world.controllerPath, ["status", "--porcelain"]).stdout,
    ).toBe("");
  });

  it("publishes one verified Draft from latest main exactly once across fresh processes", () => {
    const { world, scenario, expectedChanges } = createHappyPathScenario();
    expect(world.staleMainSha).not.toBe(world.mainSha);

    const firstRun = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(firstRun.exitCode, firstRun.stderr.join("\n")).toBe(0);
    expect(firstRun.stderr).toEqual([]);
    expect(firstRun.stdout).not.toEqual([]);

    const secondRun = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(secondRun.exitCode, secondRun.stderr.join("\n")).toBe(0);
    expect(secondRun.stderr).toEqual([]);

    const externalState = scenario.inspectExternalState();
    expect(externalState.activeWorkers).toBe(0);
    expect(externalState.maximumActiveWorkers).toBe(1);
    expect(externalState.sessions).toHaveLength(1);
    expect(externalState.sessions[0]).toMatchObject({
      issueNumber: 499,
      issue: {
        number: 499,
        title: "Add the system-test fixture",
        body: "Create src/issue-499.txt containing the approved fixture text.",
      },
      baseSha: world.mainSha,
    });
    expect(externalState.sessions[0].worktreePath).not.toBe(world.controllerPath);
    expect(externalState.claims).toHaveLength(1);
    expect(externalState.claimRequests).toHaveLength(1);
    expect(externalState.claimRequests[0]).toMatchObject({
      issueNumber: 499,
    });
    expect(externalState.claimRequests[0].operationId).toMatch(
      /issue-499.*claim/,
    );
    expect(externalState.pullRequests).toHaveLength(1);
    expect(externalState.pullRequestRequests).toHaveLength(1);
    expect(externalState.verificationRequests).toHaveLength(1);

    const pullRequest = externalState.pullRequests[0];
    expect(pullRequest).toMatchObject({
      issueNumber: 499,
      draft: true,
      baseBranch: "main",
    });
    expect(pullRequest.body).toMatch(
      /\b(?:closes|fixes|resolves)\s+#499\b/i,
    );
    const remoteHead = assertPublishedCandidate({
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

    const events = scenario.inspectEvents();
    expect(events.map((event) => event.kind)).toEqual([
      "issue-claimed",
      "worker-started",
      "worker-completed",
      "candidate-verified",
      "remote-ref-updated",
      "remote-head-observed",
      "draft-pr-created",
    ]);
    expect(events[4]).toMatchObject({
      oldSha: "0000000000000000000000000000000000000000",
      newSha: pullRequest.headSha,
      ref: `refs/heads/${pullRequest.headBranch}`,
    });

    const status = scenario.run(["status", "--json"]);
    expect(status.exitCode, status.stderr.join("\n")).toBe(0);
    expect(status.stderr).toEqual([]);
    expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
      workerLease: null,
      issues: [
        {
          number: 499,
          disposition: "published",
          pullRequestNumber: 1,
          baseSha: world.mainSha,
          headSha: remoteHead,
        },
      ],
    });
  });

  it("keeps a failed verification private and releases the implementation lane", () => {
    const { world, scenario } = createHappyPathScenario({
      verification: "fail",
    });

    const firstRun = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(firstRun.exitCode, firstRun.stderr.join("\n")).toBe(0);
    expect(firstRun.stderr).toEqual([]);

    const externalStateAfterFailure = scenario.inspectExternalState();
    expect(externalStateAfterFailure).toMatchObject({
      activeWorkers: 0,
      maximumActiveWorkers: 1,
      claims: [{ issueNumber: 499 }],
      sessions: [{ issueNumber: 499, baseSha: world.mainSha }],
      pullRequests: [],
      pullRequestRequests: [],
      verificationRequests: [{ issueNumber: 499 }],
    });
    expect(
      git(world.remotePath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]).stdout.trim(),
    ).toBe("main");

    const parkedPath = path.join(
      world.runtimePath,
      "worktrees",
      "parked",
      "issue-499",
    );
    expect(
      git(world.controllerPath, ["worktree", "list", "--porcelain"]).stdout,
    ).toContain(`worktree ${parkedPath.replaceAll("\\", "/")}`);
    expect(
      git(parkedPath, ["branch", "--show-current"]).stdout.trim(),
    ).toBe("codex/issue-499");
    expect(git(parkedPath, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      world.mainSha,
    );
    expect(git(parkedPath, ["status", "--porcelain"]).stdout.trim()).toBe(
      "A  src/issue-499.txt",
    );

    const status = scenario.run(["status", "--json"]);
    expect(status.exitCode, status.stderr.join("\n")).toBe(0);
    expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
      workerLease: null,
      issues: [
        {
          number: 499,
          disposition: "verification_failed",
          baseSha: world.mainSha,
          artifactPath: parkedPath,
        },
      ],
    });

    const secondRun = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(secondRun.exitCode, secondRun.stderr.join("\n")).toBe(0);
    expect(secondRun.stderr).toEqual([]);
    expect(scenario.inspectExternalState()).toEqual(externalStateAfterFailure);
  });

  it("discards exact zero-byte sandbox placeholders before publishing issue #499", () => {
    const placeholderPaths = [
      "package-lock.json",
      "yarn.lock",
      "supabase/seed.sql",
    ];
    const { world, scenario, expectedChanges } = createHappyPathScenario({
      extraWorkerChanges: placeholderPaths.map((placeholderPath) => ({
        path: placeholderPath,
        content: "",
      })),
    });

    const run = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    expect(run.stderr).toEqual([]);

    const externalState = scenario.inspectExternalState();
    expect(externalState.pullRequests).toHaveLength(1);
    const pullRequest = externalState.pullRequests[0];
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
    for (const placeholderPath of placeholderPaths) {
      expect(
        git(
          world.remotePath,
          ["cat-file", "-e", `${pullRequest.headSha}:${placeholderPath}`],
          true,
        ).status,
      ).not.toBe(0);
    }
  });

  it("persists stop and performs no delivery effect on a later run", () => {
    const { world, scenario } = createHappyPathScenario();
    const localGitBeforeStop = inspectLocalGitState(world);

    const stop = scenario.run(["stop", "--json"]);
    expect(stop.exitCode, stop.stderr.join("\n")).toBe(0);
    expect(stop.stderr).toEqual([]);

    const status = scenario.run(["status", "--json"]);
    expect(status.exitCode, status.stderr.join("\n")).toBe(0);
    expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
      stopRequested: true,
      workerLease: null,
      issues: [],
    });

    const run = scenario.run([
      "run",
      "--mode",
      "PrOnly",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    expect(run.stderr).toEqual([]);
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [],
      claims: [],
      claimRequests: [],
      pullRequests: [],
      pullRequestRequests: [],
      verificationRequests: [],
    });
    expect(scenario.inspectEvents()).toEqual([]);
    expect(deliveryGitMutations(scenario.inspectGitTrace())).toEqual([]);
    expect(inspectLocalGitState(world)).toEqual(localGitBeforeStop);
    expect(
      git(world.remotePath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]).stdout.trim(),
    ).toBe("main");
  });
});
