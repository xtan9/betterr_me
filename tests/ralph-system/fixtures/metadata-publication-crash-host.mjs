import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createTestAdapters } from "./test-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 4) {
  throw new Error(
    "usage: metadata-publication-crash-host.mjs <config.json> <controller|effect> -- <command> [options]",
  );
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const boundary = process.argv[3];
if (boundary !== "controller" && boundary !== "effect") {
  throw new Error(`unknown metadata publication boundary: ${boundary}`);
}

const destinationPath = path.join(
  config.runtimePath,
  boundary === "controller" ? "controller-v2.lock" : "effect-v2.lock",
);
const enteredPath = path.join(
  config.runtimePath,
  `${boundary}-publication-entered.json`,
);
const originalLinkSync = fs.linkSync;
let held = false;

fs.linkSync = function linkSyncWithPublicationBarrier(
  existingPath,
  newPath,
) {
  if (
    !held &&
    path.resolve(newPath.toString()) === path.resolve(destinationPath) &&
    path.resolve(existingPath.toString()).startsWith(
      `${path.resolve(destinationPath)}.candidate-`,
    )
  ) {
    held = true;
    fs.writeFileSync(
      enteredPath,
      `${JSON.stringify({
        boundary,
        processId: process.pid,
        candidatePath: existingPath.toString(),
      })}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  return Reflect.apply(originalLinkSync, fs, [existingPath, newPath]);
};

const adapters = createTestAdapters(config);
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
