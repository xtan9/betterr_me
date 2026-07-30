import fs from "node:fs";
import path from "node:path";
import { redactCredentialPatterns } from "../queue.mjs";

function eventFiles(runtimePath) {
  if (!fs.existsSync(runtimePath)) return [];
  return fs
    .readdirSync(runtimePath, { recursive: true })
    .map((entry) => path.join(runtimePath, String(entry)))
    .filter((filePath) =>
      path.basename(filePath) === "events.jsonl" &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile(),
    )
    .sort();
}

export function primeRuntimeArtifactCursors(runtimePath, cursors = new Map()) {
  for (const filePath of eventFiles(runtimePath)) {
    cursors.set(filePath, { offset: fs.statSync(filePath).size, remainder: "" });
  }
  return cursors;
}

export function streamRuntimeArtifactsOnce({ runtimePath, cursors, stdout }) {
  if (!(cursors instanceof Map) || typeof stdout !== "function") {
    throw new Error("runtime artifact stream failed integrity validation");
  }
  const root = fs.realpathSync.native(runtimePath);
  for (const filePath of eventFiles(root)) {
    const stat = fs.statSync(filePath);
    const previous = cursors.get(filePath) ?? { offset: 0, remainder: "" };
    const offset = stat.size < previous.offset ? 0 : previous.offset;
    if (stat.size === offset) {
      cursors.set(filePath, { offset, remainder: previous.remainder });
      continue;
    }
    const length = stat.size - offset;
    const buffer = Buffer.allocUnsafe(length);
    const descriptor = fs.openSync(filePath, "r");
    try {
      fs.readSync(descriptor, buffer, 0, length, offset);
    } finally {
      fs.closeSync(descriptor);
    }
    const combined = `${offset === 0 ? "" : previous.remainder}${buffer.toString("utf8")}`;
    const lines = combined.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    const relative = path.relative(root, filePath).replaceAll("\\", "/");
    for (const line of lines) {
      if (line) {
        stdout(
          `[ralph-v2:stream ${relative}] ${redactCredentialPatterns(line)}`,
        );
      }
    }
    cursors.set(filePath, { offset: stat.size, remainder });
  }
}

export function startRuntimeArtifactStreamer({
  runtimePath,
  stdout = console.log,
  intervalMilliseconds = 1_000,
}) {
  if (!Number.isSafeInteger(intervalMilliseconds) || intervalMilliseconds < 100) {
    throw new Error("runtime artifact stream interval failed integrity validation");
  }
  const cursors = primeRuntimeArtifactCursors(runtimePath);
  let stopped = false;
  const poll = () => {
    if (stopped) return;
    try {
      streamRuntimeArtifactsOnce({ runtimePath, cursors, stdout });
    } catch (error) {
      stdout(`[ralph-v2:stream] ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const timer = setInterval(poll, intervalMilliseconds);
  return {
    stop() {
      clearInterval(timer);
      poll();
      stopped = true;
    },
  };
}
