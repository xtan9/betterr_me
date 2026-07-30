import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  throw new Error("usage: windows-job-hostile-root.mjs <fixture-root>");
}
const identity = readProcessIdentity(process.pid);
if (!identity) throw new Error("root process identity is unavailable");
const whoamiPath = path.join(
  process.env.SystemRoot ?? process.env.WINDIR ?? "",
  "System32",
  "whoami.exe",
);
const groups = spawnSync(whoamiPath, ["/groups", "/fo", "csv", "/nh"], {
  encoding: "utf8",
  windowsHide: true,
});
const proofWriteErrors = {};
for (const [name, proofPath] of [
  ["observation", process.env.RALPH_TEST_OBSERVATION_PATH],
  ["termination", process.env.RALPH_TEST_TERMINATION_PATH],
]) {
  if (!proofPath) continue;
  try {
    fs.writeFileSync(proofPath, "forged by contained child\n");
    proofWriteErrors[name] = null;
  } catch (error) {
    proofWriteErrors[name] = error?.code ?? error?.name ?? "unknown";
  }
}
fs.writeFileSync(
  path.join(fixtureRoot, "root.json"),
  `${JSON.stringify(
    {
      processId: process.pid,
      processIdentity: identity,
      parentProcessId: process.ppid,
      controllerSecret: process.env.RALPH_TEST_CONTROLLER_SECRET ?? null,
      lowIntegrity:
        groups.status === 0 && groups.stdout.includes("S-1-16-4096"),
      proofWriteErrors,
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);

const descendantPath = fileURLToPath(
  new URL("./windows-job-hostile-descendant.mjs", import.meta.url),
);
const descendant = spawn(process.execPath, [descendantPath, fixtureRoot], {
  cwd: fixtureRoot,
  detached: true,
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});
if (!descendant.pid) throw new Error("hostile descendant did not start");
descendant.unref();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
while (true) await sleep(1_000);
