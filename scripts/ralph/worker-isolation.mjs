import fs from "node:fs";
import path from "node:path";

export function workerCodexModelArguments({
  readOnly,
  reviewKind = "exhaustive",
}) {
  const effort = readOnly
    ? reviewKind === "delta"
      ? "high"
      : "xhigh"
    : "high";
  return [
    "--model",
    "gpt-5.6-sol",
    "-c",
    `model_reasoning_effort=${JSON.stringify(effort)}`,
  ];
}

function codexEventTypes(eventLog) {
  return new Set(
    String(eventLog ?? "")
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const type = JSON.parse(line).type;
        return typeof type === "string" ? [type] : [];
      } catch {
        return [];
      }
    }),
  );
}

export function codexSessionStarted(eventLog) {
  return codexEventTypes(eventLog).has("thread.started");
}

export function codexStartupEventsReady(eventLog) {
  const types = codexEventTypes(eventLog);
  return types.has("thread.started") && types.has("turn.started");
}

export function processExitCode({ code, successfulStop }) {
  return successfulStop ? 0 : (code ?? -1);
}

export function isolatedCodexAuthInstallRequired({ runtimeExists, sourceIsNewer }) {
  if (typeof runtimeExists !== "boolean" || typeof sourceIsNewer !== "boolean") {
    throw new Error("isolated auth reconciliation evidence must be boolean");
  }
  return !runtimeExists || sourceIsNewer;
}

export function isolatedCodexRuntimeConfiguration({
  workerHome,
  codexHome,
  sourceAuthPath,
}) {
  for (const [label, value] of [
    ["worker home", workerHome],
    ["Codex runtime", codexHome],
    ["source auth path", sourceAuthPath],
  ]) {
    if (typeof value !== "string" || !path.posix.isAbsolute(value)) {
      throw new Error(`isolated ${label} must be an absolute Linux path`);
    }
  }

  const relativeRuntime = path.posix.relative(workerHome, codexHome);
  if (
    relativeRuntime === "" ||
    (!relativeRuntime.startsWith("../") && relativeRuntime !== "..")
  ) {
    throw new Error(
      "isolated Codex runtime must be outside the agent-readable worker home",
    );
  }

  const authPath = path.posix.join(codexHome, "auth.json");
  const configPath = path.posix.join(codexHome, "config.toml");
  return {
    environment: [`CODEX_HOME=${codexHome}`],
    sourceAuthPath,
    authPath,
    configPath,
    directoryProvisionCommand: [
      "install",
      "-d",
      "-m",
      "700",
      "-o",
      "65534",
      "-g",
      "65534",
      codexHome,
    ],
    authInstallCommand: [
      "install",
      "-m",
      "600",
      "-o",
      "65534",
      "-g",
      "65534",
      sourceAuthPath,
      authPath,
    ],
    configRemovalCommand: ["/bin/rm", "-f", configPath],
  };
}

export function unprivilegedWslCommandArguments({
  home,
  environment = /** @type {string[]} */ ([]),
  command,
  args = /** @type {string[]} */ ([]),
}) {
  if (typeof home !== "string" || !home.startsWith("/")) {
    throw new Error("unprivileged WSL home must be an absolute Linux path");
  }
  if (typeof command !== "string" || !command.startsWith("/")) {
    throw new Error("unprivileged WSL command must be an absolute Linux path");
  }
  if (!Array.isArray(environment) || !environment.every((value) => typeof value === "string")) {
    throw new Error("unprivileged WSL environment must contain strings");
  }
  if (!Array.isArray(args) || !args.every((value) => typeof value === "string")) {
    throw new Error("unprivileged WSL arguments must contain strings");
  }
  return [
    "/usr/bin/setpriv",
    "--no-new-privs",
    "--bounding-set=-all",
    "--reuid=65534",
    "--regid=65534",
    "--clear-groups",
    "env",
    `HOME=${home}`,
    ...environment,
    command,
    ...args,
  ];
}

export function unprivilegedWslIdentityProbeArguments(home) {
  return unprivilegedWslCommandArguments({
    home,
    command: "/bin/sh",
    args: [
      "-c",
      "/bin/grep -E '^(Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs):' /proc/self/status",
    ],
  });
}

export function unprivilegedWslIdentityIsSafe(output) {
  const fields = new Map(
    String(output)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator < 0) return [line, []];
        return [
          line.slice(0, separator),
          line
            .slice(separator + 1)
            .trim()
            .split(/\s+/)
            .filter(Boolean),
        ];
      }),
  );
  const equals = (name, expected) => {
    const actual = fields.get(name);
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index])
    );
  };
  const zeroCapability = ["0000000000000000"];
  return (
    equals("Uid", ["65534", "65534", "65534", "65534"]) &&
    equals("Gid", ["65534", "65534", "65534", "65534"]) &&
    equals("Groups", []) &&
    equals("CapInh", zeroCapability) &&
    equals("CapPrm", zeroCapability) &&
    equals("CapEff", zeroCapability) &&
    equals("CapBnd", zeroCapability) &&
    equals("CapAmb", zeroCapability) &&
    equals("NoNewPrivs", ["1"])
  );
}

