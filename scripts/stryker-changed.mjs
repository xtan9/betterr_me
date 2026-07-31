#!/usr/bin/env node
// Run Stryker mutation testing for centrally owned mutation scopes changed vs
// origin/main. Implementation changes mutate the exact changed files. Test or
// infrastructure changes mutate the owning scope because no source file alone
// represents their impact.

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseNameStatus,
} from "./ci/classify-changes.mjs";
import {
  buildStrykerCommand,
  selectMutationTargets,
} from "./ci/mutation-selection.mjs";

const BASE_REF = process.env.STRYKER_BASE_REF || "origin/main";

function getChangedRecords(baseRef = BASE_REF) {
  let diffOutput;
  try {
    diffOutput = execFileSync(
      "git",
      ["diff", "--name-status", "-z", "--find-renames", `${baseRef}...HEAD`],
      { encoding: "utf8" },
    );
  } catch (error) {
    console.error(`Failed to diff against ${baseRef}:`, error.message);
    console.error("Set STRYKER_BASE_REF or fetch the base branch before running.");
    return null;
  }

  return parseNameStatus(diffOutput);
}

export async function runChangedMutation({ baseRef = BASE_REF } = {}) {
  const records = getChangedRecords(baseRef);
  if (!records) return 1;

  const targets = selectMutationTargets(records);
  if (targets.length === 0) {
    console.log(`No centrally owned mutation scope changed vs ${baseRef}.`);
    console.log("Skipping mutation testing for this pull request.");
    return 0;
  }

  console.log(
    `Running Stryker for ${targets.length} changed-scope target(s):\n  ${targets.join("\n  ")}\n`,
  );

  const requireFromScript = createRequire(import.meta.url);
  const strykerPkgJson = requireFromScript.resolve(
    "@stryker-mutator/core/package.json",
  );
  const strykerBin = path.join(
    path.dirname(strykerPkgJson),
    "bin",
    "stryker.js",
  );
  const command = buildStrykerCommand(strykerBin, targets);

  return await new Promise((resolve) => {
    const child = spawn(
      command.command,
      command.args,
      command.options,
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error("Failed to start Stryker:", error.message);
      resolve(1);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runChangedMutation();
}
