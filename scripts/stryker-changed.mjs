#!/usr/bin/env node
// Run Stryker mutation testing scoped to lib/db files changed vs origin/main.
// Used by the per-PR CI job so PRs pay a small mutation-testing cost (~2-5
// min) while the weekly workflow runs the full scope (~15 min).

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const BASE_REF = process.env.STRYKER_BASE_REF || "origin/main";
const MUTATE_SCOPE = "lib/db/**/*.ts";

// Files Stryker is told to mutate. Intersection of (changed since base) and
// (currently in Stryker's mutate scope). If nothing in scope changed, exit
// cleanly — nothing to mutate-test.
function getChangedFiles() {
  let diffOutput;
  try {
    diffOutput = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=d", `${BASE_REF}...HEAD`],
      { encoding: "utf8" },
    );
  } catch (err) {
    console.error(`Failed to diff against ${BASE_REF}:`, err.message);
    console.error(
      `Set STRYKER_BASE_REF or fetch the base branch before running.`,
    );
    process.exit(1);
  }

  return diffOutput
    .split("\n")
    .filter(Boolean)
    .filter((f) => /^lib\/db\/.+\.ts$/.test(f))
    .filter((f) => f !== "lib/db/index.ts" && f !== "lib/db/types.ts");
}

const changed = getChangedFiles();

if (changed.length === 0) {
  console.log(`No files matching ${MUTATE_SCOPE} changed vs ${BASE_REF}.`);
  console.log("Skipping mutation testing for this PR.");
  process.exit(0);
}

console.log(
  `Running Stryker on ${changed.length} changed file(s):\n  ${changed.join("\n  ")}\n`,
);

// Resolve Stryker's bin via Node's module resolution rather than relying on
// PATH — makes the script robust to direct `node scripts/...` invocation and
// to package-manager PATH differences. Stryker's package.json "exports" field
// doesn't expose ./bin/*, so we resolve package.json first and then join the
// bin path manually. `execPath` + resolved bin path, no shell, no
// command-injection risk.
const requireFromScript = createRequire(import.meta.url);
const strykerPkgJson = requireFromScript.resolve(
  "@stryker-mutator/core/package.json",
);
const strykerBin = path.join(path.dirname(strykerPkgJson), "bin", "stryker.js");

const child = spawn(
  process.execPath,
  [strykerBin, "run", "--mutate", changed.join(",")],
  { stdio: "inherit" },
);
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
