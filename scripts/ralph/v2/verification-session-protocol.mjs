import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;
const MAX_FACT_BYTES = 8 * 1024 * 1024;
const REQUEST_INPUT_KEYS = Object.freeze([
  "baseSha",
  "candidateTreeSha",
  "changedPaths",
  "deadline",
  "requirements",
  "sessionId",
  "verificationPlan",
  "verificationPlanSha256",
]);
const REQUEST_KEYS = Object.freeze([
  ...REQUEST_INPUT_KEYS,
  "kind",
  "requestSha256",
  "schemaVersion",
]);
const RESULT_INPUT_KEYS = Object.freeze([
  "requestSha256",
  "verifierReceipt",
]);
const RESULT_KEYS = Object.freeze([
  ...RESULT_INPUT_KEYS,
  "kind",
  "resultSha256",
  "schemaVersion",
]);

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const approved = [...expected].sort();
  return (
    actual.length === approved.length &&
    actual.every((key, index) => key === approved[index])
  );
}

function canonicalJsonValue(value, ancestors = new Set(), depth = 0) {
  if (depth > 64) {
    throw new Error("verification session JSON failed integrity validation");
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("verification session JSON failed integrity validation");
    }
    return value;
  }
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new Error("verification session JSON failed integrity validation");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalJsonValue(entry, ancestors, depth + 1));
    }
    if (!plainObject(value)) {
      throw new Error("verification session JSON failed integrity validation");
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => {
          if (!key || key.includes("\0")) {
            throw new Error(
              "verification session JSON failed integrity validation",
            );
          }
          return [key, canonicalJsonValue(value[key], ancestors, depth + 1)];
        }),
    );
  } finally {
    ancestors.delete(value);
  }
}

function canonicalDocument(value) {
  return `${JSON.stringify(canonicalJsonValue(value), null, 2)}\n`;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(value)))
    .digest("hex");
}

function assertDigest(value, description) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertGitSha(value, description) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertSessionId(value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error("verification request failed integrity validation");
  }
  return value;
}

function assertChangedPaths(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length === 0 ||
        entry.includes("\0") ||
        entry.includes("\\") ||
        path.posix.isAbsolute(entry) ||
        path.posix.normalize(entry) !== entry ||
        entry === "." ||
        entry.startsWith("../"),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("verification request failed integrity validation");
  }
  return [...value];
}

function requestBody(input) {
  if (!exactKeys(input, REQUEST_INPUT_KEYS)) {
    throw new Error("verification request failed integrity validation");
  }
  if (
    !plainObject(input.requirements) ||
    !plainObject(input.verificationPlan) ||
    !Number.isSafeInteger(input.deadline) ||
    input.deadline <= 0
  ) {
    throw new Error("verification request failed integrity validation");
  }
  const verificationPlan = canonicalJsonValue(input.verificationPlan);
  const verificationPlanSha256 = assertDigest(
    input.verificationPlanSha256,
    "verification plan digest",
  );
  if (digest(verificationPlan) !== verificationPlanSha256) {
    throw new Error("verification plan digest failed integrity validation");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "verification-request",
    sessionId: assertSessionId(input.sessionId),
    baseSha: assertGitSha(input.baseSha, "verification base SHA"),
    candidateTreeSha: assertGitSha(
      input.candidateTreeSha,
      "verification candidate tree SHA",
    ),
    changedPaths: assertChangedPaths(input.changedPaths),
    requirements: canonicalJsonValue(input.requirements),
    verificationPlan,
    verificationPlanSha256,
    deadline: input.deadline,
  };
}

function normalizeRequestInput(input) {
  const body = requestBody(input);
  return { ...body, requestSha256: digest(body) };
}

function validateRequest(value) {
  if (
    !exactKeys(value, REQUEST_KEYS) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "verification-request"
  ) {
    throw new Error("verification request failed integrity validation");
  }
  const input = Object.fromEntries(
    REQUEST_INPUT_KEYS.map((key) => [key, value[key]]),
  );
  const expected = normalizeRequestInput(input);
  if (
    !assertDigest(value.requestSha256, "verification request digest") ||
    value.requestSha256 !== expected.requestSha256 ||
    canonicalDocument(value) !== canonicalDocument(expected)
  ) {
    throw new Error("verification request digest failed integrity validation");
  }
  return expected;
}

