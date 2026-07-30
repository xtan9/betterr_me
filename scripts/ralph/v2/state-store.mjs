import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import net from "node:net";

const SCHEMA_VERSION = 1;
const EFFECT_DRAIN_TIMEOUT_MILLISECONDS = 30_000;
const EFFECT_DRAIN_POLL_MILLISECONDS = 20;

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

function publishFileDurably(filePath, content, publicationId = randomUUID()) {
  const candidatePath = `${filePath}.candidate-${process.pid}-${publicationId}`;
  writeFileDurably(candidatePath, content);
  try {
    fs.linkSync(candidatePath, filePath);
  } finally {
    fs.rmSync(candidatePath, { force: true });
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

function windowsProcessIdentity(processId) {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) {
    throw new Error("Ralph cannot locate Windows PowerShell for process identity");
  }
  const powershellPath = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const result = spawnSync(
    powershellPath,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `[System.Diagnostics.Process]::GetProcessById(${processId}).StartTime.ToUniversalTime().Ticks`,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000,
    },
  );
  if (result.error || result.signal) {
    throw new Error("Ralph could not inspect controller process identity", {
      cause: result.error,
    });
  }
  if (result.status !== 0) return null;
  const ticks = result.stdout.trim();
  if (!/^\d+$/.test(ticks)) {
    throw new Error("Ralph received an invalid controller process identity");
  }
  return `windows-start-ticks:${ticks}`;
}

