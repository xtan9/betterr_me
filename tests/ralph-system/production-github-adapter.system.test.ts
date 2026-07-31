import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionGitHubAdapter } from "../../scripts/ralph/v2/production-github-adapter.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("production GitHub adapter", () => {
  it("excludes claimed, closed, unapproved, and dependency-blocked issues", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-selection-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, JSON.stringify([
      { issueNumber: 10, blockers: [] },
      { issueNumber: 11, blockers: [10] },
      { issueNumber: 12, blockers: [] },
      { issueNumber: 13, blockers: [] },
      { issueNumber: 14, blockers: [] },
    ]));
    const adapter = createProductionGitHubAdapter({
      repository: "o/r",
      queuePath,
      actor: "ralph",
      execute: (args: string[]) => {
        if (args[0] !== "issue" || args[1] !== "list") throw new Error("unexpected command");
        return JSON.stringify([
          { number: 10, title: "ready", body: "b", state: "OPEN", url: "u10", labels: [{ name: "ready-for-agent" }], assignees: [] },
          { number: 11, title: "blocked", body: "b", state: "OPEN", url: "u11", labels: [{ name: "ready-for-agent" }], assignees: [] },
          { number: 12, title: "closed", body: "b", state: "CLOSED", url: "u12", labels: [{ name: "ready-for-agent" }], assignees: [] },
          { number: 13, title: "unapproved", body: "b", state: "OPEN", url: "u13", labels: [], assignees: [] },
          { number: 14, title: "claimed", body: "b", state: "OPEN", url: "u14", labels: [{ name: "ready-for-agent" }], assignees: [{ login: "someone-else" }] },
        ]);
      },
    });
    await expect(adapter.listReadyIssues()).resolves.toEqual([
      expect.objectContaining({ number: 10 }),
    ]);
  });

  it("selects only the ready dependency frontier and normalizes PR evidence", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-adapter-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, JSON.stringify([
      { issueNumber: 10, title: "ten", blockers: [], whatToBuild: "ten", testSeam: "ten", acceptanceCriteria: ["ten"] },
      { issueNumber: 11, title: "eleven", blockers: [10], whatToBuild: "eleven", testSeam: "eleven", acceptanceCriteria: ["eleven"] },
    ]));
    const calls: string[][] = [];
    const execute = (args: string[]) => {
      calls.push(args);
      const command = args.join(" ");
      if (command.startsWith("issue list ")) return JSON.stringify([
        { number: 10, title: "ten", body: "body", state: "OPEN", url: "u10", labels: [{ name: "ready-for-agent" }], assignees: [{ login: "ralph" }] },
        { number: 11, title: "eleven", body: "body", state: "OPEN", url: "u11", labels: [{ name: "ready-for-agent" }], assignees: [] },
      ]);
      if (command.startsWith("pr view 7 ")) return JSON.stringify({
        number: 7, state: "OPEN", isDraft: false, headRefName: "codex/issue-10",
        headRefOid: "head", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", url: "pr",
        statusCheckRollup: [{ name: "optional", conclusion: "FAILURE", detailsUrl: "https://github.com/o/r/actions/runs/99" }],
      });
      if (command.startsWith("pr checks 7 ")) return JSON.stringify([
        { name: "test", state: "SUCCESS", bucket: "pass", link: "https://github.com/o/r/actions/runs/42" },
      ]);
      if (command.startsWith("issue view 10 ")) return JSON.stringify({
        number: 10,
        state: "OPEN",
        closedByPullRequestsReferences: [
          { number: 7, state: "OPEN", isDraft: true, url: "pr" },
        ],
      });
      if (command.startsWith("issue view 11 ")) return JSON.stringify({
        number: 11,
        state: "CLOSED",
        closedByPullRequestsReferences: [
          { number: 8, state: "MERGED", isDraft: false, url: "pr8" },
        ],
      });
      if (command.includes("git/ref/heads/main")) return JSON.stringify({ object: { sha: "main" } });
      if (command.includes("compare/main...head")) return JSON.stringify({ status: "ahead" });
      throw new Error(`unexpected command ${command}`);
    };
    const adapter = createProductionGitHubAdapter({
      repository: "o/r", queuePath, actor: "ralph", execute,
    });

    expect(await adapter.listReadyIssues()).toEqual([
      expect.objectContaining({ number: 10, body: "body" }),
    ]);
    expect(await adapter.inspectPullRequest({ pullRequestNumber: 7 })).toMatchObject({
      number: 7,
      headSha: "head",
      headContainsLatestMain: true,
      checks: [{ name: "test", bucket: "pass", runId: "42", provider: "github-actions" }],
      checksAvailable: true,
      requiredCheckEvidenceReady: true,
    });
    expect(await adapter.auditApprovedQueue()).toEqual({
      issues: [
        { number: 10, state: "OPEN", pullRequests: [{ number: 7, state: "OPEN", draft: true, url: "pr" }] },
        { number: 11, state: "CLOSED", pullRequests: [{ number: 8, state: "MERGED", draft: false, url: "pr8" }] },
      ],
    });
    expect(calls.length).toBe(7);
  });

  it("rejects a controller that loses the active GitHub claim race", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-claim-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, "[]");
    let posts = 0;
    const execute = (args: string[]) => {
      const command = args.join(" ");
      if (command.includes("issues/10/comments --paginate")) {
        return JSON.stringify([
          {
            id: 1,
            created_at: new Date(Date.now() - 1_000).toISOString(),
            body: "<!-- betterr-ralph-v2-claim:op-a -->",
          },
          ...(posts > 0
            ? [{ id: 2, created_at: new Date().toISOString(), body: "<!-- betterr-ralph-v2-claim:op-b -->" }]
            : []),
        ]);
      }
      if (command.startsWith("issue edit 10 ")) return "";
      if (command.includes("issues/10/comments --method POST")) {
        posts += 1;
        return JSON.stringify({ id: 2 });
      }
      throw new Error(`unexpected command ${command}`);
    };
    const adapter = createProductionGitHubAdapter({
      repository: "o/r", queuePath, actor: "ralph", execute,
    });
    await expect(
      adapter.claimIssue({ issueNumber: 10, operationId: "op-b", claimedAt: new Date().toISOString() }),
    ).resolves.toMatchObject({ claimed: false, operationId: "op-b" });
    await expect(
      adapter.claimIssue({ issueNumber: 10, operationId: "op-b", claimedAt: new Date().toISOString() }),
    ).resolves.toMatchObject({ claimed: false, operationId: "op-b" });
    expect(posts).toBe(1);
  });

  it("elects exactly one winner when a fresh process interleaves the atomic claim race", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-atomic-claim-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    const backendPath = path.join(root, "backend.json");
    fs.writeFileSync(queuePath, "[]");
    fs.writeFileSync(backendPath, JSON.stringify({ comments: [] }));
    const contenderPath = fileURLToPath(new URL(
      "./fixtures/github-claim-contender.mjs",
      import.meta.url,
    ));
    let contenderResult: any;
    let interleaved = false;
    const adapter = createProductionGitHubAdapter({
      repository: "o/r",
      queuePath,
      actor: "ralph",
      execute(args: string[]) {
        const command = args.join(" ");
        const read = () => JSON.parse(fs.readFileSync(backendPath, "utf8"));
        if (command.includes("issues/10/comments --paginate")) {
          const comments = read().comments;
          if (!interleaved && comments.length === 0) {
            interleaved = true;
            const child = spawnSync(
              process.execPath,
              [contenderPath, queuePath, backendPath, "contender-b"],
              { encoding: "utf8", windowsHide: true },
            );
            expect(child.status, child.stderr).toBe(0);
            contenderResult = JSON.parse(child.stdout);
          }
          return JSON.stringify(read().comments);
        }
        if (command.startsWith("issue edit 10 ")) return "";
        if (command.includes("issues/10/comments --method POST")) {
          const state = read();
          const body = args.find((entry) => entry.startsWith("body="))?.slice(5) ?? "";
          const comment = { id: state.comments.length + 1, created_at: new Date().toISOString(), body };
          state.comments.push(comment);
          fs.writeFileSync(backendPath, JSON.stringify(state));
          return JSON.stringify(comment);
        }
        throw new Error(`unexpected parent command ${command}`);
      },
    });
    const parentResult = await adapter.claimIssue({
      issueNumber: 10,
      operationId: "contender-a",
      claimedAt: new Date().toISOString(),
    });
    expect([parentResult, contenderResult].filter((result) => result.claimed)).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(backendPath, "utf8")).comments).toHaveLength(2);
  });

  it("does not accept neutral or skipped required checks as successful", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-checks-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, "[]");
    const adapter = createProductionGitHubAdapter({
      repository: "o/r",
      queuePath,
      actor: "ralph",
      execute: (args: string[]) => {
        const command = args.join(" ");
        if (command.startsWith("pr view 7 ")) return JSON.stringify({
          number: 7, state: "OPEN", isDraft: false, headRefName: "codex/issue-10",
          headRefOid: "head", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", url: "pr",
        });
        if (command.startsWith("pr checks 7 ")) return JSON.stringify([
          { name: "neutral", state: "NEUTRAL", link: "https://github.com/o/r/actions/runs/41" },
          { name: "skipped", state: "SKIPPED", link: "https://github.com/o/r/actions/runs/42" },
        ]);
        if (command.includes("git/ref/heads/main")) return JSON.stringify({ object: { sha: "main" } });
        if (command.includes("compare/main...head")) return JSON.stringify({ status: "ahead" });
        throw new Error(`unexpected command ${command}`);
      },
    });
    await expect(adapter.inspectPullRequest({ pullRequestNumber: 7 })).resolves.toMatchObject({
      checks: [
        expect.objectContaining({ name: "neutral", bucket: "fail" }),
        expect.objectContaining({ name: "skipped", bucket: "fail" }),
      ],
    });
  });

  it("repairs controller-owned checks with the controller's complete trusted PR body", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-metadata-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, "[]");
    const calls: string[][] = [];
    const adapter = createProductionGitHubAdapter({
      repository: "o/r",
      queuePath,
      actor: "ralph",
      execute: (args: string[]) => { calls.push(args); return ""; },
    });
    const body = "## Delivery classification\n\n- [x] Internal, operational, or infrastructure-only change\n\nCloses #10\n";

    await adapter.repairControllerOwnedChecks({
      issueNumber: 10,
      pullRequestNumber: 7,
      expectedHeadSha: "head",
      checks: [],
      body,
      operationId: "repair-1",
    });

    expect(calls).toEqual([[
      "pr", "edit", "7", "--repo", "o/r", "--body", body,
    ]]);
  });

  it("refreshes a long-running claim idempotently with the same ownership identity", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-github-heartbeat-"));
    roots.push(root);
    const queuePath = path.join(root, "queue.json");
    fs.writeFileSync(queuePath, "[]");
    const comments: Array<Record<string, unknown>> = [{
      id: 1,
      created_at: new Date().toISOString(),
      body: "<!-- betterr-ralph-v2-claim:claim-10 -->",
    }];
    let posts = 0;
    const adapter = createProductionGitHubAdapter({
      repository: "o/r",
      queuePath,
      actor: "ralph",
      execute: (args: string[]) => {
        const command = args.join(" ");
        if (command.includes("issues/10/comments --paginate")) return JSON.stringify(comments);
        if (command.includes("issues/10/comments --method POST")) {
          posts += 1;
          const body = args.find((entry) => entry.startsWith("body="))?.slice(5) ?? "";
          const created = { id: comments.length + 1, created_at: new Date().toISOString(), body };
          comments.push(created);
          return JSON.stringify(created);
        }
        throw new Error(`unexpected command ${command}`);
      },
    });
    const input = {
      issueNumber: 10,
      operationId: "claim-10",
      heartbeatId: "heartbeat-10-a",
      claimedAt: new Date().toISOString(),
    };

    await expect(adapter.refreshClaim(input)).resolves.toMatchObject({ claimed: true });
    await expect(adapter.refreshClaim(input)).resolves.toMatchObject({ claimed: true });
    expect(posts).toBe(1);
  });
});
