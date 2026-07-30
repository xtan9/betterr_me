import { describe, expect, it } from "vitest";
import { runOvernightLoop } from "../../scripts/ralph/v2/overnight-loop.mjs";

describe("Ralph v2 overnight loop", () => {
  it("polls one resumable issue until merge, then starts the next issue and audits queue completion", async () => {
    const statuses = [
      { stopRequested: false, issues: [{ number: 10, disposition: "pr_waiting" }] },
      { stopRequested: false, issues: [{ number: 10, disposition: "merged" }, { number: 11, disposition: "pr_waiting" }] },
      { stopRequested: false, issues: [{ number: 10, disposition: "merged" }, { number: 11, disposition: "merged" }] },
    ];
    let runs = 0;
    let queueInspections = 0;
    const sleeps: number[] = [];
    const runtime = {
      inspect: () => ({ stopRequested: false, issues: [] }),
      run: async () => statuses[runs++],
      inspectQueue: async () => {
        queueInspections += 1;
        return queueInspections < 3
          ? { readyIssueNumbers: [11], queueComplete: false }
          : {
              readyIssueNumbers: [],
              queueComplete: true,
              closedIssueNumbers: [10, 11],
              nonMergeableIssueNumbers: [],
              unresolvedIssueNumbers: [],
            };
      },
      requestStop: async () => ({ stopRequested: true, issues: [] }),
    };

    await expect(runOvernightLoop({
      runtime,
      mode: "AutoMerge",
      maxIssues: 24,
      pollIntervalMilliseconds: 25,
      deadlineEpochMilliseconds: 10_000,
      now: () => 1_000,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    })).resolves.toMatchObject({
      stopReason: "queue_complete",
      completed: true,
      runAttempts: 3,
      issues: [{ number: 10, disposition: "merged" }, { number: 11, disposition: "merged" }],
      queueAudit: {
        queueComplete: true,
        closedIssueNumbers: [10, 11],
        nonMergeableIssueNumbers: [],
        unresolvedIssueNumbers: [],
      },
    });
    expect(sleeps).toEqual([25, 25]);
    expect(runs).toBe(3);
  });

  it("bounds controller retries and engages the kill switch after exhaustion", async () => {
    let attempts = 0;
    let stopCalls = 0;
    const runtime = {
      inspect: () => ({ stopRequested: false, issues: [] }),
      run: async () => { attempts += 1; throw new Error("temporary GitHub outage"); },
      inspectQueue: async () => ({ readyIssueNumbers: [10] }),
      requestStop: async () => {
        stopCalls += 1;
        return { stopRequested: true, issues: [] };
      },
    };
    const result = await runOvernightLoop({
      runtime,
      mode: "AutoMerge",
      maxIssues: 24,
      maxConsecutiveErrors: 3,
      retryDelayMilliseconds: 5,
      deadlineEpochMilliseconds: 10_000,
      now: () => 1_000,
      sleep: async () => {},
    });
    expect(result).toMatchObject({
      stopReason: "retry_exhausted",
      completed: false,
      runAttempts: 3,
      lastError: "temporary GitHub outage",
    });
    expect(attempts).toBe(3);
    expect(stopCalls).toBe(1);
  });

  it("does not launch work after the deadline", async () => {
    let runs = 0;
    let stopCalls = 0;
    const runtime = {
      inspect: () => ({ stopRequested: false, issues: [] }),
      run: async () => { runs += 1; return { stopRequested: false, issues: [] }; },
      inspectQueue: async () => ({ readyIssueNumbers: [10] }),
      requestStop: async () => {
        stopCalls += 1;
        return { stopRequested: true, issues: [] };
      },
    };
    expect(await runOvernightLoop({
      runtime,
      mode: "AutoMerge",
      maxIssues: 24,
      deadlineEpochMilliseconds: 1_000,
      now: () => 1_000,
      sleep: async () => {},
    })).toMatchObject({ stopReason: "deadline", completed: false });
    expect(runs).toBe(0);
    expect(stopCalls).toBe(1);
  });
});
