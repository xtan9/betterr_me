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
}) {
  const remoteHead = git(input.remotePath, [
    "rev-parse",
    `refs/heads/${input.headBranch}`,
  ]).stdout.trim();
  expect(remoteHead).toBe(input.headSha);
  expect(
    git(input.remotePath, [
      "show",
      `${remoteHead}:src/issue-499.txt`,
    ]).stdout,
  ).toBe("approved fixture\n");
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
  expect(
    git(input.remotePath, [
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-r",
      input.mainSha,
      remoteHead,
    ]).stdout.trim(),
  ).toBe("A\tsrc/issue-499.txt");

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
