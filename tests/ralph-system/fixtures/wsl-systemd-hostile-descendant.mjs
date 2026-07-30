import fs from "node:fs";
import path from "node:path";

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  throw new Error("usage: wsl-systemd-hostile-descendant.mjs <fixture-root>");
}

if (process.env.RALPH_TEST_IGNORE_SIGNALS === "1") {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {});
  }
}

fs.writeFileSync(
  path.join(fixtureRoot, "linux-descendant.json"),
  `${JSON.stringify({ processId: process.pid, parentProcessId: process.ppid })}\n`,
  { flag: "wx" },
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
while (true) await sleep(1_000);
