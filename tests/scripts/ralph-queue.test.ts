import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  evaluateIteration,
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
});

describe("Ralph iteration advancement", () => {
  const successfulIteration = {
    selectedIssueNumber: 101,
    beforeSha: "before",
    afterSha: "after",
    commitCount: 1,
    worktreeClean: true,
    commitMessage: "refactor: own scheduling lifecycle (#101)",
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
      { ...successfulIteration, commitMessage: "refactor: own lifecycle" },
      "commit message does not reference #101",
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
  ])("stops when the success gate fails", (iteration, reason) => {
    expect(evaluateIteration(iteration)).toEqual({
      canAdvance: false,
      reason,
    });
  });
});
