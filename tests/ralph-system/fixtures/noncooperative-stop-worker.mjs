import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function remainAlive() {
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1_000);
}

if (process.argv[2] === "grandchild") {
  remainAlive();
} else {
  const [, , , worktreePath, processTreePath, relativePath, content] =
    process.argv;
  if (!worktreePath || !processTreePath || !relativePath || content === undefined) {
    throw new Error(
      "usage: noncooperative-stop-worker.mjs worker <worktree> <tree.json> <path> <content>",
    );
  }

  const destination = path.join(worktreePath, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);

  const grandchild = spawn(process.execPath, [import.meta.filename, "grandchild"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const temporaryPath = `${processTreePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify({ workerPid: process.pid, grandchildPid: grandchild.pid })}\n`,
  );
  fs.renameSync(temporaryPath, processTreePath);
  remainAlive();
}
