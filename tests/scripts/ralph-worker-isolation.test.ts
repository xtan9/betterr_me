import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  ensureSanitizedWorkerGitView,
  removeSanitizedWorkerGitView,
  workerGitSmokeCommand,
} from "../../scripts/ralph/worker-isolation.mjs";

const gitCommand = process.platform === "win32" ? "git.exe" : "git";

function git(args: string[], options: { input?: string } = {}) {
  const result = spawnSync(gitCommand, args, {
    encoding: "utf8",
    input: options.input,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git failed with ${result.status}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

describe("Ralph sanitized worker Git view", () => {
  it("does not use command substitutions that escape the standalone sandbox environment", () => {
    const command = workerGitSmokeCommand("/repository/.git/config");
    expect(command).not.toContain("$(");
    expect(command).toContain("git rev-list --count --all | grep -qx 1");
    expect(command).toContain("! git remote | grep -q .");
  });

  it("exposes one clean baseline without the controller repository remote or history", async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-worker-isolation-"),
    );
    const repositoryRoot = path.join(temporaryRoot, "repository");
    const worktreePath = path.join(temporaryRoot, "issue-worktree");
    const workerGitRoot = path.join(temporaryRoot, "worker-git");
    try {
      git(["init", "--initial-branch=main", repositoryRoot]);
      git(["-C", repositoryRoot, "config", "user.name", "Test"]);
      git(["-C", repositoryRoot, "config", "user.email", "test@example.test"]);
      git(["-C", repositoryRoot, "config", "core.autocrlf", "true"]);
      fs.writeFileSync(path.join(repositoryRoot, "tracked.txt"), "first\r\n", "utf8");
      git(["-C", repositoryRoot, "add", "tracked.txt"]);
      git(["-C", repositoryRoot, "commit", "--quiet", "-m", "first"]);
      fs.writeFileSync(path.join(repositoryRoot, "tracked.txt"), "second\r\n", "utf8");
      git(["-C", repositoryRoot, "commit", "--quiet", "-am", "second"]);
      git([
        "-C",
        repositoryRoot,
        "remote",
        "add",
        "origin",
        "https://credential@example.test/private.git",
      ]);
      const baseSha = git(["-C", repositoryRoot, "rev-parse", "HEAD"]).stdout.trim();
      git([
        "-C",
        repositoryRoot,
        "worktree",
        "add",
        "-b",
        "codex/issue-1",
        worktreePath,
        baseSha,
      ]);

      const view = await ensureSanitizedWorkerGitView({
        repositoryRoot,
        worktreePath,
        baseSha,
        workerGitRoot,
        issueNumber: 1,
        git,
      });
      const workerGit = (args: string[]) =>
        git([
          `--git-dir=${view.gitDirectory}`,
          `--work-tree=${worktreePath}`,
          ...args,
        ]).stdout.trim();

      expect(workerGit(["status", "--porcelain"])).toBe("");
      expect(workerGit(["rev-list", "--count", "--all"])).toBe("1");
      expect(workerGit(["remote"])).toBe("");
      expect(fs.readFileSync(path.join(view.gitDirectory, "config"), "utf8")).not.toContain(
        "credential@example.test",
      );

      fs.rmSync(path.join(view.viewPath, "baseline.json"));
      fs.writeFileSync(path.join(view.gitDirectory, "partial-build"), "stale");
      const recoveredView = await ensureSanitizedWorkerGitView({
        repositoryRoot,
        worktreePath,
        baseSha,
        workerGitRoot,
        issueNumber: 1,
        git,
      });
      expect(fs.existsSync(path.join(recoveredView.gitDirectory, "partial-build"))).toBe(
        false,
      );
      expect(workerGit(["status", "--porcelain"])).toBe("");

      fs.appendFileSync(path.join(worktreePath, "tracked.txt"), "deliberate\r\n");
      expect(workerGit(["status", "--porcelain"])).toBe("M tracked.txt");

      removeSanitizedWorkerGitView(workerGitRoot, 1);
      expect(fs.existsSync(view.viewPath)).toBe(false);
    } finally {
      const resolvedTemporaryRoot = path.resolve(temporaryRoot);
      if (resolvedTemporaryRoot.startsWith(path.resolve(os.tmpdir()))) {
        fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
      }
    }
  });
});
