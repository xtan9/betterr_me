import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGenerationIntentStore } from "../../scripts/ralph/v2/generation-intent.mjs";

const roots: string[] = [];
const BASE_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const REQUIREMENTS_SHA = "c".repeat(64);
const POLICY_SHA = "d".repeat(64);
const PLAN_SHA = "e".repeat(64);

function createCase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-intent-"));
  roots.push(root);
  const runtimePath = path.join(root, "private-runtime");
  const workerPath = path.join(root, "worker-checkout");
  fs.mkdirSync(workerPath, { recursive: true });
  const store = createGenerationIntentStore(runtimePath);
  const generation = {
    issueNumber: 731,
    generation: 1,
    baseSha: BASE_SHA,
    branch: "ralph/issue-731-generation-1",
    implementationSessionId: "ralph-v2:issue-731:generation-1:implementation",
    requirementsSha256: REQUIREMENTS_SHA,
    workerPolicySha256: POLICY_SHA,
  };
  const candidate = {
    issueNumber: 731,
    generation: 1,
    candidateTreeSha: TREE_SHA,
    changedPaths: ["src/a.ts", "src/z.ts"],
    verificationSessionId: "ralph-v2:issue-731:generation-1:verification",
    verificationPlanSha256: PLAN_SHA,
    verificationStartedAtEpochMilliseconds: 1_000,
    verificationTimeoutMilliseconds: 60_000,
    verificationDeadlineEpochMilliseconds: 61_000,
  };
  return { root, runtimePath, workerPath, store, generation, candidate };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 immutable generation intents", () => {
  it("publishes generation and candidate intent outside the writable checkout", () => {
    const testCase = createCase();
    const reserved = testCase.store.reserveGeneration(testCase.generation);
    const rebound = testCase.store.reserveGeneration(testCase.generation);
    const bound = testCase.store.bindCandidate({
      ...testCase.candidate,
      generationIntentSha256: reserved.sha256,
    });

    expect(rebound).toEqual(reserved);
    expect(bound.intent.changedPaths).toEqual(["src/a.ts", "src/z.ts"]);
    expect(reserved.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(path.resolve(reserved.path).startsWith(path.resolve(testCase.runtimePath))).toBe(
      true,
    );
    expect(path.resolve(reserved.path).startsWith(path.resolve(testCase.workerPath))).toBe(
      false,
    );
  });

  it.each([
    ["base SHA", { baseSha: "f".repeat(40) }],
    ["requirements", { requirementsSha256: "1".repeat(64) }],
    ["worker policy", { workerPolicySha256: "2".repeat(64) }],
    ["implementation session", { implementationSessionId: "forged" }],
  ])("rejects a conflicting immutable %s", (_name, changed) => {
    const testCase = createCase();
    testCase.store.reserveGeneration(testCase.generation);
    expect(() =>
      testCase.store.reserveGeneration({ ...testCase.generation, ...changed }),
    ).toThrow(/generation intent conflict|integrity validation/i);
  });

  it.each([
    ["candidate tree", { candidateTreeSha: "3".repeat(40) }],
    ["changed paths", { changedPaths: ["src/other.ts"] }],
    ["verification plan", { verificationPlanSha256: "4".repeat(64) }],
    ["verification session", { verificationSessionId: "forged" }],
    ["start", { verificationStartedAtEpochMilliseconds: 2_000 }],
    ["timeout", { verificationTimeoutMilliseconds: 120_000 }],
    ["deadline", { verificationDeadlineEpochMilliseconds: 121_000 }],
  ])("rejects a conflicting immutable %s", (_name, changed) => {
    const testCase = createCase();
    const reserved = testCase.store.reserveGeneration(testCase.generation);
    const candidate = {
      ...testCase.candidate,
      generationIntentSha256: reserved.sha256,
    };
    testCase.store.bindCandidate(candidate);
    expect(() =>
      testCase.store.bindCandidate({ ...candidate, ...changed }),
    ).toThrow(/candidate intent conflict|integrity validation/i);
  });

  it("detects every protected state field changed together after a crash", () => {
    const testCase = createCase();
    const generation = testCase.store.reserveGeneration(testCase.generation);
    const candidate = testCase.store.bindCandidate({
      ...testCase.candidate,
      generationIntentSha256: generation.sha256,
    });
    const record = {
      number: testCase.generation.issueNumber,
      generation: testCase.generation.generation,
      baseSha: testCase.generation.baseSha,
      branch: testCase.generation.branch,
      sessionId: testCase.generation.implementationSessionId,
      requirementsSha256: testCase.generation.requirementsSha256,
      workerPolicySha256: testCase.generation.workerPolicySha256,
      generationIntentSha256: generation.sha256,
      candidateTreeSha: testCase.candidate.candidateTreeSha,
      changedPaths: testCase.candidate.changedPaths,
      verificationSessionId: testCase.candidate.verificationSessionId,
      verificationPlanSha256: testCase.candidate.verificationPlanSha256,
      verificationStartedAtEpochMilliseconds:
        testCase.candidate.verificationStartedAtEpochMilliseconds,
      verificationTimeoutMilliseconds:
        testCase.candidate.verificationTimeoutMilliseconds,
      verificationDeadlineEpochMilliseconds:
        testCase.candidate.verificationDeadlineEpochMilliseconds,
      candidateIntentSha256: candidate.sha256,
    };
    expect(testCase.store.assertRecord(record)).toMatchObject({
      generationIntent: generation.intent,
      candidateIntent: candidate.intent,
    });

    const forged = {
      ...record,
      candidateTreeSha: "9".repeat(40),
      verificationStartedAtEpochMilliseconds: 9_000,
      verificationTimeoutMilliseconds: 900_000,
      verificationDeadlineEpochMilliseconds: 909_000,
    };
    expect(() => testCase.store.assertRecord(forged)).toThrow(
      /state does not match immutable candidate intent/i,
    );
  });

  it("fails closed on a partial or malformed immutable publication", () => {
    const testCase = createCase();
    const reserved = testCase.store.reserveGeneration(testCase.generation);
    fs.writeFileSync(reserved.path, '{"schemaVersion":1');
    expect(() => testCase.store.assertRecord({
      number: 731,
      generation: 1,
      generationIntentSha256: reserved.sha256,
    })).toThrow(/unreadable|integrity validation/i);
  });
});
