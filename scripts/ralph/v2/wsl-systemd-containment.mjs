import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { windowsToWslPath } from "./wsl-worker-sandbox.mjs";

const execFileAsync = promisify(execFile);
const SCHEMA_VERSION = 1;
const DEFAULT_INSPECTION_TIMEOUT_MILLISECONDS = 10_000;
const HOST_SOURCE_PATH = fileURLToPath(
  new URL("./wsl-systemd-session-host.mjs", import.meta.url),
);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const UNIT_PATTERN = /^ralph-v2-[a-f0-9]{48}\.service$/;
const SETPRIV_PREFIX = [
  "--no-new-privs",
  "--bounding-set=-all",
  "--reuid=65534",
  "--regid=65534",
  "--clear-groups",
  "env",
];
const SAFE_WINDOWS_ENVIRONMENT_KEYS = new Set([
  "APPDATA",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "OS",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSame(left, right) {
  return serialize(left) === serialize(right);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `WSL systemd fact failed integrity validation at ${filePath}`,
      { cause: error },
    );
  }
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

function publishOnce(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, serialize(value));
  try {
    fs.linkSync(candidatePath, filePath);
    return { created: true, value };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return { created: false, value: readJson(filePath) };
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function assertString(value, description, maximumLength = 32_768) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function assertLinuxAbsolutePath(value, description) {
  const candidate = assertString(value, description);
  if (!path.posix.isAbsolute(candidate) || path.posix.normalize(candidate) !== candidate) {
    throw new Error(`${description} must be a normalized absolute Linux path`);
  }
  return candidate;
}

function normalizeEnvironment(value) {
  if (
    !plainObject(value) ||
    Object.entries(value).some(
      ([name, entry]) =>
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
        typeof entry !== "string" ||
        entry.length > 32_768 ||
        entry.includes("\0"),
    )
  ) {
    throw new Error("WSL systemd child environment failed integrity validation");
  }
  const names = Object.keys(value).map((name) => name.toUpperCase());
  if (new Set(names).size !== names.length) {
    throw new Error("WSL systemd child environment names conflict");
  }
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertUnprivilegedSetprivLaunch(executable, args) {
  if (executable !== "/usr/bin/setpriv") {
    throw new Error("WSL systemd child must use the trusted setpriv boundary");
  }
  if (
    args.length <= SETPRIV_PREFIX.length ||
    SETPRIV_PREFIX.some((entry, index) => args[index] !== entry)
  ) {
    throw new Error("WSL systemd setpriv arguments failed integrity validation");
  }
  let commandIndex = SETPRIV_PREFIX.length;
  while (
    commandIndex < args.length &&
    /^[A-Za-z_][A-Za-z0-9_]*=[^\0]*$/.test(args[commandIndex])
  ) {
    commandIndex += 1;
  }
  if (
    commandIndex >= args.length ||
    !path.posix.isAbsolute(args[commandIndex])
  ) {
    throw new Error("WSL systemd setpriv command must be an absolute Linux path");
  }
}

function normalizeChild(value) {
  if (!plainObject(value) || !Array.isArray(value.args)) {
    throw new Error("WSL systemd child failed integrity validation");
  }
  const executable = assertLinuxAbsolutePath(
    value.executable,
    "WSL systemd child executable",
  );
  const args = value.args.map((entry) =>
    assertString(entry, "WSL systemd child argument"),
  );
  assertUnprivilegedSetprivLaunch(executable, args);
  return {
    executable,
    args,
    cwd: assertLinuxAbsolutePath(value.cwd, "WSL systemd child cwd"),
    environment: normalizeEnvironment(value.environment),
  };
}

function normalizeRuntimeTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400) {
    throw new Error("WSL systemd runtime timeout failed integrity validation");
  }
  return value;
}

function planMaterial({ sessionId, runtimeTimeoutSeconds, child }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: assertString(sessionId, "WSL systemd session ID", 500),
    runtimeTimeoutSeconds: normalizeRuntimeTimeout(runtimeTimeoutSeconds),
    child: normalizeChild(child),
  };
}

export function wslSystemdPlanDigest(value) {
  return sha256(serialize(planMaterial(value)));
}

export function normalizeWslSystemdConfig(value) {
  if (!plainObject(value) || value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("WSL systemd configuration failed integrity validation");
  }
  const material = planMaterial(value);
  const planDigest = wslSystemdPlanDigest(material);
  const expectedUnitName = `ralph-v2-${sha256(
    `${material.sessionId}\0${planDigest}`,
  ).slice(0, 48)}.service`;
  if (
    value.planDigest !== planDigest ||
    value.unitName !== expectedUnitName ||
    !UNIT_PATTERN.test(value.unitName)
  ) {
    throw new Error("WSL systemd plan identity failed integrity validation");
  }
  return { ...material, planDigest, unitName: expectedUnitName };
}

