import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createRalphRuntime } from "../../scripts/ralph/v2/production-runtime.mjs";
import { createProductionReviewerSessions } from "../../scripts/ralph/v2/production-reviewer-sessions.mjs";
import { createProductionSessionSupervisor } from "../../scripts/ralph/v2/production-session-supervisor.mjs";
import { createProductionVerificationSupervisor } from "../../scripts/ralph/v2/production-verification-supervisor.mjs";
import { createRalphRuntimeCore } from "../../scripts/ralph/v2/runtime.mjs";
import { createRepositoryVerificationRecipe } from "../../scripts/ralph/v2/verification-plan.mjs";
import { windowsToWslPath } from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";
import { createTestAdapters } from "./fixtures/test-adapters.mjs";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const MOCK_CODEX_SOURCE = fileURLToPath(
  new URL("./fixtures/mock-review-codex.mjs", import.meta.url),
);
const GATE_SCRIPT =
  "const id=process.argv.at(-1);process.stdout.write(`stdout:${id}\\n`);process.stderr.write(`stderr:${id}\\n`);";
const TRUSTED_DEPENDENCY_ROOT =
  "/var/lib/betterr-me-ralph/deps-source/node_modules";
const worlds: Array<ReturnType<typeof createGitWorld>> = [];

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function filesUnder(root: string, suffix: string) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map((entry) => path.join(root, String(entry)))
    .filter((entry) => entry.endsWith(suffix) && fs.statSync(entry).isFile())
    .sort();
}

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

async function runGenuineScenario({
  tamperArtifact,
  wrongRecipeFingerprint = false,
}: {
  tamperArtifact?: "delete-gate" | "change-review";
  wrongRecipeFingerprint?: boolean;
} = {}) {
  const world = createGitWorld();
  worlds.push(world);
  createSystemScenario(world, {
    issues: [
      {
        number: 813,
        title: "Publish genuine verification",
        body: "Create the exact runtime verification fixture.",
      },
    ],
    workerChanges: [
      { path: "src/runtime-verification.txt", content: "verified\n" },
    ],
    expectedChanges: [
      {
        path: "src/runtime-verification.txt",
        content: "verified\n",
        mode: "100644",
        status: "A",
      },
    ],
  });
  const config = JSON.parse(
    fs.readFileSync(path.join(world.root, "system-config.json"), "utf8"),
  );
  const adapters = createTestAdapters(config);
  const repositoryMaterialsPath = fs.realpathSync.native(process.cwd());
  const materialRecipe = createRepositoryVerificationRecipe({
    repositoryPath: repositoryMaterialsPath,
  });
  const verificationRecipe = {
    ...materialRecipe,
    tests: ["related", "typescript", "full-suite"].map((id) => ({
      id,
      executable: "/usr/local/bin/node",
      args: ["-e", GATE_SCRIPT, id],
      includeChangedPaths: false,
    })),
    ...(wrongRecipeFingerprint
      ? {
          review: {
            ...materialRecipe.review,
            policySha256: "f".repeat(64),
          },
        }
      : {}),
  };
  let tampered = false;
  const lifecycle = {
    async checkpoint(input: Record<string, unknown>) {
      await adapters.lifecycle.checkpoint(input);
      if (
        input.point !== "production-verification-completed" ||
        !tamperArtifact ||
        tampered
      ) {
        return;
      }
      tampered = true;
      if (tamperArtifact === "delete-gate") {
        const [artifact] = filesUnder(
          path.join(world.runtimePath, "verification-gates"),
          ".output.log",
        );
        if (!artifact) throw new Error("test could not find a gate artifact");
        fs.rmSync(artifact);
      } else {
        const [artifact] = filesUnder(
          path.join(world.runtimePath, "verification-reviews"),
          ".report.json",
        );
        if (!artifact) throw new Error("test could not find a review artifact");
        fs.appendFileSync(artifact, "tampered\n");
      }
    },
  };
  const reviewSchemaPath = fileURLToPath(
    new URL("../../scripts/ralph/review.schema.json", import.meta.url),
  );
  const reviewSessionSupervisor = createProductionSessionSupervisor({
    sessionRoot: path.join(world.runtimePath, "review-supervision"),
    containmentRoot: path.join(world.runtimePath, "review-containment"),
    trustedWslBridge: true,
  });
  const reviewerSessions = createProductionReviewerSessions({
    runtimePath: world.runtimePath,
    artifactRoot: path.join(world.runtimePath, "verification-reviews"),
    sessionSupervisor: reviewSessionSupervisor,
    reviewSchemaPath,
    dependencyRoot: TRUSTED_DEPENDENCY_ROOT,
    codexExecutable: "/usr/local/bin/node",
    codexPrefixArguments: [
      windowsToWslPath(MOCK_CODEX_SOURCE),
      windowsToWslPath(world.root),
    ],
    linuxWorkspaceRoot: `/var/tmp/betterr-me-ralph/tests/${sha256(world.root)}`,
  });
  const verifierSessionSupervisor = createProductionSessionSupervisor({
    sessionRoot: path.join(world.runtimePath, "verification-supervision"),
    containmentRoot: path.join(world.runtimePath, "verification-containment"),
    trustedWslBridge: true,
  });
  const verifier = createProductionVerificationSupervisor({
    runtimePath: world.runtimePath,
    repositoryPath: world.controllerPath,
    verificationMaterialsPath: repositoryMaterialsPath,
    trustedDependencyRoot: TRUSTED_DEPENDENCY_ROOT,
    sessionSupervisor: verifierSessionSupervisor,
    reviewerSessions,
    lifecycle,
    linuxWorkspaceRoot: `/var/tmp/betterr-me-ralph/tests/${sha256(world.root)}`,
  });
  const runtime = createRalphRuntimeCore({
    repositoryPath: world.controllerPath,
    runtimePath: world.runtimePath,
    github: adapters.github,
    worker: adapters.worker,
    verifier,
    lifecycle,
    clock: adapters.clock,
    verificationRecipe,
    verificationMaterialsPath: repositoryMaterialsPath,
    verificationTimeoutMilliseconds: 60_000,
  });

  const status = await runtime.run({ mode: "PrOnly", maxIssues: 1 });
  const externalState = JSON.parse(
    fs.readFileSync(config.externalStatePath, "utf8"),
  );
  const durableState = JSON.parse(
    fs.readFileSync(path.join(world.runtimePath, "state-v2.json"), "utf8"),
  );
  const genuineReceipt = durableState.issues["813"].verificationReceipt;
  const reviewLaunches = filesUnder(
    path.join(world.root, "review-launches"),
    ".json",
  );
  return {
    externalState,
    genuineReceipt,
    reviewLaunches,
    status,
    tampered,
    world,
  };
}

