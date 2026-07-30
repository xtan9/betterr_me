import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileDurably } from "./test-primitives.mjs";

const [configPath, action] = process.argv.slice(2);
if (!configPath || !action) {
  throw new Error("usage: session-supervisor-controller-host.mjs <config> <action>");
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const moduleUrl = pathToFileURL(
  path.join(config.repositoryRoot, "scripts", "ralph", "v2", "session-supervisor.mjs"),
).href;
const { createDurableSessionSupervisorClient } = await import(moduleUrl);
const client = createDurableSessionSupervisorClient({
  sessionRoot: config.sessionRoot,
  pollIntervalMilliseconds: 10,
});

if (action === "plan-authorize-hold") {
  await client.plan(config.plan);
  await client.authorize({
    sessionId: config.sessionId,
    authorizationId: config.authorizationId,
    planDigest: config.planDigest,
  });
  writeFileDurably(
    path.join(config.fixtureRoot, "controller-authorized.json"),
    `${JSON.stringify({ processId: process.pid, sessionId: config.sessionId })}\n`,
  );
  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  while (true) await sleep(1_000);
} else {
  throw new Error(`unknown controller host action: ${action}`);
}