export function isolatedCodexReadablePaths({
  readOnly,
  worktreePath,
  gitMetadataRoot,
  dependencyRoot,
  workerHome,
  protectedPaths = /** @type {string[]} */ ([]),
}) {
  return [
    ...(readOnly ? [worktreePath] : []),
    ...(!readOnly && gitMetadataRoot ? [gitMetadataRoot] : []),
    dependencyRoot,
    workerHome,
    ...protectedPaths,
  ];
}

export function isolatedCodexFilesystemConfig(
  extraReadable = /** @type {string[]} */ ([]),
) {
  return `{${[
    [":root", "deny"],
    [":minimal", "read"],
    [":tmpdir", "deny"],
    ...extraReadable.map((readablePath) => [readablePath, "read"]),
  ]
    .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join(",")}}`;
}

const IMMUTABLE_ESBUILD_SELECTOR =
  "*/node_modules/@esbuild/linux-x64/bin/esbuild";

function immutableDependencyFindArguments(dependencyRoot) {
  if (typeof dependencyRoot !== "string" || !dependencyRoot.startsWith("/")) {
    throw new Error("immutable dependency root must be an absolute Linux path");
  }
  return [
    "find",
    dependencyRoot,
    "-path",
    IMMUTABLE_ESBUILD_SELECTOR,
    "-type",
    "f",
  ];
}

export function immutableDependencyExecutableDiscoveryArguments(
  dependencyRoot,
) {
  return [...immutableDependencyFindArguments(dependencyRoot), "-print"];
}

export function immutableDependencyExecutablePaths(output, dependencyRoot) {
  immutableDependencyFindArguments(dependencyRoot);
  const prefix = `${dependencyRoot}/.pnpm/`;
  const suffix = "/node_modules/@esbuild/linux-x64/bin/esbuild";
  const paths = String(output ?? "")
    .split(/\r?\n/)
    .filter(Boolean);
  for (const executablePath of paths) {
    const packageDirectory = executablePath.slice(
      prefix.length,
      executablePath.length - suffix.length,
    );
    if (
      !executablePath.startsWith(prefix) ||
      !executablePath.endsWith(suffix) ||
      !/^@esbuild\+linux-x64@[^/]+$/.test(packageDirectory)
    ) {
      throw new Error(`unexpected immutable esbuild path ${executablePath}`);
    }
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("duplicate immutable esbuild path");
  }
  return paths.sort();
}

function assertExecutablePaths(executablePaths) {
  if (
    !Array.isArray(executablePaths) ||
    executablePaths.length === 0 ||
    executablePaths.some(
      (executablePath) =>
        typeof executablePath !== "string" || !executablePath.startsWith("/"),
    )
  ) {
    throw new Error("immutable esbuild paths must be non-empty absolute paths");
  }
}

export function immutableDependencyExecutableStatArguments(executablePaths) {
  assertExecutablePaths(executablePaths);
  return ["stat", "-c", "%U:%G:%a", ...executablePaths];
}

export function immutableDependencyExecutableRepairArguments(executablePaths) {
  assertExecutablePaths(executablePaths);
  return ["chmod", "0555", ...executablePaths];
}

export function immutableDependencyExecutableStatsAreSafe(
  output,
  expectedCount,
  expectedMode = /** @type {string | null} */ (null),
) {
  if (!Number.isInteger(expectedCount) || expectedCount < 1) return false;
  const lines = String(output ?? "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length !== expectedCount) return false;
  const pattern = expectedMode === null
    ? /^root:root:[0-7]{3,4}$/
    : new RegExp(`^root:root:${expectedMode}$`);
  return lines.every((line) => pattern.test(line));
}

export function workerGitEnvironment({ gitDirectory, worktreePath }) {
  return {
    GIT_DIR: gitDirectory,
    GIT_WORK_TREE: worktreePath,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.autocrlf",
    GIT_CONFIG_VALUE_0: "true",
  };
}

export function workerGitSmokeCommand(realGitConfig) {
  return `set -eu; git status --porcelain >/dev/null; git rev-list --count --all | grep -qx 1; ! git remote | grep -q .; ! test -r ${JSON.stringify(realGitConfig)}; ! touch "$GIT_DIR/ralph-write-probe" 2>/dev/null; echo RALPH_WORKER_GIT_OK`;
}

export function workerGitViewPath(workerGitRoot, issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("issue number must be a positive integer");
  }
  return path.join(workerGitRoot, `issue-${issueNumber}`);
}

