import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createGitWorld, git } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

describe("Ralph v2 automatic merge lifecycle", () => {
  it("keeps DryRun separate from PR publication and makes no external writes", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 899, title: "Preview only", body: "Do not claim or publish." }],
      workerChanges: [{ path: "should-not-exist.txt", content: "no\n" }],
      expectedChanges: [],
    });
    const beforeMain = git(world.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim();
    const run = scenario.run(["run", "--mode", "DryRun", "--max-issues", "1", "--json"]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 899, disposition: "ready" }],
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [],
      claimRequests: [],
      pullRequests: [],
      mergeRequests: [],
    });
    expect(git(world.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim()).toBe(beforeMain);
  });

  it("parks an ambiguous issue and continues with the next independent issue", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 900, title: "Ambiguous", body: "A human decision is required." },
        { number: 901, title: "Independent", body: "Create lib/issue-901.txt." },
      ],
      workerChanges: [],
      expectedChanges: [],
      workerChangesByIssue: {
        "900": [],
        "901": [{ path: "lib/issue-901.txt", content: "independent\n" }],
      },
      expectedChangesByIssue: {
        "900": [],
        "901": [{ path: "lib/issue-901.txt", content: "independent\n", mode: "100644", status: "A" }],
      },
      workerResultByIssue: {
        "900": {
          kind: "blocked",
          ambiguous: true,
          blockerKind: "requirements",
          summary: "human must choose the behavior",
        },
      },
    });
    const run = scenario.run(["run", "--mode", "AutoMerge", "--max-issues", "2", "--json"]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [
        { number: 900, disposition: "safety_blocked", blocker: "human must choose the behavior" },
        { number: 901, disposition: "merged" },
      ],
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
      mergeRequests: [{ issueNumber: 901 }],
    });
  });

  it("preserves a Draft PR when an honest code-repair worker becomes blocked", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 902, title: "Repair can block", body: "Create lib/issue-902.txt." }],
      workerChanges: [{ path: "lib/issue-902.txt", content: "candidate\n" }],
      expectedChanges: [{ path: "lib/issue-902.txt", content: "candidate\n", mode: "100644", status: "A" }],
      repairWorkerChanges: [],
      repairExpectedChanges: [{ path: "lib/issue-902.txt", content: "candidate\n", mode: "100644", status: "A" }],
      pullRequestChecks: [{ name: "test", state: "FAILURE", bucket: "fail", provider: "github-actions", runId: "902" }],
      repairWorkerResultByIssue: {
        "902": {
          kind: "blocked",
          ambiguous: true,
          blockerKind: "requirements",
          summary: "repair needs a human decision",
        },
      },
    });
    const run = scenario.run(["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{
        number: 902,
        disposition: "safety_blocked",
        blocker: "repair needs a human decision",
        pullRequestNumber: expect.any(Number),
      }],
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      pullRequests: [{ issueNumber: 902, draft: true, state: "OPEN" }],
      mergeRequests: [],
    });
  });

  it("adopts and exhaustively re-verifies an existing Draft PR without reimplementation", () => {
    const world = createGitWorld();
    worlds.push(world);
    git(world.controllerPath, ["fetch", "origin", "main"]);
    git(world.controllerPath, ["checkout", "-b", "codex/issue-904", "origin/main"]);
    fs.mkdirSync(`${world.controllerPath}/lib`, { recursive: true });
    fs.writeFileSync(`${world.controllerPath}/lib/issue-904.txt`, "existing candidate\n");
    git(world.controllerPath, ["add", "lib/issue-904.txt"]);
    git(world.controllerPath, ["commit", "-m", "fix: existing issue 904"]);
    const headSha = git(world.controllerPath, ["rev-parse", "HEAD"]).stdout.trim();
    git(world.controllerPath, ["push", "origin", "codex/issue-904"]);
    git(world.controllerPath, ["checkout", "main"]);
    git(world.controllerPath, ["branch", "-D", "codex/issue-904"]);

    const scenario = createSystemScenario(world, {
      issues: [{ number: 904, title: "Adopt existing", body: "Create lib/issue-904.txt." }],
      workerChanges: [],
      expectedChanges: [{ path: "lib/issue-904.txt", content: "existing candidate\n", mode: "100644", status: "A" }],
      repairExpectedChanges: [{ path: "lib/issue-904.txt", content: "existing candidate\n", mode: "100644", status: "A" }],
      initialPullRequests: [{
        number: 77,
        issueNumber: 904,
        draft: true,
        state: "OPEN",
        headBranch: "codex/issue-904",
        headSha,
        baseBranch: "main",
      }],
    });
    const first = scenario.run(["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"]);
    expect(first.exitCode, first.stderr.join("\n")).toBe(0);
    expect(JSON.parse(first.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 904, disposition: "pr_waiting", pullRequestNumber: 77 }],
    });
    const run = scenario.run(["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    const output = JSON.parse(run.stdout.at(-1) ?? "null");
    expect(output, JSON.stringify(output, null, 2)).toMatchObject({
      issues: [{ number: 904, disposition: "merged", pullRequestNumber: 77 }],
    });
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [],
      verificationRequests: [{ issueNumber: 904 }],
      mergeRequests: [{ issueNumber: 904, pullRequestNumber: 77 }],
    });
  });

  it.each(["MERGED", "CLOSED"])(
    "fails closed when issue #905 is still ready but its existing PR is %s",
    (pullRequestState) => {
      const world = createGitWorld();
      worlds.push(world);
      const scenario = createSystemScenario(world, {
        issues: [{ number: 905, title: "Stale issue state", body: "Create lib/issue-905.txt." }],
        workerChanges: [{ path: "lib/issue-905.txt", content: "duplicate\n" }],
        expectedChanges: [{ path: "lib/issue-905.txt", content: "duplicate\n", mode: "100644", status: "A" }],
        initialPullRequests: [{
          number: 78,
          issueNumber: 905,
          draft: false,
          state: pullRequestState,
          headBranch: "codex/issue-905",
          headSha: world.mainSha,
          baseBranch: "main",
        }],
      });

      const run = scenario.run(["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"]);

      expect(run.exitCode, run.stderr.join("\n")).toBe(0);
      expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
        issues: [{
          number: 905,
          disposition: "safety_blocked",
          pullRequestNumber: 78,
          blocker: { kind: "existing_pull_request_not_open", state: pullRequestState },
        }],
      });
      expect(scenario.inspectExternalState()).toMatchObject({ sessions: [], mergeRequests: [] });
    },
  );

  it("merges one verified low-risk PR exactly once and cleans its checkout", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        {
          number: 901,
          title: "Add a harmless application fixture",
          body: "Create lib/issue-901.txt containing the approved fixture text.",
        },
      ],
      workerChanges: [
        { path: "lib/issue-901.txt", content: "approved fixture\n" },
      ],
      expectedChanges: [
        {
          path: "lib/issue-901.txt",
          content: "approved fixture\n",
          mode: "100644",
          status: "A",
        },
      ],
    });

    const first = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(first.exitCode, first.stderr.join("\n")).toBe(0);

    const afterFirst = scenario.inspectExternalState();
    expect(afterFirst.pullRequests).toHaveLength(1);
    expect(afterFirst.pullRequests[0]).toMatchObject({
      issueNumber: 901,
      draft: false,
      state: "MERGED",
    });
    expect(afterFirst.readyPullRequestRequests).toHaveLength(1);
    expect(afterFirst.mergeRequests).toHaveLength(1);
    expect(
      git(world.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim(),
    ).toBe(afterFirst.pullRequests[0].headSha);
    expect(
      fs.existsSync(`${world.runtimePath}/worktrees/current`),
    ).toBe(false);
    expect(JSON.parse(first.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 901, disposition: "merged" }],
    });

    const second = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(second.exitCode, second.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
      sessions: [{ issueNumber: 901 }],
      claimRequests: [{ issueNumber: 901 }],
      readyPullRequestRequests: [{ issueNumber: 901 }],
      mergeRequests: [{ issueNumber: 901 }],
    });
  });

  it("starts the next issue from the main commit merged by the previous issue", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 911, title: "Add first fixture", body: "Create lib/issue-911.txt." },
        { number: 912, title: "Add second fixture", body: "Create lib/issue-912.txt." },
      ],
      workerChanges: [],
      expectedChanges: [],
      workerChangesByIssue: {
        "911": [{ path: "lib/issue-911.txt", content: "first\n" }],
        "912": [{ path: "lib/issue-912.txt", content: "second\n" }],
      },
      expectedChangesByIssue: {
        "911": [{ path: "lib/issue-911.txt", content: "first\n", mode: "100644", status: "A" }],
        "912": [{ path: "lib/issue-912.txt", content: "second\n", mode: "100644", status: "A" }],
      },
    });

    const run = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "2",
      "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    const state = scenario.inspectExternalState();
    expect(state.maximumActiveWorkers).toBe(1);
    expect(state.sessions).toHaveLength(2);
    expect(state.pullRequests).toHaveLength(2);
    expect(state.mergeRequests).toHaveLength(2);
    expect(state.sessions[0].baseSha).toBe(world.mainSha);
    expect(state.sessions[1].baseSha).toBe(state.pullRequests[0].headSha);
    expect(
      git(world.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim(),
    ).toBe(state.pullRequests[1].headSha);
  });

  it("does not merge an ordinary-path change whose requirements are high risk", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        {
          number: 921,
          title: "Adjust the account helper",
          body: "Change authentication behavior in lib/account-helper.ts.",
        },
      ],
      workerChanges: [
        { path: "lib/account-helper.ts", content: "export const enabled = true;\n" },
      ],
      expectedChanges: [
        {
          path: "lib/account-helper.ts",
          content: "export const enabled = true;\n",
          mode: "100644",
          status: "A",
        },
      ],
    });

    const run = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    const state = scenario.inspectExternalState();
    expect(state.mergeRequests).toEqual([]);
    expect(state.readyPullRequestRequests).toEqual([]);
    expect(state.pullRequests[0].draft).toBe(true);
    expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [
        {
          number: 921,
          disposition: "safety_blocked",
          blocker: expect.stringMatching(/risk/i),
        },
      ],
    });
  });

  it("does not claim a second issue while the first PR is waiting for checks", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 931, title: "Add waiting fixture", body: "Create lib/issue-931.txt." },
        { number: 932, title: "Add later fixture", body: "Create lib/issue-932.txt." },
      ],
      workerChanges: [{ path: "lib/issue-931.txt", content: "waiting\n" }],
      expectedChanges: [
        { path: "lib/issue-931.txt", content: "waiting\n", mode: "100644", status: "A" },
      ],
      pullRequestChecks: [
        {
          name: "fixture-required-check",
          bucket: "pending",
          state: "IN_PROGRESS",
          provider: "github-actions",
          runId: "fixture-check-1",
        },
      ],
    });

    const run = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "2",
      "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    const state = scenario.inspectExternalState();
    expect(state.claimRequests).toHaveLength(1);
    expect(state.claimRequests[0].issueNumber).toBe(931);
    expect(state.sessions).toHaveLength(1);
    expect(state.pullRequests[0]).toMatchObject({ draft: true, state: "OPEN" });
    expect(state.readyPullRequestRequests).toEqual([]);
    expect(state.mergeRequests).toEqual([]);
  });

  it("refreshes a long-running issue claim once without changing its ownership identity", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 941, title: "Long check", body: "Create lib/issue-941.txt." }],
      workerChanges: [{ path: "lib/issue-941.txt", content: "long\n" }],
      expectedChanges: [{ path: "lib/issue-941.txt", content: "long\n", mode: "100644", status: "A" }],
      pullRequestChecks: [{
        name: "slow-check", bucket: "pending", state: "IN_PROGRESS",
        provider: "github-actions", runId: "slow-1",
      }],
    });
    const args = ["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"];
    expect(scenario.run(args).exitCode).toBe(0);
    const configPath = `${world.root}/system-config.json`;
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.now = "2026-07-30T19:00:00.000Z";
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    expect(scenario.run(args).exitCode).toBe(0);
    expect(scenario.run(args).exitCode).toBe(0);

    const external = scenario.inspectExternalState();
    expect(external.claims).toHaveLength(1);
    expect(external.claimRefreshRequests).toHaveLength(1);
    expect(external.claimRefreshRequests[0]).toMatchObject({
      operationId: external.claims[0].operationId,
    });
  });

  it("does not finalize a merge until remote main contains the exact PR head", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 941, title: "Add merge receipt fixture", body: "Create lib/issue-941.txt." },
      ],
      workerChanges: [{ path: "lib/issue-941.txt", content: "receipt\n" }],
      expectedChanges: [
        { path: "lib/issue-941.txt", content: "receipt\n", mode: "100644", status: "A" },
      ],
      mergeUpdatesMain: false,
    });

    const run = scenario.run([
      "run",
      "--mode",
      "AutoMerge",
      "--max-issues",
      "1",
      "--json",
    ]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr.join("\n")).toMatch(/remote main.*merged head/i);
    expect(
      git(world.remotePath, ["rev-parse", "refs/heads/main"]).stdout.trim(),
    ).toBe(world.mainSha);
    const status = scenario.run(["status", "--json"]);
    expect(JSON.parse(status.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 941, disposition: "pr_waiting" }],
    });
  });

  it("retries a transient failed check once and later merges without reimplementation", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 951, title: "Add retry fixture", body: "Create lib/issue-951.txt." },
      ],
      workerChanges: [{ path: "lib/issue-951.txt", content: "retry\n" }],
      expectedChanges: [
        { path: "lib/issue-951.txt", content: "retry\n", mode: "100644", status: "A" },
      ],
      pullRequestCheckSequence: [
        [
          {
            name: "fixture-required-check",
            bucket: "cancel",
            state: "CANCELLED",
            provider: "github-actions",
            runId: "fixture-check-1",
          },
        ],
        [
          {
            name: "fixture-required-check",
            bucket: "pass",
            state: "SUCCESS",
            provider: "github-actions",
            runId: "fixture-check-2",
          },
        ],
      ],
    });

    const first = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(first.exitCode, first.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [{ issueNumber: 951 }],
      retryCheckRequests: [{ issueNumber: 951 }],
      readyPullRequestRequests: [],
      mergeRequests: [],
    });

    const second = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(second.exitCode, second.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
      sessions: [{ issueNumber: 951 }],
      retryCheckRequests: [{ issueNumber: 951 }],
      readyPullRequestRequests: [{ issueNumber: 951 }],
      mergeRequests: [{ issueNumber: 951 }],
    });
  });

  it("repairs a controller-owned failed check idempotently before merging", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 961, title: "Add metadata fixture", body: "Create lib/issue-961.txt." },
      ],
      workerChanges: [{ path: "lib/issue-961.txt", content: "metadata\n" }],
      expectedChanges: [
        { path: "lib/issue-961.txt", content: "metadata\n", mode: "100644", status: "A" },
      ],
      pullRequestCheckSequence: [
        [
          {
            name: "release-scope-evidence",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "controller-check-1",
          },
        ],
        [
          {
            name: "release-scope-evidence",
            bucket: "pass",
            state: "SUCCESS",
            provider: "github-actions",
            runId: "controller-check-2",
          },
        ],
      ],
    });

    const first = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(first.exitCode, first.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [{ issueNumber: 961 }],
      pullRequests: [{
        body: expect.stringContaining("- [x] Internal, operational, or infrastructure-only change"),
      }],
      controllerRepairRequests: [{ issueNumber: 961 }],
      readyPullRequestRequests: [],
      mergeRequests: [],
    });

    const second = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(second.exitCode, second.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
      sessions: [{ issueNumber: 961 }],
      controllerRepairRequests: [{ issueNumber: 961 }],
      readyPullRequestRequests: [{ issueNumber: 961 }],
      mergeRequests: [{ issueNumber: 961 }],
    });
  });

  it("uses one fresh worker to repair an ordinary failed check and re-verifies", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [
        { number: 971, title: "Repair application fixture", body: "Create lib/issue-971.txt correctly." },
      ],
      workerChanges: [{ path: "lib/issue-971.txt", content: "initial\n" }],
      expectedChanges: [
        { path: "lib/issue-971.txt", content: "initial\n", mode: "100644", status: "A" },
      ],
      repairWorkerChanges: [{ path: "lib/issue-971.txt", content: "repaired\n" }],
      repairExpectedChanges: [
        { path: "lib/issue-971.txt", content: "repaired\n", mode: "100644", status: "A" },
      ],
      pullRequestCheckSequence: [
        [
          {
            name: "vitest",
            bucket: "fail",
            state: "FAILURE",
            provider: "github-actions",
            runId: "code-check-1",
          },
        ],
        [
          {
            name: "vitest",
            bucket: "pass",
            state: "SUCCESS",
            provider: "github-actions",
            runId: "code-check-2",
          },
        ],
      ],
    });

    const first = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(first.exitCode, first.stderr.join("\n")).toBe(0);
    const repaired = scenario.inspectExternalState();
    expect(JSON.parse(first.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 971, disposition: "pr_waiting" }],
    });
    expect(repaired.sessions).toHaveLength(2);
    expect(repaired.sessions[1]).toMatchObject({
      issueNumber: 971,
      purpose: "pr-repair",
    });
    expect(repaired.verificationRequests).toHaveLength(2);
    expect(repaired.pullRequests[0].checkAttempt).toBe(1);
    expect(repaired.mergeRequests).toEqual([]);

    const second = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(second.exitCode, second.stderr.join("\n")).toBe(0);
    const merged = scenario.inspectExternalState();
    expect(merged.sessions).toHaveLength(2);
    expect(merged.readyPullRequestRequests).toHaveLength(1);
    expect(merged.mergeRequests).toHaveLength(1);
  });

  it("resumes the same repair generation after a controller crash", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 972, title: "Recover repair fixture", body: "Create lib/issue-972.txt correctly." }],
      workerChanges: [{ path: "lib/issue-972.txt", content: "initial\n" }],
      expectedChanges: [{ path: "lib/issue-972.txt", content: "initial\n", mode: "100644", status: "A" }],
      repairWorkerChanges: [{ path: "lib/issue-972.txt", content: "repaired\n" }],
      repairExpectedChanges: [{ path: "lib/issue-972.txt", content: "repaired\n", mode: "100644", status: "A" }],
      pullRequestCheckSequence: [
        [{ name: "vitest", bucket: "fail", state: "FAILURE", provider: "github-actions", runId: "repair-crash-1" }],
        [{ name: "vitest", bucket: "pass", state: "SUCCESS", provider: "github-actions", runId: "repair-crash-2" }],
      ],
      crashPoint: "pull-request-code-repair-planned",
    });
    const args = ["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"];

    const crashed = scenario.run(args);
    expect(crashed.exitCode).not.toBe(0);
    const recovered = scenario.run(args);
    expect(recovered.exitCode, recovered.stderr.join("\n")).toBe(0);
    const merged = scenario.run(args);
    expect(merged.exitCode, merged.stderr.join("\n")).toBe(0);

    const state = scenario.inspectExternalState();
    expect(state.maximumActiveWorkers).toBe(1);
    expect(state.sessions).toHaveLength(2);
    expect(state.verificationRequests).toHaveLength(2);
    expect(state.mergeRequests).toHaveLength(1);
  });

  it("leaves a reviewed-required PR as Draft until approval exists", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 981, title: "Add reviewed fixture", body: "Create lib/issue-981.txt." }],
      workerChanges: [{ path: "lib/issue-981.txt", content: "review\n" }],
      expectedChanges: [{ path: "lib/issue-981.txt", content: "review\n", mode: "100644", status: "A" }],
      pullRequestReviewRequired: true,
      pullRequestReviewDecision: "REVIEW_REQUIRED",
    });

    const run = scenario.run([
      "run", "--mode", "AutoMerge", "--max-issues", "1", "--json",
    ]);
    expect(run.exitCode, run.stderr.join("\n")).toBe(0);
    const state = scenario.inspectExternalState();
    expect(state.pullRequests[0].draft).toBe(true);
    expect(state.readyPullRequestRequests).toEqual([]);
    expect(state.mergeRequests).toEqual([]);
    expect(JSON.parse(run.stdout.at(-1) ?? "null")).toMatchObject({
      issues: [{ number: 981, disposition: "pr_waiting" }],
    });
  });

  it("uses a fresh worker to resolve a real latest-main merge conflict", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 991, title: "Resolve conflict fixture", body: "Create lib/conflict.txt with the approved result." }],
      workerChanges: [{ path: "lib/conflict.txt", content: "issue version\n" }],
      expectedChanges: [{ path: "lib/conflict.txt", content: "issue version\n", mode: "100644", status: "A" }],
      advanceMainAfterPullRequest: { path: "lib/conflict.txt", content: "main version\n" },
      repairWorkerChanges: [{ path: "lib/conflict.txt", content: "resolved version\n" }],
      repairExpectedChanges: [{ path: "lib/conflict.txt", content: "resolved version\n", mode: "100644", status: "A" }],
    });
    const args = ["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"];

    const repaired = scenario.run(args);
    expect(repaired.exitCode, repaired.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      maximumActiveWorkers: 1,
      sessions: [
        { issueNumber: 991, purpose: "implementation" },
        { issueNumber: 991, purpose: "conflict-repair" },
      ],
      mergeRequests: [],
    });
    const merged = scenario.run(args);
    expect(merged.exitCode, merged.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState().mergeRequests).toHaveLength(1);
  });

  it("updates a clean PR to latest main and re-verifies before merging", () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 992, title: "Update clean fixture", body: "Create lib/issue-992.txt." }],
      workerChanges: [{ path: "lib/issue-992.txt", content: "issue\n" }],
      expectedChanges: [{ path: "lib/issue-992.txt", content: "issue\n", mode: "100644", status: "A" }],
      repairExpectedChanges: [{ path: "lib/issue-992.txt", content: "issue\n", mode: "100644", status: "A" }],
      advanceMainAfterPullRequest: { path: "lib/unrelated-main.txt", content: "main\n" },
      pullRequestMergeStateStatusWhenBehind: "CLEAN",
    });
    const args = ["run", "--mode", "AutoMerge", "--max-issues", "1", "--json"];

    const requested = scenario.run(args);
    expect(requested.exitCode, requested.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      baseUpdateRequests: [{ issueNumber: 992 }],
      sessions: [{ issueNumber: 992, purpose: "implementation" }],
      verificationRequests: [{ issueNumber: 992 }],
      mergeRequests: [],
    });
    const adopted = scenario.run(args);
    expect(adopted.exitCode, adopted.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState()).toMatchObject({
      sessions: [{ issueNumber: 992, purpose: "implementation" }],
      verificationRequests: [
        { issueNumber: 992 },
        { issueNumber: 992 },
      ],
      mergeRequests: [],
    });
    const merged = scenario.run(args);
    expect(merged.exitCode, merged.stderr.join("\n")).toBe(0);
    expect(scenario.inspectExternalState().mergeRequests).toHaveLength(1);
  });
});
