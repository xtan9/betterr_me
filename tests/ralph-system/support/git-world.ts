import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertPathWithin } from "./test-paths";

export function git(cwd: string, args: string[], allowFailure = false) {
  const result = spawnSync("git", [
    "-c",
    "commit.gpgSign=false",
    "-c",
    "tag.gpgSign=false",
    "-c",
    "core.autocrlf=false",
    ...args,
  ], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    env: {
      ...process.env,
      GCM_INTERACTIVE: "Never",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    },
  });

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

export function createGitWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-system-"));
  const seedPath = path.join(root, "seed");
  const remotePath = path.join(root, "origin.git");
  const controllerPath = path.join(root, "controller");
  const runtimePath = path.join(root, "runtime");
  const eventLogPath = path.join(remotePath, "ralph-events.jsonl");
  const gitTracePath = path.join(root, "git-trace.jsonl");

  fs.mkdirSync(seedPath);
  git(seedPath, ["init", "--initial-branch=main"]);
  git(seedPath, ["config", "user.name", "Ralph System Test"]);
  git(seedPath, ["config", "user.email", "ralph-system@example.invalid"]);
  fs.writeFileSync(path.join(seedPath, "README.md"), "# System fixture\n");
  git(seedPath, ["add", "README.md"]);
  git(seedPath, ["commit", "-m", "seed main"]);
  git(root, ["clone", "--bare", seedPath, remotePath]);
  const postReceiveHook = path.join(remotePath, "hooks", "post-receive");
  fs.writeFileSync(
    postReceiveHook,
    [
      "#!/bin/sh",
      "while read old_sha new_sha ref_name",
      "do",
      "  printf '{\"kind\":\"remote-ref-updated\",\"oldSha\":\"%s\",\"newSha\":\"%s\",\"ref\":\"%s\"}\\n' \"$old_sha\" \"$new_sha\" \"$ref_name\" >> \"$(git rev-parse --git-dir)/ralph-events.jsonl\"",
      "done",
      "",
    ].join("\n"),
  );
  fs.chmodSync(postReceiveHook, 0o755);
  git(root, ["clone", remotePath, controllerPath]);
  git(controllerPath, ["config", "user.name", "Ralph System Test"]);
  git(controllerPath, ["config", "user.email", "ralph-system@example.invalid"]);

  return {
    root,
    remotePath,
    controllerPath,
    runtimePath,
    eventLogPath,
    gitTracePath,
    mainSha: git(controllerPath, ["rev-parse", "origin/main"]).stdout.trim(),
    cleanup() {
      const temporaryDirectory = path.resolve(os.tmpdir());
      const resolvedRoot = assertPathWithin(
        temporaryDirectory,
        root,
        "system-test cleanup",
      );
      if (!path.basename(resolvedRoot).startsWith("ralph-v2-system-")) {
        throw new Error(`refusing to remove unexpected test path ${resolvedRoot}`);
      }
      const realRoot = fs.realpathSync.native(resolvedRoot);
      if (path.normalize(realRoot).toLowerCase() !== path.normalize(resolvedRoot).toLowerCase()) {
        throw new Error(
          `refusing to remove redirected test path ${resolvedRoot} -> ${realRoot}`,
        );
      }
      fs.rmSync(resolvedRoot, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    },
  };
}
