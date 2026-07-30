import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GIT_TIMEOUT_MS = 30_000;
const EMPTY_SANDBOX_PLACEHOLDERS = Object.freeze([
  "package-lock.json",
  "yarn.lock",
  "supabase/seed.sql",
]);

function runGit(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "commit.gpgSign=false",
      "-c",
      "tag.gpgSign=false",
      "-c",
      "core.autocrlf=false",
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
      env: {
        ...process.env,
        GCM_INTERACTIVE: "Never",
        GIT_TERMINAL_PROMPT: "0",
        GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
      },
    },
  );
  if (result.error || result.signal) {
    throw new Error(
      `git ${args.join(" ")} did not exit normally: ${
        result.error?.message ?? `signal ${result.signal}`
      }`,
    );
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function gitLine(cwd, args) {
  return runGit(cwd, args).stdout.trim();
}

function managedWorktreePath(runtimePath) {
  const worktreeRoot = path.resolve(runtimePath, "worktrees");
  const worktreePath = path.resolve(worktreeRoot, "current");
  const relative = path.relative(worktreeRoot, worktreePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`invalid Ralph worktree path ${worktreePath}`);
  }
  return { worktreeRoot, worktreePath };
}

function issueBranch(issueNumber) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`invalid issue number ${issueNumber}`);
  }
  return `codex/issue-${issueNumber}`;
}

function safeWorktreeFile(worktreePath, repositoryPath) {
  const segments = repositoryPath.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`invalid repository path ${repositoryPath}`);
  }
  let candidate = worktreePath;
  for (const segment of segments) {
    candidate = path.join(candidate, segment);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error(`sandbox placeholder traverses a symbolic link: ${repositoryPath}`);
    }
  }
  return candidate;
}

export function createGitWorkspace({ repositoryPath, runtimePath }) {
  const repositoryRoot = path.resolve(repositoryPath);
  const { worktreeRoot, worktreePath } = managedWorktreePath(runtimePath);

  return {
    prepare(issueNumber) {
      const branch = issueBranch(issueNumber);
      runGit(repositoryRoot, ["fetch", "--prune", "origin", "main"]);
      const baseSha = gitLine(repositoryRoot, ["rev-parse", "origin/main"]);
      fs.mkdirSync(worktreeRoot, { recursive: true });
      if (fs.existsSync(worktreePath)) {
        throw new Error(`Ralph worktree is already populated at ${worktreePath}`);
      }
      const branchExists = runGit(
        repositoryRoot,
        ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
        { allowFailure: true },
      );
      if (branchExists.status === 0) {
        throw new Error(`Ralph issue branch already exists: ${branch}`);
      }
      runGit(repositoryRoot, [
        "worktree",
        "add",
        "-b",
        branch,
        worktreePath,
        baseSha,
      ]);
      const observedBase = gitLine(worktreePath, ["rev-parse", "HEAD"]);
      if (observedBase !== baseSha) {
        throw new Error(`worktree base changed: ${observedBase} != ${baseSha}`);
      }
      return { baseSha, branch, worktreePath };
    },

    buildCandidate() {
      runGit(worktreePath, ["add", "--all"]);
      const candidateTreeSha = gitLine(worktreePath, ["write-tree"]);
      return { candidateTreeSha };
    },

    discardEmptySandboxPlaceholders({ baseSha }) {
      const removed = [];
      for (const repositoryPath of EMPTY_SANDBOX_PLACEHOLDERS) {
        const baseEntry = gitLine(worktreePath, [
          "ls-tree",
          "--name-only",
          baseSha,
          "--",
          repositoryPath,
        ]);
        if (baseEntry) continue;
        const candidate = safeWorktreeFile(worktreePath, repositoryPath);
        if (!fs.existsSync(candidate)) continue;
        const metadata = fs.lstatSync(candidate);
        if (metadata.isFile() && metadata.size === 0) {
          fs.rmSync(candidate);
          removed.push(repositoryPath);
        }
      }
      return { removed };
    },

    commit({ issueNumber, candidateTreeSha }) {
      runGit(worktreePath, [
        "commit",
        "--message",
        `fix: resolve issue #${issueNumber}`,
      ]);
      const headSha = gitLine(worktreePath, ["rev-parse", "HEAD"]);
      const committedTreeSha = gitLine(worktreePath, [
        "rev-parse",
        `${headSha}^{tree}`,
      ]);
      if (committedTreeSha !== candidateTreeSha) {
        throw new Error(
          `committed tree changed after verification: ${committedTreeSha} != ${candidateTreeSha}`,
        );
      }
      return { headSha };
    },

    push({ branch, headSha }) {
      runGit(worktreePath, [
        "push",
        "--set-upstream",
        "origin",
        `${headSha}:refs/heads/${branch}`,
      ]);
      const remoteHead = gitLine(repositoryRoot, [
        "ls-remote",
        "--heads",
        "origin",
        `refs/heads/${branch}`,
      ]).split(/\s+/)[0];
      if (remoteHead !== headSha) {
        throw new Error(`remote head changed: ${remoteHead} != ${headSha}`);
      }
    },

    park({ issueNumber, branch, baseSha }) {
      const expectedBranch = issueBranch(issueNumber);
      const parkedRoot = path.resolve(worktreeRoot, "parked");
      const artifactPath = path.resolve(parkedRoot, `issue-${issueNumber}`);
      const relative = path.relative(parkedRoot, artifactPath);
      if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        branch !== expectedBranch
      ) {
        throw new Error("refusing to park an unmanaged Ralph checkout");
      }
      if (!fs.existsSync(worktreePath) || fs.existsSync(artifactPath)) {
        throw new Error("Ralph cannot park the active issue checkout safely");
      }
      const observedBranch = gitLine(worktreePath, ["branch", "--show-current"]);
      const observedHead = gitLine(worktreePath, ["rev-parse", "HEAD"]);
      if (observedBranch !== branch || observedHead !== baseSha) {
        throw new Error("refusing to park a changed Ralph checkout identity");
      }
      fs.mkdirSync(parkedRoot, { recursive: true });
      runGit(repositoryRoot, ["worktree", "move", worktreePath, artifactPath]);
      return { artifactPath };
    },

    cleanup({ branch, headSha }) {
      if (fs.existsSync(worktreePath)) {
        const observedBranch = gitLine(worktreePath, ["branch", "--show-current"]);
        const observedHead = gitLine(worktreePath, ["rev-parse", "HEAD"]);
        const status = gitLine(worktreePath, ["status", "--porcelain"]);
        if (observedBranch !== branch || observedHead !== headSha || status) {
          throw new Error("refusing to clean a changed Ralph worktree");
        }
        runGit(repositoryRoot, ["worktree", "remove", worktreePath]);
      }
      const branchHead = runGit(
        repositoryRoot,
        ["rev-parse", "--verify", `refs/heads/${branch}`],
        { allowFailure: true },
      );
      if (branchHead.status === 0) {
        if (branchHead.stdout.trim() !== headSha) {
          throw new Error("refusing to delete a changed Ralph issue branch");
        }
        runGit(repositoryRoot, ["branch", "--delete", "--force", branch]);
      }
      runGit(repositoryRoot, ["worktree", "prune"]);
    },
  };
}
