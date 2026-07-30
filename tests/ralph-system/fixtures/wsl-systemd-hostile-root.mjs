import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  throw new Error("usage: wsl-systemd-hostile-root.mjs <fixture-root>");
}

if (process.env.RALPH_TEST_IGNORE_SIGNALS === "1") {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {});
  }
}

fs.writeFileSync(
  path.join(fixtureRoot, "linux-root.json"),
  `${JSON.stringify({ processId: process.pid, parentProcessId: process.ppid })}\n`,
  { flag: "wx" },
);
const descendantPath = fileURLToPath(
  new URL("./wsl-systemd-hostile-descendant.mjs", import.meta.url),
);
const descendant = spawn(process.execPath, [descendantPath, fixtureRoot], {
  cwd: fixtureRoot,
  detached: true,
  env: process.env,
  stdio: "ignore",
});
if (!descendant.pid) throw new Error("Linux descendant did not start");
descendant.unref();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
while (true) await sleep(1_000);
