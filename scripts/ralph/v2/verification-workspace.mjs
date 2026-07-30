import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GIT_TIMEOUT_MILLISECONDS = 30_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha1(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function safeEnvironment(overrides = {}) {
  const allowedNames = [
    "ComSpec",
    "LANG",
    "LC_ALL",
    "PATH",
    "PATHEXT",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ];
  return {
    ...Object.fromEntries(
      allowedNames.flatMap((name) =>
        typeof process.env[name] === "string" ? [[name, process.env[name]]] : [],
      ),
    ),
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ...overrides,
  };
}

function git(cwd, args, { input, environment, safeDirectories = [] } = {}) {
  const executable = process.platform === "win32" ? "git.exe" : "git";
  const trustedDirectories = [cwd, ...safeDirectories].map((directory) =>
    fs.realpathSync.native(directory),
  );
  const result = spawnSync(executable, [
    ...trustedDirectories.flatMap((directory) => [
      "-c",
      `safe.directory=${directory}`,
    ]),
    "-c",
    "core.autocrlf=false",
    ...args,
  ], {
    cwd,
    encoding: "utf8",
    env: safeEnvironment(environment),
    input,
    timeout: GIT_TIMEOUT_MILLISECONDS,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `verification workspace Git operation failed: ${String(
        result.stderr || result.error?.message || result.status,
      ).trim()}`,
    );
  }
  return result.stdout.trim();
}

function writeDurably(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishDurably(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(
    candidatePath,
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
  );
  try {
    try {
      fs.linkSync(candidatePath, filePath);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      return false;
    }
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("verification workspace manifest failed integrity validation", {
      cause: error,
    });
  }
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createVerificationWorkspace({
  repositoryPath,
  workspaceRoot,
  trustedDependencyRoot,
}) {
  if (
    !path.isAbsolute(repositoryPath) ||
    !path.isAbsolute(workspaceRoot) ||
    !path.isAbsolute(trustedDependencyRoot)
  ) {
    throw new Error("verification workspace paths failed integrity validation");
  }
  const repository = fs.realpathSync.native(repositoryPath);
  const dependencies = fs.realpathSync.native(trustedDependencyRoot);
  if (
    !fs.statSync(repository).isDirectory() ||
    !fs.statSync(dependencies).isDirectory()
  ) {
    throw new Error("verification workspace roots failed integrity validation");
  }
  const repositoryGitDirectory = fs.realpathSync.native(
    git(repository, ["rev-parse", "--absolute-git-dir"]),
  );
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const root = fs.realpathSync.native(workspaceRoot);
  if (within(repository, root) || within(root, repository)) {
    throw new Error("verification workspace cannot overlap its source repository");
  }
  if (within(dependencies, root) || within(root, dependencies)) {
    throw new Error("verification workspace cannot overlap trusted dependencies");
  }

  function normalizedInput(input) {
    if (
      !input ||
      !nonblank(input.sessionId) ||
      !isSha1(input.baseSha) ||
      !isSha1(input.candidateTreeSha)
    ) {
      throw new Error("verification workspace input failed integrity validation");
    }
    return {
      sessionId: input.sessionId,
      baseSha: input.baseSha.toLowerCase(),
      candidateTreeSha: input.candidateTreeSha.toLowerCase(),
    };
  }

  function pathsFor(input) {
    const key = sha256(
      `${input.sessionId}\0${input.baseSha}\0${input.candidateTreeSha}`,
    );
    return {
      key,
      worktreePath: path.join(root, "views", key),
      manifestPath: path.join(root, "manifests", `${key}.json`),
    };
  }

  function expectedManifest(input, paths, verificationCommitSha) {
    return {
      schemaVersion: 1,
      kind: "verification-workspace",
      sessionId: input.sessionId,
      baseSha: input.baseSha,
      candidateTreeSha: input.candidateTreeSha,
      verificationCommitSha,
      worktreePath: paths.worktreePath,
      trustedDependencyRoot: dependencies,
    };
  }

  function validatePrepared(manifest) {
    if (
      !manifest ||
      !isSha1(manifest.verificationCommitSha) ||
      !within(root, manifest.worktreePath) ||
      fs.realpathSync.native(manifest.worktreePath) !== manifest.worktreePath ||
      fs.realpathSync.native(
        path.join(manifest.worktreePath, "node_modules"),
      ) !== dependencies ||
      git(manifest.worktreePath, ["rev-parse", "HEAD"]) !==
        manifest.verificationCommitSha ||
      git(manifest.worktreePath, ["write-tree"]) !== manifest.candidateTreeSha
    ) {
      throw new Error("verification workspace failed integrity validation");
    }
    git(manifest.worktreePath, ["diff", "--quiet"]);
    if (git(manifest.worktreePath, ["remote"])) {
      throw new Error("verification workspace retained a remote");
    }
    return manifest;
  }

  return {
    prepare(rawInput) {
      const input = normalizedInput(rawInput);
      const paths = pathsFor(input);
      if (fs.existsSync(paths.manifestPath)) {
        const manifest = readManifest(paths.manifestPath);
        const expected = expectedManifest(
          input,
          paths,
          manifest.verificationCommitSha,
        );
        if (!sameValue(manifest, expected)) {
          throw new Error("verification workspace manifest changed");
        }
        return validatePrepared(manifest);
      }
      if (fs.existsSync(paths.worktreePath)) {
        throw new Error("verification workspace lacks its durable manifest");
      }

      git(repository, ["cat-file", "-e", `${input.baseSha}^{commit}`]);
      git(repository, ["cat-file", "-e", `${input.candidateTreeSha}^{tree}`]);

      const candidatePath = path.join(
        root,
        "candidates",
        `${paths.key}-${randomUUID()}`,
      );
      fs.mkdirSync(candidatePath, { recursive: true });
      try {
        git(candidatePath, ["init", "--initial-branch=main"]);
        git(candidatePath, ["config", "core.logAllRefUpdates", "false"]);
        const sourceTrustConfig = path.join(
          candidatePath,
          ".git",
          "ralph-source-trust.config",
        );
        git(candidatePath, [
          "config",
          "--file",
          sourceTrustConfig,
          "--add",
          "safe.directory",
          repository,
        ]);
        git(candidatePath, [
          "config",
          "--file",
          sourceTrustConfig,
          "--add",
          "safe.directory",
          repositoryGitDirectory,
        ]);
        try {
          git(
            candidatePath,
            [
              "fetch",
              "--no-tags",
              "--no-write-fetch-head",
              repository,
              input.baseSha,
              input.candidateTreeSha,
            ],
            {
              environment: { GIT_CONFIG_GLOBAL: sourceTrustConfig },
              safeDirectories: [repository, repositoryGitDirectory],
            },
          );
        } finally {
          fs.rmSync(sourceTrustConfig, { force: true });
        }
        const verificationCommitSha = git(
          candidatePath,
          ["commit-tree", input.candidateTreeSha, "-p", input.baseSha],
          {
            input: "Ralph private verification candidate\n",
            environment: {
              GIT_AUTHOR_NAME: "Ralph Verification",
              GIT_AUTHOR_EMAIL: "ralph-verification@example.invalid",
              GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
              GIT_COMMITTER_NAME: "Ralph Verification",
              GIT_COMMITTER_EMAIL: "ralph-verification@example.invalid",
              GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
            },
          },
        );
        if (!isSha1(verificationCommitSha)) {
          throw new Error("verification workspace commit failed integrity validation");
        }
        git(candidatePath, ["checkout", "--detach", "--force", verificationCommitSha]);
        const dependencyLink = path.join(candidatePath, "node_modules");
        if (fs.existsSync(dependencyLink)) {
          throw new Error("candidate tree contains a node_modules entry");
        }
        fs.symlinkSync(
          dependencies,
          dependencyLink,
          process.platform === "win32" ? "junction" : "dir",
        );
        const manifest = expectedManifest(
          input,
          paths,
          verificationCommitSha,
        );
        validatePrepared({ ...manifest, worktreePath: candidatePath });
        fs.mkdirSync(path.dirname(paths.worktreePath), { recursive: true });
        fs.renameSync(candidatePath, paths.worktreePath);
        if (!publishDurably(paths.manifestPath, manifest)) {
          throw new Error("verification workspace manifest publication raced");
        }
        return validatePrepared(manifest);
      } finally {
        if (fs.existsSync(candidatePath)) {
          fs.rmSync(candidatePath, { recursive: true, force: true });
        }
      }
    },

    cleanup(rawReceipt) {
      const input = normalizedInput(rawReceipt);
      const paths = pathsFor(input);
      if (!fs.existsSync(paths.manifestPath)) {
        if (fs.existsSync(paths.worktreePath)) {
          throw new Error("verification workspace cleanup lacks its manifest");
        }
        return;
      }
      const manifest = readManifest(paths.manifestPath);
      if (!sameValue(manifest, rawReceipt)) {
        throw new Error("verification workspace cleanup receipt changed");
      }
      validatePrepared(manifest);
      const resolved = fs.realpathSync.native(manifest.worktreePath);
      if (!within(root, resolved) || resolved === root) {
        throw new Error("verification workspace cleanup escaped its root");
      }
      fs.rmSync(resolved, { recursive: true, force: true });
      fs.rmSync(paths.manifestPath, { force: true });
    },
  };
}
