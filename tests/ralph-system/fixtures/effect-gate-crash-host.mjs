import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createTestAdapters } from "./test-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 4) {
  throw new Error(
    "usage: effect-gate-crash-host.mjs <config.json> <before|after> -- <command> [options]",
  );
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const boundary = process.argv[3];
if (boundary !== "before" && boundary !== "after") {
  throw new Error(`unknown effect-gate crash boundary: ${boundary}`);
}

const enteredPath = path.join(
  config.runtimePath,
  `effect-gate-${boundary}-entered.json`,
);
const adapters = createTestAdapters(config);
const claimIssue = adapters.github.claimIssue;

adapters.github.claimIssue = async (input) => {
  let receipt;
  if (boundary === "after") receipt = await claimIssue(input);
  fs.writeFileSync(
    enteredPath,
    `${JSON.stringify({ boundary, processId: process.pid, input })}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  await new Promise(() => {});
  if (boundary === "before") return claimIssue(input);
  return receipt;
};

const { createRalphRuntimeCore } = await import(
  "../../../scripts/ralph/v2/runtime.mjs"
);
const runtime = createRalphRuntimeCore({
  repositoryPath: config.repositoryPath,
  runtimePath: config.runtimePath,
  ...adapters,
});

process.exitCode = await runCli(process.argv.slice(separator + 1), {
  runtime,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
