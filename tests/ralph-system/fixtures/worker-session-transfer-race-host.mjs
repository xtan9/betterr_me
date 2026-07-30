import fs from "node:fs";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";

if (isMainThread) {
  const [configPath] = process.argv.slice(2);
  if (!configPath) {
    throw new Error("usage: worker-session-transfer-race-host.mjs <config.json>");
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const registry = createWorkerSessionRegistry(config.sessionRoot);
  const reservation = registry.claim({
    sessionId: config.sessionId,
    workerId: "transfer-supervisor",
  });
  if (!reservation.acquired) {
    throw new Error("fixture could not reserve the transfer session");
  }
  const transfer = (workerId) =>
    new Promise((resolve, reject) => {
      const thread = new Worker(new URL(import.meta.url), {
        workerData: {
          sessionRoot: config.sessionRoot,
          sessionId: config.sessionId,
          expectedOwner: reservation.owner,
          workerId,
        },
      });
      thread.once("message", resolve);
      thread.once("error", reject);
      thread.once("exit", (exitCode) => {
        if (exitCode !== 0) reject(new Error(`transfer thread exited ${exitCode}`));
      });
    });
  const attempts = await Promise.all([
    transfer("incompatible-transfer-a"),
    transfer("incompatible-transfer-b"),
  ]);
  fs.writeFileSync(
    config.resultPath,
    `${JSON.stringify(
      { attempts, owner: registry.inspect(config.sessionId) },
      null,
      2,
    )}\n`,
  );
} else {
  const registry = createWorkerSessionRegistry(workerData.sessionRoot);
  try {
    const owner = registry.transfer({
      sessionId: workerData.sessionId,
      expectedOwner: workerData.expectedOwner,
      workerId: workerData.workerId,
      processId: process.pid,
      processIdentity: readProcessIdentity(process.pid),
    });
    parentPort.postMessage({ status: "won", workerId: workerData.workerId, owner });
  } catch (error) {
    parentPort.postMessage({
      status: "rejected",
      workerId: workerData.workerId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
