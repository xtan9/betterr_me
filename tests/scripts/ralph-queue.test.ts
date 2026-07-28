import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  analyzeTypeScriptRun,
  buildOvernightSummary,
  chooseClaimWinner,
  classifyChangeRisk,
  evaluateMergeGate,
  failureDisposition,
  evaluateIteration,
  findNewTypeScriptDiagnostics,
  selectNextLiveIssue,
  selectNextLiveIssueStatus,
  selectNextIssue,
  selectRecoveryBase,
  reviewFailureKind,
  shouldRepairFailure,
  shouldRetry,
  testVerificationFailureKind,
  transitionIssue,
  validateQueueState,
} from "../../scripts/ralph/queue.mjs";

const queue = [
  { issueNumber: 101, title: "Create the lifecycle", blockers: [] },
  { issueNumber: 102, title: "Reconcile updates", blockers: [101] },
  { issueNumber: 103, title: "Create another seam", blockers: [] },
];

describe("Ralph queue selection", () => {
  it("loads the approved 24-issue queue with #481 at the initial frontier", () => {
    const architectureQueue = JSON.parse(
      fs.readFileSync(
        path.resolve("scripts/ralph/architecture-queue.json"),
        "utf8",
      ),
    );

    expect(architectureQueue).toHaveLength(24);
    expect(selectNextIssue(architectureQueue, { completed: [] }).issueNumber).toBe(
      481,
    );
  });

  it("selects the first incomplete issue whose blockers are complete", () => {
    expect(selectNextIssue(queue, { completed: [] })).toEqual(queue[0]);
    expect(selectNextIssue(queue, { completed: [101] })).toEqual(queue[1]);
  });

  it("skips blocked work and selects a later frontier issue", () => {
    expect(selectNextIssue(queue, { completed: [103] })).toEqual(queue[0]);
    expect(
      selectNextIssue(
        [
          { issueNumber: 102, title: "Reconcile updates", blockers: [101] },
          { issueNumber: 103, title: "Create another seam", blockers: [] },
          { issueNumber: 101, title: "Create the lifecycle", blockers: [] },
        ],
        { completed: [] },
      ),
    ).toEqual({
      issueNumber: 103,
      title: "Create another seam",
      blockers: [],
    });
  });

  it("returns null only when every queued issue is complete", () => {
    expect(selectNextIssue(queue, { completed: [101, 102, 103] })).toBeNull();
  });

  it("stops when incomplete work has no reachable frontier", () => {
    expect(() =>
      selectNextIssue(
        [
          { issueNumber: 101, title: "First", blockers: [102] },
          { issueNumber: 102, title: "Second", blockers: [101] },
        ],
        { completed: [] },
      ),
    ).toThrow("no runnable issues remain");
  });

  it("rejects progress that references an issue outside the queue", () => {
    expect(() => validateQueueState(queue, { completed: [999] })).toThrow(
      "unknown issue #999",
    );
  });

  it.each([
    [[], { completed: [] }, "queue must contain at least one issue"],
    [queue, {}, "progress must contain a completed array"],
    [
      [{ issueNumber: 0, title: "Invalid", blockers: [] }],
      { completed: [] },
      "issueNumber must be a positive integer",
    ],
    [
      [
        { issueNumber: 101, title: "First", blockers: [] },
        { issueNumber: 101, title: "Duplicate", blockers: [] },
      ],
      { completed: [] },
      "duplicate issue #101",
    ],
    [
      [{ issueNumber: 101, title: "No blockers", blockers: null }],
      { completed: [] },
      "must contain a blockers array",
    ],
    [
      [{ issueNumber: 101, title: "Bad blocker", blockers: [0] }],
      { completed: [] },
      "blocker for issue #101 must be a positive integer",
    ],
    [
      [{ issueNumber: 101, title: "Unknown blocker", blockers: [999] }],
      { completed: [] },
      "references unknown blocker #999",
    ],
    [queue, { completed: [0] }, "completed issue must be a positive integer"],
  ])("rejects invalid queue or progress state", (issues, progress, message) => {
    expect(() => validateQueueState(issues, progress)).toThrow(message);
  });
});

