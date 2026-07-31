import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runOvernightCli } from "./cli.mjs";
import { assertProductionPreflight } from "./production-preflight.mjs";
import { createRalphRuntime } from "./production-runtime.mjs";
import { createProductionGitHubAdapter } from "./production-github-adapter.mjs";
import { startRuntimeArtifactStreamer } from "./runtime-artifact-stream.mjs";
import { redactCredentialPatterns } from "../queue.mjs";

function positiveInteger(value, description, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${description} failed integrity validation`);
  }
  return parsed;
}

export function parseProductionArguments(args) {
  const [command, ...tokens] = args;
  if (!["run", "status", "audit", "stop"].includes(command)) {
    throw new Error(`unknown production Ralph command: ${command ?? "<missing>"}`);
  }
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`invalid production Ralph argument: ${name ?? "<missing>"}`);
    }
    if (values.has(name)) throw new Error(`duplicate production Ralph argument: ${name}`);
    values.set(name, value);
  }
  const known = new Set([
    "--repository-path", "--runtime-path", "--github-repository", "--github-actor",
    "--queue-path", "--mode", "--max-issues", "--deadline-hours", "--poll-seconds",
    "--implementation-timeout-seconds", "--verification-timeout-seconds",
    "--max-controller-errors", "--trusted-dependency-root",
  ]);
  for (const name of values.keys()) {
    if (!known.has(name)) throw new Error(`unknown production Ralph argument: ${name}`);
  }
  const repositoryPath = values.get("--repository-path");
  const runtimePath = values.get("--runtime-path");
  const githubRepository = values.get("--github-repository");
  if (
    !path.win32.isAbsolute(repositoryPath ?? "") ||
    !path.win32.isAbsolute(runtimePath ?? "") ||
    !/^[^/\s]+\/[^/\s]+$/.test(githubRepository ?? "")
  ) throw new Error("production Ralph requires repository, runtime, and GitHub repository paths");
  const mode = values.get("--mode") ?? "PrOnly";
  if (!["DryRun", "PrOnly", "AutoMerge"].includes(mode)) {
    throw new Error("production Ralph mode failed integrity validation");
  }
  const deadlineHours = positiveInteger(
    values.get("--deadline-hours") ?? "12", "deadline", 1, 168,
  );
  return {
    command,
    repositoryPath: path.win32.resolve(repositoryPath),
    runtimePath: path.win32.resolve(runtimePath),
    githubRepository,
    githubActor: values.get("--github-actor"),
    queuePath: path.win32.resolve(
      values.get("--queue-path") ?? path.win32.join(repositoryPath, "scripts", "ralph", "architecture-queue.json"),
    ),
    mode,
    maxIssues: positiveInteger(values.get("--max-issues") ?? "24", "issue limit", 1, 100),
    deadlineMilliseconds: deadlineHours * 60 * 60 * 1_000,
    pollIntervalMilliseconds:
      positiveInteger(values.get("--poll-seconds") ?? "30", "poll interval", 5, 300) * 1_000,
    implementationTimeoutMilliseconds:
      positiveInteger(
        values.get("--implementation-timeout-seconds") ?? "14400",
        "implementation timeout",
        60,
        14_400,
      ) * 1_000,
    verificationTimeoutMilliseconds:
      positiveInteger(
        values.get("--verification-timeout-seconds") ?? "3600",
        "verification timeout",
        60,
        14_400,
      ) * 1_000,
    maxConsecutiveErrors: positiveInteger(
      values.get("--max-controller-errors") ?? "5", "controller retry limit", 1, 10,
    ),
    trustedDependencyRoot:
      values.get("--trusted-dependency-root") ??
      "/var/lib/betterr-me-ralph/deps-source/node_modules",
  };
}

function sanitizedSummaryValue(value, depth = 0) {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") {
    return redactCredentialPatterns(value).slice(0, 10_000);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 1_000).map((entry) => sanitizedSummaryValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 1_000).map(([key, entry]) => [
      redactCredentialPatterns(key).slice(0, 200),
      sanitizedSummaryValue(entry, depth + 1),
    ]));
  }
  return String(value).slice(0, 1_000);
}

function replaceAtomically(filePath, bytes) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, bytes, { flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
}

export function writeOvernightSummary(runtimePath, result, completedAt = new Date()) {
  const summaryRoot = path.join(runtimePath, "summaries");
  fs.mkdirSync(summaryRoot, { recursive: true });
  const completedAtIso = completedAt.toISOString();
  const timestamp = completedAtIso.replaceAll(":", "-");
  const safeResult = sanitizedSummaryValue(result);
  const bytes = `${JSON.stringify({ schemaVersion: 1, completedAt: completedAtIso, ...safeResult }, null, 2)}\n`;
  const immutablePath = path.join(summaryRoot, `overnight-${timestamp}.json`);
  fs.writeFileSync(immutablePath, bytes, { flag: "wx" });
  const latestPath = path.join(summaryRoot, "latest.json");
  replaceAtomically(latestPath, bytes);
  const canonicalPath = path.join(summaryRoot, "overnight-summary.json");
  replaceAtomically(canonicalPath, bytes);
  replaceAtomically(path.join(runtimePath, "overnight-summary.json"), bytes);
  const issueLines = (safeResult.issues ?? []).map((issue) => {
    const rawBlocker = issue.blocker === undefined
      ? ""
      : ` — ${typeof issue.blocker === "string" ? issue.blocker : JSON.stringify(issue.blocker)}`;
    const blocker = redactCredentialPatterns(rawBlocker)
      .replace(/[\r\n]+/g, " ")
      .slice(0, 1_000);
    return `- #${issue.number}: ${issue.disposition ?? "unknown"}${blocker}`;
  });
  const audit = safeResult.queueAudit;
  const markdown = [
    "# Ralph v2 overnight summary",
    "",
    `Completed at: ${completedAtIso}`,
    `Stop reason: \`${safeResult.stopReason ?? "unknown"}\``,
    `Completed: ${safeResult.completed === true ? "yes" : "no"}`,
    `Run attempts: ${safeResult.runAttempts ?? 0}`,
    "",
    "## Issues",
    "",
    ...(issueLines.length > 0 ? issueLines : ["- No issue records."]),
    ...(audit
      ? [
          "",
          "## Queue audit",
          "",
          `- Closed: ${(audit.closedIssueNumbers ?? []).map((number) => `#${number}`).join(", ") || "none"}`,
          `- Preserved non-mergeable: ${(audit.nonMergeableIssueNumbers ?? []).map((number) => `#${number}`).join(", ") || "none"}`,
          `- Unresolved: ${(audit.unresolvedIssueNumbers ?? []).map((number) => `#${number}`).join(", ") || "none"}`,
        ]
      : []),
    "",
  ].join("\n");
  const immutableMarkdownPath = path.join(summaryRoot, `overnight-${timestamp}.md`);
  fs.writeFileSync(immutableMarkdownPath, markdown, { flag: "wx" });
  const latestMarkdownPath = path.join(summaryRoot, "latest.md");
  replaceAtomically(latestMarkdownPath, markdown);
  const canonicalMarkdownPath = path.join(summaryRoot, "overnight-summary.md");
  replaceAtomically(canonicalMarkdownPath, markdown);
  replaceAtomically(path.join(runtimePath, "overnight-summary.md"), markdown);
  return immutablePath;
}

