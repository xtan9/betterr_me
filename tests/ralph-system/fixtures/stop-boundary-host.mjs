import fs from "node:fs";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntimeCore } from "../../../scripts/ralph/v2/runtime.mjs";
import { createStopBoundaryAdapters } from "./stop-boundary-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 3) {
  throw new Error("usage: stop-boundary-host.mjs <config.json> -- <command>");
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const runtime = createRalphRuntimeCore({
  repositoryPath: config.repositoryPath,
  runtimePath: config.runtimePath,
  ...createStopBoundaryAdapters(config),
});

process.exitCode = await runCli(process.argv.slice(separator + 1), {
  runtime,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