describe("Ralph live issue selection and claiming", () => {
  const liveQueue = [
    { issueNumber: 101, blockers: [] },
    { issueNumber: 102, blockers: [101] },
    { issueNumber: 103, blockers: [] },
  ];

  it("selects the first open, ready, unassigned issue whose blockers are merged", () => {
    const liveIssues = [
      {
        issueNumber: 101,
        state: "OPEN",
        labels: ["ready-for-agent"],
        assignees: [],
      },
      {
        issueNumber: 102,
        state: "OPEN",
        labels: ["ready-for-agent"],
        assignees: [],
      },
      {
        issueNumber: 103,
        state: "OPEN",
        labels: ["ready-for-agent"],
        assignees: [],
      },
    ];

    expect(
      selectNextLiveIssue(liveQueue, { completed: [] }, liveIssues, "xtan9"),
    ).toEqual(liveQueue[0]);
  });

  it("skips issues that are closed, not ready, or assigned to another actor", () => {
    const liveIssues = [
      {
        issueNumber: 101,
        state: "CLOSED",
        labels: ["ready-for-agent"],
        assignees: [],
      },
      {
        issueNumber: 102,
        state: "OPEN",
        labels: ["needs-info"],
        assignees: [],
      },
      {
        issueNumber: 103,
        state: "OPEN",
        labels: ["ready-for-agent"],
        assignees: ["someone-else"],
      },
    ];

    expect(
      selectNextLiveIssue(liveQueue, { completed: [] }, liveIssues, "xtan9"),
    ).toBeNull();
  });

  it("allows the current actor's assigned issue to be reconciled after a crash", () => {
    expect(
      selectNextLiveIssue(
        liveQueue,
        { completed: [] },
        [
          {
            issueNumber: 101,
            state: "OPEN",
            labels: ["ready-for-agent"],
            assignees: ["xtan9"],
          },
        ],
        "xtan9",
      ),
    ).toEqual(liveQueue[0]);
  });

  it("distinguishes a completed queue from a temporarily unavailable frontier", () => {
    expect(
      selectNextLiveIssueStatus(liveQueue, { completed: [] }, [], "xtan9"),
    ).toEqual({ status: "unavailable", issueNumbers: [101, 103] });
    expect(
      selectNextLiveIssueStatus(
        liveQueue,
        { completed: [101, 102, 103] },
        [],
        "xtan9",
      ),
    ).toEqual({ status: "complete" });
  });

  it("chooses the earliest unexpired remote claim deterministically", () => {
    const now = new Date("2026-07-28T06:00:00Z");
    expect(
      chooseClaimWinner(
        [
          {
            runId: "later",
            createdAt: "2026-07-28T05:01:00Z",
            expiresAt: "2026-07-29T05:01:00Z",
            commentId: 12,
          },
          {
            runId: "expired",
            createdAt: "2026-07-27T01:00:00Z",
            expiresAt: "2026-07-28T01:00:00Z",
            commentId: 9,
          },
          {
            runId: "winner",
            createdAt: "2026-07-28T05:00:00Z",
            expiresAt: "2026-07-29T05:00:00Z",
            commentId: 10,
          },
        ],
        now,
      )?.runId,
    ).toBe("winner");
  });
});

