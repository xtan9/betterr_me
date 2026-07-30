import fs from "node:fs";
import path from "node:path";

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

export function createStateStore(runtimePath) {
  const statePath = path.join(runtimePath, "state-v2.json");

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
  };
}

