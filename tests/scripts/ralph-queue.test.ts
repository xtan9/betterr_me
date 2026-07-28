import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  analyzeTypeScriptRun,
  evaluateIteration,
  findNewTypeScriptDiagnostics,
  selectNextIssue,
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
