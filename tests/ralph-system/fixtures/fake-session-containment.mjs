import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import {
  createSafeEnvironment,
  writeFileDurably,
} from "./test-primitives.mjs";

/*
 * Portable contract fake only.
 *
 * This boundary proves that the durable supervisor does not publish a
 * termination receipt until its containment provider reports zero live,
 * identity-matched child processes. It deliberately does NOT claim that a
 * Windows Job Object or a WSL process group contains every hostile descendant.
 * Those are separate platform-acceptance tests for the production adapters.
 */
export const FAKE_CONTAINMENT_GUARANTEE = "identity-ledger-contract-only";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function processIdentityIsAlive(processId, processIdentity) {
  try {
    process.kill(processId, 0);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code !== "EPERM") throw error;
  }
  return readProcessIdentity(processId) === processIdentity;
}

function readRecords(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8")),
    );
}

function publishOnce(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    writeFileDurably(filePath, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(`conflicting fake containment publication at ${filePath}`);
    }
    return existing;
  }
}

async function waitForProcessIdentity(processId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const identity = readProcessIdentity(processId);
    if (identity) return identity;
    await sleep(10);
  }
  throw new Error("fake containment could not identify its launched child");
}

export function createFakeSessionContainment({ fixtureRoot, sessionId }) {
  const processDirectory = path.join(fixtureRoot, "contained-processes");
  const launchAttemptPath = path.join(fixtureRoot, "launch-attempt.json");
  const launchReleasePath = path.join(fixtureRoot, "launch-release");
  const terminationRequestPath = path.join(
    fixtureRoot,
    "containment-termination-request.json",
  );

  function inspect() {
    const knownProcesses = readRecords(processDirectory).filter(
      (record) => record.sessionId === sessionId,
    );
    const liveProcesses = knownProcesses.filter((record) =>
      processIdentityIsAlive(record.processId, record.processIdentity),
    );
    return {
      guarantee: FAKE_CONTAINMENT_GUARANTEE,
      knownProcesses,
      liveProcesses,
      liveProcessCount: liveProcesses.length,
    };
  }

  return {
    guarantee: FAKE_CONTAINMENT_GUARANTEE,

    async launch({ authorization, child }) {
      if (
        typeof authorization?.authorizationId !== "string" ||
        !authorization.authorizationId.trim() ||
        typeof authorization?.planDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(authorization.planDigest)
      ) {
        throw new Error("fake containment rejected an unauthorized child launch");
      }

      publishOnce(launchAttemptPath, {
        sessionId,
        authorizationId: authorization.authorizationId,
        planDigest: authorization.planDigest,
      });
      if (child.holdBeforeSpawn === true) {
        const deadline = Date.now() + 10_000;
        while (!fs.existsSync(launchReleasePath)) {
          if (Date.now() >= deadline) {
            throw new Error("fake containment launch barrier timed out");
          }
          await sleep(10);
        }
      }

      const launched = spawn(child.executable, child.args, {
        cwd: child.cwd,
        env: createSafeEnvironment(process.env, {
          ...child.environment,
          RALPH_V2_SESSION_ID: sessionId,
          RALPH_V2_AUTHORIZATION_ID: authorization.authorizationId,
          RALPH_V2_PLAN_DIGEST: authorization.planDigest,
        }),
        stdio: "ignore",
        windowsHide: true,
      });
      if (!launched.pid) throw new Error("fake containment child did not start");
      const processIdentity = await waitForProcessIdentity(launched.pid);
      const completion = new Promise((resolve, reject) => {
        launched.once("error", reject);
        launched.once("close", (exitCode, signal) =>
          resolve({ exitCode, signal }),
        );
      });
      return {
        processId: launched.pid,
        processIdentity,
        completion,
      };
    },

    inspect,

    async terminate({ operationId, reason }) {
      const request = publishOnce(terminationRequestPath, {
        sessionId,
        operationId,
        reason,
      });
      if (request.operationId !== operationId) {
        throw new Error("fake containment termination operation conflicts");
      }

      const deadline = Date.now() + 10_000;
      let observation = inspect();
      while (observation.liveProcessCount !== 0) {
        if (Date.now() >= deadline) {
          throw new Error("fake containment still has live processes");
        }
        await sleep(10);
        observation = inspect();
      }
      return {
        kind: "contained-processes-terminated",
        sessionId,
        operationId,
        processTreeTerminated: true,
        ...observation,
      };
    },
  };
}

