import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntime } from "../../scripts/ralph/v2/runtime.mjs";
import { createFakeGitHub } from "./support/fake-github";
import { createGitWorld, git } from "./support/git-world";
import { createScriptedWorker } from "./support/scripted-worker";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

describe("Ralph v2 system delivery", () => {
  it("publishes one verified Draft from latest main without duplicate effects or a leftover checkout", async () => {
    const world = createGitWorld();
    worlds.push(world);
    const github = createFakeGitHub([
      {
        number: 499,
        title: "Add the system-test fixture",
        body: "Create src/issue-499.txt containing the approved fixture text.",
      },
    ]);
    const worker = createScriptedWorker([
      { path: "src/issue-499.txt", content: "approved fixture\n" },
    ]);
    const verifiedTreeShas: string[] = [];
    const runtime = createRalphRuntime({
      repositoryPath: world.controllerPath,
      runtimePath: world.runtimePath,
      github,
      worker,
      verifier: {
        async verify(input: { candidateTreeSha: string }) {
          verifiedTreeShas.push(input.candidateTreeSha);
          return {
            kind: "passed" as const,
            candidateTreeSha: input.candidateTreeSha,
          };
        },
      },
      clock: { now: () => new Date("2026-07-30T12:00:00.000Z") },
    });

    const output: string[] = [];
    const errors: string[] = [];
    const io = {
      runtime,
      stdout: (line: string) => output.push(line),
      stderr: (line: string) => errors.push(line),
    };

    expect(
      await runCli(
        ["run", "--mode", "PrOnly", "--max-issues", "1", "--json"],
        io,
      ),
    ).toBe(0);
    expect(JSON.parse(output.at(-1) ?? "null")).toEqual({
      kind: "run-finished",
      outcome: "issue-limit-reached",
      issuesStarted: 1,
    });

    const firstRunOutputLength = output.length;
    expect(
      await runCli(
        ["run", "--mode", "PrOnly", "--max-issues", "1", "--json"],
        io,
      ),
    ).toBe(0);
    expect(JSON.parse(output.at(-1) ?? "null")).toEqual({
      kind: "run-finished",
      outcome: "queue-complete",
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
    expect(new Set(workerState.sessions.map((session) => session.sessionId)).size)
      .toBe(1);

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
    expect(githubState.pullRequests[0].body).toContain("Closes #499");

    const pullRequest = githubState.pullRequests[0];
    const remoteHead = git(world.remotePath, [
      "rev-parse",
      `refs/heads/${pullRequest.headBranch}`,
    ]).stdout.trim();
    expect(remoteHead).toBe(pullRequest.headSha);
    expect(
      git(world.remotePath, [
        "show",
        `${remoteHead}:src/issue-499.txt`,
      ]).stdout,
    ).toBe("approved fixture\n");
    expect(
      git(world.remotePath, ["merge-base", world.mainSha, remoteHead])
        .stdout.trim(),
    ).toBe(world.mainSha);
    expect(
      git(world.remotePath, [
        "rev-list",
        "--count",
        `${world.mainSha}..${remoteHead}`,
      ]).stdout.trim(),
    ).toBe("1");

    const committedTreeSha = git(world.remotePath, [
      "show",
      "-s",
      "--format=%T",
      remoteHead,
    ]).stdout.trim();
    expect(verifiedTreeShas).toEqual([committedTreeSha]);

    const worktreeList = git(world.controllerPath, [
      "worktree",
      "list",
      "--porcelain",
    ]).stdout;
    expect(worktreeList.match(/^worktree /gm)).toHaveLength(1);
    expect(fs.existsSync(workerState.sessions[0].worktreePath)).toBe(false);
    expect(fs.existsSync(path.join(world.runtimePath, "worktrees", "current")))
      .toBe(false);
    expect(
      git(world.controllerPath, ["branch", "--list", pullRequest.headBranch])
        .stdout.trim(),
    ).toBe("");
    expect(git(world.controllerPath, ["status", "--porcelain"]).stdout).toBe("");
    expect(git(world.controllerPath, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
      world.mainSha,
    );

    const statusOutput: string[] = [];
    expect(
      await runCli(["status", "--json"], {
        runtime,
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
  });
});