describe.runIf(process.platform === "win32")(
  "Ralph v2 runtime genuine-verification seam",
  () => {
    it("does not expose raw verifier, reviewer, or supervisor escape hatches", () => {
      expect(() =>
        createRalphRuntime({ github: {} } as never),
      ).toThrow(/does not accept an injected GitHub adapter/i);
      expect(() =>
        createRalphRuntime({ worker: {} } as never),
      ).toThrow(/does not accept an injected worker adapter/i);
      expect(() =>
        createRalphRuntime({ verifier: {} } as never),
      ).toThrow(/does not accept an injected raw verifier/i);
      expect(() =>
        createRalphRuntime({ reviewerSessions: {} } as never),
      ).toThrow(/does not accept an injected reviewer-session/i);
      expect(() =>
        createRalphRuntime({ verificationSupervisor: {} } as never),
      ).toThrow(/does not accept an injected verification supervisor/i);
      expect(() =>
        createRalphRuntime({ lifecycle: {} } as never),
      ).toThrow(/does not accept an injected lifecycle/i);
      expect(() =>
        createRalphRuntime({ clock: {} } as never),
      ).toThrow(/does not accept an injected clock/i);
    });

    it("publishes after real gates and four fresh exhaustive review sessions pass", async () => {
      const { externalState, genuineReceipt, reviewLaunches, status, world } =
        await runGenuineScenario();

      const gateDiagnostics = filesUnder(
        path.join(world.runtimePath, "verification-gates"),
        ".output.log",
      ).map((filePath) => fs.readFileSync(filePath, "utf8"));
      expect(status.issues, gateDiagnostics.join("\n--- gate ---\n")).toEqual([
        expect.objectContaining({ number: 813, disposition: "published" }),
      ]);
      expect(genuineReceipt).toMatchObject({
        kind: "passed",
        evidence: {
          schemaVersion: 2,
          tests: [
            expect.objectContaining({ id: "related", status: "passed" }),
            expect.objectContaining({ id: "typescript", status: "passed" }),
            expect.objectContaining({ id: "full-suite", status: "passed" }),
          ],
        },
      });
      expect(reviewLaunches).toHaveLength(4);
      expect(externalState).toMatchObject({
        pullRequests: [{ issueNumber: 813, draft: true }],
      });
    }, 90_000);

    it("fails closed when a bound gate artifact disappears", async () => {
      const { externalState, reviewLaunches, status, tampered } =
        await runGenuineScenario({ tamperArtifact: "delete-gate" });

      expect(tampered).toBe(true);
      expect(status.issues).toEqual([
        expect.objectContaining({
          number: 813,
          disposition: "verification_failed",
        }),
      ]);
      expect(reviewLaunches).toHaveLength(4);
      expect(externalState.pullRequests).toEqual([]);
    }, 90_000);

    it("fails closed when a bound review artifact changes", async () => {
      const { externalState, status, tampered } =
        await runGenuineScenario({ tamperArtifact: "change-review" });

      expect(tampered).toBe(true);
      expect(status.issues).toEqual([
        expect.objectContaining({
          number: 813,
          disposition: "verification_failed",
        }),
      ]);
      expect(externalState.pullRequests).toEqual([]);
    }, 90_000);

    it("rejects a verification recipe not fingerprinted from controller materials", async () => {
      await expect(
        runGenuineScenario({ wrongRecipeFingerprint: true }),
      ).rejects.toThrow(/review materials changed/i);
    });
  },
);
