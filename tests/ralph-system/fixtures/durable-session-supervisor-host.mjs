import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import { createFakeSessionContainment } from "./fake-session-containment.mjs";
import { writeFileDurably } from "./test-primitives.mjs";

const [configPath, supervisorId] = process.argv.slice(2);
if (!configPath || !supervisorId) {
  throw new Error(
    "usage: durable-session-supervisor-host.mjs <config> <supervisor-id>",
  );
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const identity = readProcessIdentity(process.pid);
if (!identity) throw new Error("supervisor process identity is unavailable");
const wrapperDirectory = path.join(config.fixtureRoot, "supervisor-wrappers");
fs.mkdirSync(wrapperDirectory, { recursive: true });
writeFileDurably(
  path.join(wrapperDirectory, `${supervisorId}.json`),
  `${JSON.stringify(
    {
      role: "trusted-supervisor",
      sessionId: config.sessionId,
      supervisorId,
      processId: process.pid,
      processIdentity: identity,
      parentProcessId: process.ppid,
    },
    null,
    2,
  )}\n`,
);

const moduleUrl = pathToFileURL(
  path.join(config.repositoryRoot, "scripts", "ralph", "v2", "session-supervisor.mjs"),
).href;
const { runDurableSessionSupervisor } = await import(moduleUrl);
const containment = createFakeSessionContainment({
  fixtureRoot: config.fixtureRoot,
  sessionId: config.sessionId,
});
await runDurableSessionSupervisor({
  sessionRoot: config.sessionRoot,
  sessionId: config.sessionId,
  supervisorId,
  containment,
  pollIntervalMilliseconds: 10,
});

