import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;
const REQUEST_INPUT_KEYS = [
  "axis",
  "candidateTreeSha",
  "deadlineEpochMilliseconds",
  "policySha256",
  "prompt",
  "readOnly",
  "resultPath",
  "sessionId",
  "skillSha256",
  "worktreePath",
];

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index]);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function serialize(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertString(value, description, pattern = null, maximum = 500_000) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0") ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertLinuxPath(value, description) {
  const candidate = assertString(value, description, null, 32_768);
  if (!path.posix.isAbsolute(candidate) || path.posix.normalize(candidate) !== candidate) {
    throw new Error(`${description} failed integrity validation`);
  }
  return candidate;
}

function normalizeRequestInput(input) {
  if (
    !exactKeys(input, REQUEST_INPUT_KEYS) ||
    input.readOnly !== true ||
    !Number.isSafeInteger(input.deadlineEpochMilliseconds) ||
    input.deadlineEpochMilliseconds <= 0
  ) {
    throw new Error("review broker request failed integrity validation");
  }
  const body = {
    schemaVersion: SCHEMA_VERSION,
    kind: "review-request",
    sessionId: assertString(input.sessionId, "review broker session ID", null, 500),
    axis: assertString(
      input.axis,
      "review broker axis",
      /^[a-z][a-z0-9-]{0,63}$/,
      64,
    ),
    prompt: assertString(input.prompt, "review broker prompt"),
    resultPath: assertLinuxPath(input.resultPath, "review broker result path"),
    worktreePath: assertLinuxPath(input.worktreePath, "review broker worktree path"),
    candidateTreeSha: assertString(
      input.candidateTreeSha,
      "review broker candidate tree",
      /^[a-f0-9]{40}$/,
      40,
    ),
    policySha256: assertString(
      input.policySha256,
      "review broker policy digest",
      /^[a-f0-9]{64}$/,
      64,
    ),
    skillSha256: assertString(
      input.skillSha256,
      "review broker skill digest",
      /^[a-f0-9]{64}$/,
      64,
    ),
    deadlineEpochMilliseconds: input.deadlineEpochMilliseconds,
    readOnly: true,
  };
  return { ...body, requestSha256: sha256(serialize(body)) };
}

function validateRequest(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "review-request" ||
    typeof value.requestSha256 !== "string"
  ) {
    throw new Error("review broker request failed integrity validation");
  }
  const input = Object.fromEntries(
    REQUEST_INPUT_KEYS.map((key) => [key, value[key]]),
  );
  const expected = normalizeRequestInput(input);
  if (serialize(value) !== serialize(expected)) {
    throw new Error("review broker request digest failed integrity validation");
  }
  return expected;
}

function validateReceipt(receipt, request) {
  if (
    !plainObject(receipt) ||
    receipt.kind !== "completed" ||
    receipt.sessionId !== request.sessionId ||
    receipt.axis !== request.axis ||
    receipt.candidateTreeSha !== request.candidateTreeSha ||
    receipt.freshSession !== true ||
    receipt.readOnly !== true ||
    receipt.processTreeTerminated !== true ||
    receipt.resultPath !== request.resultPath ||
    typeof receipt.outputSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receipt.outputSha256)
  ) {
    throw new Error("review broker receipt failed integrity validation");
  }
  return canonicalValue(receipt);
}

function normalizeResponse(input, request) {
  if (input.status === "completed") {
    const body = {
      schemaVersion: SCHEMA_VERSION,
      kind: "review-response",
      status: "completed",
      requestSha256: request.requestSha256,
      receipt: validateReceipt(input.receipt, request),
    };
    return { ...body, responseSha256: sha256(serialize(body)) };
  }
  if (input.status === "failed") {
    const body = {
      schemaVersion: SCHEMA_VERSION,
      kind: "review-response",
      status: "failed",
      requestSha256: request.requestSha256,
      message: assertString(input.message, "review broker failure", null, 4_000),
    };
    return { ...body, responseSha256: sha256(serialize(body)) };
  }
  throw new Error("review broker response failed integrity validation");
}

function validateResponse(value, request) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "review-response" ||
    typeof value.responseSha256 !== "string"
  ) {
    throw new Error("review broker response failed integrity validation");
  }
  const expected = normalizeResponse(
    value.status === "completed"
      ? { status: "completed", receipt: value.receipt }
      : { status: value.status, message: value.message },
    request,
  );
  if (serialize(value) !== serialize(expected)) {
    throw new Error("review broker response digest failed integrity validation");
  }
  return expected;
}

function publish(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidate = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  const bytes = Buffer.from(serialize(value), "utf8");
  const descriptor = fs.openSync(candidate, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.linkSync(candidate, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(candidate, { force: true });
  }
  const observed = fs.readFileSync(filePath, "utf8");
  if (observed !== bytes.toString("utf8")) {
    throw new Error("review broker publication conflicts");
  }
}

function read(filePath, validator) {
  const bytes = fs.readFileSync(filePath, "utf8");
  const value = validator(JSON.parse(bytes));
  if (serialize(value) !== bytes) {
    throw new Error("review broker fact is not canonical");
  }
  return value;
}

export function createReviewBrokerProtocol({ root }) {
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    throw new Error("review broker root failed integrity validation");
  }
  fs.mkdirSync(root, { recursive: true });
  const trustedRoot = fs.realpathSync.native(root);

  function pathsFor(sessionId) {
    const key = sha256(assertString(sessionId, "review broker session ID", null, 500));
    const directory = path.join(trustedRoot, key);
    return {
      directory,
      request: path.join(directory, "request.json"),
      response: path.join(directory, "response.json"),
    };
  }

  function readRequestAt(filePath) {
    return read(filePath, validateRequest);
  }

  return Object.freeze({
    publishRequest(input) {
      const request = normalizeRequestInput(input);
      const paths = pathsFor(request.sessionId);
      publish(paths.request, request);
      return readRequestAt(paths.request);
    },
    listRequests() {
      return fs
        .readdirSync(trustedRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
        .flatMap((entry) => {
          const requestPath = path.join(trustedRoot, entry.name, "request.json");
          return fs.existsSync(requestPath) ? [readRequestAt(requestPath)] : [];
        });
    },
    readResponse(sessionId) {
      const paths = pathsFor(sessionId);
      if (!fs.existsSync(paths.response)) return null;
      const request = readRequestAt(paths.request);
      return read(paths.response, (value) => validateResponse(value, request));
    },
    publishSuccess(sessionId, receipt) {
      const paths = pathsFor(sessionId);
      const request = readRequestAt(paths.request);
      const response = normalizeResponse({ status: "completed", receipt }, request);
      publish(paths.response, response);
      return read(paths.response, (value) => validateResponse(value, request));
    },
    publishFailure(sessionId, message) {
      const paths = pathsFor(sessionId);
      const request = readRequestAt(paths.request);
      const response = normalizeResponse({ status: "failed", message }, request);
      publish(paths.response, response);
      return read(paths.response, (value) => validateResponse(value, request));
    },
  });
}
