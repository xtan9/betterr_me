import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCodexJsonlRenderer,
  formatControllerStatus,
} from "../../scripts/ralph/live-output.mjs";

function renderer(options: { sensitiveValues?: string[] } = {}) {
  const lines: string[] = [];
  const stream = createCodexJsonlRenderer({
    issueNumber: 482,
    phase: "implementation",
    sensitiveValues: options.sensitiveValues ?? [],
    writeLine: (line: string) => lines.push(line),
  });
  return { lines, stream };
}

describe("Ralph live Codex output", () => {
  it("renders fragmented JSONL agent messages without exposing reasoning", () => {
    const { lines, stream } = renderer();

    stream.write(
      '{"type":"item.completed","item":{"type":"agent_message","text":"Implemented the exchange seam."}}\n{"type":"item.completed","item":{"type":"reasoning","text":"private chain',
    );
    stream.write(' of thought"}}\n');
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] Implemented the exchange seam.",
    ]);
  });

  it("shows commands, file changes, failures, and bounded usage", () => {
    const { lines, stream } = renderer();

    stream.write(
      [
        {
          type: "item.started",
          item: {
            type: "command_execution",
            command: "pnpm test",
            status: "in_progress",
          },
        },
        {
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "pnpm test",
            status: "completed",
            exit_code: 0,
          },
        },
        {
          type: "item.completed",
          item: {
            type: "file_change",
            changes: [{ path: "scripts/ralph/controller.mjs", kind: "update" }],
          },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1200,
            cached_input_tokens: 900,
            output_tokens: 80,
          },
        },
        { type: "turn.failed", error: { message: "review failed" } },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] command started: pnpm test",
      "[ralph][issue #482][implementation] command completed (exit 0): pnpm test",
      "[ralph][issue #482][implementation] file update: scripts/ralph/controller.mjs",
      "[ralph][issue #482][implementation] turn completed: 1200 input, 900 cached, 80 output tokens",
      "[ralph][issue #482][implementation] turn failed: review failed",
    ]);
  });

  it("redacts configured and recognizable credentials from readable output", () => {
    const { lines, stream } = renderer({ sensitiveValues: ["private-value"] });

    stream.write(
      `${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "values private-value ghp_abcdefghijklmnopqrstuvwxyz123456 sk-abcdefghijklmnopqrstuvwxyz123456",
        },
      })}\n`,
    );
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] values [REDACTED] [REDACTED] [REDACTED]",
    ]);
  });

  it("redacts secrets before truncating long output", () => {
    const { lines, stream } = renderer({ sensitiveValues: ["SENSITIVESECRET"] });

    stream.write(
      `${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: `${"x".repeat(1995)}SENSITIVESECRET`,
        },
      })}\n`,
    );
    stream.end();

    expect(lines).toEqual([
      `[ralph][issue #482][implementation] ${"x".repeat(1995)}[REDACTED]... [truncated]`,
    ]);
  });

  it("redacts common credential shapes that are not controller-configured", () => {
    const { lines, stream } = renderer();

    stream.write(
      `${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: [
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturevalue",
            "AKIAIOSFODNN7EXAMPLE",
            "postgresql://worker:super-secret@localhost/app",
            "refresh_token=refresh-secret-value",
          ].join(" "),
        },
      })}\n`,
    );
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] [REDACTED] [REDACTED] [REDACTED] [REDACTED]",
    ]);
  });

  it("warns about malformed events without echoing their contents", () => {
    const { lines, stream } = renderer();

    stream.write("not-json potentially-sensitive-content\n");
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] warning: malformed Codex JSON event",
    ]);
  });

  it("ignores valid event shapes it does not recognize", () => {
    const { lines, stream } = renderer();

    stream.write('{}\n{"type":"future.event","value":"unknown"}\n');
    stream.end();

    expect(lines).toEqual([]);
  });

  it("strips terminal escapes and bidirectional controls from agent text", () => {
    const { lines, stream } = renderer();

    stream.write(
      `${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "before\u001b[2Jafter\u202Espoof",
        },
      })}\n`,
    );
    stream.end();

    expect(lines).toEqual([
      "[ralph][issue #482][implementation] beforeafterspoof",
    ]);
  });

  it("formats controller lifecycle messages for the same live stream", () => {
    expect(formatControllerStatus("Waiting for required checks on PR #508.")).toBe(
      "[ralph] Waiting for required checks on PR #508.",
    );
  });

  it("ships a PowerShell monitor that follows the stable live log", () => {
    const monitor = fs.readFileSync(
      path.resolve("scripts/ralph/watch-ralph.ps1"),
      "utf8",
    );

    expect(monitor.replaceAll("\r\n", "\n")).toBe(`[CmdletBinding()]
param(
    [ValidateRange(1, 1000)]
    [int]$Tail = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ralphRoot = Join-Path $env:LOCALAPPDATA "betterr-me-ralph\\xtan9_betterr_me"
$liveLog = Join-Path $ralphRoot "live.log"

Write-Host "Waiting for Ralph live output at $liveLog"
while (-not (Test-Path -LiteralPath $liveLog)) {
    Start-Sleep -Seconds 1
}

Get-Content -LiteralPath $liveLog -Tail $Tail -Wait
`);
  });
});
