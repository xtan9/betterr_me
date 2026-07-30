import fs from "node:fs";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntime } from "../../../scripts/ralph/v2/runtime.mjs";
import { createTestAdapters } from "./test-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 3) {
  throw new Error("usage: test-host.mjs <config.json> -- <command> [options]");
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const adapters = createTestAdapters(config);
const runtime = createRalphRuntime({
  repositoryPath: config.repositoryPath,
  runtimePath: config.runtimePath,
  ...adapters,
});

process.exitCode = await runCli(process.argv.slice(separator + 1), {
  runtime,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
