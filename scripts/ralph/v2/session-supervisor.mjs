import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createWorkerSessionRegistry } from "./worker-session-registry.mjs";

const SCHEMA_VERSION = 1;
const DEFAULT_POLL_INTERVAL_MILLISECONDS = 20;
const DEFAULT_WAIT_TIMEOUT_MILLISECONDS = 30_000;
const DEFAULT_OWNER_OBSERVATION_TIMEOUT_MILLISECONDS = 2_000;
const MAX_IDENTIFIER_LENGTH = 500;
const MAX_ARGUMENT_LENGTH = 32_768;
const MAX_ARGUMENT_COUNT = 2_048;
const PROCESS_IDENTITY_PATTERN = /^(?:windows-start-ticks:\d+|linux-boot-start:[0-9a-f-]{36}:\d+)$/i;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function exactKeys(value, expectedKeys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    !value.includes("\0")
  );
}

function assertIdentifier(value, description) {
  if (!validIdentifier(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertDigest(value, description) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertPositiveDuration(value, description, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new Error(`${description} failed integrity validation`);
  }
  return candidate;
}

function assertChildPlan(child) {
  const requiredKeys = ["args", "cwd", "environment", "executable", "holdBeforeSpawn"];
  const allowedKeys = [...requiredKeys, "tokenMode"];
  if (
    !plainObject(child) ||
    !requiredKeys.every((key) => Object.hasOwn(child, key)) ||
    Object.keys(child).some((key) => !allowedKeys.includes(key)) ||
    typeof child.executable !== "string" ||
    !path.isAbsolute(child.executable) ||
    child.executable.length > MAX_ARGUMENT_LENGTH ||
    child.executable.includes("\0") ||
    typeof child.cwd !== "string" ||
    !path.isAbsolute(child.cwd) ||
    child.cwd.length > MAX_ARGUMENT_LENGTH ||
    child.cwd.includes("\0") ||
    !Array.isArray(child.args) ||
    child.args.length > MAX_ARGUMENT_COUNT ||
    child.args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length > MAX_ARGUMENT_LENGTH ||
        argument.includes("\0"),
    ) ||
    !plainObject(child.environment) ||
    Object.entries(child.environment).some(
      ([name, value]) =>
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
        typeof value !== "string" ||
        value.length > MAX_ARGUMENT_LENGTH ||
        value.includes("\0"),
    ) ||
    typeof child.holdBeforeSpawn !== "boolean" ||
    !new Set(["low-integrity", "trusted-wsl-bridge"]).has(
      child.tokenMode ?? "low-integrity",
    )
  ) {
    throw new Error("session child plan failed integrity validation");
  }
  return {
    executable: child.executable,
    args: [...child.args],
    cwd: child.cwd,
    environment: { ...child.environment },
    holdBeforeSpawn: child.holdBeforeSpawn,
    tokenMode: child.tokenMode ?? "low-integrity",
  };
}

function normalizePlan(input) {
  if (!exactKeys(input, ["child", "planDigest", "sessionId"])) {
    throw new Error("session plan failed integrity validation");
  }
  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    kind: "plan",
    sessionId: assertIdentifier(input.sessionId, "session ID"),
    planDigest: assertDigest(input.planDigest, "session plan digest"),
    child: assertChildPlan(input.child),
  };
  const expectedDigest = computeSessionPlanDigest({
    sessionId: normalized.sessionId,
    child: normalized.child,
  });
  if (normalized.planDigest !== expectedDigest) {
    throw new Error("session plan digest does not match its exact child plan");
  }
  return normalized;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function serialize(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function computeSessionPlanDigest(input) {
  if (!exactKeys(input, ["child", "sessionId"])) {
    throw new Error("session plan digest input failed integrity validation");
  }
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    kind: "child-plan-digest",
    sessionId: assertIdentifier(input.sessionId, "session ID"),
    child: assertChildPlan(input.child),
  };
  return createHash("sha256").update(serialize(payload)).digest("hex");
}

function sameValue(left, right) {
  return serialize(left) === serialize(right);
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

function publishDurably(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, serialize(value));
  try {
    fs.linkSync(candidatePath, filePath);
    syncDirectory(path.dirname(filePath));
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function parseFact(filePath, validator) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`session fact failed integrity validation at ${filePath}`, {
      cause: error,
    });
  }
  return validator(parsed, filePath);
}

function optionalFact(filePath, validator) {
  if (!fs.existsSync(filePath)) return null;
  return parseFact(filePath, validator);
}

function publishFact(filePath, value, validator) {
  validator(value, filePath);
  const created = publishDurably(filePath, value);
  const observed = parseFact(filePath, validator);
  return { created, value: observed };
}

function validatePlan(value, filePath = "session plan") {
  if (
    !exactKeys(value, [
      "child",
      "kind",
      "planDigest",
      "schemaVersion",
      "sessionId",
    ]) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "plan"
  ) {
    throw new Error(`session plan failed integrity validation at ${filePath}`);
  }
  assertIdentifier(value.sessionId, "session ID");
  assertDigest(value.planDigest, "session plan digest");
  assertChildPlan(value.child);
  if (
    value.planDigest !==
    computeSessionPlanDigest({
      sessionId: value.sessionId,
      child: value.child,
    })
  ) {
    throw new Error(
      `session plan digest does not match its exact child plan at ${filePath}`,
    );
  }
  return value;
}

function validateAuthorization(value, filePath = "session authorization") {
  if (
    !exactKeys(value, [
      "authorizationId",
      "kind",
      "planDigest",
      "schemaVersion",
      "sessionId",
    ]) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "authorization"
  ) {
    throw new Error(
      `session authorization failed integrity validation at ${filePath}`,
    );
  }
  assertIdentifier(value.sessionId, "session ID");
  assertIdentifier(value.authorizationId, "session authorization ID");
  assertDigest(value.planDigest, "session authorization digest");
  return value;
}

