import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntime } from "../../scripts/ralph/v2/runtime.mjs";
import { createFakeGitHub } from "./support/fake-github";
import { createGitWorld, git } from "./support/git-world";
import { createScriptedWorker } from "./support/scripted-worker";
import {
  assertCheckoutCleaned,
  assertPublishedCandidate,
} from "./support/assertions";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

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

  it("publishes one verified Draft from latest main without duplicate effects or a leftover checkout", async () => {
    const world = createGitWorld();
    worlds.push(world);
    const events: Array<{ kind: string; [key: string]: unknown }> = [];
    const github = createFakeGitHub(
      [
        {
          number: 499,
          title: "Add the system-test fixture",
          body: "Create src/issue-499.txt containing the approved fixture text.",
        },
      ],
      {
        events,
        resolveRemoteHead: (headBranch) =>
          git(world.remotePath, [
            "rev-parse",
            `refs/heads/${headBranch}`,
          ]).stdout.trim(),
      },
    );
    const worker = createScriptedWorker([
      { path: "src/issue-499.txt", content: "approved fixture\n" },
    ], events);
    const verifiedTreeShas: string[] = [];
    const createRuntime = () =>
      createRalphRuntime({
        repositoryPath: world.controllerPath,
        runtimePath: world.runtimePath,
        github,
        worker,
        verifier: {
          async verify(input: { candidateTreeSha: string }) {
            const observedTreeSha = git(world.controllerPath, [
              "rev-parse",
              `${input.candidateTreeSha}^{tree}`,
            ]).stdout.trim();
            expect(
              git(world.controllerPath, [
                "diff-tree",
                "--no-commit-id",
                "--name-status",
                "-r",
                world.mainSha,
                observedTreeSha,
              ]).stdout.trim(),
            ).toBe("A\tsrc/issue-499.txt");
            expect(
              git(world.controllerPath, [
                "show",
                `${observedTreeSha}:src/issue-499.txt`,
              ]).stdout,
            ).toBe("approved fixture\n");
            verifiedTreeShas.push(observedTreeSha);
            events.push({ kind: "candidate-verified", treeSha: observedTreeSha });
            return {
              kind: "passed" as const,
              candidateTreeSha: observedTreeSha,
            };
          },
        },
        clock: { now: () => new Date("2026-07-30T12:00:00.000Z") },
      });

    const output: string[] = [];
    const errors: string[] = [];
    expect(
      await runCli(
        ["run", "--mode", "PrOnly", "--max-issues", "1", "--json"],
        {
          runtime: createRuntime(),
          stdout: (line: string) => output.push(line),
          stderr: (line: string) => errors.push(line),
        },
      ),
    ).toBe(0);
    expect(JSON.parse(output.at(-1) ?? "null")).toMatchObject({
      kind: "run-finished",
      issuesStarted: 1,
    });

    const firstRunOutputLength = output.length;
    expect(
      await runCli(
        ["run", "--mode", "PrOnly", "--max-issues", "1", "--json"],
        {
          runtime: createRuntime(),
          stdout: (line: string) => output.push(line),
          stderr: (line: string) => errors.push(line),
        },
      ),
    ).toBe(0);
    expect(JSON.parse(output.at(-1) ?? "null")).toMatchObject({
      kind: "run-finished",
      issuesStarted: 0,
    });
    expect(output.length).toBeGreaterThan(firstRunOutputLength);
    expect(errors).toEqual([]);

    const workerState = worker.inspect();
    expect(workerState.activeWorkers).toBe(0);
    expect(workerState.maximumActiveWorkers).toBe(1);
    expect(workerState.sessions).toHaveLength(1);
    expect(workerState.sessions[0]).toMatchObject({
      issueNumber: 499,
      baseSha: world.mainSha,
    });
    expect(workerState.sessions[0].worktreePath).not.toBe(world.controllerPath);

    const githubState = github.inspect();
    expect(githubState.claims).toHaveLength(1);
    expect(githubState.claimRequests).toHaveLength(1);
    expect(githubState.pullRequests).toHaveLength(1);
    expect(githubState.pullRequestRequests).toHaveLength(1);
    expect(githubState.pullRequests[0]).toMatchObject({
      issueNumber: 499,
      draft: true,
      baseBranch: "main",
    });
    expect(githubState.pullRequests[0].body).toMatch(
      /\b(?:closes|fixes|resolves)\s+#499\b/i,
    );

    const pullRequest = githubState.pullRequests[0];
    const remoteHead = assertPublishedCandidate({
      remotePath: world.remotePath,
      mainSha: world.mainSha,
      headBranch: pullRequest.headBranch,
      headSha: pullRequest.headSha,
      verifiedTreeShas,
    });
    assertCheckoutCleaned({
      controllerPath: world.controllerPath,
      runtimePath: world.runtimePath,
      mainSha: world.mainSha,
      issueBranch: pullRequest.headBranch,
      workerPath: workerState.sessions[0].worktreePath,
    });

    const eventKinds = events.map((event) => event.kind);
    expect(eventKinds).toEqual([
      "issue-claimed",
      "worker-started",
      "worker-completed",
      "candidate-verified",
      "remote-head-observed",
      "draft-pr-created",
    ]);

    const statusOutput: string[] = [];
    expect(
      await runCli(["status", "--json"], {
        runtime: createRuntime(),
        stdout: (line: string) => statusOutput.push(line),
        stderr: (line: string) => errors.push(line),
      }),
    ).toBe(0);
    expect(JSON.parse(statusOutput.at(-1) ?? "null")).toMatchObject({
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
    expect(errors).toEqual([]);

    const stopOutput: string[] = [];
    expect(
      await runCli(["stop", "--json"], {
        runtime: createRuntime(),
        stdout: (line: string) => stopOutput.push(line),
        stderr: (line: string) => errors.push(line),
      }),
    ).toBe(0);
    expect(JSON.parse(stopOutput.at(-1) ?? "null")).toMatchObject({
      kind: "stop-requested",
    });
    expect(errors).toEqual([]);
  });
});