function procProcessIdentity(processId) {
  try {
    const bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = fs.readFileSync(`/proc/${processId}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    const fields = stat.slice(commandEnd + 2).trim().split(/\s+/);
    const startTicks = fields[19];
    if (commandEnd < 0 || !bootId || !/^\d+$/.test(startTicks)) {
      throw new Error("invalid /proc process metadata");
    }
    return `linux-boot-start:${bootId}:${startTicks}`;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Ralph could not inspect controller process identity", {
      cause: error,
    });
  }
}

export function readProcessIdentity(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("process ID failed integrity validation");
  }
  if (process.platform === "win32") return windowsProcessIdentity(processId);
  if (fs.existsSync("/proc/self/stat")) return procProcessIdentity(processId);
  throw new Error(
    `Ralph does not support safe controller locking on ${process.platform}`,
  );
}

function validProcessIdentity(identity) {
  return (
    /^windows-start-ticks:\d+$/.test(identity) ||
    /^linux-boot-start:[0-9a-f-]{36}:\d+$/i.test(identity)
  );
}

function validLeaseOwner(owner) {
  return (
    Number.isSafeInteger(owner?.processId) &&
    owner.processId > 0 &&
    typeof owner.token === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      owner.token,
    ) &&
    typeof owner.processIdentity === "string" &&
    validProcessIdentity(owner.processIdentity)
  );
}

function validEffectLease(owner) {
  return (
    validLeaseOwner(owner) &&
    typeof owner.effect === "string" &&
    /^[a-z][a-z0-9-]{0,63}$/.test(owner.effect)
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizedRuntimePath(runtimePath) {
  const resolved = fs.realpathSync.native(path.resolve(runtimePath));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function controllerMutexEndpoint(runtimePath) {
  const key = createHash("sha256")
    .update(normalizedRuntimePath(runtimePath))
    .digest("hex")
    .slice(0, 40);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\betterr-me-ralph-v2-${key}`;
  }
  if (process.platform === "linux") {
    return `\0betterr-me-ralph-v2-${key}`;
  }
  throw new Error(
    `Ralph does not support safe controller locking on ${process.platform}`,
  );
}

async function acquireControllerMutex(runtimePath, ifActiveReturnNull = false) {
  fs.mkdirSync(runtimePath, { recursive: true });
  const endpoint = controllerMutexEndpoint(runtimePath);
  const server = net.createServer((socket) => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen({ path: endpoint, exclusive: true });
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      if (ifActiveReturnNull) return null;
      throw new Error("Ralph controller OS mutex is active", { cause: error });
    }
    throw new Error("Ralph controller OS mutex could not be acquired", {
      cause: error,
    });
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

export function createStateStore(runtimePath) {
  const statePath = path.join(runtimePath, "state-v2.json");
  const stopPath = path.join(runtimePath, "STOP");
  const lockPath = path.join(runtimePath, "controller-v2.lock");
  const effectLockPath = path.join(runtimePath, "effect-v2.lock");
  let cachedProcessIdentity;

  function currentProcessIdentity() {
    cachedProcessIdentity ??= readProcessIdentity(process.pid);
    if (!cachedProcessIdentity) {
      throw new Error("Ralph cannot establish its process identity");
    }
    return cachedProcessIdentity;
  }

  function reclaimStaleEffectGate() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!fs.existsSync(effectLockPath)) return;
      let serializedOwner;
      let owner;
      try {
        serializedOwner = fs.readFileSync(effectLockPath, "utf8");
        owner = JSON.parse(serializedOwner);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw new Error("Ralph effect gate failed integrity validation", {
          cause: error,
        });
      }
      if (!validEffectLease(owner)) {
        throw new Error("Ralph effect gate failed integrity validation");
      }
      const observedIdentity = readProcessIdentity(owner.processId);
      if (observedIdentity === owner.processIdentity) {
        throw new Error(
          `Ralph irreversible effect gate is active for ${owner.effect}`,
        );
      }
      if (observedIdentity === null && processIsAlive(owner.processId)) {
        throw new Error("Ralph could not verify effect gate ownership");
      }

      const stalePath = `${effectLockPath}.stale-${owner.token}-${process.pid}`;
      try {
        if (fs.readFileSync(effectLockPath, "utf8") !== serializedOwner) continue;
        fs.renameSync(effectLockPath, stalePath);
        fs.rmSync(stalePath, { force: true });
        return;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    throw new Error("Ralph stale effect gate could not be reclaimed safely");
  }

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

    async requestStop() {
      fs.mkdirSync(runtimePath, { recursive: true });
      if (!fs.existsSync(stopPath)) {
        try {
          writeFileDurably(stopPath, "stop requested\n");
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
      }

      const deadline = Date.now() + EFFECT_DRAIN_TIMEOUT_MILLISECONDS;
      while (fs.existsSync(effectLockPath)) {
        let serializedOwner;
        let owner;
        try {
          serializedOwner = fs.readFileSync(effectLockPath, "utf8");
          owner = JSON.parse(serializedOwner);
        } catch (error) {
          if (error?.code === "ENOENT") continue;
          throw new Error("Ralph effect gate failed integrity validation", {
            cause: error,
          });
        }
        if (!validEffectLease(owner)) {
          throw new Error("Ralph effect gate failed integrity validation");
        }
        const observedIdentity = readProcessIdentity(owner.processId);
        if (observedIdentity === owner.processIdentity) {
          if (Date.now() >= deadline) {
            throw new Error("Ralph effect gate exceeded the STOP drain timeout");
          }
          await sleep(EFFECT_DRAIN_POLL_MILLISECONDS);
          continue;
        }
        if (observedIdentity === null && processIsAlive(owner.processId)) {
          throw new Error("Ralph could not verify effect gate ownership");
        }
        const stalePath = `${effectLockPath}.stale-${randomUUID()}`;
        try {
          if (fs.readFileSync(effectLockPath, "utf8") !== serializedOwner) continue;
          fs.renameSync(effectLockPath, stalePath);
          fs.rmSync(stalePath, { force: true });
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    },

    acquireEffectAdmission(effect) {
      if (typeof effect !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(effect)) {
        throw new Error("Ralph effect name failed integrity validation");
      }
      if (fs.existsSync(stopPath)) return null;
      fs.mkdirSync(runtimePath, { recursive: true });
      reclaimStaleEffectGate();
      if (fs.existsSync(stopPath)) return null;
      const token = randomUUID();
      const processIdentity = currentProcessIdentity();
      const lease = {
        token,
        processId: process.pid,
        processIdentity,
        effect,
        createdAt: new Date().toISOString(),
      };
      try {
        publishFileDurably(
          effectLockPath,
          `${JSON.stringify(lease)}\n`,
          token,
        );
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error("Ralph irreversible effect gate is already active");
        }
        throw error;
      }

      let released = false;
      const admission = {
        release() {
          if (released) return;
          const observed = JSON.parse(fs.readFileSync(effectLockPath, "utf8"));
          if (observed.token !== token) {
            throw new Error("Ralph effect gate ownership changed");
          }
          fs.rmSync(effectLockPath);
          released = true;
        },
      };
      if (fs.existsSync(stopPath)) {
        admission.release();
        return null;
      }
      return admission;
    },

    async acquireControllerLease({ ifActiveReturnNull = false } = {}) {
      const mutex = await acquireControllerMutex(
        runtimePath,
        ifActiveReturnNull,
      );
      if (!mutex) return null;
      let token;
      try {
        fs.mkdirSync(runtimePath, { recursive: true });
        if (fs.existsSync(lockPath)) {
          let owner;
          try {
            owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          } catch (error) {
            throw new Error("Ralph controller lock failed integrity validation", {
              cause: error,
            });
          }
          if (!validLeaseOwner(owner)) {
            throw new Error("Ralph controller lock failed integrity validation");
          }

          const stalePath = `${lockPath}.stale-${owner.token}-${process.pid}`;
          try {
            fs.renameSync(lockPath, stalePath);
            fs.rmSync(stalePath, { force: true });
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
        }

        reclaimStaleEffectGate();

        token = randomUUID();
        const lease = {
          token,
          processId: process.pid,
          processIdentity: currentProcessIdentity(),
          createdAt: new Date().toISOString(),
        };
        publishFileDurably(lockPath, `${JSON.stringify(lease)}\n`, token);
      } catch (error) {
        await mutex.release();
        throw error;
      }

      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          let releaseError;
          try {
            if (fs.existsSync(lockPath)) {
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
            }
          } catch (error) {
            releaseError = error;
          } finally {
            await mutex.release();
          }
          if (releaseError) throw releaseError;
        },
      };
    },
  };
}
