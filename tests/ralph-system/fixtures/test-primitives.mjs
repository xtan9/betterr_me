import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ENVIRONMENT_ALLOWLIST = [
  "COMSPEC",
  "ComSpec",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "Path",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TZ",
  "WINDIR",
  "windir",
  "GIT_TRACE2_EVENT",
];

export function createSafeEnvironment(source = process.env, overrides = {}) {
  const environment = {};
  for (const name of ENVIRONMENT_ALLOWLIST) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  return {
    ...environment,
    GCM_INTERACTIVE: "Never",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    ...overrides,
  };
}

export function assertPathWithin(root, candidate, purpose) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${purpose} escapes ${resolvedRoot}: ${resolvedCandidate}`);
  }

  const realRoot = fs.realpathSync.native(resolvedRoot);
  let existingAncestor = resolvedCandidate;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(`${purpose} has no existing ancestor: ${resolvedCandidate}`);
    }
    existingAncestor = parent;
  }
  const realAncestor = fs.realpathSync.native(existingAncestor);
  const realCandidate = path.resolve(
    realAncestor,
    path.relative(existingAncestor, resolvedCandidate),
  );
  const realRelative = path.relative(realRoot, realCandidate);
  const comparableRelative =
    process.platform === "win32" ? realRelative.toLowerCase() : realRelative;
  if (
    !comparableRelative ||
    comparableRelative.startsWith("..") ||
    path.isAbsolute(realRelative)
  ) {
    throw new Error(`${purpose} escapes real path ${realRoot}: ${realCandidate}`);
  }
  return resolvedCandidate;
}

export function runGit(cwd, args, allowFailure = false) {
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
    env: createSafeEnvironment(),
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
