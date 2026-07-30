import { createHash } from "node:crypto";
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

function validateOwner(owner, sessionId, ownerPath) {
  if (
    !owner ||
    owner.sessionId !== sessionId ||
    typeof owner.workerId !== "string" ||
    owner.workerId.length < 1 ||
    !Number.isSafeInteger(owner.processId) ||
    owner.processId <= 0 ||
    typeof owner.processIdentity !== "string" ||
    owner.processIdentity.length < 1
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

  function inspect(sessionId) {
    const filePath = ownerPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
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

  return {
    inspect,

    claim({
      sessionId,
      workerId,
      processIdentity = readProcessIdentity(process.pid),
    }) {
      const filePath = ownerPath(sessionId);
      fs.mkdirSync(ownershipRoot, { recursive: true });
      const owner = {
        sessionId,
        workerId,
        processId: process.pid,
        processIdentity,
      };
      if (!owner.processIdentity) {
        throw new Error("worker process identity is unavailable");
      }
      try {
        writeDurably(filePath, `${JSON.stringify(owner, null, 2)}\n`);
        return { acquired: true, owner };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        return { acquired: false, owner: inspect(sessionId) };
      }
    },
  };
}
