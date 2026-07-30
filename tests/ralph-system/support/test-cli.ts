import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSafeEnvironment } from "../fixtures/test-primitives.mjs";

type GitWorld = {
  controllerPath: string;
  remotePath: string;
  runtimePath: string;
  mainSha: string;
  eventLogPath: string;
  gitTracePath: string;
  root: string;
};

export function createSystemScenario(
  world: GitWorld,
  input: {
    issues: Array<{ number: number; title: string; body: string }>;
    workerChanges: Array<{ path: string; content: string }>;
    expectedChanges: Array<{
      path: string;
      content: string;
      mode: string;
      status: string;
    }>;
    verification?: "pass" | "fail";
  },
) {
  const configPath = path.join(world.root, "system-config.json");
  const externalStatePath = path.join(world.root, "external-state.json");
  fs.writeFileSync(
    externalStatePath,
    `${JSON.stringify(
      {
        activeWorkers: 0,
        maximumActiveWorkers: 0,
        sessions: [],
        claims: [],
        claimRequests: [],
        pullRequests: [],
        pullRequestRequests: [],
        verificationRequests: [],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        repositoryPath: world.controllerPath,
        remotePath: world.remotePath,
        runtimePath: world.runtimePath,
        mainSha: world.mainSha,
        eventLogPath: world.eventLogPath,
        externalStatePath,
        now: "2026-07-30T12:00:00.000Z",
        verification: input.verification ?? "pass",
        ...input,
      },
      null,
      2,
    )}\n`,
  );

  const hostPath = fileURLToPath(
    new URL("../fixtures/test-host.mjs", import.meta.url),
  );

  return {
    run(args: string[]) {
      const result = spawnSync(
        process.execPath,
        [hostPath, configPath, "--", ...args],
        {
          cwd: world.controllerPath,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          env: createSafeEnvironment(process.env, {
            GIT_TRACE2_EVENT: world.gitTracePath,
            HOME: world.root,
            USERPROFILE: world.root,
          }),
        },
      );
      if (result.error || result.signal) {
        throw new Error(
          `Ralph test host did not exit normally: ${
            result.error?.message ?? `signal ${result.signal}`
          }`,
        );
      }
      return {
        exitCode: result.status,
        stdout: result.stdout.trim().split(/\r?\n/).filter(Boolean),
        stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean),
      };
    },
    inspectExternalState() {
      return JSON.parse(fs.readFileSync(externalStatePath, "utf8"));
    },
    inspectEvents() {
      if (!fs.existsSync(world.eventLogPath)) return [];
      return fs.readFileSync(world.eventLogPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
    inspectGitTrace() {
      if (!fs.existsSync(world.gitTracePath)) return [];
      return fs.readFileSync(world.gitTracePath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}
