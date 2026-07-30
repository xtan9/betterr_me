import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SCHEMA_VERSION = 1;

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    stopRequested: false,
    workerLease: null,
    issues: {},
  };
}

function validateState(state, statePath) {
  if (
    !state ||
    state.schemaVersion !== SCHEMA_VERSION ||
    typeof state.stopRequested !== "boolean" ||
    (state.workerLease !== null && typeof state.workerLease !== "object") ||
    !state.issues ||
    typeof state.issues !== "object" ||
    Array.isArray(state.issues)
  ) {
    throw new Error(`Ralph state failed integrity validation at ${statePath}`);
  }
  return state;
}

function writeFileDurably(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function processIsAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

export function createStateStore(runtimePath) {
  const statePath = path.join(runtimePath, "state-v2.json");
  const stopPath = path.join(runtimePath, "STOP");
  const lockPath = path.join(runtimePath, "controller-v2.lock");

  return {
    load() {
      if (!fs.existsSync(statePath)) return emptyState();
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      } catch (error) {
        throw new Error(`Ralph state is unreadable at ${statePath}`, {
          cause: error,
        });
      }
      return validateState(parsed, statePath);
    },

    save(state) {
      validateState(state, statePath);
      fs.mkdirSync(runtimePath, { recursive: true });
      const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        writeFileDurably(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
        fs.renameSync(temporaryPath, statePath);
      } finally {
        fs.rmSync(temporaryPath, { force: true });
      }
    },

    isStopRequested() {
      return fs.existsSync(stopPath);
    },

    requestStop() {
      fs.mkdirSync(runtimePath, { recursive: true });
      if (fs.existsSync(stopPath)) return;
      try {
        writeFileDurably(stopPath, "stop requested\n");
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    },

    acquireControllerLease() {
      fs.mkdirSync(runtimePath, { recursive: true });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const token = randomUUID();
        const lease = {
          token,
          processId: process.pid,
          createdAt: new Date().toISOString(),
        };
        const candidatePath = `${lockPath}.candidate-${process.pid}-${token}`;
        writeFileDurably(candidatePath, `${JSON.stringify(lease)}\n`);
        let acquired = false;
        try {
          fs.linkSync(candidatePath, lockPath);
          acquired = true;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        } finally {
          fs.rmSync(candidatePath, { force: true });
        }
        if (acquired) {
          return {
            release() {
              if (!fs.existsSync(lockPath)) return;
              let observed;
              try {
                observed = JSON.parse(fs.readFileSync(lockPath, "utf8"));
              } catch (error) {
                throw new Error("Ralph controller lock became unreadable", {
                  cause: error,
                });
              }
              if (observed.token !== token) {
                throw new Error("Ralph controller lock ownership changed");
              }
              fs.rmSync(lockPath);
            },
          };
        }

        let owner;
        let serializedOwner;
        try {
          serializedOwner = fs.readFileSync(lockPath, "utf8");
          owner = JSON.parse(serializedOwner);
        } catch (error) {
          if (error?.code === "ENOENT") continue;
          throw new Error("Ralph controller lock failed integrity validation", {
            cause: error,
          });
        }
        if (
          !Number.isSafeInteger(owner.processId) ||
          owner.processId <= 0 ||
          typeof owner.token !== "string"
        ) {
          throw new Error("Ralph controller lock failed integrity validation");
        }
        if (processIsAlive(owner.processId)) {
          throw new Error(`Ralph controller is active as process ${owner.processId}`);
        }

        const stalePath = `${lockPath}.stale-${owner.token}-${process.pid}`;
        try {
          if (fs.readFileSync(lockPath, "utf8") !== serializedOwner) continue;
          fs.renameSync(lockPath, stalePath);
          fs.rmSync(stalePath, { force: true });
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      throw new Error("Ralph controller lock could not be acquired safely");
    },
  };
}
