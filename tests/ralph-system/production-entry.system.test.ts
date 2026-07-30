import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseProductionArguments,
  runVisibleOvernight,
  writeOvernightSummary,
} from "../../scripts/ralph/v2/production-entry.mjs";

describe("Ralph v2 production entry", () => {
  it("parses a bounded visible overnight run", () => {
    expect(parseProductionArguments([
      "run",
      "--repository-path", "C:\\repo",
      "--runtime-path", "C:\\runtime",
      "--github-repository", "owner/repository",
      "--mode", "AutoMerge",
      "--max-issues", "24",
      "--deadline-hours", "12",
      "--poll-seconds", "30",
      "--implementation-timeout-seconds", "14400",
      "--verification-timeout-seconds", "3600",
      "--max-controller-errors", "5",
    ])).toMatchObject({
      command: "run",
      repositoryPath: "C:\\repo",
      runtimePath: "C:\\runtime",
      githubRepository: "owner/repository",
      mode: "AutoMerge",
      maxIssues: 24,
      deadlineMilliseconds: 43_200_000,
      pollIntervalMilliseconds: 30_000,
      implementationTimeoutMilliseconds: 14_400_000,
      verificationTimeoutMilliseconds: 3_600_000,
      maxConsecutiveErrors: 5,
    });
  });

  it("rejects an unbounded or unknown launch", () => {
    expect(() => parseProductionArguments([
      "run", "--repository-path", "C:\\repo", "--runtime-path", "C:\\runtime",
      "--github-repository", "owner/repository", "--deadline-hours", "0",
    ])).toThrow(/deadline/i);
    expect(() => parseProductionArguments(["launch-everything"])).toThrow(/command/i);
  });

  it("publishes immutable summaries and atomically advances the latest pointer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-summary-"));
    try {
      writeOvernightSummary(root, { stopReason: "issue_limit", issues: [{ number: 1 }] }, new Date("2026-07-30T01:00:00Z"));
      writeOvernightSummary(root, { stopReason: "queue_complete", issues: [{ number: 2 }] }, new Date("2026-07-30T02:00:00Z"));
      const summaryRoot = path.join(root, "summaries");
      expect(fs.readdirSync(summaryRoot).filter(
        (name) => name.startsWith("overnight-") && name.endsWith(".json"),
      )).toHaveLength(2);
      expect(JSON.parse(fs.readFileSync(path.join(summaryRoot, "latest.json"), "utf8"))).toMatchObject({
        stopReason: "queue_complete",
        issues: [{ number: 2 }],
      });
      const humanSummary = fs.readFileSync(path.join(summaryRoot, "latest.md"), "utf8");
      expect(humanSummary).toContain("Stop reason: `queue_complete`");
      expect(humanSummary).toContain("#2");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("streams isolated session events through the visible production run", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-visible-run-"));
    try {
      const output: string[] = [];
      let observedRunDeadline: number | undefined;
      const runtime = {
        inspect: () => ({ stopRequested: false, issues: [] }),
        run: async (input: { deadlineEpochMilliseconds?: number }) => {
          observedRunDeadline = input.deadlineEpochMilliseconds;
          const eventLog = path.join(root, "implementation-session-requests", "one", "events.jsonl");
          fs.mkdirSync(path.dirname(eventLog), { recursive: true });
          fs.writeFileSync(eventLog, '{"type":"turn.completed"}\n');
          return { stopRequested: false, issues: [{ number: 1, disposition: "merged" }] };
        },
        inspectQueue: async () => ({ readyIssueNumbers: [], queueComplete: true }),
        requestStop: async () => ({ stopRequested: true, issues: [] }),
      };

      const result = await runVisibleOvernight({
        runtime,
        runtimePath: root,
        mode: "AutoMerge",
        maxIssues: 1,
        pollIntervalMilliseconds: 5,
        retryDelayMilliseconds: 5,
        maxConsecutiveErrors: 1,
        deadlineEpochMilliseconds: Date.now() + 5_000,
        stdout: (line) => output.push(line),
      });

      expect(result).toMatchObject({ completed: true, stopReason: "queue_complete" });
      expect(observedRunDeadline).toBeGreaterThan(Date.now());
      expect(output).toEqual(expect.arrayContaining([
        expect.stringMatching(/implementation-session-requests.*turn\.completed/),
        expect.stringMatching(/poll 1: #1:merged/),
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
