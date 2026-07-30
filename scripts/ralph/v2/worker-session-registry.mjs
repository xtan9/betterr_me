import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readProcessIdentity } from "./state-store.mjs";

function sessionKey(sessionId) {
  if (
    typeof sessionId !== "string" ||
    sessionId.length < 1 ||
    sessionId.length > 500
  ) {
    throw new Error("worker session ID failed integrity validation");
  }
  return createHash("sha256").update(sessionId).digest("hex");
}

function writeDurably(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishDurably(filePath, content) {
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, content);
  try {
    fs.linkSync(candidatePath, filePath);
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function validProcessIdentity(identity) {
  return (
    typeof identity === "string" &&
    (/^windows-start-ticks:\d+$/.test(identity) ||
      /^linux-boot-start:[0-9a-f-]{36}:\d+$/i.test(identity))
  );
}

function validWorkerId(workerId) {
  return (
    typeof workerId === "string" &&
    workerId.trim().length > 0 &&
    workerId.length <= 500
  );
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

function validateOwner(owner, sessionId, ownerPath) {
  if (
    !owner ||
    owner.sessionId !== sessionId ||
    typeof owner.token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      owner.token,
    ) ||
    !validWorkerId(owner.workerId) ||
    !Number.isSafeInteger(owner.processId) ||
    owner.processId <= 0 ||
    !validProcessIdentity(owner.processIdentity)
  ) {
    throw new Error(`worker session owner failed integrity validation at ${ownerPath}`);
  }
  return owner;
}

export function createWorkerSessionRegistry(sessionRoot) {
  const ownershipRoot = path.resolve(sessionRoot, "execution-owners");

  function ownerPath(sessionId) {
    return path.join(ownershipRoot, `${sessionKey(sessionId)}.json`);
  }

  function transferPath(filePath, token) {
    return `${filePath}.transfer-${token}.json`;
  }

  function readOwner(filePath, sessionId) {
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      throw new Error(
        `worker session owner failed integrity validation at ${filePath}`,
        { cause: error },
      );
    }
    return validateOwner(owner, sessionId, filePath);
  }

  function resolveOwner(filePath, sessionId, reservation) {
    const handoffPath = transferPath(filePath, reservation.token);
    if (!fs.existsSync(handoffPath)) return reservation;
    const transferred = readOwner(handoffPath, sessionId);
    if (transferred.token !== reservation.token) {
      throw new Error(
        `worker session owner failed integrity validation at ${handoffPath}`,
      );
    }
    return transferred;
  }

  function inspect(sessionId) {
    const filePath = ownerPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    const reservation = readOwner(filePath, sessionId);
    return resolveOwner(filePath, sessionId, reservation);
  }

  function inspectLive(sessionId) {
    const owner = inspect(sessionId);
    if (!owner) return null;
    const observedIdentity = readProcessIdentity(owner.processId);
    if (observedIdentity === owner.processIdentity) return owner;
    if (observedIdentity === null && processIsAlive(owner.processId)) {
      throw new Error("worker session owner liveness could not be verified");
    }
    return null;
  }

  return {
    inspect,
    inspectLive,

    transfer({
      sessionId,
      expectedOwner,
      workerId,
      processId,
      processIdentity,
    }) {
      if (!Number.isSafeInteger(processId) || processId <= 0) {
        throw new Error("worker session transfer failed integrity validation");
      }
      const observedProcessIdentity = readProcessIdentity(processId);
      const targetProcessIdentity =
        processIdentity ?? observedProcessIdentity;
      const filePath = ownerPath(sessionId);
      const reservation = readOwner(filePath, sessionId);
      if (
        reservation.token !== expectedOwner?.token ||
        reservation.workerId !== expectedOwner?.workerId ||
        reservation.processId !== expectedOwner?.processId ||
        reservation.processIdentity !== expectedOwner?.processIdentity ||
        reservation.processId !== process.pid ||
        readProcessIdentity(process.pid) !== reservation.processIdentity
      ) {
        throw new Error("worker session ownership changed before transfer");
      }
      if (
        !validWorkerId(workerId) ||
        !validProcessIdentity(targetProcessIdentity) ||
        observedProcessIdentity !== targetProcessIdentity
      ) {
        throw new Error("worker session transfer failed integrity validation");
      }
      const owner = {
        sessionId,
        token: reservation.token,
        workerId,
        processId,
        processIdentity: targetProcessIdentity,
      };
      const handoffPath = transferPath(filePath, reservation.token);
      try {
        publishDurably(handoffPath, `${JSON.stringify(owner, null, 2)}\n`);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const existing = readOwner(handoffPath, sessionId);
        if (JSON.stringify(existing) !== JSON.stringify(owner)) {
          throw new Error("worker session ownership was already transferred");
        }
      }
      const currentReservation = readOwner(filePath, sessionId);
      if (currentReservation.token !== reservation.token) {
        throw new Error("worker session reservation changed during transfer");
      }
      return resolveOwner(filePath, sessionId, currentReservation);
    },

    claim({
      sessionId,
      workerId,
      processIdentity,
    }) {
      if (!validWorkerId(workerId)) {
        throw new Error("worker ID failed integrity validation");
      }
      const observedProcessIdentity = readProcessIdentity(process.pid);
      const claimantProcessIdentity =
        processIdentity ?? observedProcessIdentity;
      if (
        !validProcessIdentity(claimantProcessIdentity) ||
        observedProcessIdentity !== claimantProcessIdentity
      ) {
        throw new Error("worker process identity is unavailable");
      }
      fs.mkdirSync(ownershipRoot, { recursive: true });
      const filePath = ownerPath(sessionId);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const owner = {
          sessionId,
          token: randomUUID(),
          workerId,
          processId: process.pid,
          processIdentity: claimantProcessIdentity,
        };
        try {
          publishDurably(filePath, `${JSON.stringify(owner, null, 2)}\n`);
          return { acquired: true, owner };
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }

        let serializedReservation;
        let reservation;
        let observedOwner;
        try {
          serializedReservation = fs.readFileSync(filePath, "utf8");
          reservation = validateOwner(
            JSON.parse(serializedReservation),
            sessionId,
            filePath,
          );
          observedOwner = resolveOwner(filePath, sessionId, reservation);
        } catch (error) {
          if (error?.code === "ENOENT") continue;
          if (error instanceof SyntaxError) {
            throw new Error(
              `worker session owner failed integrity validation at ${filePath}`,
              { cause: error },
            );
          }
          throw error;
        }
        const observedIdentity = readProcessIdentity(observedOwner.processId);
        if (observedIdentity === observedOwner.processIdentity) {
          return { acquired: false, owner: observedOwner };
        }
        if (
          observedIdentity === null &&
          processIsAlive(observedOwner.processId)
        ) {
          throw new Error("worker session owner liveness could not be verified");
        }

        const stalePath = `${filePath}.stale-${process.pid}-${randomUUID()}`;
        try {
          if (
            fs.existsSync(transferPath(filePath, reservation.token)) &&
            resolveOwner(filePath, sessionId, reservation).processIdentity !==
              observedOwner.processIdentity
          ) {
            continue;
          }
          if (fs.readFileSync(filePath, "utf8") !== serializedReservation) {
            continue;
          }
          fs.renameSync(filePath, stalePath);
          fs.rmSync(stalePath, { force: true });
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      throw new Error("worker session ownership could not be claimed safely");
    },
  };
}
