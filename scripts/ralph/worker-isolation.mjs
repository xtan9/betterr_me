import fs from "node:fs";
import path from "node:path";

export function isolatedCodexReadablePaths({
  readOnly,
  worktreePath,
  gitMetadataRoot,
  dependencyRoot,
  workerHome,
}) {
  return [
    ...(readOnly ? [worktreePath] : []),
    ...(!readOnly && gitMetadataRoot ? [gitMetadataRoot] : []),
    dependencyRoot,
    workerHome,
  ];
}

export function isolatedCodexFilesystemConfig(extraReadable = []) {
  return `{${[
    [":root", "deny"],
    [":minimal", "read"],
    [":tmpdir", "deny"],
    ...extraReadable.map((readablePath) => [readablePath, "read"]),
  ]
    .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join(",")}}`;
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
    await git(
      [
        `--git-dir=${gitDirectory}`,
        `--work-tree=${worktreePath}`,
        "-c",
        "core.autocrlf=true",
        "add",
        "--force",
        "--pathspec-from-file=-",
        "--pathspec-file-nul",
      ],
      { input: trackedFiles },
    );
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