describe("Ralph durable state and policy", () => {
  it("rejects duplicate or dependency-incomplete progress", () => {
    const queue = [
      { issueNumber: 101, blockers: [] },
      { issueNumber: 102, blockers: [101] },
    ];

    expect(() => validateQueueState(queue, { completed: [101, 101] })).toThrow(
      "duplicate completed issue #101",
    );
    expect(() => validateQueueState(queue, { completed: [102] })).toThrow(
      "completed issue #102 appears before blocker #101",
    );
  });

  it("advances issue stages monotonically and permits idempotent recovery", () => {
    const selected = transitionIssue(
      { version: 2, completed: [], issues: {} },
      101,
      "selected",
      { baseSha: "abc" },
      "2026-07-28T06:00:00Z",
    );
    const same = transitionIssue(
      selected,
      101,
      "selected",
      { baseSha: "abc" },
      "2026-07-28T06:01:00Z",
    );
    const claimed = transitionIssue(
      same,
      101,
      "claimed",
      { claimRunId: "run-1" },
      "2026-07-28T06:02:00Z",
    );

    expect(claimed.issues["101"].stage).toBe("claimed");
    expect(() =>
      transitionIssue(claimed, 101, "selected", {}, "2026-07-28T06:03:00Z"),
    ).toThrow("cannot move issue #101 backward");
  });

  it("keeps the recorded base when recovering an existing worktree", () => {
    expect(selectRecoveryBase("recorded", "new-main", true)).toBe("recorded");
    expect(selectRecoveryBase("recorded", "new-main", false)).toBe("new-main");
    expect(() => selectRecoveryBase(undefined, "new-main", true)).toThrow(
      "existing worktree has no recorded base",
    );
  });

  it("reconciles controller errors according to durable remote progress", () => {
    expect(failureDisposition("implementing", false)).toBe("failed");
    expect(failureDisposition("implementing", false, "kill-switch")).toBe(
      "interrupted",
    );
    expect(failureDisposition("implementing", false, "timeout")).toBe(
      "interrupted",
    );
    expect(failureDisposition("pr-open", false)).toBe("manual-review");
    expect(failureDisposition("checks-passed", false)).toBe("manual-review");
    expect(failureDisposition("checks-passed", true)).toBe("merged");
  });

  it("allows automatic merge only for a low-risk, fully green PR", () => {
    expect(
      evaluateMergeGate({
        mode: "AutoMerge",
        risk: "low",
        checksPassed: true,
        reviewRequired: true,
        reviewDecision: "APPROVED",
        mergeState: "CLEAN",
        ambiguous: false,
      }),
    ).toEqual({ canMerge: true, reason: "all merge gates passed" });
  });

  it.each([
    [{ mode: "PrOnly", risk: "low" }, "mode is PrOnly"],
    [{ mode: "AutoMerge", risk: "high" }, "change is high risk"],
    [{ mode: "AutoMerge", risk: "low", checksPassed: false }, "required checks did not pass"],
    [{ mode: "AutoMerge", risk: "low", mergeState: "DIRTY" }, "pull request has conflicts"],
    [{ mode: "AutoMerge", risk: "low", ambiguous: true }, "requirements are ambiguous"],
    [
      { mode: "AutoMerge", risk: "low", reviewDecision: "CHANGES_REQUESTED" },
      "review changes were requested",
    ],
  ])("fails closed at the merge boundary", (overrides, reason) => {
    expect(
      evaluateMergeGate({
        mode: "AutoMerge",
        risk: "low",
        checksPassed: true,
        reviewRequired: false,
        reviewDecision: "",
        mergeState: "CLEAN",
        ambiguous: false,
        ...overrides,
      }),
    ).toEqual({ canMerge: false, reason });
  });

  it("allows automatic merge only for an explicit low-risk path allowlist", () => {
    for (const file of [
      "scripts/ralph/queue.mjs",
      ".github/workflows/ci.yml",
      "supabase/migrations/20260728000000_change.sql",
      "app/api/oauth/token/route.ts",
      "tsconfig.json",
      "vercel.json",
      "lib/billing/stripe.ts",
      "lib/db/calendar-events.ts",
    ]) {
      expect(classifyChangeRisk([file], { title: "Routine change" }).level).toBe(
        "high",
      );
    }
    expect(
      classifyChangeRisk(["lib/calendar/create-event.ts"], {
        title: "Create a calendar event",
      }).level,
    ).toBe("low");
    expect(
      classifyChangeRisk(
        ["lib/calendar/create-event.ts", "tests/lib/calendar/create-event.test.ts"],
        { title: "Create a calendar event" },
      ).level,
    ).toBe("low");
  });

  it("retries only transient failures and respects the cap", () => {
    expect(shouldRetry("network", 1, 3)).toBe(true);
    expect(shouldRetry("rate-limit", 2, 3)).toBe(true);
    expect(shouldRetry("network", 3, 3)).toBe(false);
    expect(shouldRetry("tests", 1, 3)).toBe(false);
    expect(shouldRetry("review", 1, 3)).toBe(false);
    expect(shouldRetry("ambiguous", 1, 3)).toBe(false);
  });

  it("uses bounded fresh repair attempts only for concrete verification findings", () => {
    expect(shouldRepairFailure("tests", 0, 2)).toBe(true);
    expect(shouldRepairFailure("typecheck", 1, 2)).toBe(true);
    expect(shouldRepairFailure("review", 2, 2)).toBe(false);
    expect(shouldRepairFailure("ambiguous", 0, 2)).toBe(false);
    expect(shouldRepairFailure("unsafe-scope", 0, 2)).toBe(false);
    expect(shouldRepairFailure("network", 0, 2)).toBe(false);
  });

  it("maps ordinary test exits to repairable findings without hiding interruptions", () => {
    expect(testVerificationFailureKind("command")).toBe("tests");
    expect(testVerificationFailureKind(undefined)).toBe("tests");
    expect(testVerificationFailureKind("timeout")).toBe("timeout");
    expect(testVerificationFailureKind("kill-switch")).toBe("kill-switch");
    expect(testVerificationFailureKind("network")).toBe("network");
  });

  it("repairs only review findings explicitly classified as safe to repair", () => {
    expect(reviewFailureKind({ repairable: true })).toBe("review");
    expect(reviewFailureKind({ repairable: false })).toBe("review-nonrepairable");
    expect(reviewFailureKind({})).toBe("review-nonrepairable");
  });

  it("builds a durable final summary from issue states", () => {
    expect(
      buildOvernightSummary({
        version: 2,
        runId: "run-1",
        startedAt: "2026-07-28T06:00:00Z",
        completed: [101],
        issues: {
          "101": { stage: "merged", prNumber: 601 },
          "102": { stage: "manual-review", prNumber: 602, stopReason: "high risk" },
        },
      }),
    ).toMatchObject({
      runId: "run-1",
      merged: [{ issueNumber: 101, prNumber: 601 }],
      awaitingHuman: [{ issueNumber: 102, prNumber: 602, reason: "high risk" }],
    });
  });
});

