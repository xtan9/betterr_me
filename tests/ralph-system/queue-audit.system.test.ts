import { describe, expect, it } from "vitest";
import { classifyQueueAudit } from "../../scripts/ralph/v2/queue-audit.mjs";

describe("Ralph v2 final queue audit", () => {
  it("distinguishes closed work, required non-mergeable PRs, and unresolved issues", () => {
    expect(classifyQueueAudit({
      audit: {
        issues: [
          { number: 10, state: "CLOSED", pullRequests: [{ number: 100, state: "MERGED", draft: false }] },
          { number: 11, state: "OPEN", pullRequests: [{ number: 101, state: "MERGED", draft: false }] },
          { number: 12, state: "OPEN", pullRequests: [{ number: 102, state: "OPEN", draft: true }] },
          { number: 13, state: "OPEN", pullRequests: [] },
        ],
      },
      issueRecords: {
        10: { disposition: "merged", pullRequestNumber: 100 },
        11: { disposition: "merged", pullRequestNumber: 101 },
        12: { disposition: "safety_blocked", pullRequestNumber: 102 },
        13: { disposition: "verification_failed" },
      },
      readyIssueNumbers: [13],
    })).toEqual({
      queueComplete: false,
      closedIssueNumbers: [10],
      nonMergeableIssueNumbers: [12],
      unresolvedIssueNumbers: [11, 13],
      readyIssueNumbers: [13],
    });
  });

  it("accepts completion only when every approved issue is closed or has a preserved blocked PR", () => {
    expect(classifyQueueAudit({
      audit: {
        issues: [
          { number: 20, state: "CLOSED", pullRequests: [] },
          { number: 21, state: "OPEN", pullRequests: [{ number: 121, state: "OPEN", draft: true }] },
        ],
      },
      issueRecords: {
        21: { disposition: "verification_failed", pullRequestNumber: 121 },
      },
      readyIssueNumbers: [],
    })).toMatchObject({
      queueComplete: true,
      closedIssueNumbers: [20],
      nonMergeableIssueNumbers: [21],
      unresolvedIssueNumbers: [],
    });
  });
});
