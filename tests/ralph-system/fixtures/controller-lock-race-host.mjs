import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../../scripts/ralph/v2/cli.mjs";
import { createTestAdapters } from "./test-adapters.mjs";

const separator = process.argv.indexOf("--");
if (separator < 4) {
  throw new Error(
    "usage: controller-lock-race-host.mjs <config.json> <reclaimer|owner> -- <command> [options]",
  );
}

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const role = process.argv[3];
if (role !== "reclaimer" && role !== "owner") {
  throw new Error(`unknown controller-lock race role: ${role}`);
}

const lockPath = path.join(config.runtimePath, "controller-v2.lock");
const barrierDirectory = path.join(
  config.runtimePath,
  "controller-lock-race-barriers",
);
const barriers = {
  reclaimerReady: path.join(barrierDirectory, "reclaimer-ready"),
  reclaimerRelease: path.join(barrierDirectory, "reclaimer-release"),
  ownerReady: path.join(barrierDirectory, "owner-ready"),
  ownerRelease: path.join(barrierDirectory, "owner-release"),
};

fs.mkdirSync(barrierDirectory, { recursive: true });

function writeMarker(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function waitForMarkerSync(filePath, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  const waitState = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(filePath)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`timed out waiting for ${path.basename(filePath)}`);
    }
    Atomics.wait(waitState, 0, 0, Math.min(remaining, 100));
  }
}

function waitForMarker(filePath, timeoutMilliseconds = 10_000) {
  if (fs.existsSync(filePath)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (fs.existsSync(filePath)) finish();
    };
    const timeout = setTimeout(
      () => finish(new Error(`timed out waiting for ${path.basename(filePath)}`)),
      timeoutMilliseconds,
    );
    const watcher = fs.watch(path.dirname(filePath), (eventType, filename) => {
      if (filename === null || filename.toString() === path.basename(filePath)) {
        inspect();
      }
    });
    watcher.once("error", finish);
    inspect();
  });
}

if (role === "reclaimer") {
  const originalRenameSync = fs.renameSync;
  let pausedAtStaleReclaim = false;
  fs.renameSync = function renameSyncWithStaleReclaimBarrier(
    sourcePath,
    destinationPath,
  ) {
    if (
      !pausedAtStaleReclaim &&
      path.resolve(sourcePath.toString()) === path.resolve(lockPath) &&
      path.resolve(destinationPath.toString()).startsWith(
        `${path.resolve(lockPath)}.stale-`,
      )
    ) {
      pausedAtStaleReclaim = true;
      writeMarker(barriers.reclaimerReady, { processId: process.pid });
      waitForMarkerSync(barriers.reclaimerRelease);
    }
    return Reflect.apply(originalRenameSync, fs, [sourcePath, destinationPath]);
  };
}

const adapters = createTestAdapters(config);
if (role === "owner") {
  const listReadyIssues = adapters.github.listReadyIssues;
  adapters.github.listReadyIssues = async () => {
    writeMarker(barriers.ownerReady, {
      processId: process.pid,
      lock: JSON.parse(fs.readFileSync(lockPath, "utf8")),
    });
    await waitForMarker(barriers.ownerRelease);
    return listReadyIssues();
  };
}

const { createRalphRuntime } = await import(
  "../../../scripts/ralph/v2/runtime.mjs"
);
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
