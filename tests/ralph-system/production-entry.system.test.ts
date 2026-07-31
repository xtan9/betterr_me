import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseProductionArguments,
  runProductionDryRun,
  runProductionOvernightWithSummary,
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
        (name) => /^overnight-\d{4}-/.test(name) && name.endsWith(".json"),
      )).toHaveLength(2);
      expect(JSON.parse(fs.readFileSync(path.join(summaryRoot, "latest.json"), "utf8"))).toMatchObject({
        stopReason: "queue_complete",
        issues: [{ number: 2 }],
      });
      const humanSummary = fs.readFileSync(path.join(summaryRoot, "latest.md"), "utf8");
      expect(humanSummary).toContain("Stop reason: `queue_complete`");
      expect(humanSummary).toContain("#2");
      expect(fs.readFileSync(path.join(summaryRoot, "overnight-summary.json"), "utf8"))
        .toBe(fs.readFileSync(path.join(summaryRoot, "latest.json"), "utf8"));
      expect(fs.readFileSync(path.join(summaryRoot, "overnight-summary.md"), "utf8"))
        .toBe(humanSummary);
      expect(fs.readFileSync(path.join(root, "overnight-summary.json"), "utf8"))
        .toBe(fs.readFileSync(path.join(summaryRoot, "latest.json"), "utf8"));
      expect(fs.readFileSync(path.join(root, "overnight-summary.md"), "utf8"))
        .toBe(humanSummary);
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

  it(
    "keeps production DryRun read-only and does not construct worker infrastructure",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-production-dry-run-"));
      const runtimePath = path.join(root, "runtime-must-not-exist");
      try {
        await expect(runProductionDryRun({
          github: {
            listReadyIssues: async () => [{ number: 10 }, { number: 11 }],
          },
          maxIssues: 1,
        })).resolves.toEqual({
          stopRequested: false,
          workerLease: null,
          issues: [{ number: 10, disposition: "ready" }],
        });
        expect(fs.existsSync(runtimePath)).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("atomically refreshes a failure summary when overnight orchestration throws", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-failure-summary-"));
    try {
      await expect(runProductionOvernightWithSummary({
        runtime: { inspect: () => ({ issues: [{ number: 12, disposition: "pr_waiting" }] }) },
        runtimePath: root,
        run: async () => { throw new Error("audit unavailable"); },
      })).rejects.toThrow("audit unavailable");
      expect(JSON.parse(fs.readFileSync(
        path.join(root, "summaries", "overnight-summary.json"),
        "utf8",
      ))).toMatchObject({
        completed: false,
        stopReason: "controller_failure",
        lastError: "audit unavailable",
        issues: [{ number: 12, disposition: "pr_waiting" }],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("redacts credential-shaped hostile text from machine and human summaries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-redacted-summary-"));
    try {
      const secrets = [
        `ghp_${"a".repeat(36)}`,
        `AKIA${"A".repeat(16)}`,
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature123456",
        "Bearer abcdefghijklmnopqrstuvwxyz123456",
        "postgresql://worker:password@db.example.invalid/database",
        "api_key=super-secret-value",
      ];
      writeOvernightSummary(root, {
        completed: false,
        stopReason: "controller_failure",
        lastError: `hostile ${secrets.join(" ")}`,
        issues: [{ number: 13, disposition: "safety_blocked", blocker: `leak ${secrets.join(" ")}` }],
      });
      for (const name of ["overnight-summary.json", "overnight-summary.md"]) {
        const content = fs.readFileSync(path.join(root, name), "utf8");
        for (const secret of secrets) expect(content).not.toContain(secret);
        expect(content).toContain("[REDACTED]");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