function statusLine(event) {
  if (event.kind === "controller-error") {
    return `[ralph-v2] controller error ${event.consecutiveErrors}: ${event.error}`;
  }
  const issues = event.status.issues
    .map((issue) => `#${issue.number}:${issue.disposition}`)
    .join(", ");
  return `[ralph-v2] poll ${event.runAttempts}: ${issues || "no claimed issues"}`;
}

export async function runVisibleOvernight({
  runtime,
  runtimePath,
  mode,
  maxIssues,
  pollIntervalMilliseconds,
  retryDelayMilliseconds,
  maxConsecutiveErrors,
  deadlineEpochMilliseconds,
  stdout = console.log,
}) {
  const streamer = startRuntimeArtifactStreamer({ runtimePath, stdout });
  try {
    const execution = await runOvernightCli({
      mode,
      maxIssues,
      pollIntervalMilliseconds,
      retryDelayMilliseconds,
      maxConsecutiveErrors,
      deadlineEpochMilliseconds,
    }, { runtime, onStatus: (event) => stdout(statusLine(event)) });
    return execution.result;
  } finally {
    streamer.stop();
  }
}

export async function runProductionDryRun({ github, maxIssues }) {
  const readyIssues = await github.listReadyIssues();
  return {
    stopRequested: false,
    workerLease: null,
    issues: readyIssues.slice(0, maxIssues).map((issue) => ({
      number: issue.number,
      disposition: "ready",
    })),
  };
}

