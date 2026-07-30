import fs from "node:fs";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntimeCore } from "../../../scripts/ralph/v2/runtime.mjs";
import { createTestAdapters } from "./test-adapters.mjs";
import { createSurvivingProcessWorker } from "./surviving-worker-adapter.mjs";

const separator = process.argv.indexOf("--");
if (separator < 3) {
  throw new Error(
    "usage: surviving-worker-host.mjs <config.json> -- <command> [options]",
  );
}

const configPath = process.argv[2];
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const adapters = createTestAdapters(config);
const runtime = createRalphRuntimeCore({
  repositoryPath: config.repositoryPath,
  runtimePath: config.runtimePath,
  ...adapters,
  worker: createSurvivingProcessWorker(config, configPath),
});

process.exitCode = await runCli(process.argv.slice(separator + 1), {
  runtime,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
