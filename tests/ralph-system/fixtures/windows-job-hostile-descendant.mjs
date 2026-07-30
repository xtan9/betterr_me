import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function readProcessIdentity(processId) {
  const powerShellPath = path.join(
    process.env.SystemRoot ?? process.env.WINDIR ?? "",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const result = spawnSync(
    powerShellPath,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `[System.Diagnostics.Process]::GetProcessById(${processId}).StartTime.ToUniversalTime().Ticks`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const ticks = result.status === 0 ? result.stdout.trim() : "";
  return /^\d+$/.test(ticks) ? `windows-start-ticks:${ticks}` : null;
}

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  throw new Error("usage: windows-job-hostile-descendant.mjs <fixture-root>");
}

const identity = readProcessIdentity(process.pid);
if (!identity) throw new Error("descendant process identity is unavailable");
fs.writeFileSync(
  path.join(fixtureRoot, "descendant.json"),
  `${JSON.stringify(
    {
      processId: process.pid,
      processIdentity: identity,
      parentProcessId: process.ppid,
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
while (true) await sleep(1_000);
