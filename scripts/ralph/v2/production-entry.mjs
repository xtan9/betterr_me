import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runOvernightLoop } from "./overnight-loop.mjs";
import { assertProductionPreflight } from "./production-preflight.mjs";
import { createRalphRuntime } from "./production-runtime.mjs";
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

export function writeOvernightSummary(runtimePath, result, completedAt = new Date()) {
  const summaryRoot = path.join(runtimePath, "summaries");
  fs.mkdirSync(summaryRoot, { recursive: true });
  const completedAtIso = completedAt.toISOString();
  const timestamp = completedAtIso.replaceAll(":", "-");
  const bytes = `${JSON.stringify({ schemaVersion: 1, completedAt: completedAtIso, ...result }, null, 2)}\n`;
  const immutablePath = path.join(summaryRoot, `overnight-${timestamp}.json`);
  fs.writeFileSync(immutablePath, bytes, { flag: "wx" });
  const latestPath = path.join(summaryRoot, "latest.json");
  const temporaryPath = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, bytes, { flag: "wx" });
  fs.renameSync(temporaryPath, latestPath);
  const issueLines = (result.issues ?? []).map((issue) => {
    const rawBlocker = issue.blocker === undefined
      ? ""
      : ` — ${typeof issue.blocker === "string" ? issue.blocker : JSON.stringify(issue.blocker)}`;
    const blocker = redactCredentialPatterns(rawBlocker)
      .replace(/[\r\n]+/g, " ")
      .slice(0, 1_000);
    return `- #${issue.number}: ${issue.disposition ?? "unknown"}${blocker}`;
  });
  const audit = result.queueAudit;
  const markdown = [
    "# Ralph v2 overnight summary",
    "",
    `Completed at: ${completedAtIso}`,
    `Stop reason: \`${result.stopReason ?? "unknown"}\``,
    `Completed: ${result.completed === true ? "yes" : "no"}`,
    `Run attempts: ${result.runAttempts ?? 0}`,
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
  const temporaryMarkdownPath = `${latestMarkdownPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryMarkdownPath, markdown, { flag: "wx" });
  fs.renameSync(temporaryMarkdownPath, latestMarkdownPath);
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
    return await runOvernightLoop({
      runtime,
      mode,
      maxIssues,
      pollIntervalMilliseconds,
      retryDelayMilliseconds,
      maxConsecutiveErrors,
      deadlineEpochMilliseconds,
      onStatus: (event) => stdout(statusLine(event)),
    });
  } finally {
    streamer.stop();
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseProductionArguments(args);
  fs.mkdirSync(options.runtimePath, { recursive: true });
  if (options.command === "run" && options.mode !== "DryRun") {
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
    });
  }
  const runtime = createRalphRuntime({
    repositoryPath: options.repositoryPath,
    runtimePath: options.runtimePath,
    githubRepository: options.githubRepository,
    githubActor: options.githubActor,
    queuePath: options.queuePath,
    trustedDependencyRoot: options.trustedDependencyRoot,
    implementationTimeoutMilliseconds: options.implementationTimeoutMilliseconds,
    verificationTimeoutMilliseconds: options.verificationTimeoutMilliseconds,
  });
  if (options.command === "status") {
    console.log(JSON.stringify(runtime.inspect(), null, 2));
    return 0;
  }
  if (options.command === "audit") {
    console.log(JSON.stringify(await runtime.inspectQueue(), null, 2));
    return 0;
  }
  if (options.command === "stop") {
    console.log(JSON.stringify(await runtime.requestStop(), null, 2));
    return 0;
  }
  if (options.mode === "DryRun") {
    const result = await runtime.run({ mode: "DryRun", maxIssues: options.maxIssues });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.log(
    `[ralph-v2] starting ${options.mode}, issue limit ${options.maxIssues}, ` +
    `deadline ${Math.round(options.deadlineMilliseconds / 3_600_000)}h`,
  );
  const result = await runVisibleOvernight({
    runtime,
    runtimePath: options.runtimePath,
    mode: options.mode,
    maxIssues: options.maxIssues,
    pollIntervalMilliseconds: options.pollIntervalMilliseconds,
    retryDelayMilliseconds: options.pollIntervalMilliseconds,
    maxConsecutiveErrors: options.maxConsecutiveErrors,
    deadlineEpochMilliseconds: Date.now() + options.deadlineMilliseconds,
  });
  const summaryPath = writeOvernightSummary(options.runtimePath, result);
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
