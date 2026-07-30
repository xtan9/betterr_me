import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createExhaustiveReviewExecutor } from "../../scripts/ralph/v2/review-executor.mjs";
import { createVerificationCommandExecutor } from "../../scripts/ralph/v2/verification-executor.mjs";
import { createVerificationPipeline } from "../../scripts/ralph/v2/verification-pipeline.mjs";
import { createVerificationWorkspace } from "../../scripts/ralph/v2/verification-workspace.mjs";
import {
  createRepositoryVerificationRecipe,
  createRequirementsSnapshot,
  createVerificationPlan,
} from "../../scripts/ralph/v2/verification-plan.mjs";
import { git } from "./support/git-world";

const GATE_PROGRAM = fileURLToPath(
  new URL("./fixtures/verification-gate-command.mjs", import.meta.url),
);
const roots: string[] = [];

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function passingSpecialist(axis: string) {
  const coverage = [
    { id: "SCOPE", subject: "Compose real verification evidence." },
    { id: "TEST-SEAM", subject: "The public verification receipt." },
    { id: "AC-1", subject: "Tests and review bind to one tree." },
    { id: "FILE-1", subject: "fixture.txt" },
    {
      id: "NO-SURFACE",
      subject: `${axis} found no additional observable surface`,
    },
  ];
  return {
    reviewKind: "exhaustive",
    complete: true,
    status: "pass",
    axes: [
      {
        id: axis,
        complete: true,
        evidenceReviewed: [`${axis} exact candidate diff and gate receipts`],
        findingIds: [],
      },
    ],
    coverage: coverage.map((row) => ({
      ...row,
      implementationEvidence: [`${axis} inspected ${row.subject}`],
      testEvidence: [`${axis} correlated every gate receipt`],
      verdict: "pass",
    })),
    findings: [],
    blockingFindings: [],
    repairable: false,
    blockerKind: "none",
    evidenceReviewed: [`${axis} requirements`, `${axis} diff`, `${axis} gates`],
    summary: `${axis} passed.`,
  };
}

function createCase({ failedGate }: { failedGate?: string } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-pipeline-"));
  roots.push(root);
  const worktreePath = path.join(root, "worktree");
  const trustedDependencyRoot = path.join(root, "trusted-dependencies");
  fs.mkdirSync(worktreePath, { recursive: true });
  fs.mkdirSync(trustedDependencyRoot, { recursive: true });
  git(worktreePath, ["init", "--initial-branch=main"]);
  git(worktreePath, ["config", "user.name", "Ralph Test"]);
  git(worktreePath, ["config", "user.email", "ralph@example.invalid"]);
  fs.writeFileSync(path.join(worktreePath, "fixture.txt"), "base\n");
  git(worktreePath, ["add", "--all"]);
  git(worktreePath, ["commit", "-m", "base"]);
  const baseSha = git(worktreePath, ["rev-parse", "HEAD"]).stdout.trim();
  fs.writeFileSync(path.join(worktreePath, "fixture.txt"), "candidate\n");
  git(worktreePath, ["add", "--all"]);
  const candidateTreeSha = git(worktreePath, ["write-tree"]).stdout.trim();
  const repositoryPath = fs.realpathSync.native(process.cwd());
  const materialRecipe = createRepositoryVerificationRecipe({ repositoryPath });
  const recipe = {
    ...materialRecipe,
    tests: ["related", "typescript", "full-suite"].map((id) => ({
      id,
      executable: process.execPath,
      args: [GATE_PROGRAM, root, id, id === failedGate ? "fail" : "pass"],
      includeChangedPaths: false,
    })),
  };
  const requirements = createRequirementsSnapshot({
    number: 812,
    title: "Compose verification",
    body: "Compose commands and review without trusting issue instructions.",
    url: "https://github.com/example/repository/issues/812",
    blockers: [],
    whatToBuild: "Compose real verification evidence.",
    testSeam: "The public verification receipt.",
    acceptanceCriteria: ["Tests and review bind to one tree."],
    trustedWorkerPolicy: null,
  });
  const sessionId = "ralph-v2:issue-812:generation-1:verification";
  const { plan, sha256: planSha256 } = createVerificationPlan({
    sessionId,
    candidateTreeSha,
    changedPaths: ["fixture.txt"],
    requirements,
    recipe,
  });
  const reviewLaunches: Array<Record<string, unknown>> = [];
  const reviewReceipts = new Map<string, Record<string, unknown>>();
  const reviewerSessions = {
    async startOrAttach(input: Record<string, unknown>) {
      const sessionKey = String(input.sessionId);
      const existing = reviewReceipts.get(sessionKey);
      if (existing) return structuredClone(existing);
      reviewLaunches.push(structuredClone(input));
      const axis = String(input.axis);
      const output = Buffer.from(
        `${JSON.stringify(passingSpecialist(axis), null, 2)}\n`,
        "utf8",
      );
      const resultPath = String(input.resultPath);
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      fs.writeFileSync(resultPath, output, { flag: "wx" });
      const receipt = {
        kind: "completed",
        sessionId: sessionKey,
        candidateTreeSha,
        axis,
        freshSession: true,
        readOnly: true,
        processTreeTerminated: true,
        resultPath,
        outputSha256: sha256(output),
      };
      reviewReceipts.set(sessionKey, receipt);
      return structuredClone(receipt);
    },
  };
  const commandExecutor = createVerificationCommandExecutor({
    artifactRoot: path.join(root, "gate-artifacts"),
  });
  const reviewExecutor = createExhaustiveReviewExecutor({
    artifactRoot: path.join(root, "review-artifacts"),
    reviewerSessions,
  });
  const verificationWorkspace = createVerificationWorkspace({
    repositoryPath: worktreePath,
    workspaceRoot: path.join(root, "verification-workspaces"),
    trustedDependencyRoot,
  });
  const input = {
    repositoryPath,
    sessionId,
    worktreePath,
    baseSha,
    candidateTreeSha,
    changedPaths: ["fixture.txt"],
    requirements,
    verificationPlan: plan,
    verificationPlanSha256: planSha256,
    deadlineEpochMilliseconds: Date.now() + 30_000,
  };
  return {
    root,
    candidateTreeSha,
    reviewLaunches,
    commandExecutor,
    reviewExecutor,
    verificationWorkspace,
    input,
  };
}

