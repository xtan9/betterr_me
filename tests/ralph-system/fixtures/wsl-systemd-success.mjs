import fs from "node:fs";
import path from "node:path";

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  throw new Error("usage: wsl-systemd-success.mjs <fixture-root>");
}

fs.writeFileSync(
  path.join(fixtureRoot, "linux-success.json"),
  `${JSON.stringify({ processId: process.pid, parentProcessId: process.ppid })}\n`,
  { flag: "wx" },
);