describe("Ralph TypeScript baseline comparison", () => {
  it("ignores line-number movement for an existing diagnostic", () => {
    expect(
      findNewTypeScriptDiagnostics(
        ["tests/example.test.ts(10,2): error TS2322: Type 'x' is invalid."],
        ["tests/example.test.ts(25,4): error TS2322: Type 'x' is invalid."],
      ),
    ).toEqual([]);
  });

  it("reports a new diagnostic with its file and message", () => {
    expect(
      findNewTypeScriptDiagnostics([], [
        "lib/example.ts(3,1): error TS2304: Cannot find name 'missing'.",
      ]),
    ).toEqual([
      "lib/example.ts | error TS2304: Cannot find name 'missing'.",
    ]);
  });

  it("reports an additional duplicate diagnostic", () => {
    const diagnostic =
      "lib/example.ts(3,1): error TS2304: Cannot find name 'missing'.";

    expect(findNewTypeScriptDiagnostics([diagnostic], [diagnostic, diagnostic])).toEqual([
      "lib/example.ts | error TS2304: Cannot find name 'missing'.",
    ]);
  });

  it("captures global compiler diagnostics without a file location", () => {
    expect(
      findNewTypeScriptDiagnostics([], [
        "error TS18003: No inputs were found in config file 'tsconfig.json'.",
      ]),
    ).toEqual([
      "GLOBAL | error TS18003: No inputs were found in config file 'tsconfig.json'.",
    ]);
  });

  it("captures unfamiliar compiler output so failures cannot pass silently", () => {
    expect(
      findNewTypeScriptDiagnostics([], ["TypeScript compiler terminated unexpectedly"]),
    ).toEqual(["OUTPUT | TypeScript compiler terminated unexpectedly"]);
  });

  it("rejects a nonzero compiler exit with no output", () => {
    expect(analyzeTypeScriptRun([], 2)).toEqual({
      accountedFor: false,
      signals: [],
    });
  });

  it("accepts a nonzero compiler exit only when a TypeScript diagnostic was captured", () => {
    expect(analyzeTypeScriptRun(["error TS5023: Unknown compiler option."], 2)).toEqual({
      accountedFor: true,
      signals: ["GLOBAL | error TS5023: Unknown compiler option."],
    });
  });

  it("does not treat unrelated output as accounting for a compiler failure", () => {
    expect(analyzeTypeScriptRun(["Node runtime warning"], 2).accountedFor).toBe(false);
  });
});