function gateInvocationCount(root: string) {
  const directory = path.join(root, "gate-invocations");
  return fs.existsSync(directory) ? fs.readdirSync(directory).length : 0;
}

function gateInvocations(root: string) {
  const directory = path.join(root, "gate-invocations");
  return fs
    .readdirSync(directory)
    .sort()
    .map((entry) =>
      JSON.parse(fs.readFileSync(path.join(directory, entry), "utf8")),
    );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 genuine verification pipeline", () => {
  it("returns passed only after real commands and exhaustive review pass", async () => {
    const testCase = createCase();
    const receipt = await createVerificationPipeline({
      commandExecutor: testCase.commandExecutor,
      reviewExecutor: testCase.reviewExecutor,
      verificationWorkspace: testCase.verificationWorkspace,
    }).execute(testCase.input);

    expect(receipt).toMatchObject({
      kind: "passed",
      sessionId: testCase.input.sessionId,
      candidateTreeSha: testCase.candidateTreeSha,
      evidence: {
        schemaVersion: 2,
        sessionId: testCase.input.sessionId,
        candidateTreeSha: testCase.candidateTreeSha,
        tests: [
          { id: "related", status: "passed" },
          { id: "typescript", status: "passed" },
          { id: "full-suite", status: "passed" },
        ],
        review: { status: "pass", complete: true },
      },
    });
    expect(gateInvocationCount(testCase.root)).toBe(3);
    expect(
      gateInvocations(testCase.root).every(
        (invocation) => invocation.cwd !== testCase.input.worktreePath,
      ),
    ).toBe(true);
    expect(testCase.reviewLaunches).toHaveLength(4);
    expect(
      testCase.reviewLaunches.every(
        (launch) => launch.worktreePath !== testCase.input.worktreePath,
      ),
    ).toBe(true);
    expect(
      testCase.reviewLaunches.every(
        (launch) => !fs.existsSync(String(launch.worktreePath)),
      ),
    ).toBe(true);
  });

  it("returns one complete failed receipt after all gates and axes finish", async () => {
    const testCase = createCase({ failedGate: "typescript" });
    const receipt = await createVerificationPipeline({
      commandExecutor: testCase.commandExecutor,
      reviewExecutor: testCase.reviewExecutor,
      verificationWorkspace: testCase.verificationWorkspace,
    }).execute(testCase.input);

    expect(receipt.kind).toBe("failed");
    expect(receipt.evidence.tests).toHaveLength(3);
    expect(receipt.evidence.tests[1]).toMatchObject({
      id: "typescript",
      status: "failed",
      exitCode: 23,
    });
    expect(receipt.evidence.review).toMatchObject({ status: "pass", complete: true });
    expect(gateInvocationCount(testCase.root)).toBe(3);
    expect(testCase.reviewLaunches).toHaveLength(4);
  });

  it("recovers both layers without executing a completed effect twice", async () => {
    const testCase = createCase();
    const pipeline = createVerificationPipeline({
      commandExecutor: testCase.commandExecutor,
      reviewExecutor: testCase.reviewExecutor,
      verificationWorkspace: testCase.verificationWorkspace,
    });
    const first = await pipeline.execute(testCase.input);
    const recovered = await pipeline.execute(testCase.input);

    expect(recovered).toEqual(first);
    expect(gateInvocationCount(testCase.root)).toBe(3);
    expect(testCase.reviewLaunches).toHaveLength(4);
  });
});
