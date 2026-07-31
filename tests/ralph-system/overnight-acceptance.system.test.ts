import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

const pass = [{
  name: "required",
  bucket: "pass",
  state: "SUCCESS",
  provider: "github-actions",
  runId: "pass-run",
}];

describe("Ralph v2 final overnight acceptance", () => {
  it("drains a mixed queue sequentially through fresh CLI processes with an exact summary", async () => {
    const world = createGitWorld();
    worlds.push(world);
    const issues = [
      { number: 1101, title: "Resolve moved-base conflict", body: "Create lib/conflict.txt." },
      { number: 1106, title: "Dependent final route", body: "Create lib/final.txt.", blockers: [1102] },
      { number: 1102, title: "Repair failed checks", body: "Create lib/repaired.txt." },
      { number: 1103, title: "Protected account behavior", body: "Change authentication behavior in lib/risk.txt." },
      { number: 1104, title: "Ambiguous request", body: "Create the unspecified behavior." },
      { number: 1105, title: "Manual merge route", body: "Create lib/manual.txt." },
    ];
    const scenario = createSystemScenario(world, {
      issues,
      workerChanges: [],
      expectedChanges: [],
      workerChangesByIssue: {
        "1101": [{ path: "lib/conflict.txt", content: "candidate\n" }],
        "1102": [{ path: "lib/repaired.txt", content: "initial\n" }],
        "1103": [{ path: "lib/risk.txt", content: "risk\n" }],
        "1105": [{ path: "lib/manual.txt", content: "manual\n" }],
        "1106": [{ path: "lib/final.txt", content: "final\n" }],
      },
      expectedChangesByIssue: {
        "1101": [{ path: "lib/conflict.txt", content: "candidate\n", mode: "100644", status: "A" }],
        "1102": [{ path: "lib/repaired.txt", content: "initial\n", mode: "100644", status: "A" }],
        "1103": [{ path: "lib/risk.txt", content: "risk\n", mode: "100644", status: "A" }],
        "1105": [{ path: "lib/manual.txt", content: "manual\n", mode: "100644", status: "A" }],
        "1106": [{ path: "lib/final.txt", content: "final\n", mode: "100644", status: "A" }],
      },
      repairWorkerChanges: [],
      repairExpectedChanges: [],
      repairWorkerChangesByIssue: {
        "1101": [{ path: "lib/conflict.txt", content: "resolved\n" }],
        "1102": [{ path: "lib/repaired.txt", content: "fixed\n" }],
      },
      repairExpectedChangesByIssue: {
        "1101": [{ path: "lib/conflict.txt", content: "resolved\n", mode: "100644", status: "A" }],
        "1102": [{ path: "lib/repaired.txt", content: "fixed\n", mode: "100644", status: "A" }],
      },
      advanceMainAfterPullRequestByIssue: {
        "1101": { path: "lib/conflict.txt", content: "main\n" },
      },
      pullRequestMergeStateStatusWhenBehindByIssue: { "1101": "DIRTY" },
      pullRequestCheckSequenceByIssue: {
        "1101": [pass, pass],
        "1102": [[{
          name: "tests",
          bucket: "fail",
          state: "FAILURE",
          provider: "github-actions",
          runId: "failed-run",
        }], pass],
        "1103": [pass],
        "1105": [[{
          name: "manual-hold",
          bucket: "pending",
          state: "IN_PROGRESS",
          provider: "github-actions",
          runId: "manual-run",
        }]],
        "1106": [pass],
      },
      workerResultByIssue: {
        "1104": {
          kind: "blocked",
          ambiguous: true,
          blockerKind: "ticket-infrastructure",
          summary: "requirements need a human decision",
        },
      },
      crashPoint: "pull-request-conflict-repair-planned",
    });

    const hostPath = fileURLToPath(new URL(
      "./fixtures/overnight-acceptance-host.mjs",
      import.meta.url,
    ));
    const host = spawnSync(process.execPath, [hostPath, scenario.configPath], {
      cwd: world.controllerPath,
      encoding: "utf8",
      timeout: 240_000,
      windowsHide: true,
      env: createSafeEnvironment(process.env, {
        GIT_TRACE2_EVENT: world.gitTracePath,
        HOME: world.root,
        USERPROFILE: world.root,
      }),
    });
    expect(host.status, host.stderr || host.error?.message).toBe(0);
    const delivery = JSON.parse(host.stdout.trim().split(/\r?\n/).at(-1) ?? "null");
    expect(delivery.result.issues).toEqual([
      expect.objectContaining({ number: 1101, disposition: "merged" }),
      expect.objectContaining({ number: 1102, disposition: "merged" }),
      expect.objectContaining({ number: 1103, disposition: "safety_blocked" }),
      expect.objectContaining({ number: 1104, disposition: "safety_blocked" }),
      expect.objectContaining({ number: 1105, disposition: "merged" }),
      expect.objectContaining({ number: 1106, disposition: "merged" }),
    ]);
    expect(delivery.result).toMatchObject({
      completed: true,
      stopReason: "queue_complete",
      queueAudit: {
        readyIssueNumbers: [],
        closedIssueNumbers: [1101, 1102, 1105, 1106],
        nonMergeableIssueNumbers: [1103, 1104],
      },
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
    });
    expect(delivery.manualMergeApplied).toBe(true);
    expect(scenario.inspectEvents().filter((event: any) => event.kind === "pull-request-merged"))
      .toHaveLength(3);
    const claimOrder = scenario.inspectEvents()
      .filter((event: any) => event.kind === "issue-claimed")
      .map((event: any) => event.issueNumber);
    expect(claimOrder.indexOf(1102)).toBeLessThan(claimOrder.indexOf(1106));
    expect(fs.existsSync(path.join(world.runtimePath, "overnight-summary.json"))).toBe(true);
    expect(fs.existsSync(path.join(world.runtimePath, "overnight-summary.md"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(
      path.join(world.runtimePath, "overnight-summary.json"),
      "utf8",
    ))).toMatchObject({ stopReason: "queue_complete", completed: true });
    expect(fs.readFileSync(path.join(world.runtimePath, "overnight-summary.md"), "utf8"))
      .toContain("Stop reason: `queue_complete`");
    expect(fs.existsSync(path.join(world.runtimePath, "worktrees", "current"))).toBe(false);
    for (const number of [1101, 1102, 1103, 1105, 1106]) {
      expect(git(world.controllerPath, [
        "show-ref", "--verify", "--quiet", `refs/heads/codex/issue-${number}`,
      ], true).status).not.toBe(0);
    }
    const parked = delivery.result.issues.find((issue: any) => issue.number === 1104).artifactPath;
    fs.writeFileSync(path.join(parked, "tamper.txt"), "changed after summary\n");
    const tamperedAudit = scenario.run(["audit", "--json"]);
    expect(tamperedAudit.exitCode, tamperedAudit.stderr.join("\n")).toBe(0);
    expect(JSON.parse(tamperedAudit.stdout.at(-1) ?? "null")).toMatchObject({
      queueComplete: false,
      unresolvedIssueNumbers: [1104],
    });
  }, 240_000);
});
