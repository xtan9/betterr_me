import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function defaultExecute(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function defaultProcessIsAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function checked(execute, executable, args, cwd, description, accepted = [0]) {
  const result = execute(executable, args, cwd);
  if (
    result?.error ||
    result?.signal ||
    !accepted.includes(result?.status)
  ) {
    throw new Error(
      `${description} failed: ${String(result?.stderr || result?.error?.message || result?.status).trim()}`,
    );
  }
  return String(result.stdout ?? "").trim();
}

function repositoryFromRemote(remote) {
  const match = String(remote).trim().match(
    /github\.com(?::|\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export function assertProductionPreflight({
  repositoryPath,
  runtimePath,
  githubRepository,
  legacyRuntimeRoot,
  execute = defaultExecute,
  processIsAlive = defaultProcessIsAlive,
  trustedDependencyRoot = "/var/lib/betterr-me-ralph/deps-source/node_modules",
}) {
  if (
    !path.win32.isAbsolute(repositoryPath) ||
    !fs.statSync(repositoryPath).isDirectory() ||
    !path.win32.isAbsolute(runtimePath) ||
    !fs.statSync(runtimePath).isDirectory() ||
    !/^[^/\s]+\/[^/\s]+$/.test(githubRepository) ||
    !path.posix.isAbsolute(trustedDependencyRoot)
  ) throw new Error("production preflight paths failed integrity validation");

  if (legacyRuntimeRoot) {
    const legacyLockPath = path.join(legacyRuntimeRoot, "runner.lock");
    if (fs.existsSync(legacyLockPath)) {
      let lock;
      try {
        lock = JSON.parse(fs.readFileSync(legacyLockPath, "utf8"));
      } catch {
        throw new Error("legacy Ralph controller lock failed integrity validation");
      }
      if (!Number.isSafeInteger(lock?.pid) || lock.pid <= 0) {
        throw new Error("legacy Ralph controller lock failed integrity validation");
      }
      if (processIsAlive(lock.pid)) {
        throw new Error(`legacy Ralph controller process ${lock.pid} is still active`);
      }
    }
  }

  checked(execute, "git", ["fetch", "--prune", "origin", "main"], repositoryPath, "latest-main fetch");
  const status = checked(
    execute,
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    repositoryPath,
    "clean-worktree check",
  );
  if (status) throw new Error("production Ralph requires a completely clean controller checkout");
  const branch = checked(execute, "git", ["branch", "--show-current"], repositoryPath, "branch check");
  if (branch !== "main") throw new Error(`production Ralph requires main, not ${branch || "detached HEAD"}`);
  const headSha = checked(execute, "git", ["rev-parse", "HEAD"], repositoryPath, "HEAD check");
  const mainSha = checked(execute, "git", ["rev-parse", "origin/main"], repositoryPath, "origin/main check");
  if (headSha !== mainSha || !/^[a-f0-9]{40}$/.test(headSha)) {
    throw new Error("production Ralph requires local main to exactly equal origin/main");
  }
  const remote = checked(execute, "git", ["remote", "get-url", "origin"], repositoryPath, "origin check");
  if (repositoryFromRemote(remote)?.toLowerCase() !== githubRepository.toLowerCase()) {
    throw new Error("production Ralph GitHub repository does not match origin");
  }
  checked(execute, "gh", ["auth", "status"], repositoryPath, "GitHub authentication");
  const systemd = checked(
    execute,
    "wsl.exe",
    ["-u", "root", "-e", "/usr/bin/systemctl", "is-system-running"],
    repositoryPath,
    "WSL systemd",
    [0, 1],
  );
  if (!new Set(["running", "degraded"]).has(systemd)) {
    throw new Error(`WSL systemd is not usable: ${systemd}`);
  }
  checked(
    execute,
    "wsl.exe",
    [
      "-u", "nobody", "-e", "/usr/bin/test", "-r",
      "/var/lib/betterr-me-ralph/codex-runtime/auth.json",
    ],
    repositoryPath,
    "isolated Codex authentication",
  );
  checked(
    execute,
    "wsl.exe",
    [
      "-u", "nobody", "-e", "/usr/bin/test", "-d",
      trustedDependencyRoot,
    ],
    repositoryPath,
    "immutable WSL dependencies",
  );
  const skillRoot = "/var/lib/betterr-me-ralph/worker-home/.agents/skills";
  const skillOwnership = checked(
    execute, "wsl.exe", ["-u", "root", "-e", "stat", "-c", "%U:%G:%a", skillRoot],
    repositoryPath, "immutable WSL skill ownership",
  );
  if (skillOwnership !== "root:root:555") {
    throw new Error("immutable WSL skill home has unsafe ownership or mode");
  }
  const dependencyOwnership = checked(
    execute, "wsl.exe", ["-u", "root", "-e", "stat", "-c", "%U:%G:%a", trustedDependencyRoot],
    repositoryPath, "immutable WSL dependency ownership",
  );
  if (dependencyOwnership !== "root:root:555") {
    throw new Error("immutable WSL dependency root has unsafe ownership or mode");
  }
  const writableDependency = checked(
    execute,
    "wsl.exe",
    ["-u", "root", "-e", "/bin/bash", "-c", `find ${trustedDependencyRoot} \\( -type f -o -type d \\) -perm /022 -print -quit`],
    repositoryPath,
    "immutable WSL dependency permissions",
  );
  if (writableDependency) throw new Error("immutable WSL dependencies contain a writable entry");
  const expectedSkills = checked(
    execute, "wsl.exe", ["-u", "root", "-e", "cat", "/var/lib/betterr-me-ralph/skills.content.sha256"],
    repositoryPath, "immutable WSL skill fingerprint",
  );
  const actualSkills = checked(
    execute,
    "wsl.exe",
    ["-u", "root", "-e", "/bin/bash", "-c", `set -o pipefail; find ${skillRoot} -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum`],
    repositoryPath,
    "immutable WSL skill content",
  );
  if (expectedSkills !== actualSkills) throw new Error("immutable WSL skill content fingerprint changed");
  const expectedDependencies = checked(
    execute, "wsl.exe", ["-u", "root", "-e", "cat", "/var/lib/betterr-me-ralph/deps.content.sha256"],
    repositoryPath, "immutable WSL dependency fingerprint",
  );
  const actualDependencies = checked(
    execute,
    "wsl.exe",
    ["-u", "root", "-e", "/bin/bash", "-c", `set -o pipefail; find ${trustedDependencyRoot} -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum`],
    repositoryPath,
    "immutable WSL dependency content",
  );
  if (expectedDependencies !== actualDependencies) {
    throw new Error("immutable WSL dependency content fingerprint changed");
  }
  checked(
    execute,
    "wsl.exe",
    [
      "-u", "root", "-e", "stat",
      `${skillRoot}/implement/SKILL.md`,
      `${skillRoot}/tdd/SKILL.md`,
      `${skillRoot}/code-review/SKILL.md`,
    ],
    repositoryPath,
    "required immutable WSL skills",
  );
  return { repositoryPath, runtimePath, githubRepository, branch, headSha };
}
