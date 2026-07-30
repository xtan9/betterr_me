import fs from "node:fs";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createRalphRuntimeCore } from "../../../scripts/ralph/v2/runtime.mjs";
import { createTestAdapters } from "./test-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 3) {
  throw new Error("usage: test-host.mjs <config.json> -- <command> [options]");
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (
  config.controllerReadyDirectory &&
  process.argv[separator + 1] === "run"
) {
  fs.mkdirSync(config.controllerReadyDirectory, { recursive: true });
  fs.writeFileSync(
    `${config.controllerReadyDirectory}/${process.pid}.ready`,
    "ready\n",
  );
  while (!fs.existsSync(config.controllerReleasePath)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const adapters = createTestAdapters(config);
const runtime = createRalphRuntimeCore({
  repositoryPath: config.repositoryPath,
  runtimePath: config.runtimePath,
  implementationTimeoutMilliseconds: config.implementationTimeoutMilliseconds,
  ...adapters,
});

process.exitCode = await runCli(process.argv.slice(separator + 1), {
  runtime,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
