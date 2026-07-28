import { spawn } from "node:child_process";
import fs from "node:fs";

const [pidPath, command, ...args] = process.argv.slice(2);
if (!pidPath || !command) {
  process.stderr.write("usage: wsl-process-wrapper.mjs PID_PATH COMMAND [ARG...]\n");
  process.exit(2);
}

const child = spawn(command, args, {
  detached: true,
  stdio: "inherit",
});
fs.writeFileSync(pidPath, String(child.pid));

function terminate(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The child may already have exited.
  }
}

process.on("SIGTERM", () => terminate("SIGTERM"));
process.on("SIGINT", () => terminate("SIGINT"));
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`child terminated by ${signal}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
