import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createVerificationCommandExecutor } from "../../scripts/ralph/v2/verification-executor.mjs";
import {
  createVerificationPlan,
  verificationPlanDigest,
} from "../../scripts/ralph/v2/verification-plan.mjs";
import { git } from "./support/git-world";

const GATE_PROGRAM = fileURLToPath(
  new URL("./fixtures/verification-gate-command.mjs", import.meta.url),
);
const roots: string[] = [];

function createCase(behaviors: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-executor-"));
  roots.push(root);
  const worktreePath = path.join(root, "worktree");
  const artifactRoot = path.join(root, "private-artifacts");
  fs.mkdirSync(worktreePath, { recursive: true });
  git(worktreePath, ["init", "--initial-branch=main"]);
  git(worktreePath, ["config", "user.name", "Ralph Test"]);
  git(worktreePath, ["config", "user.email", "ralph@example.invalid"]);
  fs.writeFileSync(path.join(worktreePath, "fixture.txt"), "candidate\n");
  git(worktreePath, ["add", "--all"]);
  const candidateTreeSha = git(worktreePath, ["write-tree"]).stdout.trim();
  const recipe = {
    schemaVersion: 1,
    tests: ["related", "typescript", "full-suite"].map((id) => ({
      id,
      executable: process.execPath,
      args: [
        GATE_PROGRAM,
        root,
        id,
        behaviors[id] ?? "pass",
        ...(id === "related"
          ? ["literal;& touch SHOULD_NOT_EXIST", "literal with spaces"]
          : []),
      ],
      includeChangedPaths: false,
    })),
    review: {
      kind: "exhaustive",
      axes: ["standards", "spec", "security", "tests"],
      policySha256: "a".repeat(64),
      skillSha256: "b".repeat(64),
    },
  };
  const sessionId = "ralph-v2:issue-811:generation-1:verification";
  const { plan, sha256 } = createVerificationPlan({
    sessionId,
    candidateTreeSha,
    changedPaths: ["fixture.txt"],
    requirements: {
      schemaVersion: 1,
      issueNumber: 811,
      title: "Execute real verification",
      body: "Every planned gate must run.",
      trustedWorkerPolicy: null,
    },
    recipe,
  });
  return {
    root,
    worktreePath,
    artifactRoot,
    candidateTreeSha,
    sessionId,
    plan,
    planSha256: sha256,
    input: {
      sessionId,
      worktreePath,
      candidateTreeSha,
      verificationPlan: plan,
      verificationPlanSha256: sha256,
      deadlineEpochMilliseconds: Date.now() + 30_000,
    },
  };
}

