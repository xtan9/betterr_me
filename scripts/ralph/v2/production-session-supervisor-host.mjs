import fs from "node:fs";
import path from "node:path";
import { runDurableSessionSupervisor } from "./session-supervisor.mjs";
import { createWindowsJobContainment } from "./windows-job-containment.mjs";

const [configPathInput] = process.argv.slice(2);
if (!configPathInput || !path.isAbsolute(configPathInput)) {
  throw new Error("usage: production-session-supervisor-host.mjs <absolute-config>");
}
const configPath = fs.realpathSync.native(configPathInput);
const resultPath = `${configPath}.result.json`;
const errorPath = `${configPath}.error.json`;

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500 &&
    !value.includes("\0")
  );
}

function readConfig() {
  const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !path.isAbsolute(value.sessionRoot) ||
    !path.isAbsolute(value.containmentRoot) ||
    !validIdentifier(value.sessionId) ||
    !validIdentifier(value.supervisorId) ||
    typeof value.trustedWslBridge !== "boolean" ||
    !Number.isSafeInteger(value.pollIntervalMilliseconds) ||
    value.pollIntervalMilliseconds <= 0
  ) {
    throw new Error("production session supervisor host configuration is invalid");
  }
  return value;
}

function writeOnce(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

try {
  const config = readConfig();
  if (process.platform !== "win32") {
    throw new Error("production session containment is not implemented off Windows");
  }
  const result = await runDurableSessionSupervisor({
    sessionRoot: config.sessionRoot,
    sessionId: config.sessionId,
    supervisorId: config.supervisorId,
    containment: createWindowsJobContainment({
      containmentRoot: config.containmentRoot,
      sessionId: config.sessionId,
      pollIntervalMilliseconds: config.pollIntervalMilliseconds,
      trustedWslBridge: config.trustedWslBridge,
    }),
    pollIntervalMilliseconds: config.pollIntervalMilliseconds,
  });
  writeOnce(resultPath, { schemaVersion: 1, result });
} catch (error) {
  try {
    writeOnce(errorPath, {
      schemaVersion: 1,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? "" : "",
    });
  } catch {
    // A prior immutable diagnostic is more trustworthy than an overwrite.
  }
  throw error;
}
