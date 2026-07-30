import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertPathWithin,
  runGit,
} from "../fixtures/test-primitives.mjs";

export function git(cwd: string, args: string[], allowFailure = false) {
  return runGit(cwd, args, allowFailure);
}

export function createGitWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-system-"));
  const seedPath = path.join(root, "seed");
  const remotePath = path.join(root, "origin.git");
  const controllerPath = path.join(root, "controller");
  const runtimePath = path.join(root, "runtime");
  const eventLogPath = path.join(remotePath, "ralph-events.jsonl");
  const gitTracePath = path.join(root, "git-trace.jsonl");

  try {
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
    git(seedPath, ["remote", "add", "origin", remotePath]);
    fs.appendFileSync(path.join(seedPath, "README.md"), "\nLatest remote main.\n");
    git(seedPath, ["add", "README.md"]);
    git(seedPath, ["commit", "-m", "advance remote main"]);
    git(seedPath, ["push", "origin", "main"]);
    fs.rmSync(eventLogPath, { force: true });
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }

  return {
    root,
    remotePath,
    controllerPath,
    runtimePath,
    eventLogPath,
    gitTracePath,
    staleMainSha: git(controllerPath, ["rev-parse", "origin/main"]).stdout.trim(),
    mainSha: git(remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim(),
    cleanup() {
      const temporaryDirectory = fs.realpathSync.native(os.tmpdir());
      const resolvedRoot = assertPathWithin(
        temporaryDirectory,
        fs.realpathSync.native(root),
        "system-test cleanup",
      );
      if (!path.basename(resolvedRoot).startsWith("ralph-v2-system-")) {
        throw new Error(`refusing to remove unexpected test path ${resolvedRoot}`);
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
