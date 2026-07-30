import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import { writeFileDurably } from "./test-primitives.mjs";

const [configPath] = process.argv.slice(2);
if (!configPath) throw new Error("usage: hostile-mock-codex.mjs <config>");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sessionId = process.env.RALPH_V2_SESSION_ID;
const authorizationId = process.env.RALPH_V2_AUTHORIZATION_ID;
const planDigest = process.env.RALPH_V2_PLAN_DIGEST;
if (
  sessionId !== config.sessionId ||
  authorizationId !== config.authorizationId ||
  planDigest !== config.planDigest
) {
  fs.mkdirSync(path.join(config.fixtureRoot, "unauthorized-launches"), {
    recursive: true,
  });
  writeFileDurably(
    path.join(config.fixtureRoot, "unauthorized-launches", `${process.pid}.json`),
    `${JSON.stringify({ sessionId, authorizationId, planDigest })}\n`,
  );
  process.exit(91);
}

const identity = readProcessIdentity(process.pid);
if (!identity) throw new Error("mock Codex process identity is unavailable");
const processDirectory = path.join(config.fixtureRoot, "contained-processes");
const launchDirectory = path.join(config.fixtureRoot, "codex-launches");
const mutationDirectory = path.join(config.fixtureRoot, "codex-mutations");
fs.mkdirSync(processDirectory, { recursive: true });
fs.mkdirSync(launchDirectory, { recursive: true });
fs.mkdirSync(mutationDirectory, { recursive: true });
const childRecord = {
  role: "mock-codex",
  sessionId,
  authorizationId,
  planDigest,
  processId: process.pid,
  processIdentity: identity,
  parentProcessId: process.ppid,
};
writeFileDurably(
  path.join(processDirectory, `mock-codex-${process.pid}.json`),
  `${JSON.stringify(childRecord, null, 2)}\n`,
);
writeFileDurably(
  path.join(launchDirectory, `${process.pid}.json`),
  `${JSON.stringify(childRecord, null, 2)}\n`,
);

const descendantProgram = fileURLToPath(
  new URL("./session-supervisor-descendant.mjs", import.meta.url),
);
const descendant = spawn(process.execPath, [descendantProgram, configPath], {
  cwd: config.fixtureRoot,
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});
const descendantCompletion = new Promise((resolve) =>
  descendant.once("close", resolve),
);
if (!descendant.pid) throw new Error("mock Codex descendant did not start");
const descendantRecordPath = path.join(
  processDirectory,
  `descendant-${descendant.pid}.json`,
);
const descendantRecordDeadline = Date.now() + 5_000;
while (!fs.existsSync(descendantRecordPath)) {
  if (Date.now() >= descendantRecordDeadline) {
    throw new Error("mock Codex descendant did not join fake containment");
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}

writeFileDurably(
  path.join(mutationDirectory, `${process.pid}.json`),
  `${JSON.stringify(
    { sessionId, processId: process.pid, authorizationId },
    null,
    2,
  )}\n`,
);
if (config.mode === "crash-after-mutation-before-receipt") {
  process.exit(79);
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const completionReleasePath = path.join(config.fixtureRoot, "completion-release");
const terminationRequestPath = path.join(
  config.fixtureRoot,
  "containment-termination-request.json",
);
const terminationReleasePath = path.join(config.fixtureRoot, "termination-release");
while (true) {
  if (fs.existsSync(completionReleasePath)) break;
  if (
    fs.existsSync(terminationRequestPath) &&
    (!config.holdTermination || fs.existsSync(terminationReleasePath))
  ) {
    break;
  }
  await sleep(10);
}
if (config.descendantIgnoresCompletionRelease === true) {
  descendant.unref();
  process.exit(0);
}
await descendantCompletion;
