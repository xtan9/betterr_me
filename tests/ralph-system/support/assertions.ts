import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { git } from "./git-world";

export function assertPublishedCandidate(input: {
  remotePath: string;
  mainSha: string;
  headBranch: string;
  headSha: string;
  verifiedTreeShas: string[];
  expectedChanges: Array<{
    path: string;
    content: string;
    mode: string;
    status: string;
  }>;
}) {
  const remoteHead = git(input.remotePath, [
    "rev-parse",
    `refs/heads/${input.headBranch}`,
  ]).stdout.trim();
  expect(remoteHead).toBe(input.headSha);
  expect(
    git(input.remotePath, ["merge-base", input.mainSha, remoteHead]).stdout.trim(),
  ).toBe(input.mainSha);
  expect(
    git(input.remotePath, [
      "rev-list",
      "--count",
      `${input.mainSha}..${remoteHead}`,
    ]).stdout.trim(),
  ).toBe("1");

  const actualChanges = git(input.remotePath, [
    "diff-tree",
    "--no-commit-id",
    "--name-status",
    "-r",
    input.mainSha,
    remoteHead,
  ]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
  expect(actualChanges).toEqual(
    input.expectedChanges
      .map((change) => `${change.status}\t${change.path}`)
      .sort(),
  );

  for (const change of input.expectedChanges) {
    expect(
      git(input.remotePath, ["show", `${remoteHead}:${change.path}`]).stdout,
    ).toBe(change.content);
    expect(
      git(input.remotePath, ["ls-tree", remoteHead, "--", change.path])
        .stdout.trim(),
    ).toMatch(new RegExp(`^${change.mode} blob [0-9a-f]+\\t${change.path}$`));
  }

  const committedTreeSha = git(input.remotePath, [
    "show",
    "-s",
    "--format=%T",
    remoteHead,
  ]).stdout.trim();
  expect(input.verifiedTreeShas).toEqual([committedTreeSha]);

  const remoteBranches = git(input.remotePath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
  expect(remoteBranches).toEqual(["main", input.headBranch].sort());

  return remoteHead;
}

export function assertCheckoutCleaned(input: {
  controllerPath: string;
  runtimePath: string;
  controllerHeadSha: string;
  issueBranch: string;
  workerPath: string;
}) {
  const worktreeList = git(input.controllerPath, [
    "worktree",
    "list",
    "--porcelain",
  ]).stdout;
  expect(worktreeList.match(/^worktree /gm)).toHaveLength(1);
  expect(fs.existsSync(input.workerPath)).toBe(false);
  expect(fs.existsSync(path.join(input.runtimePath, "worktrees", "current")))
    .toBe(false);
  expect(
    git(input.controllerPath, ["branch", "--list", input.issueBranch])
      .stdout.trim(),
  ).toBe("");
  expect(git(input.controllerPath, ["status", "--porcelain"]).stdout).toBe("");
  expect(git(input.controllerPath, ["rev-parse", "HEAD"]).stdout.trim()).toBe(
    input.controllerHeadSha,
  );
}

export function deliveryGitMutations(
  traceEvents: Array<{
    event?: string;
    argv?: string[];
    sid?: string;
    code?: number;
  }>,
) {
  const exits = new Map(
    traceEvents
      .filter((event) => event.event === "exit" && "sid" in event)
      .map((event) => [
        (event as { sid: string }).sid,
        (event as { code?: number }).code,
      ]),
  );
  return traceEvents
    .filter(
      (event): event is { event: string; sid: string; argv: string[] } =>
        event.event === "start" &&
        "sid" in event &&
        typeof event.sid === "string" &&
        Array.isArray(event.argv) &&
        exits.get(event.sid) === 0,
    )
    .flatMap((event) => {
      const argv = event.argv;
      const worktree = argv.indexOf("worktree");
      if (
        worktree >= 0 &&
        ["add", "lock", "move", "prune", "remove", "repair", "unlock"].includes(
          argv[worktree + 1],
        )
      ) {
        return [`worktree-${argv[worktree + 1]}`];
      }
      for (const mutation of [
        "add",
        "checkout",
        "cherry-pick",
        "clean",
        "commit",
        "commit-tree",
        "fetch",
        "merge",
        "push",
        "rebase",
        "reset",
        "restore",
        "switch",
        "update-ref",
        "write-tree",
      ]) {
        if (argv.includes(mutation)) return [mutation];
      }
      const branch = argv.indexOf("branch");
      if (
        branch >= 0 &&
        argv.slice(branch + 1).some(
          (argument) =>
            ["-d", "-D", "--delete", "--force"].includes(argument) ||
            argument.startsWith("codex/issue-"),
        )
      ) {
        return ["branch-mutation"];
      }
      return [];
    });
}