describe("Ralph iteration advancement", () => {
  const successfulIteration = {
    selectedIssueNumber: 101,
    beforeSha: "before",
    afterSha: "after",
    commitCount: 1,
    branchMatches: true,
    directParentMatches: true,
    headMatches: true,
    worktreeClean: true,
    commitSubject: "refactor: own scheduling lifecycle (#101)",
    verificationExitCode: 0,
    independentReview: {
      status: "pass",
      blockingFindings: [],
      summary: "No blocking findings.",
    },
    agentResult: {
      status: "completed",
      issueNumber: 101,
      testsPassed: true,
      reviewCompleted: true,
      summary: "Implemented and verified the lifecycle.",
    },
  };

  it("advances after one clean, verified commit for the selected issue", () => {
    expect(evaluateIteration(successfulIteration)).toEqual({
      canAdvance: true,
      reason: "completed",
    });
  });

  it.each([
    [{ ...successfulIteration, afterSha: "before" }, "did not create a commit"],
    [{ ...successfulIteration, commitCount: 2 }, "created 2 commits"],
    [{ ...successfulIteration, worktreeClean: false }, "worktree is not clean"],
    [
      { ...successfulIteration, commitSubject: "refactor: own lifecycle" },
      "commit subject does not reference #101",
    ],
    [
      {
        ...successfulIteration,
        agentResult: { ...successfulIteration.agentResult, issueNumber: 102 },
      },
      "agent reported issue #102",
    ],
    [
      {
        ...successfulIteration,
        agentResult: {
          ...successfulIteration.agentResult,
          testsPassed: false,
        },
      },
      "did not report passing tests",
    ],
    [
      {
        ...successfulIteration,
        agentResult: {
          ...successfulIteration.agentResult,
          reviewCompleted: false,
        },
      },
      "did not report a completed review",
    ],
    [
      { ...successfulIteration, branchMatches: false },
      "agent left the integration branch",
    ],
    [
      { ...successfulIteration, directParentMatches: false },
      "new commit does not directly extend the starting commit",
    ],
    [
      { ...successfulIteration, headMatches: false },
      "final HEAD does not match the verified commit",
    ],
    [
      { ...successfulIteration, verificationExitCode: 1 },
      "independent test suite failed",
    ],
    [
      {
        ...successfulIteration,
        independentReview: {
          status: "findings",
          blockingFindings: ["A blocking defect"],
          summary: "Review failed.",
        },
      },
      "independent code review did not pass",
    ],
  ])("stops when the success gate fails", (iteration, reason) => {
    expect(evaluateIteration(iteration)).toEqual({
      canAdvance: false,
      reason,
    });
  });

  it("does not accept a longer issue number as a ticket reference", () => {
    expect(
      evaluateIteration({
        ...successfulIteration,
        commitSubject: "refactor: own scheduling lifecycle (#1010)",
      }),
    ).toEqual({
      canAdvance: false,
      reason: "commit subject does not reference #101",
    });
  });

  it("stops when the agent does not report completion", () => {
    expect(
      evaluateIteration({
        ...successfulIteration,
        agentResult: { ...successfulIteration.agentResult, status: "blocked" },
      }),
    ).toEqual({
      canAdvance: false,
      reason: "agent reported blocked",
    });
  });

  it("stops when the agent result is missing", () => {
    expect(
      evaluateIteration({ ...successfulIteration, agentResult: undefined }),
    ).toEqual({
      canAdvance: false,
      reason: "agent reported no status",
    });
  });

  it("stops when independent review output is malformed", () => {
    expect(
      evaluateIteration({
        ...successfulIteration,
        independentReview: { status: "pass", summary: "Missing findings." },
      }),
    ).toEqual({
      canAdvance: false,
      reason: "independent code review did not pass",
    });
  });
});

describe("Ralph queue CLI errors", () => {
  const queueScript = path.resolve("scripts/ralph/queue.mjs");

  it("fails for an unknown command", () => {
    const result = spawnSync(process.execPath, [queueScript, "unknown"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("usage: queue.mjs");
  });

  it("fails when a required option is missing", () => {
    const result = spawnSync(process.execPath, [queueScript, "next"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required option --queue");
  });
});
