import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  codexStartupEventsReady,
  isolatedCodexFilesystemConfig,
  workerCodexModelArguments,
} from "../worker-isolation.mjs";

const [configPath, expectedConfigSha256] = process.argv.slice(2);
const MAX_EVENT_LOG_BYTES = 8 * 1024 * 1024;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publishOnce(filePath, value) {
  const bytes = Buffer.from(serialize(value), "utf8");
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  const descriptor = fs.openSync(candidatePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.linkSync(candidatePath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!fs.readFileSync(filePath).equals(bytes)) {
      throw new Error("review runner receipt publication conflicts");
    }
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function assertLinuxPath(value, description) {
  if (
    typeof value !== "string" ||
    !path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.includes("\0")
  ) {
    throw new Error(`${description} failed integrity validation`);
  }
  return value;
}

function readConfig() {
  if (
    !configPath ||
    !path.posix.isAbsolute(configPath) ||
    !/^[a-f0-9]{64}$/.test(expectedConfigSha256 ?? "")
  ) {
    throw new Error("review runner launch failed integrity validation");
  }
  const bytes = fs.readFileSync(configPath);
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (
    sha256(bytes) !== expectedConfigSha256 ||
    parsed?.schemaVersion !== 1 ||
    parsed.kind !== "reviewer-session" ||
    typeof parsed.sessionId !== "string" ||
    typeof parsed.axis !== "string" ||
    typeof parsed.promptSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(parsed.promptSha256) ||
    !Number.isSafeInteger(parsed.deadlineEpochMilliseconds) ||
    parsed.deadlineEpochMilliseconds <= 0 ||
    !Array.isArray(parsed.codexPrefixArguments) ||
    parsed.codexPrefixArguments.some(
      (entry) => typeof entry !== "string" || entry.includes("\0"),
    )
  ) {
    throw new Error("review runner configuration failed integrity validation");
  }
  for (const [value, description] of [
    [parsed.promptPath, "review prompt path"],
    [parsed.resultPath, "review result path"],
    [parsed.eventLogPath, "review event-log path"],
    [parsed.runnerReceiptPath, "review runner-receipt path"],
    [parsed.worktreePath, "review worktree path"],
    [parsed.reviewSchemaPath, "review schema path"],
    [parsed.workerHome, "review worker home"],
    [parsed.codexHome, "review Codex home"],
    [parsed.dependencyRoot, "review dependency root"],
    [parsed.codexExecutable, "review Codex executable"],
  ]) {
    assertLinuxPath(value, description);
  }
  return parsed;
}

function codexArguments(config) {
  const profile = "ralph-v2-reviewer";
  return [
    ...config.codexPrefixArguments,
    "exec",
    "--ephemeral",
    "--json",
    "--ignore-user-config",
    ...workerCodexModelArguments({ readOnly: true, reviewKind: "exhaustive" }),
    "-c",
    'approval_policy="never"',
    "-c",
    `default_permissions=${JSON.stringify(profile)}`,
    "-c",
    `permissions.${profile}.extends=":read-only"`,
    "-c",
    `permissions.${profile}.filesystem=${isolatedCodexFilesystemConfig([
      config.worktreePath,
      config.dependencyRoot,
      config.workerHome,
    ])}`,
    "-c",
    `permissions.${profile}.network.enabled=false`,
    "-c",
    'shell_environment_policy.inherit="core"',
    "-c",
    'shell_environment_policy.ignore_default_excludes=false',
    "-c",
    'shell_environment_policy.exclude=["*TOKEN*","*SECRET*","GH_*","GITHUB_*","AWS_*","AZURE_*","SUPABASE_*","VERCEL_*"]',
    "--cd",
    config.worktreePath,
    "--output-schema",
    config.reviewSchemaPath,
    "--output-last-message",
    config.resultPath,
    "-",
  ];
}

async function runCodex(config, prompt, eventDescriptor) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.codexExecutable, codexArguments(config), {
      cwd: config.worktreePath,
      env: {
        CODEX_HOME: config.codexHome,
        HOME: config.workerHome,
        LANG: "C.UTF-8",
        NO_COLOR: "1",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let byteCount = 0;
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const collect = (target, streamLive = false) => (chunk) => {
      const bytes = Buffer.from(chunk);
      byteCount += bytes.length;
      if (byteCount > MAX_EVENT_LOG_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("review Codex output exceeded its bound")));
        return;
      }
      target.push(bytes);
      if (streamLive) fs.writeSync(eventDescriptor, bytes);
    };
    child.stdout.on("data", collect(stdout, true));
    child.stderr.on("data", collect(stderr));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code, signal) =>
      finish(() =>
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }),
      ),
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("review Codex deadline expired")));
    }, Math.max(1, config.deadlineEpochMilliseconds - Date.now()));
    child.stdin.end(prompt);
  });
}

const config = readConfig();
if (process.getuid?.() !== 65534 || process.getgid?.() !== 65534) {
  throw new Error("review runner did not enter the unprivileged identity");
}
const prompt = fs.readFileSync(config.promptPath, "utf8");
if (sha256(prompt) !== config.promptSha256) {
  throw new Error("review prompt digest failed integrity validation");
}
if (fs.existsSync(config.resultPath) || fs.existsSync(config.runnerReceiptPath)) {
  throw new Error("review runner refused pre-existing output");
}
const eventDescriptor = fs.openSync(config.eventLogPath, "wx", 0o600);
let result;
let eventLog;
try {
  result = await runCodex(config, prompt, eventDescriptor);
  const stderrHeader = Buffer.from("\n[stderr]\n", "utf8");
  eventLog = Buffer.concat([result.stdout, stderrHeader, result.stderr]);
  fs.writeSync(eventDescriptor, stderrHeader);
  fs.writeSync(eventDescriptor, result.stderr);
  fs.fsyncSync(eventDescriptor);
} finally {
  fs.closeSync(eventDescriptor);
}
if (result.code !== 0 || result.signal !== null) {
  throw new Error(`review Codex exited unsuccessfully (${result.code ?? result.signal})`);
}
if (!codexStartupEventsReady(result.stdout.toString("utf8"))) {
  throw new Error("review Codex did not prove a fresh session startup");
}
const resultBytes = fs.readFileSync(config.resultPath);
JSON.parse(resultBytes.toString("utf8"));
publishOnce(config.runnerReceiptPath, {
  schemaVersion: 1,
  sessionId: config.sessionId,
  axis: config.axis,
  configSha256: expectedConfigSha256,
  resultSha256: sha256(resultBytes),
  eventLogSha256: sha256(eventLog),
  freshSession: true,
  processId: process.pid,
  uid: process.getuid(),
  gid: process.getgid(),
});