function wslExecutablePath() {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("Ralph cannot locate wsl.exe");
  const executable = path.join(systemRoot, "System32", "wsl.exe");
  if (!fs.existsSync(executable)) throw new Error("Ralph requires WSL2");
  return executable;
}

function safeWindowsEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) =>
        SAFE_WINDOWS_ENVIRONMENT_KEYS.has(name.toUpperCase()) &&
        typeof value === "string",
    ),
  );
}

function assertUnitName(value) {
  if (typeof value !== "string" || !UNIT_PATTERN.test(value)) {
    throw new Error("WSL systemd unit name failed integrity validation");
  }
  return value;
}

export function createWslSystemdChildPlan({
  containmentRoot,
  sessionId,
  runtimeTimeoutSeconds,
  child,
}) {
  if (
    typeof containmentRoot !== "string" ||
    !path.win32.isAbsolute(containmentRoot)
  ) {
    throw new Error("WSL systemd containment root must be an absolute Windows path");
  }
  fs.mkdirSync(containmentRoot, { recursive: true });
  const root = fs.realpathSync.native(containmentRoot);
  const material = planMaterial({ sessionId, runtimeTimeoutSeconds, child });
  const planDigest = wslSystemdPlanDigest(material);
  const unitName = `ralph-v2-${sha256(
    `${material.sessionId}\0${planDigest}`,
  ).slice(0, 48)}.service`;
  const config = normalizeWslSystemdConfig({
    ...material,
    planDigest,
    unitName,
  });
  const configPath = path.join(root, "wsl-systemd-launch.json");
  const publication = publishOnce(configPath, config);
  if (!exactSame(publication.value, config)) {
    throw new Error("WSL systemd launch configuration conflicts");
  }
  const linuxHostPath = windowsToWslPath(HOST_SOURCE_PATH);
  const linuxConfigPath = windowsToWslPath(configPath);
  const systemdArguments = [
    "/usr/bin/systemd-run",
    "--quiet",
    "--wait",
    "--collect",
    `--unit=${unitName}`,
    "--property=Type=exec",
    "--property=KillMode=control-group",
    "--property=SendSIGKILL=yes",
    "--property=TimeoutStopSec=5s",
    `--property=RuntimeMaxSec=${config.runtimeTimeoutSeconds}s`,
    "--property=TasksMax=512",
    "/usr/local/bin/node",
    linuxHostPath,
    "host",
    linuxConfigPath,
  ];
  return {
    unitName,
    planDigest,
    configPath,
    windowsChild: {
      executable: wslExecutablePath(),
      args: ["--", ...systemdArguments],
      cwd: root,
      environment: {},
      holdBeforeSpawn: false,
      tokenMode: "trusted-wsl-bridge",
    },
  };
}

export async function inspectWslSystemdUnit(
  unitNameInput,
  timeoutMilliseconds = DEFAULT_INSPECTION_TIMEOUT_MILLISECONDS,
) {
  const unitName = assertUnitName(unitNameInput);
  if (
    !Number.isSafeInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1 ||
    timeoutMilliseconds > 60_000
  ) {
    throw new Error("WSL systemd inspection timeout failed integrity validation");
  }
  let result;
  try {
    result = await execFileAsync(
      wslExecutablePath(),
      ["--", "/usr/local/bin/node", windowsToWslPath(HOST_SOURCE_PATH), "inspect", unitName],
      {
        encoding: "utf8",
        env: safeWindowsEnvironment(),
        timeout: timeoutMilliseconds,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(
      `WSL systemd inspection failed: ${String(
        error?.stderr || error?.stdout || error?.message || error,
      ).trim()}`,
      { cause: error },
    );
  }
  let inspection;
  try {
    inspection = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error("WSL systemd inspection output failed integrity validation", {
      cause: error,
    });
  }
  if (
    !plainObject(inspection) ||
    inspection.schemaVersion !== SCHEMA_VERSION ||
    inspection.unitName !== unitName ||
    typeof inspection.unitExists !== "boolean" ||
    typeof inspection.active !== "boolean" ||
    typeof inspection.populated !== "boolean" ||
    typeof inspection.loadState !== "string" ||
    typeof inspection.activeState !== "string" ||
    typeof inspection.subState !== "string" ||
    typeof inspection.controlGroup !== "string" ||
    !Number.isSafeInteger(inspection.mainProcessId) ||
    inspection.mainProcessId < 0 ||
    typeof inspection.result !== "string"
  ) {
    throw new Error("WSL systemd inspection receipt failed integrity validation");
  }
  return inspection;
}

export const wslSystemdProtocol = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  digestPattern: DIGEST_PATTERN,
  unitPattern: UNIT_PATTERN,
});
