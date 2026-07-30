import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";
import {
  assertCheckoutCleaned,
  assertPublishedCandidate,
} from "./support/assertions";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const RUN_ARGUMENTS = [
  "run",
  "--mode",
  "PrOnly",
  "--max-issues",
  "1",
  "--json",
];

type HostResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string[];
  stderr: string[];
};

function parseHostResult(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  signal: NodeJS.Signals | null = null,
): HostResult {
  return {
    exitCode,
    signal,
    stdout: stdout.trim().split(/\r?\n/).filter(Boolean),
    stderr: stderr.trim().split(/\r?\n/).filter(Boolean),
  };
}

function processIsAlive(processId: number) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
}

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMilliseconds = 10_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function readRecords(directory: string) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8")),
    );
}

describe("Ralph v2 surviving implementation worker recovery", () => {
  it("attaches to the one stable worker session after its controller crashes", async () => {
    const world = createGitWorld();
    const expectedChanges = [
      {
        path: "src/surviving-worker.txt",
        content: "completed by the original worker\n",
        mode: "100644",
        status: "A",
      },
    ];
    const baseScenario = createSystemScenario(world, {
      issues: [
        {
          number: 602,
          title: "Recover the live implementation session",
          body: "Publish the result without starting another implementation worker.",
        },
      ],
      workerChanges: expectedChanges.map(({ path: changePath, content }) => ({
        path: changePath,
        content,
      })),
      expectedChanges,
    });
    const configPath = path.join(world.root, "system-config.json");
    const hostPath = fileURLToPath(
      new URL("./fixtures/surviving-worker-host.mjs", import.meta.url),
    );
    const fixtureRoot = path.join(world.root, "surviving-worker");
    const startsPath = path.join(fixtureRoot, "starts");
    const activePath = path.join(fixtureRoot, "active");
    const attachmentsPath = path.join(fixtureRoot, "attachments");
    const observationsPath = path.join(fixtureRoot, "session-observations");
    const receiptsPath = path.join(fixtureRoot, "receipts");
    const releasePath = path.join(fixtureRoot, "release");
    const controllers: Array<{
      child: ChildProcess;
      completion: Promise<HostResult>;
    }> = [];

    const environment = () =>
      createSafeEnvironment(process.env, {
        GIT_TRACE2_EVENT: world.gitTracePath,
        HOME: world.root,
        USERPROFILE: world.root,
      });
    const hostArguments = (args: string[]) => [
      hostPath,
      configPath,
      "--",
      ...args,
    ];
    const startHost = (args: string[]) => {
      const child = spawn(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        env: environment(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      const completion = new Promise<HostResult>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => {
          resolve(parseHostResult(exitCode, stdout, stderr, signal));
        });
      });
      const controller = { child, completion };
      controllers.push(controller);
      return controller;
    };
    const runHost = (args: string[]) => {
      const result = spawnSync(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        encoding: "utf8",
        env: environment(),
        timeout: 10_000,
        windowsHide: true,
      });
      if (result.error) throw result.error;
      return parseHostResult(
        result.status,
        result.stdout,
        result.stderr,
        result.signal,
      );
    };
    const releaseWorker = () => {
      fs.mkdirSync(fixtureRoot, { recursive: true });
      fs.writeFileSync(releasePath, "release\n");
    };

    try {
      const first = startHost(RUN_ARGUMENTS);
      await waitUntil(
        () => readRecords(startsPath).length === 1,
        "the separate implementation worker",
      );
      const originalStart = readRecords(startsPath)[0];
      expect(processIsAlive(originalStart.processId)).toBe(true);

      expect(first.child.kill("SIGKILL")).toBe(true);
      const crashed = await first.completion;
      expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
      expect(processIsAlive(originalStart.processId)).toBe(true);

      const crashedState = JSON.parse(
        fs.readFileSync(path.join(world.runtimePath, "state-v2.json"), "utf8"),
      );
      const stableSessionId = crashedState.workerLease?.sessionId;
      expect(stableSessionId).toBe(originalStart.sessionId);
      expect(crashedState.issues[602]).toMatchObject({
        disposition: "implementing",
        sessionId: stableSessionId,
      });

      const recovered = startHost(RUN_ARGUMENTS);
      await waitUntil(
        () => readRecords(attachmentsPath).length >= 1,
        "the recovery controller to attach to the original worker",
      );
      expect(
        readRecords(observationsPath).some(
          (observation) =>
            observation.kind === "running" &&
            observation.processId !== first.child.pid,
        ),
      ).toBe(true);

      expect(processIsAlive(originalStart.processId)).toBe(true);
      releaseWorker();
      const recoveredResult = await recovered.completion;
      await waitUntil(
        () => !fs.existsSync(activePath) || fs.readdirSync(activePath).length === 0,
        "all implementation worker processes to exit",
      );

      expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
      expect(recoveredResult.stderr).toEqual([]);

      const starts = readRecords(startsPath);
      const externalState = baseScenario.inspectExternalState();
      expect(externalState.claimRequests).toHaveLength(1);
      expect(externalState.verificationRequests).toHaveLength(1);
      expect(externalState.pullRequestRequests).toHaveLength(1);
      expect(externalState.pullRequests).toHaveLength(1);
      const pullRequest = externalState.pullRequests[0];
      const remoteHead = assertPublishedCandidate({
        remotePath: world.remotePath,
        mainSha: world.mainSha,
        headBranch: pullRequest.headBranch,
        headSha: pullRequest.headSha,
        verifiedTreeShas: externalState.verificationRequests.map(
          (verification: { candidateTreeSha: string }) =>
            verification.candidateTreeSha,
        ),
        expectedChanges,
      });
      assertCheckoutCleaned({
        controllerPath: world.controllerPath,
        runtimePath: world.runtimePath,
        controllerHeadSha: world.staleMainSha,
        issueBranch: pullRequest.headBranch,
        workerPath: path.join(world.runtimePath, "worktrees", "current"),
      });

      const status = runHost(["status", "--json"]);
      expect(status.exitCode, status.stderr.join("\n")).toBe(0);
      expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
        workerLease: null,
        issues: [
          {
            number: 602,
            disposition: "published",
            headSha: remoteHead,
            pullRequestNumber: 1,
          },
        ],
      });

      expect(starts).toHaveLength(1);
      expect(new Set(starts.map((start) => start.sessionId))).toEqual(
        new Set([stableSessionId]),
      );
      expect(Math.max(...starts.map((start) => start.activeWorkers))).toBe(1);
      expect(readRecords(receiptsPath)).toEqual([
        expect.objectContaining({
          kind: "completed",
          sessionId: stableSessionId,
          workerId: originalStart.workerId,
          processId: originalStart.processId,
        }),
      ]);
    } finally {
      releaseWorker();
      for (const controller of controllers) {
        if (
          controller.child.exitCode === null &&
          controller.child.signalCode === null
        ) {
          controller.child.kill("SIGKILL");
        }
      }
      await Promise.allSettled(controllers.map(({ completion }) => completion));
      for (const activeWorker of readRecords(activePath)) {
        if (processIsAlive(activeWorker.processId)) {
          try {
            process.kill(activeWorker.processId, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
      }
      fs.rmSync(activePath, { recursive: true, force: true });
      world.cleanup();
    }
  });

  it("does not duplicate execution when the controller crashes before worker registration", async () => {
    const world = createGitWorld();
    const expectedChanges = [
      {
        path: "src/registration-window.txt",
        content: "mutated by one execution owner\n",
        mode: "100644",
        status: "A",
      },
    ];
    const baseScenario = createSystemScenario(world, {
      issues: [
        {
          number: 603,
          title: "Close the spawn registration window",
          body: "Allow exactly one implementation owner to mutate the checkout.",
        },
      ],
      workerChanges: expectedChanges.map(({ path: changePath, content }) => ({
        path: changePath,
        content,
      })),
      expectedChanges,
    });
    const configPath = path.join(world.root, "system-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.survivingWorker = {
      holdBeforeOwnership: true,
      holdBeforeMutation: true,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const hostPath = fileURLToPath(
      new URL("./fixtures/surviving-worker-host.mjs", import.meta.url),
    );
    const fixtureRoot = path.join(world.root, "surviving-worker");
    const spawnedPath = path.join(fixtureRoot, "spawned");
    const startsPath = path.join(fixtureRoot, "starts");
    const mutationsPath = path.join(fixtureRoot, "mutations");
    const receiptsPath = path.join(fixtureRoot, "receipts");
    const errorsPath = path.join(fixtureRoot, "errors");
    const activePath = path.join(fixtureRoot, "active");
    const attachmentsPath = path.join(fixtureRoot, "attachments");
    const observationsPath = path.join(fixtureRoot, "session-observations");
    const ownershipReleasePath = path.join(fixtureRoot, "ownership-release");
    const mutationReleasePath = path.join(fixtureRoot, "mutation-release");
    const completionReleasePath = path.join(fixtureRoot, "release");
    const controllers: Array<{
      child: ChildProcess;
      completion: Promise<HostResult>;
    }> = [];

    const environment = () =>
      createSafeEnvironment(process.env, {
        GIT_TRACE2_EVENT: world.gitTracePath,
        HOME: world.root,
        USERPROFILE: world.root,
      });
    const hostArguments = (args: string[]) => [
      hostPath,
      configPath,
      "--",
      ...args,
    ];
    const startHost = (args: string[]) => {
      const child = spawn(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        env: environment(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      const completion = new Promise<HostResult>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => {
          resolve(parseHostResult(exitCode, stdout, stderr, signal));
        });
      });
      const controller = { child, completion };
      controllers.push(controller);
      return controller;
    };
    const runHost = (args: string[]) => {
      const result = spawnSync(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        encoding: "utf8",
        env: environment(),
        timeout: 10_000,
        windowsHide: true,
      });
      if (result.error) throw result.error;
      return parseHostResult(
        result.status,
        result.stdout,
        result.stderr,
        result.signal,
      );
    };
    const release = (filePath: string) => {
      fs.mkdirSync(fixtureRoot, { recursive: true });
      fs.writeFileSync(filePath, "release\n");
    };

    try {
      const first = startHost(RUN_ARGUMENTS);
      await waitUntil(
        () => readRecords(spawnedPath).length === 1,
        "the first worker to spawn before ownership",
      );
      const originalSpawn = readRecords(spawnedPath)[0];
      expect(readRecords(startsPath)).toEqual([]);
      expect(readRecords(mutationsPath)).toEqual([]);
      expect(processIsAlive(originalSpawn.processId)).toBe(true);

      expect(first.child.kill("SIGKILL")).toBe(true);
      const crashed = await first.completion;
      expect(crashed.exitCode === 0 && crashed.signal === null).toBe(false);
      expect(processIsAlive(originalSpawn.processId)).toBe(true);

      const crashedState = JSON.parse(
        fs.readFileSync(path.join(world.runtimePath, "state-v2.json"), "utf8"),
      );
      const stableSessionId = crashedState.workerLease?.sessionId;
      expect(stableSessionId).toBe(originalSpawn.sessionId);

      const recovered = startHost(RUN_ARGUMENTS);
      await waitUntil(
        () =>
          readRecords(spawnedPath).length >= 2 ||
          readRecords(attachmentsPath).some(
            (attachment) => attachment.processId !== first.child.pid,
          ) ||
          readRecords(observationsPath).some(
            (observation) =>
              ["starting", "running"].includes(observation.kind) &&
              observation.processId !== first.child.pid,
          ) ||
          recovered.child.exitCode !== null ||
          recovered.child.signalCode !== null,
        "recovery to attach to starting work or spawn a contender",
      );
      expect(processIsAlive(originalSpawn.processId)).toBe(true);
      expect(readRecords(startsPath)).toEqual([]);
      expect(readRecords(mutationsPath)).toEqual([]);

      release(ownershipReleasePath);
      await waitUntil(
        () =>
          readRecords(startsPath).length >= 2 ||
          (readRecords(startsPath).length === 1 &&
            readRecords(attachmentsPath).length >= 1) ||
          readRecords(errorsPath).length >= 1 ||
          recovered.child.exitCode !== null ||
          recovered.child.signalCode !== null,
        "execution ownership to settle",
      );
      expect(readRecords(errorsPath)).toEqual([]);
      const ownersBeforeMutation = readRecords(startsPath);
      expect(readRecords(mutationsPath)).toEqual([]);

      release(mutationReleasePath);
      await waitUntil(
        () =>
          readRecords(mutationsPath).length >= ownersBeforeMutation.length ||
          recovered.child.exitCode !== null ||
          recovered.child.signalCode !== null,
        "every execution owner to reach its mutation boundary",
      );
      release(completionReleasePath);

      const recoveredResult = await recovered.completion;
      await waitUntil(
        () => !fs.existsSync(activePath) || fs.readdirSync(activePath).length === 0,
        "all registration-window workers to exit",
      );
      expect(recoveredResult.exitCode, recoveredResult.stderr.join("\n")).toBe(0);
      expect(recoveredResult.stderr).toEqual([]);

      const externalState = baseScenario.inspectExternalState();
      expect(externalState.claimRequests).toHaveLength(1);
      expect(externalState.verificationRequests).toHaveLength(1);
      expect(externalState.pullRequestRequests).toHaveLength(1);
      expect(externalState.pullRequests).toHaveLength(1);
      const pullRequest = externalState.pullRequests[0];
      const remoteHead = assertPublishedCandidate({
        remotePath: world.remotePath,
        mainSha: world.mainSha,
        headBranch: pullRequest.headBranch,
        headSha: pullRequest.headSha,
        verifiedTreeShas: externalState.verificationRequests.map(
          (verification: { candidateTreeSha: string }) =>
            verification.candidateTreeSha,
        ),
        expectedChanges,
      });
      assertCheckoutCleaned({
        controllerPath: world.controllerPath,
        runtimePath: world.runtimePath,
        controllerHeadSha: world.staleMainSha,
        issueBranch: pullRequest.headBranch,
        workerPath: path.join(world.runtimePath, "worktrees", "current"),
      });
      const status = runHost(["status", "--json"]);
      expect(status.exitCode, status.stderr.join("\n")).toBe(0);
      expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
        workerLease: null,
        issues: [
          {
            number: 603,
            disposition: "published",
            headSha: remoteHead,
            pullRequestNumber: 1,
          },
        ],
      });

      const owners = readRecords(startsPath);
      const mutations = readRecords(mutationsPath);
      const receipts = readRecords(receiptsPath);
      expect(owners).toHaveLength(1);
      expect(Math.max(...owners.map((owner) => owner.activeWorkers))).toBe(1);
      expect(owners[0].sessionId).toBe(stableSessionId);
      expect(mutations).toEqual([
        expect.objectContaining({
          workerId: owners[0].workerId,
          sessionId: stableSessionId,
        }),
      ]);
      expect(receipts).toEqual([
        expect.objectContaining({
          workerId: owners[0].workerId,
          sessionId: stableSessionId,
          kind: "completed",
        }),
      ]);
    } finally {
      release(ownershipReleasePath);
      release(mutationReleasePath);
      release(completionReleasePath);
      for (const controller of controllers) {
        if (
          controller.child.exitCode === null &&
          controller.child.signalCode === null
        ) {
          controller.child.kill("SIGKILL");
        }
      }
      await Promise.allSettled(controllers.map(({ completion }) => completion));
      const spawnedWorkers = readRecords(spawnedPath);
      for (const worker of spawnedWorkers) {
        if (!processIsAlive(worker.processId)) continue;
        try {
          process.kill(worker.processId, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await waitUntil(
        () =>
          spawnedWorkers.every((worker) => !processIsAlive(worker.processId)),
        "registration-window worker cleanup",
      );
      fs.rmSync(activePath, { recursive: true, force: true });
      world.cleanup();
    }
  });
});