export function sanitizedWorkerGitViewRecoveryAction({
  mergeActive,
  recordedBaseSha,
  expectedBaseSha,
}) {
  if (mergeActive !== true) return "rebuild";
  return recordedBaseSha === expectedBaseSha ? "adopt" : "unsafe";
}

function sanitizedConfig() {
  return `[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = true\n\tautocrlf = true\n\tignorecase = true\n`;
}

export async function ensureSanitizedWorkerGitView({
  repositoryRoot,
  worktreePath,
  baseSha,
  workerGitRoot,
  issueNumber,
  git,
}) {
  const viewPath = workerGitViewPath(workerGitRoot, issueNumber);
  const gitDirectory = path.join(viewPath, ".git");
  const baselinePath = path.join(viewPath, "baseline.json");
  const head = (
    await git(["-C", worktreePath, "rev-parse", "HEAD"])
  ).stdout.trim();
  if (head !== baseSha) {
    throw new Error("worker worktree HEAD does not match its recorded base");
  }

  let created = false;
  if (!fs.existsSync(gitDirectory) || !fs.existsSync(baselinePath)) {
    const status = (
      await git(["-C", worktreePath, "status", "--porcelain"])
    ).stdout.trim();
    if (status) {
      throw new Error(
        "cannot create a sanitized worker Git baseline from a dirty worktree",
      );
    }
    if (fs.existsSync(viewPath)) {
      fs.rmSync(viewPath, { recursive: true, force: true });
    }

    fs.mkdirSync(workerGitRoot, { recursive: true });
    await git(["init", "--initial-branch=baseline", "--template=", viewPath]);
    const trackedFiles = (
      await git([
        "-C",
        repositoryRoot,
        "ls-tree",
        "-r",
        "--name-only",
        "-z",
        baseSha,
      ])
    ).stdout;
    const pathspecPath = path.join(viewPath, "tracked-files.pathspec");
    fs.writeFileSync(pathspecPath, trackedFiles, "utf8");
    try {
      await git([
        `--git-dir=${gitDirectory}`,
        `--work-tree=${worktreePath}`,
        "-c",
        "core.autocrlf=true",
        "add",
        "--force",
        `--pathspec-from-file=${pathspecPath}`,
        "--pathspec-file-nul",
      ]);
    } finally {
      fs.rmSync(pathspecPath, { force: true });
    }
    await git([
      `--git-dir=${gitDirectory}`,
      `--work-tree=${worktreePath}`,
      "-c",
      "user.name=Ralph isolated worker",
      "-c",
      "user.email=ralph@localhost",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--message",
      `Sanitized baseline for issue #${issueNumber}`,
    ]);
    fs.writeFileSync(path.join(gitDirectory, "config"), sanitizedConfig(), "utf8");
    created = true;
  }

  const actualTree = (
    await git([`--git-dir=${gitDirectory}`, "rev-parse", "HEAD^{tree}"])
  ).stdout.trim();
  const commitCount = Number(
    (
      await git([`--git-dir=${gitDirectory}`, "rev-list", "--count", "--all"])
    ).stdout.trim(),
  );
  const remotes = (
    await git([`--git-dir=${gitDirectory}`, "remote"])
  ).stdout.trim();
  const config = fs.readFileSync(path.join(gitDirectory, "config"), "utf8");
  if (created) {
    const temporaryBaselinePath = `${baselinePath}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporaryBaselinePath,
      `${JSON.stringify({ baseSha, tree: actualTree })}\n`,
      "utf8",
    );
    fs.renameSync(temporaryBaselinePath, baselinePath);
  }
  if (!fs.existsSync(baselinePath)) {
    throw new Error("sanitized worker Git view is missing its baseline receipt");
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (
    baseline.baseSha !== baseSha ||
    baseline.tree !== actualTree ||
    commitCount !== 1 ||
    remotes ||
    config !== sanitizedConfig()
  ) {
    throw new Error("sanitized worker Git view failed integrity validation");
  }

  return { viewPath, gitDirectory };
}

export function removeSanitizedWorkerGitView(workerGitRoot, issueNumber) {
  const viewPath = workerGitViewPath(workerGitRoot, issueNumber);
  const resolvedRoot = `${path.resolve(workerGitRoot)}${path.sep}`;
  if (!path.resolve(viewPath).startsWith(resolvedRoot)) {
    throw new Error("refusing to remove worker Git view outside its managed root");
  }
  fs.rmSync(viewPath, { recursive: true, force: true });
}
