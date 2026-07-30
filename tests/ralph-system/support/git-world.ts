import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function git(cwd: string, args: string[], allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

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

  fs.mkdirSync(seedPath);
  git(seedPath, ["init", "--initial-branch=main"]);
  git(seedPath, ["config", "user.name", "Ralph System Test"]);
  git(seedPath, ["config", "user.email", "ralph-system@example.invalid"]);
  fs.writeFileSync(path.join(seedPath, "README.md"), "# System fixture\n");
  git(seedPath, ["add", "README.md"]);
  git(seedPath, ["commit", "-m", "seed main"]);
  git(root, ["clone", "--bare", seedPath, remotePath]);
  git(root, ["clone", remotePath, controllerPath]);
  git(controllerPath, ["config", "user.name", "Ralph System Test"]);
  git(controllerPath, ["config", "user.email", "ralph-system@example.invalid"]);

  return {
    root,
    remotePath,
    controllerPath,
    runtimePath,
    mainSha: git(controllerPath, ["rev-parse", "origin/main"]).stdout.trim(),
    cleanup() {
      const temporaryDirectory = path.resolve(os.tmpdir());
      const resolvedRoot = path.resolve(root);
      const relative = path.relative(temporaryDirectory, resolvedRoot);
      if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative)
      ) {
        throw new Error(`refusing to remove unexpected test path ${resolvedRoot}`);
      }
      fs.rmSync(resolvedRoot, { recursive: true, force: true });
    },
  };
}
