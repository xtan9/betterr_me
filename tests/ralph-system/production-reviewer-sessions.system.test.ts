import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionReviewerSessions } from "../../scripts/ralph/v2/production-reviewer-sessions.mjs";
import { createProductionSessionSupervisor } from "../../scripts/ralph/v2/production-session-supervisor.mjs";
import { windowsToWslPath } from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";

const MOCK_CODEX_SOURCE = fileURLToPath(
  new URL("./fixtures/mock-review-codex.mjs", import.meta.url),
);
const REVIEW_SCHEMA_PATH = fileURLToPath(
  new URL("../../scripts/ralph/review.schema.json", import.meta.url),
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20 });
  }
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 production reviewer sessions",
  () => {
    it("runs fresh contained Codex processes and reattaches without relaunch", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-reviewers-"));
      roots.push(root);
      const worktreePath = path.join(root, "worktree");
      const runtimePath = path.join(root, "runtime");
      const artifactRoot = path.join(runtimePath, "verification-reviews");
      const fixtureRoot = path.join(root, "fixture");
      fs.mkdirSync(worktreePath, { recursive: true });
      fs.mkdirSync(runtimePath, { recursive: true });
      fs.mkdirSync(artifactRoot, { recursive: true });
      fs.mkdirSync(fixtureRoot, { recursive: true });
      const supervisor = createProductionSessionSupervisor({
        sessionRoot: path.join(runtimePath, "reviewer-supervision"),
        containmentRoot: path.join(runtimePath, "reviewer-containment"),
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 30_000,
        trustedWslBridge: true,
      });
      const sessions = createProductionReviewerSessions({
        runtimePath,
        artifactRoot,
        sessionSupervisor: supervisor,
        reviewSchemaPath: REVIEW_SCHEMA_PATH,
        codexExecutable: "/usr/local/bin/node",
        codexPrefixArguments: [
          windowsToWslPath(MOCK_CODEX_SOURCE),
          windowsToWslPath(fixtureRoot),
        ],
      });
      const deadlineEpochMilliseconds = Date.now() + 30_000;
      const candidateTreeSha = "a".repeat(40);
      const common = {
        prompt: "Review this exact candidate and return evidence.",
        worktreePath,
        candidateTreeSha,
        policySha256: "b".repeat(64),
        skillSha256: "c".repeat(64),
        deadlineEpochMilliseconds,
        readOnly: true,
      };
      const [security, tests] = await Promise.all([
        sessions.startOrAttach({
          ...common,
          sessionId: "ralph-v2:review:fresh:security",
          axis: "security",
          resultPath: path.join(artifactRoot, "fresh", "security.report.json"),
        }),
        sessions.startOrAttach({
          ...common,
          sessionId: "ralph-v2:review:fresh:tests",
          axis: "tests",
          resultPath: path.join(artifactRoot, "fresh", "tests.report.json"),
        }),
      ]);

      for (const receipt of [security, tests]) {
        expect(receipt).toMatchObject({
          kind: "completed",
          freshSession: true,
          readOnly: true,
          processTreeTerminated: true,
          outputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
      }
      expect(security.sessionId).not.toBe(tests.sessionId);
      const launchRoot = path.join(fixtureRoot, "review-launches");
      const firstLaunches = fs.readdirSync(launchRoot);
      expect(firstLaunches).toHaveLength(2);
      const launchRecords = firstLaunches.map((name) =>
        JSON.parse(fs.readFileSync(path.join(launchRoot, name), "utf8")),
      );
      expect(new Set(launchRecords.map((record) => record.processId)).size).toBe(2);
      expect(launchRecords).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ uid: 65534, gid: 65534, axis: "security" }),
          expect.objectContaining({ uid: 65534, gid: 65534, axis: "tests" }),
        ]),
      );

      expect(
        await sessions.startOrAttach({
          ...common,
          sessionId: "ralph-v2:review:fresh:security",
          axis: "security",
          resultPath: path.join(artifactRoot, "fresh", "security.report.json"),
        }),
      ).toEqual(security);
      expect(fs.readdirSync(launchRoot)).toHaveLength(2);
    });

    it("streams reviewer events before the contained review completes", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-reviewers-live-"));
      roots.push(root);
      const worktreePath = path.join(root, "worktree");
      const runtimePath = path.join(root, "runtime");
      const artifactRoot = path.join(runtimePath, "verification-reviews");
      const fixtureRoot = path.join(root, "fixture");
      for (const directory of [worktreePath, runtimePath, artifactRoot, fixtureRoot]) fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(fixtureRoot, "hold-review"), "hold\n");
      const supervisor = createProductionSessionSupervisor({
        sessionRoot: path.join(runtimePath, "reviewer-supervision"),
        containmentRoot: path.join(runtimePath, "reviewer-containment"),
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 30_000,
        trustedWslBridge: true,
      });
      const sessions = createProductionReviewerSessions({
        runtimePath,
        artifactRoot,
        sessionSupervisor: supervisor,
        reviewSchemaPath: REVIEW_SCHEMA_PATH,
        codexExecutable: "/usr/local/bin/node",
        codexPrefixArguments: [windowsToWslPath(MOCK_CODEX_SOURCE), windowsToWslPath(fixtureRoot)],
      });
      const completion = sessions.startOrAttach({
        sessionId: "ralph-v2:review:live:security",
        axis: "security",
        prompt: "Review this exact candidate and return evidence.",
        worktreePath,
        candidateTreeSha: "a".repeat(40),
        policySha256: "b".repeat(64),
        skillSha256: "c".repeat(64),
        deadlineEpochMilliseconds: Date.now() + 30_000,
        readOnly: true,
        resultPath: path.join(artifactRoot, "live", "security.report.json"),
      });
      const deadline = Date.now() + 15_000;
      let eventLogPath: string | undefined;
      while (Date.now() < deadline) {
        const requestRoot = path.join(runtimePath, "reviewer-session-requests");
        const files = fs.existsSync(requestRoot)
          ? fs.readdirSync(requestRoot, { recursive: true }).map((entry) => path.join(requestRoot, String(entry)))
          : [];
        eventLogPath = files.find((candidate) => path.basename(candidate) === "events.jsonl");
        if (eventLogPath && fs.readFileSync(eventLogPath, "utf8").includes("turn.started")) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const observedWhileHeld = eventLogPath && fs.existsSync(eventLogPath)
        ? fs.readFileSync(eventLogPath, "utf8")
        : "";
      fs.writeFileSync(path.join(fixtureRoot, "release-review"), "release\n");
      await expect(completion).resolves.toMatchObject({ kind: "completed", axis: "security" });
      expect(observedWhileHeld, "no live reviewer event arrived before completion").toContain("turn.started");
    });
  },
);
