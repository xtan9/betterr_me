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
  mainSha: string;
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
    input.mainSha,
  );
}

export function assertSingleDeliveryGitTransaction(
  traceEvents: Array<{ event?: string; argv?: string[] }>,
) {
  const commands = traceEvents
    .filter((event) => event.event === "start" && Array.isArray(event.argv))
    .map((event) => event.argv ?? []);
  const count = (command: string, argument?: string) =>
    commands.filter((argv) => {
      const commandIndex = argv.indexOf(command);
      if (commandIndex < 0) return false;
      return argument === undefined || argv[commandIndex + 1] === argument;
    }).length;

  expect(count("worktree", "add")).toBe(1);
  expect(count("commit")).toBe(1);
  expect(count("push")).toBe(1);
  expect(count("worktree", "remove")).toBe(1);
  expect(count("branch", "-D")).toBe(1);
}
