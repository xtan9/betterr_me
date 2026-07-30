import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";

const [configPath, role] = process.argv.slice(2);
if (!configPath || !role) {
  throw new Error(
    "usage: worker-session-registry-host.mjs <config.json> <claim|hold-owner|crash-partial|hold-after-publication>",
  );
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const ownershipRoot = path.resolve(config.sessionRoot, "execution-owners");
const finalOwnerPath = path.join(
  ownershipRoot,
  `${createHash("sha256").update(config.sessionId).digest("hex")}.json`,
);
const original = {
  fsyncSync: fs.fsyncSync.bind(fs),
  linkSync: fs.linkSync.bind(fs),
  openSync: fs.openSync.bind(fs),
  renameSync: fs.renameSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
};

function isTransferFile(filePath) {
  if (typeof filePath !== "string" && !Buffer.isBuffer(filePath)) return false;
  return path
    .resolve(filePath.toString())
    .startsWith(`${path.resolve(finalOwnerPath)}.transfer-`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  original.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  original.renameSync(temporaryPath, filePath);
}

function writeMarker(value) {
  writeJson(config.reachedPath, value);
}

function waitSynchronouslyForever() {
  const waitState = new Int32Array(new SharedArrayBuffer(4));
  for (;;) Atomics.wait(waitState, 0, 0, 1_000);
}

function isOwnershipFile(filePath) {
  if (typeof filePath !== "string" && !Buffer.isBuffer(filePath)) return false;
  const relative = path.relative(ownershipRoot, path.resolve(filePath.toString()));
  return Boolean(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
  );
}

if (role === "crash-partial") {
  let interceptedDescriptor;
  fs.openSync = function openSyncWithCrash(filePath, flags, ...rest) {
    const descriptor = Reflect.apply(original.openSync, fs, [
      filePath,
      flags,
      ...rest,
    ]);
    if (flags === "wx" && isOwnershipFile(filePath)) {
      interceptedDescriptor = descriptor;
    }
    return descriptor;
  };
  fs.writeFileSync = function writeFileSyncWithCrash(file, ...rest) {
    if (file === interceptedDescriptor) {
      original.writeFileSync(file, '{"sessionId":', "utf8");
      original.fsyncSync(file);
      writeMarker({ phase: "partial-owner-written", processId: process.pid });
      waitSynchronouslyForever();
    }
    return Reflect.apply(original.writeFileSync, fs, [file, ...rest]);
  };
}

if (role === "hold-after-publication") {
  fs.linkSync = function linkSyncWithPublicationBarrier(
    existingPath,
    newPath,
  ) {
    const result = Reflect.apply(original.linkSync, fs, [existingPath, newPath]);
    if (path.resolve(newPath.toString()) === path.resolve(finalOwnerPath)) {
      writeMarker({ phase: "owner-published", processId: process.pid });
      waitSynchronouslyForever();
    }
    return result;
  };
}

if (role === "crash-before-transfer-publication") {
  fs.linkSync = function linkSyncWithTransferPrepublicationBarrier(
    existingPath,
    newPath,
  ) {
    if (isTransferFile(newPath)) {
      writeMarker({
        phase: "before-transfer-publication",
        processId: process.pid,
      });
      waitSynchronouslyForever();
    }
    return Reflect.apply(original.linkSync, fs, [existingPath, newPath]);
  };
}

if (role === "crash-after-transfer-publication") {
  fs.linkSync = function linkSyncWithTransferPostpublicationBarrier(
    existingPath,
    newPath,
  ) {
    const result = Reflect.apply(original.linkSync, fs, [existingPath, newPath]);
    if (isTransferFile(newPath)) {
      writeMarker({
        phase: "after-transfer-publication",
        processId: process.pid,
      });
      waitSynchronouslyForever();
    }
    return result;
  };
}

async function waitForRelease() {
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(config.releasePath)) {
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting to release the live registry owner");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

try {
  const registry = createWorkerSessionRegistry(config.sessionRoot);
  const result = registry.claim({
    sessionId: config.sessionId,
    workerId: config.workerId,
  });
  if (config.resultPath) writeJson(config.resultPath, result);

  if (
    role === "crash-before-transfer-publication" ||
    role === "crash-after-transfer-publication"
  ) {
    if (!result.acquired) {
      throw new Error("fixture could not reserve ownership before transfer");
    }
    registry.transfer({
      sessionId: config.sessionId,
      expectedOwner: result.owner,
      workerId: config.transferWorkerId,
      processId: config.transferProcessId,
      processIdentity: config.transferProcessIdentity,
    });
  }

  if (role === "hold-owner") {
    if (!result.acquired) throw new Error("fixture could not acquire live ownership");
    writeMarker({ phase: "owner-live", processId: process.pid });
    await waitForRelease();
  } else if (role === "hold-after-publication") {
    // A correct atomic publisher blocks inside linkSync above. Reaching this
    // marker means the canonical record was exposed without that publication seam.
    writeMarker({ phase: "publication-barrier-missed", processId: process.pid });
  } else if (
    role !== "claim" &&
    role !== "crash-partial" &&
    role !== "crash-before-transfer-publication" &&
    role !== "crash-after-transfer-publication"
  ) {
    throw new Error(`unknown worker-session registry role: ${role}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