function invocations(testCase: ReturnType<typeof createCase>) {
  const directory = path.join(testCase.root, "gate-invocations");
  if (!fs.existsSync(directory)) return [];
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

describe("Ralph v2 controller-owned verification command executor", () => {
  it("executes the exact argv without a shell and hashes real private artifacts", async () => {
    const testCase = createCase();
    const previousToken = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "must-not-reach-gates";
    try {
      const executor = createVerificationCommandExecutor({
        artifactRoot: testCase.artifactRoot,
      });
      const evidence = await executor.execute(testCase.input);

      expect(evidence.tests).toHaveLength(3);
      expect(evidence.tests.every((gate: { status: string }) => gate.status === "passed")).toBe(
        true,
      );
      expect(
        evidence.tests.every((gate: { outputSha256: string }) =>
          /^[0-9a-f]{64}$/.test(gate.outputSha256),
        ),
      ).toBe(true);
      expect(invocations(testCase)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            gateId: "related",
            observedArguments: [
              "literal;& touch SHOULD_NOT_EXIST",
              "literal with spaces",
            ],
            secretVisible: false,
          }),
        ]),
      );
      expect(fs.existsSync(path.join(testCase.worktreePath, "SHOULD_NOT_EXIST"))).toBe(
        false,
      );
      for (const gate of evidence.tests) {
        const output = fs.readFileSync(gate.outputArtifactPath, "utf8");
        expect(output).toContain(`stdout:${gate.id}`);
        expect(output).toContain(`stderr:${gate.id}`);
      }
    } finally {
      if (previousToken === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = previousToken;
    }
  });

  it("runs every planned gate and returns a complete failed batch", async () => {
    const testCase = createCase({ typescript: "fail" });
    const executor = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
    });
    const evidence = await executor.execute(testCase.input);

    expect(evidence.tests.map((gate: { id: string }) => gate.id)).toEqual([
      "related",
      "typescript",
      "full-suite",
    ]);
    expect(evidence.tests.find((gate: { id: string }) => gate.id === "typescript")).toMatchObject({
      status: "failed",
      exitCode: 23,
    });
    expect(invocations(testCase)).toHaveLength(3);
  });

  it("recovers after a hard checkpoint without executing a completed gate twice", async () => {
    const testCase = createCase();
    let crashed = false;
    const first = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
      lifecycle: {
        async checkpoint({
          point,
          gateId,
        }: {
          point: string;
          gateId: string;
        }) {
          if (
            !crashed &&
            point === "verification-gate-completed" &&
            gateId === "related"
          ) {
            crashed = true;
            throw new Error("simulated controller crash after related gate");
          }
        },
      },
    });
    await expect(first.execute(testCase.input)).rejects.toThrow(
      /simulated controller crash/i,
    );

    const recovered = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
    });
    const evidence = await recovered.execute(testCase.input);
    expect(evidence.tests).toHaveLength(3);
    expect(invocations(testCase)).toHaveLength(3);
  });

  it("recovers a completed output whose receipt publication was interrupted", async () => {
    const testCase = createCase();
    let crashed = false;
    const first = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
      lifecycle: {
        async checkpoint({
          point,
          gateId,
        }: {
          point: string;
          gateId: string;
        }) {
          if (
            !crashed &&
            point === "verification-gate-output-published" &&
            gateId === "related"
          ) {
            crashed = true;
            throw new Error("simulated crash before gate receipt publication");
          }
        },
      },
    });
    await expect(first.execute(testCase.input)).rejects.toThrow(
      /before gate receipt publication/i,
    );
    expect(invocations(testCase)).toHaveLength(1);

    const recovered = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
    });
    const evidence = await recovered.execute(testCase.input);
    expect(evidence.tests).toHaveLength(3);
    expect(invocations(testCase)).toHaveLength(3);
  });

  it("never replays a gate whose admitted attempt was interrupted", async () => {
    const testCase = createCase();
    let crashed = false;
    const first = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
      lifecycle: {
        async checkpoint({
          point,
          gateId,
        }: {
          point: string;
          gateId: string;
        }) {
          if (
            !crashed &&
            point === "verification-gate-attempt-admitted" &&
            gateId === "related"
          ) {
            crashed = true;
            throw new Error("simulated crash after gate admission");
          }
        },
      },
    });
    await expect(first.execute(testCase.input)).rejects.toThrow(
      /after gate admission/i,
    );
    expect(invocations(testCase)).toEqual([]);

    const recovered = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
    });
    await expect(recovered.execute(testCase.input)).rejects.toThrow(
      /interrupted.*attempt/i,
    );
    expect(invocations(testCase)).toEqual([]);
  });

  it("fails closed if the plan digest or a durable output artifact changes", async () => {
    const testCase = createCase();
    const executor = createVerificationCommandExecutor({
      artifactRoot: testCase.artifactRoot,
    });
    await expect(
      executor.execute({
        ...testCase.input,
        verificationPlanSha256: "f".repeat(64),
      }),
    ).rejects.toThrow(/plan digest.*integrity/i);

    const evidence = await executor.execute(testCase.input);
    fs.appendFileSync(evidence.tests[0].outputArtifactPath, "tampered\n");
    await expect(executor.execute(testCase.input)).rejects.toThrow(
      /artifact.*integrity/i,
    );
    expect(verificationPlanDigest(testCase.plan)).toBe(testCase.planSha256);
  });
});
