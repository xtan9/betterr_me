import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTestAdapters } from "./test-adapters.mjs";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function writeMarker(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

async function holdAt(config, point, payload = {}) {
  if (config.stopTest?.holdPoint !== point) return;
  writeMarker(config.stopTest.reachedPath, { point, ...payload });
  while (!fs.existsSync(config.stopTest.releasePath)) await sleep(20);
}

function processAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function terminateTree(child) {
  if (!child || !processAlive(child.pid)) return;
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) throw new Error("test could not locate taskkill.exe");
    const taskkill = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    await new Promise((resolve, reject) => {
      taskkill.once("error", reject);
      taskkill.once("close", resolve);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + 5_000;
  while (processAlive(child.pid) && Date.now() < deadline) await sleep(20);
}

function processTreeIds(config) {
  const processTree = JSON.parse(
    fs.readFileSync(config.stopTest.processTreePath, "utf8"),
  );
  return [processTree.workerPid, processTree.grandchildPid];
}

function assertProcessTreeAlive(config) {
  if (processTreeIds(config).some((processId) => !processAlive(processId))) {
    throw new Error("worker outcome fixture lost its live descendant tree");
  }
}

async function waitForProcessTreeDeath(config) {
  const processIds = processTreeIds(config);
  const deadline = Date.now() + 5_000;
  while (
    processIds.some((processId) => processAlive(processId)) &&
    Date.now() < deadline
  ) {
    await sleep(20);
  }
  if (processIds.some((processId) => processAlive(processId))) {
    throw new Error("worker process tree survived authoritative termination");
  }
}

export function createStopBoundaryAdapters(config) {
  const adapters = createTestAdapters(config);

  const verify = adapters.verifier.verify.bind(adapters.verifier);
  adapters.verifier.verify = async (input) => {
    const receipt = await verify(input);
    await holdAt(config, "verifier-held", {
      issueNumber: input.issue.number,
      candidateTreeSha: input.candidateTreeSha,
    });
    return receipt;
  };

  const createDraftPullRequest =
    adapters.github.createDraftPullRequest.bind(adapters.github);
  adapters.github.createDraftPullRequest = async (input) => {
    await holdAt(config, "draft-pr-effect", {
      issueNumber: input.issueNumber,
      operationId: input.operationId,
      headBranch: input.headBranch,
      headSha: input.headSha,
    });
    return createDraftPullRequest(input);
  };

  const checkpoint = adapters.lifecycle.checkpoint.bind(adapters.lifecycle);
  adapters.lifecycle.checkpoint = async (input) => {
    await checkpoint(input);
    if (input.point === "branch-pushed") {
      await holdAt(config, "branch-pushed", input);
    }
  };

  const processWorkerModes = new Set([
    "noncooperative-process",
    "wrong-session-abort-process",
    "reject-on-abort-process",
  ]);
  if (processWorkerModes.has(config.stopTest?.workerMode)) {
    let activeChild = null;
    let activeCompletion = null;
    adapters.worker.implement = async (input) => {
      const workerFixture = fileURLToPath(
        new URL("./noncooperative-stop-worker.mjs", import.meta.url),
      );
      const change = config.stopTest.workerChange;
      activeChild = spawn(
        process.execPath,
        [
          workerFixture,
          "worker",
          input.worktreePath,
          config.stopTest.processTreePath,
          change.path,
          change.content,
        ],
        {
          cwd: input.worktreePath,
          detached: process.platform !== "win32",
          env: process.env,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      activeCompletion = new Promise((resolve, reject) => {
        activeChild.once("error", reject);
        activeChild.once("exit", () =>
          resolve({ kind: "aborted", sessionId: input.sessionId }),
        );
      });
      if (config.stopTest.workerMode === "noncooperative-process") {
        return activeCompletion;
      }
      while (!input.signal?.aborted) await sleep(20);
      assertProcessTreeAlive(config);
      if (config.stopTest.workerMode === "wrong-session-abort-process") {
        writeMarker(config.stopTest.workerOutcomePath, {
          kind: "aborted",
          sessionId: `${input.sessionId}:wrong-session`,
          processTreeAlive: true,
        });
        return {
          kind: "aborted",
          sessionId: `${input.sessionId}:wrong-session`,
        };
      }
      writeMarker(config.stopTest.workerOutcomePath, {
        kind: "rejected",
        sessionId: input.sessionId,
        processTreeAlive: true,
      });
      throw new Error("worker adapter rejected while its child tree survived");
    };

    // Process-backed workers need an explicit escalation seam because an
    // AbortSignal cannot terminate an uncooperative descendant tree.
    adapters.worker.terminate = async (input) => {
      writeMarker(config.stopTest.terminationStartedPath, {
        issueNumber: input.issueNumber,
        sessionId: input.sessionId,
      });
      await terminateTree(activeChild);
      if (activeCompletion) await activeCompletion;
      await waitForProcessTreeDeath(config);
      writeMarker(config.stopTest.processTreeDeadPath, {
        issueNumber: input.issueNumber,
        sessionId: input.sessionId,
      });
      if (config.stopTest.workerMode !== "noncooperative-process") {
        while (!fs.existsSync(config.stopTest.terminationReceiptReleasePath)) {
          await sleep(20);
        }
      }
      return {
        kind: "terminated",
        sessionId: input.sessionId,
        processTreeTerminated: true,
      };
    };
  }

  return adapters;
}
