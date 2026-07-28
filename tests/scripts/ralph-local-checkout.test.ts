import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupIssueCheckout,
  parkFailedIssueCheckout,
  recoverPreservationCommit,
} from "../../scripts/ralph/local-checkout.mjs";

const temporaryRoots: string[] = [];
const gitCommand = process.platform === "win32" ? "git.exe" : "git";

function runGit(repositoryRoot: string) {
  return async (args: string[]) => {
    const result = spawnSync(gitCommand, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw Object.assign(
        new Error((result.stderr || result.stdout).trim()),
        {
          result: {
            code: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        },
      );
    }
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };
}

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-checkout-"));
  temporaryRoots.push(root);
  const repositoryRoot = path.join(root, "repository");
  const worktreeRoot = path.join(root, "worktrees");
  fs.mkdirSync(repositoryRoot, { recursive: true });
  const git = runGit(repositoryRoot);
  const checked = (args: string[]) => {
    const result = spawnSync(gitCommand, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout.trim();
  };
  checked(["init", "--initial-branch=main"]);
  checked(["config", "user.name", "Ralph Test"]);
  checked(["config", "user.email", "ralph@example.test"]);
  fs.writeFileSync(path.join(repositoryRoot, "README.md"), "base\n");
  checked(["add", "README.md"]);
  checked(["commit", "-m", "base"]);

  return { repositoryRoot, worktreeRoot, git, checked };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph local checkout lifecycle", () => {
  it("removes a merged worktree and its local issue branch", async () => {
    const { repositoryRoot, worktreeRoot, git, checked } = createRepository();
    const worktreePath = path.join(worktreeRoot, "current");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    checked([
      "worktree",
      "add",
      "-b",
      "codex/issue-101",
      worktreePath,
      "main",
    ]);
    const commit = checked(["-C", worktreePath, "rev-parse", "HEAD"]);

    await cleanupIssueCheckout({
      repositoryRoot,
      worktreeRoot,
      issueNumber: 101,
      issueState: {
        branch: "codex/issue-101",
        worktreePath,
        commit,
      },
      git,
    });

    expect(fs.existsSync(worktreePath)).toBe(false);
    expect(
      spawnSync(
        gitCommand,
        ["show-ref", "--verify", "--quiet", "refs/heads/codex/issue-101"],
        { cwd: repositoryRoot },
      ).status,
    ).toBe(1);

    await expect(
      cleanupIssueCheckout({
        repositoryRoot,
        worktreeRoot,
        issueNumber: 101,
        issueState: {
          branch: "codex/issue-101",
          worktreePath,
          commit,
        },
        git,
      }),
    ).resolves.toEqual({ worktreeRemoved: false, branchDeleted: false });
  });

  it("moves an uncommitted failed attempt out of the reusable worker slot", async () => {
    const { repositoryRoot, worktreeRoot, git, checked } = createRepository();
    const worktreePath = path.join(worktreeRoot, "current");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    checked([
      "worktree",
      "add",
      "-b",
      "codex/issue-101",
      worktreePath,
      "main",
    ]);
    fs.writeFileSync(path.join(worktreePath, "attempt.txt"), "recover me\n");

    const parkedPath = await parkFailedIssueCheckout({
      repositoryRoot,
      worktreeRoot,
      issueNumber: 101,
      issueState: {
        branch: "codex/issue-101",
        worktreePath,
      },
      git,
    });

    expect(parkedPath).toBe(path.join(worktreeRoot, "parked", "issue-101"));
    expect(fs.existsSync(worktreePath)).toBe(false);
    expect(fs.readFileSync(path.join(parkedPath, "attempt.txt"), "utf8")).toBe(
      "recover me\n",
    );

    await expect(
      parkFailedIssueCheckout({
        repositoryRoot,
        worktreeRoot,
        issueNumber: 101,
        issueState: {
          branch: "codex/issue-101",
          worktreePath,
        },
        git,
      }),
    ).resolves.toBe(parkedPath);
  });

  it("recovers a preservation commit made just before a controller crash", async () => {
    const { worktreeRoot, git, checked } = createRepository();
    const worktreePath = path.join(worktreeRoot, "current");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const baseSha = checked(["rev-parse", "main"]);
    checked([
      "worktree",
      "add",
      "-b",
      "codex/issue-101",
      worktreePath,
      "main",
    ]);
    fs.writeFileSync(path.join(worktreePath, "attempt.txt"), "recover me\n");
    checked(["-C", worktreePath, "add", "--all"]);
    checked([
      "-C",
      worktreePath,
      "commit",
      "-m",
      "wip: preserve failed issue #101",
    ]);
    const failureCommit = checked(["-C", worktreePath, "rev-parse", "HEAD"]);

    await expect(
      recoverPreservationCommit({
        worktreePath,
        baseSha,
        expectedSubject: "wip: preserve failed issue #101",
        git,
      }),
    ).resolves.toEqual({ failureCommit, changedFiles: ["attempt.txt"] });
  });
});
