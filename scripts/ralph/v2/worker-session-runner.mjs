import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  codexStartupEventsReady,
  isolatedCodexFilesystemConfig,
  workerCodexModelArguments,
} from "../worker-isolation.mjs";

const [configPath, expectedDigest] = process.argv.slice(2);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = fs.readFileSync(configPath);
const config = JSON.parse(bytes.toString("utf8"));
if (
  digest(bytes) !== expectedDigest ||
  config?.schemaVersion !== 1 ||
  config.kind !== "implementation-worker" ||
  !path.posix.isAbsolute(config.worktreePath) ||
  !path.posix.isAbsolute(config.resultPath) ||
  !path.posix.isAbsolute(config.promptPath)
) throw new Error("implementation worker configuration failed integrity validation");
if (process.getuid?.() !== 65534 || process.getgid?.() !== 65534) {
  throw new Error("implementation worker did not enter the unprivileged identity");
}
const prompt = fs.readFileSync(config.promptPath, "utf8");
if (digest(prompt) !== config.promptSha256) throw new Error("worker prompt digest changed");

const profile = "ralph-v2-worker";
const args = [
  ...(config.codexPrefixArguments ?? []),
  "exec", "--ephemeral", "--json", "--ignore-user-config",
  ...workerCodexModelArguments({ readOnly: false }),
  "-c", 'approval_policy="never"',
  "-c", `default_permissions=${JSON.stringify(profile)}`,
  "-c", `permissions.${profile}.extends=":workspace"`,
  "-c", `permissions.${profile}.filesystem=${isolatedCodexFilesystemConfig([
    config.gitMetadataRoot,
    config.dependencyRoot,
    config.workerHome,
    ...(config.protectedPaths ?? []),
  ])}`,
  "-c", `permissions.${profile}.network.enabled=false`,
  "-c", 'shell_environment_policy.inherit="core"',
  "-c", 'shell_environment_policy.ignore_default_excludes=false',
  "-c", 'shell_environment_policy.exclude=["*TOKEN*","*SECRET*","GH_*","GITHUB_*","AWS_*","AZURE_*","SUPABASE_*","VERCEL_*"]',
  "--cd", config.worktreePath,
  "--output-schema", config.resultSchemaPath,
  "--output-last-message", config.resultPath,
  "-",
];
const eventDescriptor = fs.openSync(config.eventLogPath, "wx", 0o600);
let result;
try {
  result = await new Promise((resolve, reject) => {
    const child = spawn(config.codexExecutable, args, {
      cwd: config.worktreePath,
      env: {
        HOME: config.workerHome,
        CODEX_HOME: config.codexHome,
        PATH: "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        NO_COLOR: "1",
        GIT_DIR: config.gitDirectory,
        GIT_WORK_TREE: config.worktreePath,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      stdout.push(bytes);
      fs.writeSync(eventDescriptor, bytes);
    });
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr),
    }));
    child.stdin.end(prompt);
  });
  fs.writeSync(eventDescriptor, Buffer.from("\n[stderr]\n"));
  fs.writeSync(eventDescriptor, result.stderr);
  fs.fsyncSync(eventDescriptor);
} finally {
  fs.closeSync(eventDescriptor);
}
if (result.code !== 0 || result.signal || !codexStartupEventsReady(result.stdout.toString("utf8"))) {
  throw new Error("implementation Codex session failed or was not fresh");
}
const output = JSON.parse(fs.readFileSync(config.resultPath, "utf8"));
const commonResultValid =
  ["completed", "blocked", "failed"].includes(output.status) &&
  output.issueNumber === config.issueNumber &&
  typeof output.testsPassed === "boolean" &&
  typeof output.reviewCompleted === "boolean" &&
  typeof output.ambiguous === "boolean" &&
  typeof output.blockerKind === "string" &&
  typeof output.summary === "string" &&
  output.summary.trim();
const completedResultValid =
  output.status !== "completed" ||
  (output.testsPassed === true &&
    output.reviewCompleted === true &&
    output.ambiguous === false &&
    output.blockerKind === "none");
const noncompletedResultValid =
  output.status === "completed" ||
  (output.blockerKind !== "none" &&
    (output.status !== "blocked" || output.ambiguous === true));
if (!commonResultValid || !completedResultValid || !noncompletedResultValid) {
  throw new Error("implementation worker did not satisfy its result contract");
}
const receipt = {
  schemaVersion: 1,
  sessionId: config.sessionId,
  issueNumber: config.issueNumber,
  configSha256: expectedDigest,
  resultSha256: digest(fs.readFileSync(config.resultPath)),
  resultStatus: output.status,
  freshSession: true,
  processId: process.pid,
  uid: process.getuid(),
  gid: process.getgid(),
};
fs.writeFileSync(config.runnerReceiptPath, `${JSON.stringify(receipt)}\n`, { flag: "wx" });
