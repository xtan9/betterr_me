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

function optionalGitLine(cwd, args) {
  const result = runGit(cwd, args, { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
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

function comparablePath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertManagedGeneration({
  issueNumber,
  branch,
  baseSha,
  recordedWorktreePath,
}, worktreePath) {
  if (
    branch !== issueBranch(issueNumber) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(baseSha) ||
    comparablePath(recordedWorktreePath) !== comparablePath(worktreePath)
  ) {
    throw new Error("Ralph checkout intent failed integrity validation");
  }
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
    plan(issueNumber) {
      const branch = issueBranch(issueNumber);
      runGit(repositoryRoot, ["fetch", "--prune", "origin", "main"]);
      const baseSha = gitLine(repositoryRoot, ["rev-parse", "origin/main"]);
      return { baseSha, branch, worktreePath };
    },

    ensureCheckout({ number, baseSha, branch, worktreePath: recordedWorktreePath }) {
      assertManagedGeneration(
        {
          issueNumber: number,
          branch,
          baseSha,
          recordedWorktreePath,
        },
        worktreePath,
      );
      fs.mkdirSync(worktreeRoot, { recursive: true });
      if (fs.existsSync(worktreePath)) {
        const observedBranch = gitLine(worktreePath, ["branch", "--show-current"]);
        const observedHead = gitLine(worktreePath, ["rev-parse", "HEAD"]);
        if (observedBranch !== branch || observedHead !== baseSha) {
          throw new Error("existing Ralph worktree does not match its durable intent");
        }
        return { baseSha, branch, worktreePath };
      }
      const branchHead = optionalGitLine(repositoryRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${branch}`,
      ]);
      if (branchHead && branchHead !== baseSha) {
        throw new Error(`Ralph issue branch ${branch} changed before recovery`);
      }
      runGit(
        repositoryRoot,
        branchHead
          ? ["worktree", "add", worktreePath, branch]
          : ["worktree", "add", "-b", branch, worktreePath, baseSha],
      );
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

    candidateChanges({ baseSha, candidateTreeSha }) {
      const tokens = runGit(repositoryRoot, [
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        "-z",
        baseSha,
        candidateTreeSha,
      ]).stdout.split("\0").filter(Boolean);
      const changes = [];
      for (let index = 0; index < tokens.length;) {
        const status = tokens[index];
        index += 1;
        if (/^[RC]/.test(status)) {
          const sourcePath = tokens[index];
          const destinationPath = tokens[index + 1];
          index += 2;
          changes.push({ path: sourcePath, status: "D" });
          changes.push({ path: destinationPath, status: "A" });
        } else {
          changes.push({ path: tokens[index], status: status[0] });
          index += 1;
        }
      }
      return changes.sort((left, right) => left.path.localeCompare(right.path));
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
      const observedBranch = gitLine(worktreePath, ["branch", "--show-current"]);
      if (observedBranch !== issueBranch(issueNumber)) {
        throw new Error("refusing to commit an unmanaged Ralph checkout");
      }
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

    findVerifiedCommit({ issueNumber, branch, baseSha, candidateTreeSha }) {
      if (branch !== issueBranch(issueNumber)) {
        throw new Error("refusing to inspect an unmanaged Ralph issue branch");
      }
      const branchHead = optionalGitLine(repositoryRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${branch}`,
      ]);
      if (!branchHead || branchHead === baseSha) return null;
      const ancestry = gitLine(repositoryRoot, [
        "rev-list",
        "--parents",
        "-n",
        "1",
        branchHead,
      ]).split(/\s+/);
      const commitsAhead = gitLine(repositoryRoot, [
        "rev-list",
        "--count",
        `${baseSha}..${branchHead}`,
      ]);
      const treeSha = gitLine(repositoryRoot, [
        "rev-parse",
        `${branchHead}^{tree}`,
      ]);
      if (
        ancestry.length !== 2 ||
        ancestry[0] !== branchHead ||
        ancestry[1] !== baseSha ||
        commitsAhead !== "1" ||
        treeSha !== candidateTreeSha
      ) {
        throw new Error("local issue commit does not match its verified generation");
      }
      if (fs.existsSync(worktreePath)) {
        const checkoutHead = gitLine(worktreePath, ["rev-parse", "HEAD"]);
        const checkoutBranch = gitLine(worktreePath, ["branch", "--show-current"]);
        const status = gitLine(worktreePath, ["status", "--porcelain"]);
        if (checkoutHead !== branchHead || checkoutBranch !== branch || status) {
          throw new Error("committed Ralph checkout changed before recovery");
        }
      }
      return { headSha: branchHead };
    },

    push({ issueNumber, branch, headSha }) {
      if (branch !== issueBranch(issueNumber)) {
        throw new Error("refusing to push an unmanaged Ralph issue branch");
      }
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

    remoteHead({ issueNumber, branch }) {
      if (branch !== issueBranch(issueNumber)) {
        throw new Error("refusing to inspect an unmanaged remote issue branch");
      }
      const output = gitLine(repositoryRoot, [
        "ls-remote",
        "--heads",
        "origin",
        `refs/heads/${branch}`,
      ]);
      return output ? output.split(/\s+/)[0] : null;
    },

    park({ issueNumber, branch, expectedHead }) {
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
      if (!fs.existsSync(worktreePath) && fs.existsSync(artifactPath)) {
        const parkedBranch = gitLine(artifactPath, ["branch", "--show-current"]);
        const parkedHead = gitLine(artifactPath, ["rev-parse", "HEAD"]);
        if (parkedBranch !== branch || parkedHead !== expectedHead) {
          throw new Error("parked Ralph checkout changed before recovery");
        }
        return { artifactPath };
      }
      if (!fs.existsSync(worktreePath) || fs.existsSync(artifactPath)) {
        throw new Error("Ralph cannot park the active issue checkout safely");
      }
      const observedBranch = gitLine(worktreePath, ["branch", "--show-current"]);
      const observedHead = gitLine(worktreePath, ["rev-parse", "HEAD"]);
      if (observedBranch !== branch || observedHead !== expectedHead) {
        throw new Error("refusing to park a changed Ralph checkout identity");
      }
      fs.mkdirSync(parkedRoot, { recursive: true });
      runGit(repositoryRoot, ["worktree", "move", worktreePath, artifactPath]);
      return { artifactPath };
    },

    cleanup({ issueNumber, branch, headSha }) {
      if (branch !== issueBranch(issueNumber)) {
        throw new Error("refusing to clean an unmanaged Ralph issue branch");
      }
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
