import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  startRuntimeArtifactStreamer,
  streamRuntimeArtifactsOnce,
} from "../../scripts/ralph/v2/runtime-artifact-stream.mjs";

describe("Ralph v2 runtime artifact stream", () => {
  it("streams only newly appended worker and reviewer event lines", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-stream-"));
    try {
      const workerLog = path.join(root, "implementation-session-requests", "abc", "events.jsonl");
      const reviewLog = path.join(root, "reviewer-session-requests", "def", "events.jsonl");
      fs.mkdirSync(path.dirname(workerLog), { recursive: true });
      fs.mkdirSync(path.dirname(reviewLog), { recursive: true });
      fs.writeFileSync(workerLog, '{"type":"turn.started"}\n');
      fs.writeFileSync(
        reviewLog,
        '{"type":"thread.started","text":"ghp_abcdefghijklmnopqrstuvwxyz123456"}\n',
      );
      const cursors = new Map();
      const output: string[] = [];

      streamRuntimeArtifactsOnce({ runtimePath: root, cursors, stdout: (line) => output.push(line) });
      fs.appendFileSync(workerLog, '{"type":"item.completed"}\n');
      streamRuntimeArtifactsOnce({ runtimePath: root, cursors, stdout: (line) => output.push(line) });
      streamRuntimeArtifactsOnce({ runtimePath: root, cursors, stdout: (line) => output.push(line) });

      expect(output).toEqual([
        expect.stringMatching(/implementation-session-requests.*turn\.started/),
        expect.stringMatching(/reviewer-session-requests.*thread\.started/),
        expect.stringMatching(/implementation-session-requests.*item\.completed/),
      ]);
      expect(output.join("\n")).toContain("[REDACTED]");
      expect(output.join("\n")).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("flushes a final completed event when the visible run stops", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-stream-stop-"));
    try {
      const output: string[] = [];
      const streamer = startRuntimeArtifactStreamer({
        runtimePath: root,
        stdout: (line) => output.push(line),
        intervalMilliseconds: 60_000,
      });
      const log = path.join(root, "implementation-session-requests", "abc", "events.jsonl");
      fs.mkdirSync(path.dirname(log), { recursive: true });
      fs.writeFileSync(log, '{"type":"turn.completed"}\n');

      streamer.stop();

      expect(output).toEqual([
        expect.stringMatching(/implementation-session-requests.*turn\.completed/),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