export async function runProductionOvernightWithSummary({
  runtime,
  runtimePath,
  run = runVisibleOvernight,
  ...options
}) {
  try {
    const result = await run({ runtime, runtimePath, ...options });
    const summaryPath = writeOvernightSummary(runtimePath, result);
    return { result, summaryPath };
  } catch (error) {
    let issues = [];
    try {
      const inspected = runtime.inspect();
      if (Array.isArray(inspected?.issues)) issues = inspected.issues;
    } catch {
      // A minimal summary must not depend on readable durable state.
    }
    writeOvernightSummary(runtimePath, {
      completed: false,
      stopReason: "controller_failure",
      runAttempts: 0,
      lastError: error instanceof Error ? error.message : String(error),
      issues,
    });
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseProductionArguments(args);
  if (options.command === "run" && options.mode === "DryRun") {
    const github = createProductionGitHubAdapter({
      repository: options.githubRepository,
      queuePath: options.queuePath,
      actor: options.githubActor,
    });
    console.log(JSON.stringify(
      await runProductionDryRun({ github, maxIssues: options.maxIssues }),
      null,
      2,
    ));
    return 0;
  }
  fs.mkdirSync(options.runtimePath, { recursive: true });
  if (options.command === "run" && options.mode !== "DryRun") {
    try {
      const localAppData = process.env.LOCALAPPDATA;
      if (!localAppData || !path.win32.isAbsolute(localAppData)) {
        throw new Error("production Ralph cannot locate LOCALAPPDATA for legacy-owner exclusion");
      }
      assertProductionPreflight({
        repositoryPath: options.repositoryPath,
        runtimePath: options.runtimePath,
        githubRepository: options.githubRepository,
        legacyRuntimeRoot: path.join(
          localAppData,
          "betterr-me-ralph",
          options.githubRepository.replaceAll("/", "_"),
        ),
        trustedDependencyRoot: options.trustedDependencyRoot,
      });
    } catch (error) {
      writeOvernightSummary(options.runtimePath, {
        completed: false,
        stopReason: "preflight_failed",
        runAttempts: 0,
        lastError: error instanceof Error ? error.message : String(error),
        issues: [],
      });
      throw error;
    }
  }
  let runtime;
  try {
    runtime = createRalphRuntime({
      repositoryPath: options.repositoryPath,
      runtimePath: options.runtimePath,
      githubRepository: options.githubRepository,
      githubActor: options.githubActor,
      queuePath: options.queuePath,
      trustedDependencyRoot: options.trustedDependencyRoot,
      implementationTimeoutMilliseconds: options.implementationTimeoutMilliseconds,
      verificationTimeoutMilliseconds: options.verificationTimeoutMilliseconds,
    });
  } catch (error) {
    writeOvernightSummary(options.runtimePath, {
      completed: false,
      stopReason: "initialization_failed",
      runAttempts: 0,
      lastError: error instanceof Error ? error.message : String(error),
      issues: [],
    });
    throw error;
  }
  if (options.command === "status") {
    console.log(JSON.stringify(runtime.inspect(), null, 2));
    return 0;
  }
  if (options.command === "audit") {
    console.log(JSON.stringify(await runtime.inspectQueue(), null, 2));
    return 0;
  }
  if (options.command === "stop") {
    let stopped;
    try {
      stopped = await runtime.requestStop();
    } catch (error) {
      writeOvernightSummary(options.runtimePath, {
        completed: false,
        stopReason: "stop_failed",
        runAttempts: 0,
        lastError: error instanceof Error ? error.message : String(error),
        issues: [],
      });
      throw error;
    }
    writeOvernightSummary(options.runtimePath, {
      completed: false,
      stopReason: "kill_switch",
      runAttempts: 0,
      issues: stopped.issues ?? [],
    });
    console.log(JSON.stringify(stopped, null, 2));
    return 0;
  }
  console.log(
    `[ralph-v2] starting ${options.mode}, issue limit ${options.maxIssues}, ` +
    `deadline ${Math.round(options.deadlineMilliseconds / 3_600_000)}h`,
  );
  const { result, summaryPath } = await runProductionOvernightWithSummary({
    runtime,
    runtimePath: options.runtimePath,
    mode: options.mode,
    maxIssues: options.maxIssues,
    pollIntervalMilliseconds: options.pollIntervalMilliseconds,
    retryDelayMilliseconds: options.pollIntervalMilliseconds,
    maxConsecutiveErrors: options.maxConsecutiveErrors,
    deadlineEpochMilliseconds: Date.now() + options.deadlineMilliseconds,
  });
  console.log(`[ralph-v2] ${result.stopReason}; summary: ${summaryPath}`);
  return ["queue_complete", "issue_limit"].includes(result.stopReason) ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`[ralph-v2] STOPPED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
