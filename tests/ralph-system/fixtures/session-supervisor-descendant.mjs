import fs from "node:fs";
import path from "node:path";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import { writeFileDurably } from "./test-primitives.mjs";

const [configPath] = process.argv.slice(2);
if (!configPath) {
  throw new Error("usage: session-supervisor-descendant.mjs <config>");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const identity = readProcessIdentity(process.pid);
if (!identity) throw new Error("descendant process identity is unavailable");
const processDirectory = path.join(config.fixtureRoot, "contained-processes");
fs.mkdirSync(processDirectory, { recursive: true });
writeFileDurably(
  path.join(processDirectory, `descendant-${process.pid}.json`),
  `${JSON.stringify(
    {
      role: "descendant",
      sessionId: config.sessionId,
      processId: process.pid,
      processIdentity: identity,
      parentProcessId: process.ppid,
    },
    null,
    2,
  )}\n`,
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const completionReleasePath = path.join(config.fixtureRoot, "completion-release");
const terminationRequestPath = path.join(
  config.fixtureRoot,
  "containment-termination-request.json",
);
const terminationReleasePath = path.join(config.fixtureRoot, "termination-release");

while (true) {
  if (
    !config.descendantIgnoresCompletionRelease &&
    fs.existsSync(completionReleasePath)
  ) {
    break;
  }
  if (
    fs.existsSync(terminationRequestPath) &&
    (!config.holdTermination || fs.existsSync(terminationReleasePath))
  ) {
    break;
  }
  await sleep(10);
}
