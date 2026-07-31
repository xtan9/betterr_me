import { describe, expect, it, vi } from "vitest";

import {
  reconcileScheduledWorkflowIssue,
  scheduledFailureDiagnostic,
  scheduledFailureIssueBody,
  scheduledFailureIssueTitle,
} from "../../scripts/ci/reconcile-scheduled-workflow-issue.mjs";
import {
  mutationDiagnostic,
} from "../../scripts/ci/scheduled-workflow-diagnostic.mjs";

function scheduledRun(overrides = {}) {
  return {
    name: "CI",
    event: "schedule",
    conclusion: "failure",
    run_number: 42,
    html_url: "https://github.com/xtan9/betterr_me/actions/runs/42",
    head_branch: "main",
    head_sha: "abc123",
    updated_at: "2026-07-30T05:10:00Z",
    ...overrides,
  };
}

function mockApi(openIssues: Array<{
  number: number;
  title: string;
  pull_request?: unknown;
}> = []) {
  return {
    listOpenIssues: vi.fn().mockResolvedValue(openIssues),
    hasLabel: vi.fn().mockResolvedValue(true),
    createIssue: vi.fn().mockResolvedValue({ number: 123 }),
    addComment: vi.fn().mockResolvedValue({}),
    closeIssue: vi.fn().mockResolvedValue({}),
  };
}

describe("scheduled workflow failure issues", () => {
  it("preserves an explicit command timeout when GitHub marks the step failed", () => {
    expect(mutationDiagnostic({
      reportedConclusion: "timed_out",
      stepOutcome: "failure",
      runCancelled: "false",
    })).toEqual({
      conclusion: "timed_out",
      category: "timeout",
      detail: "The mutation command exceeded its declared 50-minute limit.",
    });
  });

  it("distinguishes cancellation and missing runner outcomes", () => {
    expect(mutationDiagnostic({
      reportedConclusion: "timed_out",
      stepOutcome: "failure",
      runCancelled: "true",
    }).category).toBe("cancellation");
    expect(mutationDiagnostic({
      reportedConclusion: "",
      stepOutcome: "skipped",
      runCancelled: "false",
    }).category).toBe("infrastructure interruption");
  });

  it.each([
    ["failure", "failure"],
    ["timed_out", "timeout"],
    ["cancelled", "cancellation"],
    ["stale", "infrastructure interruption"],
    ["startup_failure", "infrastructure interruption"],
  ])("classifies %s as %s", (conclusion, category) => {
    expect(scheduledFailureDiagnostic(conclusion)).toBe(category);
    expect(scheduledFailureIssueBody(scheduledRun({ conclusion }))).toContain(
      `Diagnostic category: ${category}`,
    );
  });

  it("creates a triaged bug issue for the first scheduled failure", async () => {
    const api = mockApi();
    const run = scheduledRun();

    await expect(reconcileScheduledWorkflowIssue({ api, run }))
      .resolves.toEqual({ action: "created", issueNumber: 123 });
    expect(api.createIssue).toHaveBeenCalledWith({
      title: "[Bug] Scheduled CI workflow failed",
      body: scheduledFailureIssueBody(run),
      labels: ["needs-triage"],
    });
  });

  it("comments instead of duplicating an existing open issue", async () => {
    const title = scheduledFailureIssueTitle("CI");
    const api = mockApi([{ number: 17, title }]);

    await expect(reconcileScheduledWorkflowIssue({
      api,
      run: scheduledRun({ conclusion: "timed_out" }),
    })).resolves.toEqual({ action: "commented", issueNumber: 17 });
    expect(api.createIssue).not.toHaveBeenCalled();
    expect(api.addComment).toHaveBeenCalledWith(
      17,
      expect.stringContaining("Still failing"),
    );
  });

  it("closes the alert after a successful scheduled recovery", async () => {
    const title = scheduledFailureIssueTitle("CI");
    const api = mockApi([{ number: 17, title }]);

    await expect(reconcileScheduledWorkflowIssue({
      api,
      run: scheduledRun({ conclusion: "success", run_number: 43 }),
    })).resolves.toEqual({ action: "closed", issueNumber: 17 });
    expect(api.addComment).toHaveBeenCalledWith(
      17,
      expect.stringContaining("Recovered"),
    );
    expect(api.closeIssue).toHaveBeenCalledWith(17);
  });

  it("ignores non-scheduled and neutral workflow runs", async () => {
    const api = mockApi();

    await expect(reconcileScheduledWorkflowIssue({
      api,
      run: scheduledRun({ event: "pull_request" }),
    })).resolves.toEqual({ action: "ignored" });
    await expect(reconcileScheduledWorkflowIssue({
      api,
      run: scheduledRun({ conclusion: "neutral" }),
    })).resolves.toEqual({ action: "ignored" });
    expect(api.createIssue).not.toHaveBeenCalled();
  });
});