function resultBody(input, request) {
  if (!exactKeys(input, RESULT_INPUT_KEYS) || !plainObject(input.verifierReceipt)) {
    throw new Error("verification result failed integrity validation");
  }
  const requestSha256 = assertDigest(
    input.requestSha256,
    "verification result request digest",
  );
  if (requestSha256 !== request.requestSha256) {
    throw new Error("verification result request digest failed integrity validation");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "verification-result",
    requestSha256,
    verifierReceipt: canonicalJsonValue(input.verifierReceipt),
  };
}

function normalizeResultInput(input, request) {
  const body = resultBody(input, request);
  return { ...body, resultSha256: digest(body) };
}

function validateResult(value, request) {
  if (
    !exactKeys(value, RESULT_KEYS) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "verification-result"
  ) {
    throw new Error("verification result failed integrity validation");
  }
  const expected = normalizeResultInput(
    {
      requestSha256: value.requestSha256,
      verifierReceipt: value.verifierReceipt,
    },
    request,
  );
  if (
    !assertDigest(value.resultSha256, "verification result digest") ||
    value.resultSha256 !== expected.resultSha256 ||
    canonicalDocument(value) !== canonicalDocument(expected)
  ) {
    throw new Error("verification result digest failed integrity validation");
  }
  return expected;
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function assertSessionRoot(sessionRoot) {
  if (typeof sessionRoot !== "string" || !path.isAbsolute(sessionRoot)) {
    throw new Error("verification session root failed integrity validation");
  }
  try {
    const metadata = fs.lstatSync(sessionRoot);
    const resolved = fs.realpathSync.native(sessionRoot);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      !samePath(sessionRoot, resolved)
    ) {
      throw new Error("verification session root is not a trusted directory");
    }
    return resolved;
  } catch (error) {
    throw new Error("verification session root failed integrity validation", {
      cause: error,
    });
  }
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!["EACCES", "EBADF", "EINVAL", "EPERM"].includes(error?.code)) {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function writeCandidate(filePath, bytes) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readFact(filePath, root, validator) {
  let content;
  try {
    const metadata = fs.lstatSync(filePath);
    const resolved = fs.realpathSync.native(filePath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      !samePath(path.dirname(resolved), root) ||
      metadata.size > MAX_FACT_BYTES
    ) {
      throw new Error("verification session fact is not trusted");
    }
    content = fs.readFileSync(resolved, "utf8");
  } catch (error) {
    throw new Error("verification session fact failed integrity validation", {
      cause: error,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("verification session fact failed integrity validation", {
      cause: error,
    });
  }
  const validated = validator(parsed);
  if (canonicalDocument(validated) !== content) {
    throw new Error("verification session fact is not canonical");
  }
  return validated;
}

function publishFact({ filePath, root, value, validator, description }) {
  const content = canonicalDocument(value);
  if (Buffer.byteLength(content) > MAX_FACT_BYTES) {
    throw new Error(`${description} failed integrity validation`);
  }
  const candidatePath = path.join(
    root,
    `.${path.basename(filePath)}.candidate-${process.pid}-${randomUUID()}`,
  );
  writeCandidate(candidatePath, content);
  try {
    try {
      fs.linkSync(candidatePath, filePath);
      syncDirectory(root);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
  const observed = readFact(filePath, root, validator);
  if (canonicalDocument(observed) !== content) {
    throw new Error(`${description} publication conflict`);
  }
  return observed;
}

export function createVerificationSessionProtocol({ sessionRoot }) {
  const trustedRoot = assertSessionRoot(sessionRoot);
  const requestPath = path.join(trustedRoot, "request.json");
  const resultPath = path.join(trustedRoot, "result.json");

  const assertRootUnchanged = () => {
    if (!samePath(assertSessionRoot(sessionRoot), trustedRoot)) {
      throw new Error("verification session root failed integrity validation");
    }
  };

  const readRequest = () => {
    assertRootUnchanged();
    return readFact(requestPath, trustedRoot, validateRequest);
  };

  return Object.freeze({
    publishRequest(input) {
      assertRootUnchanged();
      const request = normalizeRequestInput(input);
      return publishFact({
        filePath: requestPath,
        root: trustedRoot,
        value: request,
        validator: validateRequest,
        description: "verification request",
      });
    },
    readRequest,
    publishResult(input) {
      assertRootUnchanged();
      const request = readRequest();
      const result = normalizeResultInput(input, request);
      return publishFact({
        filePath: resultPath,
        root: trustedRoot,
        value: result,
        validator: (value) => validateResult(value, request),
        description: "verification result",
      });
    },
    readResult() {
      assertRootUnchanged();
      const request = readRequest();
      return readFact(resultPath, trustedRoot, (value) =>
        validateResult(value, request),
      );
    },
  });
}