function validateStartDecision(value, filePath = "session start decision") {
  if (!plainObject(value) || value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `session start decision failed integrity validation at ${filePath}`,
    );
  }
  assertIdentifier(value.sessionId, "session ID");
  if (value.kind === "launch-admitted") {
    if (
      !exactKeys(value, [
        "authorizationId",
        "kind",
        "ownerToken",
        "planDigest",
        "schemaVersion",
        "sessionId",
        "supervisorId",
      ])
    ) {
      throw new Error(
        `session start decision failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.authorizationId, "session authorization ID");
    assertDigest(value.planDigest, "session authorization digest");
    if (
      typeof value.ownerToken !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.ownerToken,
      )
    ) {
      throw new Error(
        `session start decision failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.supervisorId, "session supervisor ID");
    return value;
  }
  if (value.kind === "closed-unstarted" || value.kind === "stop-before-start") {
    if (
      !exactKeys(value, [
        "kind",
        "operationId",
        "reason",
        "schemaVersion",
        "sessionId",
      ])
    ) {
      throw new Error(
        `session start decision failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.operationId, "session operation ID");
    assertIdentifier(value.reason, "session operation reason");
    return value;
  }
  throw new Error(
    `session start decision failed integrity validation at ${filePath}`,
  );
}

function validateOutcomeDecision(value, filePath = "session outcome decision") {
  if (!plainObject(value) || value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `session outcome decision failed integrity validation at ${filePath}`,
    );
  }
  assertIdentifier(value.sessionId, "session ID");
  if (value.kind === "terminate") {
    if (
      !exactKeys(value, [
        "kind",
        "operationId",
        "reason",
        "schemaVersion",
        "sessionId",
      ])
    ) {
      throw new Error(
        `session outcome decision failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.operationId, "session operation ID");
    assertIdentifier(value.reason, "session operation reason");
    return value;
  }
  if (value.kind === "completed" || value.kind === "interrupted") {
    if (
      !exactKeys(value, [
        "kind",
        "schemaVersion",
        "sessionId",
        "supervisorId",
      ])
    ) {
      throw new Error(
        `session outcome decision failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.supervisorId, "session supervisor ID");
    return value;
  }
  throw new Error(
    `session outcome decision failed integrity validation at ${filePath}`,
  );
}

function validateLaunchedFact(value, filePath = "session launched fact") {
  if (
    !exactKeys(value, [
      "kind",
      "processId",
      "processIdentity",
      "schemaVersion",
      "sessionId",
      "supervisorId",
    ]) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.kind !== "child-launched" ||
    !Number.isSafeInteger(value.processId) ||
    value.processId <= 0 ||
    typeof value.processIdentity !== "string" ||
    !PROCESS_IDENTITY_PATTERN.test(value.processIdentity)
  ) {
    throw new Error(
      `session launched fact failed integrity validation at ${filePath}`,
    );
  }
  assertIdentifier(value.sessionId, "session ID");
  assertIdentifier(value.supervisorId, "session supervisor ID");
  return value;
}

function validateProcessRecord(record, description) {
  if (
    !plainObject(record) ||
    !Number.isSafeInteger(record.processId) ||
    record.processId <= 0 ||
    typeof record.processIdentity !== "string" ||
    !PROCESS_IDENTITY_PATTERN.test(record.processIdentity)
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return record;
}

function normalizeContainmentObservation(observation, { terminated = false } = {}) {
  if (
    !plainObject(observation) ||
    typeof observation.guarantee !== "string" ||
    !observation.guarantee.trim() ||
    !Array.isArray(observation.knownProcesses) ||
    !Array.isArray(observation.liveProcesses) ||
    !Number.isSafeInteger(observation.liveProcessCount) ||
    observation.liveProcessCount < 0 ||
    observation.liveProcessCount !== observation.liveProcesses.length ||
    observation.knownProcesses.some((record) => {
      try {
        validateProcessRecord(record, "known contained process");
        return false;
      } catch {
        return true;
      }
    }) ||
    observation.liveProcesses.some((record) => {
      try {
        validateProcessRecord(record, "live contained process");
        return false;
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("session containment observation failed integrity validation");
  }
  const knownByIdentity = new Map();
  for (const record of observation.knownProcesses) {
    const key = `${record.processId}:${record.processIdentity}`;
    const previous = knownByIdentity.get(key);
    if (previous && !sameValue(previous, record)) {
      throw new Error("session containment process identity is contradictory");
    }
    knownByIdentity.set(key, record);
  }
  const liveIdentities = new Set();
  for (const record of observation.liveProcesses) {
    const key = `${record.processId}:${record.processIdentity}`;
    if (!knownByIdentity.has(key) || liveIdentities.has(key)) {
      throw new Error("session containment live-process set is inconsistent");
    }
    liveIdentities.add(key);
  }
  if (
    terminated &&
    (observation.processTreeTerminated !== true ||
      observation.liveProcessCount !== 0)
  ) {
    throw new Error("session containment did not prove zero live processes");
  }
  return {
    guarantee: observation.guarantee,
    knownProcesses: [...knownByIdentity.values()].map((record) => ({
      ...record,
    })),
    liveProcesses: observation.liveProcesses.map((record) => ({ ...record })),
    liveProcessCount: observation.liveProcessCount,
    ...(terminated ? { processTreeTerminated: true } : {}),
  };
}

function validateContainmentEvidence(value) {
  return normalizeContainmentObservation(value, { terminated: true });
}

function validateTerminal(value, filePath = "session terminal receipt") {
  if (!plainObject(value) || value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `session terminal receipt failed integrity validation at ${filePath}`,
    );
  }
  assertIdentifier(value.sessionId, "session ID");
  if (value.kind === "closed-unstarted") {
    if (
      !exactKeys(value, [
        "kind",
        "launchCount",
        "operationId",
        "reason",
        "schemaVersion",
        "sessionId",
      ]) ||
      value.launchCount !== 0
    ) {
      throw new Error(
        `session terminal receipt failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.operationId, "session operation ID");
    assertIdentifier(value.reason, "session operation reason");
    return value;
  }
  if (value.kind === "terminated") {
    if (
      !exactKeys(value, [
        "containment",
        "kind",
        "launchCount",
        "launchDisposition",
        "operationId",
        "processTreeTerminated",
        "reason",
        "schemaVersion",
        "sessionId",
      ]) ||
      !["not-started", "started-then-terminated"].includes(
        value.launchDisposition,
      ) ||
      ![0, 1].includes(value.launchCount) ||
      (value.launchDisposition === "not-started" && value.launchCount !== 0) ||
      (value.launchDisposition === "started-then-terminated" &&
        value.launchCount !== 1) ||
      value.processTreeTerminated !== true
    ) {
      throw new Error(
        `session terminal receipt failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.operationId, "session operation ID");
    assertIdentifier(value.reason, "session operation reason");
    validateContainmentEvidence(value.containment);
    return value;
  }
  if (value.kind === "completed" || value.kind === "interrupted") {
    const keys = [
      "containment",
      "kind",
      "launchCount",
      "schemaVersion",
      "sessionId",
      "supervisorId",
      ...(value.kind === "interrupted" ? ["relaunchAllowed"] : []),
    ];
    if (
      !exactKeys(value, keys) ||
      value.launchCount !== 1 ||
      (value.kind === "interrupted" && value.relaunchAllowed !== false)
    ) {
      throw new Error(
        `session terminal receipt failed integrity validation at ${filePath}`,
      );
    }
    assertIdentifier(value.supervisorId, "session supervisor ID");
    validateContainmentEvidence(value.containment);
    return value;
  }
  throw new Error(
    `session terminal receipt failed integrity validation at ${filePath}`,
  );
}

function assertTerminalForSession(terminal, sessionId) {
  if (terminal && terminal.sessionId !== sessionId) {
    throw new Error("session terminal receipt refers to another session");
  }
  return terminal;
}

function normalizeRoot(sessionRoot) {
  if (typeof sessionRoot !== "string" || !sessionRoot.trim()) {
    throw new Error("session supervisor root failed integrity validation");
  }
  const resolved = path.resolve(sessionRoot);
  if (resolved === path.parse(resolved).root) {
    throw new Error("session supervisor root cannot be a filesystem root");
  }
  fs.mkdirSync(resolved, { recursive: true });
  return fs.realpathSync.native(resolved);
}

function createPaths(sessionRoot, sessionId) {
  assertIdentifier(sessionId, "session ID");
  const key = createHash("sha256").update(sessionId).digest("hex");
  const sessionDirectory = path.join(sessionRoot, "durable-sessions", key);
  fs.mkdirSync(sessionDirectory, { recursive: true });
  const realSessionDirectory = fs.realpathSync.native(sessionDirectory);
  const relative = path.relative(sessionRoot, realSessionDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("session directory escaped the supervisor root");
  }
  return {
    directory: realSessionDirectory,
    plan: path.join(realSessionDirectory, "plan.json"),
    authorization: path.join(realSessionDirectory, "authorization.json"),
    startDecision: path.join(realSessionDirectory, "start-decision.json"),
    outcomeDecision: path.join(realSessionDirectory, "outcome-decision.json"),
    launched: path.join(realSessionDirectory, "launched.json"),
    terminal: path.join(realSessionDirectory, "terminal.json"),
  };
}

function createSessionFacts(sessionRoot, sessionId) {
  const paths = createPaths(sessionRoot, sessionId);
  function forThisSession(validator, description) {
    return (value, filePath) => {
      const validated = validator(value, filePath);
      if (validated.sessionId !== sessionId) {
        throw new Error(
          `${description} refers to another session at ${filePath}`,
        );
      }
      return validated;
    };
  }
  const planValidator = forThisSession(validatePlan, "session plan");
  const authorizationValidator = forThisSession(
    validateAuthorization,
    "session authorization",
  );
  const startDecisionValidator = forThisSession(
    validateStartDecision,
    "session start decision",
  );
  const outcomeDecisionValidator = forThisSession(
    validateOutcomeDecision,
    "session outcome decision",
  );
  const launchedValidator = forThisSession(
    validateLaunchedFact,
    "session launched fact",
  );
  const terminalValidator = forThisSession(
    validateTerminal,
    "session terminal receipt",
  );
  return {
    paths,
    plan: () => optionalFact(paths.plan, planValidator),
    authorization: () =>
      optionalFact(paths.authorization, authorizationValidator),
    startDecision: () =>
      optionalFact(paths.startDecision, startDecisionValidator),
    outcomeDecision: () =>
      optionalFact(paths.outcomeDecision, outcomeDecisionValidator),
    launched: () => optionalFact(paths.launched, launchedValidator),
    terminal: () =>
      assertTerminalForSession(
        optionalFact(paths.terminal, terminalValidator),
        sessionId,
      ),
    publishPlan: (value) => publishFact(paths.plan, value, planValidator),
    publishAuthorization: (value) =>
      publishFact(paths.authorization, value, authorizationValidator),
    publishStartDecision: (value) =>
      publishFact(paths.startDecision, value, startDecisionValidator),
    publishOutcomeDecision: (value) =>
      publishFact(paths.outcomeDecision, value, outcomeDecisionValidator),
    publishLaunched: (value) =>
      publishFact(paths.launched, value, launchedValidator),
    publishTerminal: (value) =>
      publishFact(paths.terminal, value, terminalValidator),
  };
}

function readConsistentSession(facts, sessionId) {
  const snapshot = {
    plan: facts.plan(),
    authorization: facts.authorization(),
    startDecision: facts.startDecision(),
    outcomeDecision: facts.outcomeDecision(),
    launched: facts.launched(),
    terminal: facts.terminal(),
  };
  const {
    plan,
    authorization,
    startDecision,
    outcomeDecision,
    launched,
    terminal,
  } = snapshot;
  if (!plan) {
    if (authorization || startDecision || outcomeDecision || launched || terminal) {
      throw new Error("unplanned session contains durable lifecycle facts");
    }
    return snapshot;
  }
  if (plan.sessionId !== sessionId) {
    throw new Error("durable session plan identity changed");
  }
  if (authorization && authorization.planDigest !== plan.planDigest) {
    throw new Error("durable session authorization does not match its plan");
  }
  if (startDecision?.kind === "launch-admitted") {
    if (
      !authorization ||
      startDecision.authorizationId !== authorization.authorizationId ||
      startDecision.planDigest !== authorization.planDigest
    ) {
      throw new Error("durable session launch does not match its authorization");
    }
  }
  if (launched) {
    if (
      startDecision?.kind !== "launch-admitted" ||
      launched.supervisorId !== startDecision.supervisorId
    ) {
      throw new Error("durable child launch does not match its start decision");
    }
  }
  if (
    outcomeDecision?.kind === "completed" ||
    outcomeDecision?.kind === "interrupted"
  ) {
    if (
      startDecision?.kind !== "launch-admitted" ||
      outcomeDecision.supervisorId !== startDecision.supervisorId
    ) {
      throw new Error("durable session outcome does not match its launch");
    }
  }
  if (outcomeDecision?.kind === "terminate") {
    if (!startDecision || startDecision.kind === "closed-unstarted") {
      throw new Error("durable termination has no compatible start decision");
    }
    if (
      startDecision.kind === "stop-before-start" &&
      !sameOperation(startDecision, outcomeDecision)
    ) {
      throw new Error("durable pre-start termination operation changed");
    }
  }
  if (terminal?.kind === "closed-unstarted") {
    if (
      startDecision?.kind !== "closed-unstarted" ||
      !sameOperation(startDecision, terminal) ||
      outcomeDecision ||
      launched
    ) {
      throw new Error("durable closed-session receipt is inconsistent");
    }
  }
  if (terminal?.kind === "terminated") {
    if (
      outcomeDecision?.kind !== "terminate" ||
      !sameOperation(outcomeDecision, terminal) ||
      (terminal.launchCount === 1 &&
        !launched &&
        terminal.containment.knownProcesses.length === 0) ||
      (terminal.launchCount === 0 &&
        (launched || terminal.containment.knownProcesses.length !== 0))
    ) {
      throw new Error("durable termination receipt is inconsistent");
    }
  }
  if (terminal?.kind === "completed") {
    if (
      outcomeDecision?.kind !== "completed" ||
      terminal.supervisorId !== outcomeDecision.supervisorId ||
      !launched
    ) {
      throw new Error("durable completion receipt is inconsistent");
    }
  }
  if (terminal?.kind === "interrupted") {
    if (
      outcomeDecision?.kind !== "interrupted" ||
      terminal.supervisorId !== outcomeDecision.supervisorId ||
      startDecision?.kind !== "launch-admitted"
    ) {
      throw new Error("durable interruption receipt is inconsistent");
    }
  }
  return snapshot;
}

function formatOwner(owner) {
  if (!owner) return null;
  return {
    role: "trusted-supervisor",
    supervisorId: owner.workerId,
    token: owner.token,
    processId: owner.processId,
    processIdentity: owner.processIdentity,
  };
}

function publicTerminal(terminal) {
  if (!terminal) return null;
  const { schemaVersion: _schemaVersion, ...receipt } = terminal;
  return receipt;
}

function sameOperation(left, right) {
  return (
    left?.operationId === right?.operationId && left?.reason === right?.reason
  );
}

function assertSameFact(observed, expected, description) {
  if (!sameValue(observed, expected)) {
    throw new Error(`${description} conflicts with durable session state`);
  }
  return observed;
}

function outcomeTermination(sessionId, operationId, reason) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "terminate",
    sessionId,
    operationId: assertIdentifier(operationId, "session operation ID"),
    reason: assertIdentifier(reason, "session operation reason"),
  };
}

function closedStartDecision(sessionId, operationId, reason, kind) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    sessionId,
    operationId: assertIdentifier(operationId, "session operation ID"),
    reason: assertIdentifier(reason, "session operation reason"),
  };
}

function validateContainmentBoundary(containment) {
  if (
    !plainObject(containment) ||
    typeof containment.guarantee !== "string" ||
    !containment.guarantee.trim() ||
    typeof containment.launch !== "function" ||
    typeof containment.inspect !== "function" ||
    typeof containment.terminate !== "function"
  ) {
    throw new Error("session containment boundary failed integrity validation");
  }
}

async function waitForTerminal(facts, sessionId, pollMilliseconds, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const terminal = readConsistentSession(facts, sessionId).terminal;
    if (terminal) return publicTerminal(terminal);
    await sleep(pollMilliseconds);
  }
  throw new Error(`timed out waiting for durable session ${sessionId}`);
}

async function waitForContainmentZero(containment, pollMilliseconds) {
  const deadline = Date.now() + DEFAULT_WAIT_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const observation = normalizeContainmentObservation(
      await containment.inspect(),
    );
    if (observation.guarantee !== containment.guarantee) {
      throw new Error("session containment guarantee changed during execution");
    }
    if (observation.liveProcessCount === 0) {
      return { ...observation, processTreeTerminated: true };
    }
    await sleep(pollMilliseconds);
  }
  throw new Error("session containment did not reach zero live processes");
}

async function terminateContainment(
  containment,
  { sessionId, operationId, reason },
  pollMilliseconds,
) {
  const termination = await containment.terminate({
    sessionId,
    operationId,
    reason,
  });
  if (
    !plainObject(termination) ||
    termination.kind !== "contained-processes-terminated" ||
    termination.sessionId !== sessionId ||
    termination.operationId !== operationId ||
    termination.processTreeTerminated !== true ||
    termination.guarantee !== containment.guarantee
  ) {
    throw new Error("session containment termination receipt failed integrity validation");
  }
  normalizeContainmentObservation(termination, { terminated: true });
  const finalObservation = await waitForContainmentZero(
    containment,
    pollMilliseconds,
  );
  if (finalObservation.guarantee !== termination.guarantee) {
    throw new Error("session containment guarantee changed after termination");
  }
  const knownByIdentity = new Map();
  for (const record of [
    ...termination.knownProcesses,
    ...finalObservation.knownProcesses,
  ]) {
    validateProcessRecord(record, "terminated contained process");
    knownByIdentity.set(
      `${record.processId}:${record.processIdentity}`,
      { ...record },
    );
  }
  return {
    guarantee: termination.guarantee,
    knownProcesses: [...knownByIdentity.values()],
    liveProcesses: [],
    liveProcessCount: 0,
    processTreeTerminated: true,
  };
}

function createCompletedOutcome(sessionId, supervisorId, kind) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind,
    sessionId,
    supervisorId,
  };
}

function publishChosenOutcome(facts, proposed) {
  return facts.publishOutcomeDecision(proposed).value;
}

async function awaitCompletionOrTermination(
  completion,
  facts,
  pollMilliseconds,
) {
  let settled = false;
  let result;
  let failure;
  Promise.resolve(completion).then(
    (value) => {
      settled = true;
      result = value;
    },
    (error) => {
      settled = true;
      failure = error;
    },
  );
  while (!settled) {
    const outcome = facts.outcomeDecision();
    if (outcome?.kind === "terminate") return { kind: "terminate", outcome };
    await sleep(pollMilliseconds);
  }
  if (failure) return { kind: "failed", error: failure };
  return { kind: "completed", result };
}

function assertChildHandle(handle) {
  if (
    !plainObject(handle) ||
    !Number.isSafeInteger(handle.processId) ||
    handle.processId <= 0 ||
    typeof handle.processIdentity !== "string" ||
    !PROCESS_IDENTITY_PATTERN.test(handle.processIdentity) ||
    !handle.completion ||
    typeof handle.completion.then !== "function"
  ) {
    throw new Error("session containment returned an invalid child handle");
  }
  return handle;
}

async function publishTerminalOnce(facts, terminal) {
  const publication = facts.publishTerminal(terminal);
  if (!sameValue(publication.value, terminal)) {
    throw new Error("session terminal outcome conflicts with durable state");
  }
  return publicTerminal(publication.value);
}

async function finishTermination({
  facts,
  containment,
  sessionId,
  outcome,
  pollMilliseconds,
  childHandle,
}) {
  const containmentReceipt = await terminateContainment(
    containment,
    outcome,
    pollMilliseconds,
  );
  if (childHandle) await childHandle.completion;
  const finalContainment = await waitForContainmentZero(
    containment,
    pollMilliseconds,
  );
  const knownProcesses = new Map();
  for (const record of [
    ...containmentReceipt.knownProcesses,
    ...finalContainment.knownProcesses,
  ]) {
    knownProcesses.set(`${record.processId}:${record.processIdentity}`, record);
  }
  const evidence = {
    guarantee: containmentReceipt.guarantee,
    knownProcesses: [...knownProcesses.values()],
    liveProcesses: [],
    liveProcessCount: 0,
    processTreeTerminated: true,
  };
  const launched = facts.launched();
  const launchCount =
    launched || evidence.knownProcesses.length > 0 ? 1 : 0;
  return publishTerminalOnce(facts, {
    schemaVersion: SCHEMA_VERSION,
    kind: "terminated",
    sessionId,
    operationId: outcome.operationId,
    reason: outcome.reason,
    launchCount,
    launchDisposition:
      launchCount === 1 ? "started-then-terminated" : "not-started",
    processTreeTerminated: true,
    containment: evidence,
  });
}

async function finishInterrupted({
  facts,
  containment,
  sessionId,
  supervisorId,
  pollMilliseconds,
}) {
  const operationId = `interrupted-${createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 32)}`;
  const containmentEvidence = await terminateContainment(
    containment,
    {
      sessionId,
      operationId,
      reason: "child-exited-without-durable-success",
    },
    pollMilliseconds,
  );
  return publishTerminalOnce(facts, {
    schemaVersion: SCHEMA_VERSION,
    kind: "interrupted",
    sessionId,
    supervisorId,
    launchCount: 1,
    relaunchAllowed: false,
    containment: containmentEvidence,
  });
}

async function finishCompleted({
  facts,
  containment,
  sessionId,
  supervisorId,
  pollMilliseconds,
}) {
  const completionOperationId = `complete-${createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 32)}`;
  const containmentEvidence = await terminateContainment(
    containment,
    {
      sessionId,
      operationId: completionOperationId,
      reason: "successful-session-finalization",
    },
    pollMilliseconds,
  );
  return publishTerminalOnce(facts, {
    schemaVersion: SCHEMA_VERSION,
    kind: "completed",
    sessionId,
    supervisorId,
    launchCount: 1,
    containment: containmentEvidence,
  });
}

function completedTerminalStopReceipt(terminal, sessionId, operationId, reason) {
  if (
    !terminal ||
    !["completed", "interrupted"].includes(terminal.kind) ||
    terminal.sessionId !== sessionId ||
    terminal.containment?.processTreeTerminated !== true ||
    terminal.containment?.liveProcessCount !== 0
  ) {
    throw new Error("terminal session cannot acknowledge a safe stop");
  }
  return {
    kind: "terminated",
    sessionId,
    operationId,
    reason,
    launchCount: terminal.launchCount,
    launchDisposition: `${terminal.kind}-before-stop`,
    processTreeTerminated: true,
    containment: structuredClone(terminal.containment),
  };
}

export function createDurableSessionSupervisorClient({
  sessionRoot,
  pollIntervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
  waitTimeoutMilliseconds = DEFAULT_WAIT_TIMEOUT_MILLISECONDS,
  ownerObservationTimeoutMilliseconds =
    DEFAULT_OWNER_OBSERVATION_TIMEOUT_MILLISECONDS,
}) {
  const root = normalizeRoot(sessionRoot);
  const pollMilliseconds = assertPositiveDuration(
    pollIntervalMilliseconds,
    "session supervisor poll interval",
    DEFAULT_POLL_INTERVAL_MILLISECONDS,
  );
  const waitMilliseconds = assertPositiveDuration(
    waitTimeoutMilliseconds,
    "session supervisor wait timeout",
    DEFAULT_WAIT_TIMEOUT_MILLISECONDS,
  );
  const ownerObservationMilliseconds = assertPositiveDuration(
    ownerObservationTimeoutMilliseconds,
    "session supervisor owner observation timeout",
    DEFAULT_OWNER_OBSERVATION_TIMEOUT_MILLISECONDS,
  );
  const registry = createWorkerSessionRegistry(
    path.join(root, "supervisor-ownership"),
  );

  function factsFor(sessionId) {
    return createSessionFacts(root, sessionId);
  }

  async function inspect(sessionId) {
    assertIdentifier(sessionId, "session ID");
    const facts = factsFor(sessionId);
    let snapshot = readConsistentSession(facts, sessionId);
    if (!snapshot.plan) return null;
    const observationDeadline = Date.now() + ownerObservationMilliseconds;
    let owner = registry.inspectLive(sessionId);
    while (
      !snapshot.terminal &&
      !owner &&
      Date.now() < observationDeadline
    ) {
      await sleep(pollMilliseconds);
      owner = registry.inspectLive(sessionId);
      snapshot = readConsistentSession(facts, sessionId);
    }
    snapshot = readConsistentSession(facts, sessionId);
    const { terminal, startDecision, authorization } = snapshot;
    let status = "planned";
    if (authorization) status = "authorized";
    if (startDecision?.kind === "launch-admitted") status = "running";
    if (terminal) status = terminal.kind;
    return {
      sessionId,
      status,
      owner: formatOwner(owner),
      authorization: authorization
        ? {
            authorizationId: authorization.authorizationId,
            planDigest: authorization.planDigest,
          }
        : null,
      launchCount: startDecision?.kind === "launch-admitted" ? 1 : 0,
      relaunchAllowed:
        !terminal && startDecision?.kind !== "launch-admitted",
      terminal: publicTerminal(terminal),
    };
  }

  return {
    async terminalReceipt(sessionId) {
      assertIdentifier(sessionId, "session ID");
      const snapshot = readConsistentSession(factsFor(sessionId), sessionId);
      if (!snapshot.plan) return null;
      return publicTerminal(snapshot.terminal);
    },

    async plan(input) {
      const proposed = normalizePlan(input);
      const facts = factsFor(proposed.sessionId);
      const publication = facts.publishPlan(proposed);
      assertSameFact(publication.value, proposed, "session plan");
      readConsistentSession(facts, proposed.sessionId);
      return {
        sessionId: proposed.sessionId,
        planDigest: proposed.planDigest,
        status: "planned",
      };
    },

    async authorize(input) {
      if (
        !exactKeys(input, ["authorizationId", "planDigest", "sessionId"])
      ) {
        throw new Error("session authorization failed integrity validation");
      }
      const sessionId = assertIdentifier(input.sessionId, "session ID");
      const facts = factsFor(sessionId);
      const snapshot = readConsistentSession(facts, sessionId);
      const { plan, terminal, startDecision } = snapshot;
      if (!plan) throw new Error("session cannot authorize before planning");
      if (
        terminal?.kind === "closed-unstarted" ||
        startDecision?.kind === "closed-unstarted"
      ) {
        throw new Error("closed session cannot authorize");
      }
      if (startDecision?.kind === "stop-before-start") {
        throw new Error("stopped session cannot authorize");
      }
      const authorization = {
        schemaVersion: SCHEMA_VERSION,
        kind: "authorization",
        sessionId,
        authorizationId: assertIdentifier(
          input.authorizationId,
          "session authorization ID",
        ),
        planDigest: assertDigest(
          input.planDigest,
          "session authorization digest",
        ),
      };
      if (authorization.planDigest !== plan.planDigest) {
        throw new Error("session authorization does not match its durable plan");
      }
      const publication = facts.publishAuthorization(authorization);
      assertSameFact(
        publication.value,
        authorization,
        "session authorization",
      );
      return {
        sessionId,
        authorizationId: authorization.authorizationId,
        status: "authorized",
      };
    },

    inspect,

    async startOrAttach({ sessionId }) {
      assertIdentifier(sessionId, "session ID");
      const facts = factsFor(sessionId);
      const snapshot = readConsistentSession(facts, sessionId);
      if (!snapshot.plan) throw new Error("session has not been planned");
      const terminal = snapshot.terminal;
      if (terminal) return publicTerminal(terminal);
      return waitForTerminal(
        facts,
        sessionId,
        pollMilliseconds,
        waitMilliseconds,
      );
    },

    async terminate({ sessionId, operationId, reason }) {
      assertIdentifier(sessionId, "session ID");
      const proposedOutcome = outcomeTermination(
        sessionId,
        operationId,
        reason,
      );
      const facts = factsFor(sessionId);
      const snapshot = readConsistentSession(facts, sessionId);
      if (!snapshot.plan) throw new Error("session has not been planned");
      const terminal = snapshot.terminal;
      if (terminal?.kind === "terminated") {
        if (terminal.operationId !== operationId) {
          throw new Error(
            `session is already terminated by operation ${terminal.operationId}`,
          );
        }
        if (terminal.reason !== reason) {
          throw new Error("session termination operation conflicts with its reason");
        }
        return publicTerminal(terminal);
      }
      if (["completed", "interrupted"].includes(terminal?.kind)) {
        return completedTerminalStopReceipt(
          publicTerminal(terminal),
          sessionId,
          operationId,
          reason,
        );
      }
      if (terminal) {
        throw new Error(`session is already terminal as ${terminal.kind}`);
      }

      let startDecision = snapshot.startDecision;
      if (!startDecision) {
        const proposedStart = closedStartDecision(
          sessionId,
          operationId,
          reason,
          "stop-before-start",
        );
        startDecision = facts.publishStartDecision(proposedStart).value;
      }
      if (startDecision.kind === "closed-unstarted") {
        throw new Error(
          `session is already closed by operation ${startDecision.operationId}`,
        );
      }
      if (
        startDecision.kind === "stop-before-start" &&
        !sameOperation(startDecision, proposedOutcome)
      ) {
        throw new Error(
          `session is already terminated by operation ${startDecision.operationId}`,
        );
      }

      const chosenOutcome = facts.publishOutcomeDecision(proposedOutcome).value;
      if (chosenOutcome.kind !== "terminate") {
        const completedTerminal = await waitForTerminal(
          facts,
          sessionId,
          pollMilliseconds,
          waitMilliseconds,
        );
        return completedTerminalStopReceipt(
          completedTerminal,
          sessionId,
          operationId,
          reason,
        );
      }
      if (!sameOperation(chosenOutcome, proposedOutcome)) {
        throw new Error(
          `session is already terminated by operation ${chosenOutcome.operationId}`,
        );
      }
      return waitForTerminal(
        facts,
        sessionId,
        pollMilliseconds,
        waitMilliseconds,
      );
    },

    async closeUnstarted({ sessionId, operationId, reason }) {
      assertIdentifier(sessionId, "session ID");
      const facts = factsFor(sessionId);
      const snapshot = readConsistentSession(facts, sessionId);
      if (!snapshot.plan) throw new Error("session has not been planned");
      const terminal = snapshot.terminal;
      if (terminal?.kind === "closed-unstarted") {
        if (terminal.operationId !== operationId) {
          throw new Error(
            `session is already closed by operation ${terminal.operationId}`,
          );
        }
        if (terminal.reason !== reason) {
          throw new Error("session close operation conflicts with its reason");
        }
        return publicTerminal(terminal);
      }
      if (terminal) {
        throw new Error(`session is already terminal as ${terminal.kind}`);
      }
      const proposed = closedStartDecision(
        sessionId,
        operationId,
        reason,
        "closed-unstarted",
      );
      const startPublication = facts.publishStartDecision(proposed);
      if (startPublication.value.kind === "launch-admitted") {
        throw new Error("session has already admitted its first launch");
      }
      if (
        startPublication.value.kind !== "closed-unstarted" ||
        !sameOperation(startPublication.value, proposed)
      ) {
        throw new Error(
          `session is already closed by operation ${startPublication.value.operationId}`,
        );
      }
      return publishTerminalOnce(facts, {
        schemaVersion: SCHEMA_VERSION,
        kind: "closed-unstarted",
        sessionId,
        operationId,
        reason,
        launchCount: 0,
      });
    },
  };
}

export async function runDurableSessionSupervisor({
  sessionRoot,
  sessionId,
  supervisorId,
  containment,
  pollIntervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
}) {
  const root = normalizeRoot(sessionRoot);
  assertIdentifier(sessionId, "session ID");
  assertIdentifier(supervisorId, "session supervisor ID");
  validateContainmentBoundary(containment);
  const pollMilliseconds = assertPositiveDuration(
    pollIntervalMilliseconds,
    "session supervisor poll interval",
    DEFAULT_POLL_INTERVAL_MILLISECONDS,
  );
  const facts = createSessionFacts(root, sessionId);
  const initialSnapshot = readConsistentSession(facts, sessionId);
  const plan = initialSnapshot.plan;
  if (!plan) throw new Error("session supervisor cannot start before planning");
  const existingTerminal = initialSnapshot.terminal;
  if (existingTerminal) return publicTerminal(existingTerminal);

  const registry = createWorkerSessionRegistry(
    path.join(root, "supervisor-ownership"),
  );
  const claim = registry.claim({ sessionId, workerId: supervisorId });
  if (!claim.acquired) {
    return {
      kind: "attached-to-live-supervisor",
      sessionId,
      owner: formatOwner(claim.owner),
    };
  }

  async function finishChosenTermination(outcome, childHandle) {
    return finishTermination({
      facts,
      containment,
      sessionId,
      outcome,
      pollMilliseconds,
      childHandle,
    });
  }

  async function recoverAdmittedLaunch(startDecision) {
    let outcome = facts.outcomeDecision();
    if (!outcome) {
      outcome = publishChosenOutcome(
        facts,
        createCompletedOutcome(sessionId, startDecision.supervisorId, "interrupted"),
      );
    }
    if (outcome.kind === "terminate") {
      return finishChosenTermination(outcome, null);
    }
    if (outcome.kind === "completed") {
      return finishCompleted({
        facts,
        containment,
        sessionId,
        supervisorId: outcome.supervisorId,
        pollMilliseconds,
      });
    }
    return finishInterrupted({
      facts,
      containment,
      sessionId,
      supervisorId: outcome.supervisorId,
      pollMilliseconds,
    });
  }

  while (true) {
    const snapshot = readConsistentSession(facts, sessionId);
    const { terminal } = snapshot;
    if (terminal) return publicTerminal(terminal);
    let { startDecision } = snapshot;
    if (startDecision?.kind === "closed-unstarted") {
      return publishTerminalOnce(facts, {
        schemaVersion: SCHEMA_VERSION,
        kind: "closed-unstarted",
        sessionId,
        operationId: startDecision.operationId,
        reason: startDecision.reason,
        launchCount: 0,
      });
    }

    const chosenOutcome = snapshot.outcomeDecision;
    if (chosenOutcome?.kind === "terminate") {
      return finishChosenTermination(chosenOutcome, null);
    }
    if (startDecision?.kind === "stop-before-start") {
      const termination = chosenOutcome ?? publishChosenOutcome(
        facts,
        outcomeTermination(
          sessionId,
          startDecision.operationId,
          startDecision.reason,
        ),
      );
      if (termination.kind !== "terminate") {
        throw new Error("session stop decision conflicts with its outcome");
      }
      return finishChosenTermination(termination, null);
    }

    const authorization = snapshot.authorization;
    if (!authorization) {
      await sleep(pollMilliseconds);
      continue;
    }
    if (authorization.planDigest !== plan.planDigest) {
      throw new Error("session authorization no longer matches its durable plan");
    }

    if (startDecision?.kind === "launch-admitted") {
      return recoverAdmittedLaunch(startDecision);
    }
    const proposedStart = {
      schemaVersion: SCHEMA_VERSION,
      kind: "launch-admitted",
      sessionId,
      authorizationId: authorization.authorizationId,
      planDigest: authorization.planDigest,
      ownerToken: claim.owner.token,
      supervisorId,
    };
    const startPublication = facts.publishStartDecision(proposedStart);
    startDecision = startPublication.value;
    if (!startPublication.created || !sameValue(startDecision, proposedStart)) {
      if (startDecision.kind === "launch-admitted") {
        return recoverAdmittedLaunch(startDecision);
      }
      continue;
    }

    const outcomeBeforeLaunch = facts.outcomeDecision();
    if (outcomeBeforeLaunch?.kind === "terminate") {
      return finishChosenTermination(outcomeBeforeLaunch, null);
    }
    if (outcomeBeforeLaunch) {
      throw new Error("session outcome was decided before its first launch");
    }

    let childHandle;
    try {
      childHandle = assertChildHandle(
        await containment.launch({
          sessionId,
          authorization: {
            authorizationId: authorization.authorizationId,
            planDigest: authorization.planDigest,
          },
          child: plan.child,
        }),
      );
      const launchedPublication = facts.publishLaunched({
        schemaVersion: SCHEMA_VERSION,
        kind: "child-launched",
        sessionId,
        supervisorId,
        processId: childHandle.processId,
        processIdentity: childHandle.processIdentity,
      });
      if (
        !sameValue(launchedPublication.value, {
          schemaVersion: SCHEMA_VERSION,
          kind: "child-launched",
          sessionId,
          supervisorId,
          processId: childHandle.processId,
          processIdentity: childHandle.processIdentity,
        })
      ) {
        throw new Error("session child launch conflicts with durable state");
      }
    } catch (error) {
      const outcome = publishChosenOutcome(
        facts,
        createCompletedOutcome(sessionId, supervisorId, "interrupted"),
      );
      if (outcome.kind === "terminate") {
        return finishChosenTermination(outcome, childHandle);
      }
      await finishInterrupted({
        facts,
        containment,
        sessionId,
        supervisorId,
        pollMilliseconds,
      });
      throw error;
    }

    const observed = await awaitCompletionOrTermination(
      childHandle.completion,
      facts,
      pollMilliseconds,
    );
    if (observed.kind === "terminate") {
      return finishChosenTermination(observed.outcome, childHandle);
    }
    if (
      observed.kind === "failed" ||
      observed.result?.exitCode !== 0 ||
      observed.result?.signal !== null
    ) {
      const outcome = publishChosenOutcome(
        facts,
        createCompletedOutcome(sessionId, supervisorId, "interrupted"),
      );
      if (outcome.kind === "terminate") {
        return finishChosenTermination(outcome, childHandle);
      }
      return finishInterrupted({
        facts,
        containment,
        sessionId,
        supervisorId,
        pollMilliseconds,
      });
    }

    const completedOutcome = publishChosenOutcome(
      facts,
      createCompletedOutcome(sessionId, supervisorId, "completed"),
    );
    if (completedOutcome.kind === "terminate") {
      return finishChosenTermination(completedOutcome, childHandle);
    }
    if (completedOutcome.kind !== "completed") {
      return finishInterrupted({
        facts,
        containment,
        sessionId,
        supervisorId: completedOutcome.supervisorId,
        pollMilliseconds,
      });
    }
    return finishCompleted({
      facts,
      containment,
      sessionId,
      supervisorId,
      pollMilliseconds,
    });
  }
}
