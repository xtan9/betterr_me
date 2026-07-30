import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCheckoutCleaned,
  assertPublishedCandidate,
  assertSingleDeliveryGitTransaction,
} from "./support/assertions";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

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

function createHappyPathScenario() {
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
    workerChanges: expectedChanges.map(({ path: changePath, content }) => ({
      path: changePath,
      content,
    })),
    expectedChanges,
  });
  return { world, scenario, expectedChanges };
}

describe("Ralph v2 system delivery", () => {
  it("imports its public orchestration modules without side effects", () => {
    const fixturePath = fileURLToPath(
      new URL("./fixtures/import-purity.mjs", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      [
        fixturePath,
        path.resolve("scripts/ralph/v2/cli.mjs"),
        path.resolve("scripts/ralph/v2/runtime.mjs"),
      ],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("imports are inert\n");
  });

  it("publishes one verified Draft from latest main exactly once across fresh processes", () => {
    const { world, scenario, expectedChanges } = createHappyPathScenario();

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
      baseSha: world.mainSha,
    });
    expect(externalState.sessions[0].worktreePath).not.toBe(world.controllerPath);
    expect(externalState.claims).toHaveLength(1);
    expect(externalState.claimRequests).toHaveLength(1);
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
      mainSha: world.mainSha,
      issueBranch: pullRequest.headBranch,
      workerPath: externalState.sessions[0].worktreePath,
    });

    expect(scenario.inspectEvents().map((event) => event.kind)).toEqual([
      "issue-claimed",
      "worker-started",
      "worker-completed",
      "candidate-verified",
      "remote-ref-updated",
      "remote-head-observed",
      "draft-pr-created",
    ]);
    assertSingleDeliveryGitTransaction(scenario.inspectGitTrace());

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

  it("persists stop and performs no delivery effect on a later run", () => {
    const { world, scenario } = createHappyPathScenario();

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
    expect(
      git(world.remotePath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]).stdout.trim(),
    ).toBe("main");
  });
});
