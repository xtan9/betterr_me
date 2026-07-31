import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runOvernightCli } from "../../../scripts/ralph/v2/cli.mjs";
import { runProductionOvernightWithSummary } from "../../../scripts/ralph/v2/production-entry.mjs";
import { runGit as git } from "./test-primitives.mjs";

const [configPath] = process.argv.slice(2);
if (!configPath) throw new Error("overnight acceptance host requires a config path");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const testHost = fileURLToPath(new URL("./test-host.mjs", import.meta.url));

function invoke(args) {
  const result = spawnSync(process.execPath, [testHost, configPath, "--", ...args], {
    cwd: config.repositoryPath,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `fresh CLI exited ${result.status}`);
  }
  return JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "null");
}

function readExternal() {
  return JSON.parse(fs.readFileSync(config.externalStatePath, "utf8"));
}

function writeExternal(state) {
  const temporaryPath = `${config.externalStatePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporaryPath, config.externalStatePath);
}

let manualMergeApplied = false;
const runtime = {
  inspect: () => invoke(["status", "--json"]),
  run: async (input) => invoke([
    "run", "--mode", input.mode, "--max-issues", "1", "--json",
  ]),
  async inspectQueue() {
    const external = readExternal();
    const manual = external.pullRequests.find((pr) => pr.issueNumber === 1105);
    if (manual && manual.state === "OPEN" && !manualMergeApplied) {
      const currentMain = git(config.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim();
      git(config.remotePath, ["update-ref", "refs/heads/main", manual.headSha, currentMain]);
      manual.state = "MERGED";
      writeExternal(external);
      manualMergeApplied = true;
    }
    return invoke(["audit", "--json"]);
  },
  requestStop: async () => invoke(["stop", "--json"]),
};

const delivery = await runProductionOvernightWithSummary({
  runtime,
  runtimePath: config.runtimePath,
  run: async () => (await runOvernightCli({
    mode: "AutoMerge",
    maxIssues: config.issues.length,
    pollIntervalMilliseconds: 1,
    retryDelayMilliseconds: 1,
    maxConsecutiveErrors: 3,
    deadlineEpochMilliseconds: Date.now() + 180_000,
    sleep: async () => {},
  }, { runtime })).result,
});

process.stdout.write(`${JSON.stringify({ ...delivery, manualMergeApplied })}\n`);
