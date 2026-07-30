import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [configPath] = process.argv.slice(2);
if (!configPath) {
  throw new Error("usage: windows-job-controller-host.mjs <config>");
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const moduleUrl = pathToFileURL(
  path.join(
    config.repositoryRoot,
    "scripts",
    "ralph",
    "v2",
    "windows-job-containment.mjs",
  ),
).href;
const { createWindowsJobContainment } = await import(moduleUrl);
const containment = createWindowsJobContainment({
  containmentRoot: config.containmentRoot,
  sessionId: config.sessionId,
  pollIntervalMilliseconds: 20,
});
const child = await containment.launch(config.launch);
fs.writeFileSync(
  config.controllerReadyPath,
  `${JSON.stringify(
    {
      controllerProcessId: process.pid,
      childProcessId: child.processId,
      childProcessIdentity: child.processIdentity,
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
while (true) await sleep(1_000);
