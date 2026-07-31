import { describe, expect, it, vi } from "vitest";

import { detectPullRequestValidatedPush } from
  "../../scripts/ci/detect-pull-request-validated-push.mjs";

describe("pull-request-validated push detection", () => {
  it("recognizes a merged pull request targeting the pushed branch", async () => {
    const listPullRequestsAssociatedWithCommit = vi.fn().mockResolvedValue({
      data: [
        {
          base: { ref: "main" },
          head: { sha: "validated-head" },
          merged_at: "2026-07-30T15:14:11Z",
        },
      ],
    });
    const listCheckRunsForRef = vi.fn().mockResolvedValue({
      data: {
        check_runs: [
          { conclusion: "success", name: "CI Gate", status: "completed" },
          { conclusion: "success", name: "E2E Gate", status: "completed" },
        ],
      },
    });

    await expect(detectPullRequestValidatedPush({
      branch: "main",
      commitSha: "f0835a8",
      listCheckRunsForRef,
      listPullRequestsAssociatedWithCommit,
      owner: "xtan9",
      repo: "betterr_me",
    })).resolves.toBe(true);
  });

  it("does not treat direct pushes or unrelated pull requests as validated", async () => {
    for (const data of [
      [],
      [{ base: { ref: "develop" }, merged_at: "2026-07-30T15:14:11Z" }],
      [{ base: { ref: "main" }, merged_at: null }],
    ]) {
      await expect(detectPullRequestValidatedPush({
        branch: "main",
        commitSha: "direct-push",
        listCheckRunsForRef: vi.fn(),
        listPullRequestsAssociatedWithCommit: vi.fn().mockResolvedValue({ data }),
        owner: "xtan9",
        repo: "betterr_me",
      })).resolves.toBe(false);
    }
  });

  it("keeps direct-push CI when the merged pull request gates were not green", async () => {
    const pullRequest = {
      base: { ref: "main" },
      head: { sha: "untested-head" },
      merged_at: "2026-07-30T15:14:11Z",
    };

    for (const check_runs of [
      [],
      [{ conclusion: "success", name: "CI Gate", status: "completed" }],
      [
        { conclusion: "success", name: "CI Gate", status: "completed" },
        { conclusion: "failure", name: "E2E Gate", status: "completed" },
      ],
      [
        { conclusion: "success", name: "CI Gate", status: "completed" },
        { conclusion: null, name: "E2E Gate", status: "in_progress" },
      ],
    ]) {
      await expect(detectPullRequestValidatedPush({
        branch: "main",
        commitSha: "merged-without-green-gates",
        listCheckRunsForRef: vi.fn().mockResolvedValue({
          data: { check_runs },
        }),
        listPullRequestsAssociatedWithCommit: vi.fn().mockResolvedValue({
          data: [pullRequest],
        }),
        owner: "xtan9",
        repo: "betterr_me",
      })).resolves.toBe(false);
    }
  });

  it("does not accept ambiguous duplicate gate checks", async () => {
    const pullRequest = {
      base: { ref: "main" },
      head: { sha: "duplicate-gates" },
      merged_at: "2026-07-30T15:14:11Z",
    };
    const check_runs = [
      { conclusion: "success", name: "CI Gate", status: "completed" },
      { conclusion: "success", name: "CI Gate", status: "completed" },
      { conclusion: "success", name: "E2E Gate", status: "completed" },
    ];

    await expect(detectPullRequestValidatedPush({
      branch: "main",
      commitSha: "merged-with-duplicate-gates",
      listCheckRunsForRef: vi.fn().mockResolvedValue({ data: { check_runs } }),
      listPullRequestsAssociatedWithCommit: vi.fn().mockResolvedValue({
        data: [pullRequest],
      }),
      owner: "xtan9",
      repo: "betterr_me",
    })).resolves.toBe(false);
  });
});
