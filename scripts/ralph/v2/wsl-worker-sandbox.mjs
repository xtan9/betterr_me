import fs from "node:fs";
import path from "node:path";
import {
  isolatedCodexFilesystemConfig,
  unprivilegedWslCommandArguments,
} from "../worker-isolation.mjs";

const DEFAULT_WORKER_HOME = "/var/lib/betterr-me-ralph/worker-home";
const DEFAULT_CODEX_HOME = "/var/lib/betterr-me-ralph/codex-runtime";
const DEFAULT_DEPENDENCY_ROOT =
  "/var/lib/betterr-me-ralph/deps-source/node_modules";
const DEFAULT_CODEX_PATH = "/usr/local/bin/codex";
const SAFE_WINDOWS_ENVIRONMENT_KEYS = new Set([
  "APPDATA",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "OS",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
]);

function tomlString(value) {
  return JSON.stringify(value);
}

function assertLinuxAbsolutePath(value, description) {
  if (typeof value !== "string" || !path.posix.isAbsolute(value)) {
    throw new Error(`${description} must be an absolute Linux path`);
  }
  return path.posix.normalize(value);
}

function assertStringArray(value, description) {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" || entry.includes("\0") || entry.length > 32_768,
    )
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return [...value];
}

export function windowsToWslPath(windowsPath) {
  if (typeof windowsPath !== "string" || !path.win32.isAbsolute(windowsPath)) {
    throw new Error("WSL source path must be an absolute Windows path");
  }
  const normalized = path.win32.resolve(windowsPath);
  const match = normalized.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) throw new Error("WSL source path is not drive-backed");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

export function wslToWindowsPath(linuxPath) {
  if (typeof linuxPath !== "string" || !path.posix.isAbsolute(linuxPath)) {
    throw new Error("Windows target path must be an absolute WSL path");
  }
  const normalized = path.posix.normalize(linuxPath);
  const match = normalized.match(/^\/mnt\/([a-zA-Z])\/(.+)$/);
  if (!match || normalized.includes("\0")) {
    throw new Error("Windows target path is not drive-backed");
  }
  return path.win32.normalize(`${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`);
}

function wslExecutablePath() {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("Ralph cannot locate wsl.exe");
  const executable = path.join(systemRoot, "System32", "wsl.exe");
  if (!fs.existsSync(executable)) throw new Error("Ralph requires WSL2");
  return executable;
}

function safeWindowsEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) =>
        SAFE_WINDOWS_ENVIRONMENT_KEYS.has(name.toUpperCase()) &&
        typeof value === "string",
    ),
  );
}

function restrictedProfileArguments(profile, baseProfile, readableRoots) {
  return [
    "-c",
    `default_permissions=${tomlString(profile)}`,
    "-c",
    `permissions.${profile}.extends=${tomlString(baseProfile)}`,
    "-c",
    `permissions.${profile}.filesystem=${isolatedCodexFilesystemConfig(
      readableRoots,
    )}`,
    "-c",
    `permissions.${profile}.network.enabled=false`,
  ];
}

export function createWslSandboxProbePlan({
  worktreePath,
  command,
  args = [],
  workerHome = DEFAULT_WORKER_HOME,
  codexHome = DEFAULT_CODEX_HOME,
  dependencyRoot = DEFAULT_DEPENDENCY_ROOT,
  codexPath = DEFAULT_CODEX_PATH,
}) {
  if (
    typeof worktreePath !== "string" ||
    !path.win32.isAbsolute(worktreePath) ||
    !fs.statSync(worktreePath).isDirectory()
  ) {
    throw new Error("WSL worker worktree failed integrity validation");
  }
  const linuxWorkerHome = assertLinuxAbsolutePath(
    workerHome,
    "WSL worker home",
  );
  const linuxCodexHome = assertLinuxAbsolutePath(
    codexHome,
    "WSL Codex home",
  );
  const linuxDependencyRoot = assertLinuxAbsolutePath(
    dependencyRoot,
    "WSL dependency root",
  );
  const linuxCodexPath = assertLinuxAbsolutePath(codexPath, "WSL Codex path");
  const linuxCommand = assertLinuxAbsolutePath(command, "WSL probe command");
  const mappedArguments = assertStringArray(args, "WSL probe arguments").map(
    (argument) =>
      path.win32.isAbsolute(argument) ? windowsToWslPath(argument) : argument,
  );
  const linuxWorktreePath = windowsToWslPath(worktreePath);
  const profile = "ralph-v2-probe";
  const codexArguments = [
    "sandbox",
    ...restrictedProfileArguments(profile, ":workspace", [
      linuxDependencyRoot,
      linuxWorkerHome,
    ]),
    "-P",
    profile,
    "-C",
    linuxWorktreePath,
    "--",
    linuxCommand,
    ...mappedArguments,
  ];
  const linuxLaunch = unprivilegedWslCommandArguments({
    home: linuxWorkerHome,
    environment: [`CODEX_HOME=${linuxCodexHome}`],
    command: linuxCodexPath,
    args: codexArguments,
  });
  return {
    executable: wslExecutablePath(),
    args: ["--", ...linuxLaunch],
    cwd: path.resolve(worktreePath),
    environment: safeWindowsEnvironment(),
  };
}
