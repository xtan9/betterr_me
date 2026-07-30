import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionReviewerSessions } from "../../scripts/ralph/v2/production-reviewer-sessions.mjs";
import { createProductionSessionSupervisor } from "../../scripts/ralph/v2/production-session-supervisor.mjs";
import { createProductionVerificationSupervisor } from "../../scripts/ralph/v2/production-verification-supervisor.mjs";
import {
  createRepositoryVerificationRecipe,
  createRequirementsSnapshot,
  createVerificationPlan,
} from "../../scripts/ralph/v2/verification-plan.mjs";
import { windowsToWslPath } from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";
import { createGitWorld, git } from "./support/git-world";

const MOCK_CODEX_SOURCE = fileURLToPath(
  new URL("./fixtures/mock-review-codex.mjs", import.meta.url),
);
const REVIEW_SCHEMA_PATH = fileURLToPath(
  new URL("../../scripts/ralph/review.schema.json", import.meta.url),
);
const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 production verifier session",
  () => {
    it("runs sandboxed gates and four fresh brokered review sessions", async () => {
      const world = createGitWorld();
      worlds.push(world);
      git(world.controllerPath, ["fetch", "origin", "main"]);
      git(world.controllerPath, ["checkout", "--detach", "origin/main"]);
      const baseSha = git(world.controllerPath, ["rev-parse", "HEAD"]).stdout.trim();
      fs.mkdirSync(path.join(world.controllerPath, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(world.controllerPath, "src", "fresh-verifier.txt"),
        "fresh verifier evidence\n",
      );
      git(world.controllerPath, ["add", "src/fresh-verifier.txt"]);
      const candidateTreeSha = git(world.controllerPath, ["write-tree"]).stdout.trim();
      fs.mkdirSync(world.runtimePath, { recursive: true });
      const materialsPath = fs.realpathSync.native(process.cwd());
      const materialRecipe = createRepositoryVerificationRecipe({
        repositoryPath: materialsPath,
      });
      const recipe = {
        ...materialRecipe,
        tests: ["related", "typescript", "full-suite"].map((id) => ({
          id,
          executable: "/bin/true",
          args: [],
          includeChangedPaths: false,
        })),
      };
      const issue = {
        number: 914,
        title: "Prove the fresh verifier boundary",
        body: "Run all gates and exhaustive review outside the controller.",
        url: "https://github.com/example/repository/issues/914",
        blockers: [],
        whatToBuild: "A genuinely fresh verifier process.",
        testSeam: "The production verifier acceptance receipt.",
        acceptanceCriteria: [
          "Three gates pass.",
          "Four fresh review sessions pass.",
        ],
      };
      const requirements = createRequirementsSnapshot(issue);
      const sessionId = "ralph-v2:issue-914:generation-1:verification";
      const verificationPlan = createVerificationPlan({
        sessionId,
        candidateTreeSha,
        changedPaths: ["src/fresh-verifier.txt"],
        requirements,
        recipe,
      });
      const reviewSupervisor = createProductionSessionSupervisor({
        sessionRoot: path.join(world.runtimePath, "review-supervision"),
        containmentRoot: path.join(world.runtimePath, "review-containment"),
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 60_000,
        trustedWslBridge: true,
      });
      const reviewerSessions = createProductionReviewerSessions({
        runtimePath: world.runtimePath,
        artifactRoot: path.join(world.runtimePath, "verification-reviews"),
        sessionSupervisor: reviewSupervisor,
        reviewSchemaPath: REVIEW_SCHEMA_PATH,
        codexExecutable: "/usr/local/bin/node",
        codexPrefixArguments: [
          windowsToWslPath(MOCK_CODEX_SOURCE),
          windowsToWslPath(world.root),
        ],
      });
      const verifierSupervisor = createProductionSessionSupervisor({
        sessionRoot: path.join(world.runtimePath, "verification-supervision"),
        containmentRoot: path.join(world.runtimePath, "verification-containment"),
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 60_000,
        trustedWslBridge: true,
      });
      const verifier = createProductionVerificationSupervisor({
        runtimePath: world.runtimePath,
        repositoryPath: world.controllerPath,
        verificationMaterialsPath: materialsPath,
        trustedDependencyRoot:
          "/var/lib/betterr-me-ralph/deps-source/node_modules",
        sessionSupervisor: verifierSupervisor,
        reviewerSessions,
      });
      const input = {
        issue,
        sessionId,
        worktreePath: world.controllerPath,
        baseSha,
        headBranch: "codex/issue-914",
        candidateTreeSha,
        changedPaths: ["src/fresh-verifier.txt"],
        verificationPlan: verificationPlan.plan,
        verificationPlanSha256: verificationPlan.sha256,
        deadlineEpochMilliseconds: Date.now() + 60_000,
      };

      const receipt = await verifier.startOrAttach(input);
      expect(receipt).toMatchObject({
        kind: "passed",
        sessionId,
        candidateTreeSha,
        evidence: {
          schemaVersion: 2,
          tests: [
            expect.objectContaining({ id: "related", status: "passed" }),
            expect.objectContaining({ id: "typescript", status: "passed" }),
            expect.objectContaining({ id: "full-suite", status: "passed" }),
          ],
          review: {
            status: "pass",
            complete: true,
            specialistReceipts: expect.arrayContaining([
              expect.objectContaining({ freshSession: true }),
            ]),
          },
        },
      });
      const reviewLaunchRoot = path.join(world.root, "review-launches");
      expect(fs.readdirSync(reviewLaunchRoot)).toHaveLength(4);
      expect(await verifier.startOrAttach(input)).toEqual(receipt);
      expect(fs.readdirSync(reviewLaunchRoot)).toHaveLength(4);

      expect(
        await verifier.terminate({
          issueNumber: 914,
          sessionId,
          worktreePath: world.controllerPath,
          candidateTreeSha,
          operationId: "finalize-verification-914",
        }),
      ).toEqual({
        kind: "terminated",
        sessionId,
        candidateTreeSha,
        operationId: "finalize-verification-914",
        processTreeTerminated: true,
      });
    }, 90_000);
  },
);
