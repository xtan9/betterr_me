import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

function digest(value) {
  return createHash("sha256").update(serialize(value)).digest("hex");
}

function isSha1(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function nonblank(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 1_000
  );
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function validateIssueGeneration(issueNumber, generation) {
  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber <= 0 ||
    !Number.isSafeInteger(generation) ||
    generation <= 0
  ) {
    throw new Error("generation intent failed integrity validation");
  }
}

function validateGenerationIntent(value) {
  const keys = [
    "schemaVersion",
    "issueNumber",
    "generation",
    "baseSha",
    "branch",
    "implementationSessionId",
    "requirementsSha256",
    "workerPolicySha256",
  ];
  if (
    !exactKeys(value, keys) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isSha1(value.baseSha) ||
    !nonblank(value.branch) ||
    !nonblank(value.implementationSessionId) ||
    !isSha256(value.requirementsSha256) ||
    !isSha256(value.workerPolicySha256)
  ) {
    throw new Error("generation intent failed integrity validation");
  }
  validateIssueGeneration(value.issueNumber, value.generation);
  return canonicalValue(value);
}

function validateCandidateIntent(value) {
  const keys = [
    "schemaVersion",
    "issueNumber",
    "generation",
    "generationIntentSha256",
    "candidateTreeSha",
    "changedPaths",
    "verificationSessionId",
    "verificationPlanSha256",
    "verificationStartedAtEpochMilliseconds",
    "verificationTimeoutMilliseconds",
    "verificationDeadlineEpochMilliseconds",
  ];
  if (
    !exactKeys(value, keys) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isSha256(value.generationIntentSha256) ||
    !isSha1(value.candidateTreeSha) ||
    !Array.isArray(value.changedPaths) ||
    value.changedPaths.length === 0 ||
    !value.changedPaths.every(nonblank) ||
    new Set(value.changedPaths).size !== value.changedPaths.length ||
    JSON.stringify(value.changedPaths) !==
      JSON.stringify([...value.changedPaths].sort()) ||
    !nonblank(value.verificationSessionId) ||
    !isSha256(value.verificationPlanSha256) ||
    !Number.isSafeInteger(value.verificationStartedAtEpochMilliseconds) ||
    value.verificationStartedAtEpochMilliseconds < 0 ||
    !Number.isSafeInteger(value.verificationTimeoutMilliseconds) ||
    value.verificationTimeoutMilliseconds <= 0 ||
    !Number.isSafeInteger(value.verificationDeadlineEpochMilliseconds) ||
    value.verificationDeadlineEpochMilliseconds !==
      value.verificationStartedAtEpochMilliseconds +
        value.verificationTimeoutMilliseconds
  ) {
    throw new Error("candidate intent failed integrity validation");
  }
  validateIssueGeneration(value.issueNumber, value.generation);
  return canonicalValue(value);
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

function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  const descriptor = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishImmutable(filePath, value) {
  const content = serialize(value);
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeDurably(candidatePath, content);
  try {
    fs.linkSync(candidatePath, filePath);
    fsyncDirectory(path.dirname(filePath));
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function readIntent(filePath, validate, kind) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${kind} intent is unreadable at ${filePath}`, {
      cause: error,
    });
  }
  return validate(value);
}

function same(left, right) {
  return serialize(left) === serialize(right);
}

export function createGenerationIntentStore(runtimePath) {
  if (!nonblank(runtimePath)) {
    throw new Error("generation intent runtime path failed integrity validation");
  }
  const intentRoot = path.resolve(runtimePath, "generation-intents");

  function generationPath(issueNumber, generation) {
    validateIssueGeneration(issueNumber, generation);
    return path.join(
      intentRoot,
      `issue-${issueNumber}`,
      `generation-${generation}.json`,
    );
  }

  function candidatePath(issueNumber, generation) {
    return path.join(
      intentRoot,
      `issue-${issueNumber}`,
      `generation-${generation}-candidate.json`,
    );
  }

  function loadGeneration(issueNumber, generation) {
    const filePath = generationPath(issueNumber, generation);
    const intent = readIntent(
      filePath,
      validateGenerationIntent,
      "generation",
    );
    return { intent, sha256: digest(intent), path: filePath };
  }

  function loadCandidate(issueNumber, generation) {
    const filePath = candidatePath(issueNumber, generation);
    const intent = readIntent(filePath, validateCandidateIntent, "candidate");
    return { intent, sha256: digest(intent), path: filePath };
  }

  return {
    reserveGeneration(input) {
      const intent = validateGenerationIntent({
        schemaVersion: SCHEMA_VERSION,
        ...input,
      });
      const filePath = generationPath(intent.issueNumber, intent.generation);
      if (!publishImmutable(filePath, intent)) {
        const existing = loadGeneration(intent.issueNumber, intent.generation);
        if (!same(existing.intent, intent)) {
          throw new Error("generation intent conflict");
        }
        return existing;
      }
      return { intent, sha256: digest(intent), path: filePath };
    },

    bindCandidate(input) {
      const intent = validateCandidateIntent({
        schemaVersion: SCHEMA_VERSION,
        ...input,
        changedPaths: Array.isArray(input?.changedPaths)
          ? [...input.changedPaths].sort()
          : input?.changedPaths,
      });
      const generation = loadGeneration(intent.issueNumber, intent.generation);
      if (generation.sha256 !== intent.generationIntentSha256) {
        throw new Error("candidate intent references the wrong generation intent");
      }
      const filePath = candidatePath(intent.issueNumber, intent.generation);
      if (!publishImmutable(filePath, intent)) {
        const existing = loadCandidate(intent.issueNumber, intent.generation);
        if (!same(existing.intent, intent)) {
          throw new Error("candidate intent conflict");
        }
        return existing;
      }
      return { intent, sha256: digest(intent), path: filePath };
    },

    assertRecord(record) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("Ralph state failed generation intent validation");
      }
      const generation = loadGeneration(record.number, record.generation);
      const generationProjection = {
        schemaVersion: SCHEMA_VERSION,
        issueNumber: record.number,
        generation: record.generation,
        baseSha: record.baseSha,
        branch: record.branch,
        implementationSessionId: record.sessionId,
        requirementsSha256: record.requirementsSha256,
        workerPolicySha256: record.workerPolicySha256,
      };
      if (
        record.generationIntentSha256 !== generation.sha256 ||
        !same(generationProjection, generation.intent)
      ) {
        throw new Error("Ralph state does not match immutable generation intent");
      }

      if (record.candidateIntentSha256 === undefined) {
        return { generationIntent: generation.intent, candidateIntent: null };
      }
      const candidate = loadCandidate(record.number, record.generation);
      const candidateProjection = {
        schemaVersion: SCHEMA_VERSION,
        issueNumber: record.number,
        generation: record.generation,
        generationIntentSha256: record.generationIntentSha256,
        candidateTreeSha: record.candidateTreeSha,
        changedPaths: record.changedPaths,
        verificationSessionId: record.verificationSessionId,
        verificationPlanSha256: record.verificationPlanSha256,
        verificationStartedAtEpochMilliseconds:
          record.verificationStartedAtEpochMilliseconds,
        verificationTimeoutMilliseconds: record.verificationTimeoutMilliseconds,
        verificationDeadlineEpochMilliseconds:
          record.verificationDeadlineEpochMilliseconds,
      };
      if (
        record.candidateIntentSha256 !== candidate.sha256 ||
        !same(candidateProjection, candidate.intent)
      ) {
        throw new Error("Ralph state does not match immutable candidate intent");
      }
      return {
        generationIntent: generation.intent,
        candidateIntent: candidate.intent,
      };
    },
  };
}
