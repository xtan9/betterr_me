import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRepositoryVerificationRecipe,
  createApprovedReviewIssue,
  createRequirementsSnapshot,
  createRepositoryVerificationRecipe,
  createVerificationPlan,
  DEFAULT_VERIFICATION_RECIPE,
  validateVerificationRecipe,
} from "../../scripts/ralph/v2/verification-plan.mjs";

const TREE = "a".repeat(40);
const SESSION = "ralph-v2:issue-1:generation-1:verification";
const REQUIREMENTS = Object.freeze({
  schemaVersion: 1,
  issueNumber: 1,
  title: "Implement the approved behavior",
  body: "Acceptance criterion A",
  trustedWorkerPolicy: null,
});

describe("Ralph v2 controller-owned verification plans", () => {
  it("captures the approved structured issue contract for exhaustive review", () => {
    const requirements = createRequirementsSnapshot({
      number: 811,
      title: "Execute real verification",
      body: "The original GitHub issue body.",
      url: "https://github.com/example/repository/issues/811",
      blockers: [810],
      whatToBuild: "Run every required gate against the exact candidate.",
      testSeam: "The public verification receipt.",
      acceptanceCriteria: [
        "All commands execute.",
        "All review axes complete.",
      ],
      trustedWorkerPolicy: { network: false },
    });

    expect(requirements).toMatchObject({
      schemaVersion: 2,
      issueNumber: 811,
      blockers: [810],
      whatToBuild: "Run every required gate against the exact candidate.",
      testSeam: "The public verification receipt.",
      acceptanceCriteria: [
        "All commands execute.",
        "All review axes complete.",
      ],
    });
    expect(createApprovedReviewIssue(requirements)).toEqual({
      issueNumber: 811,
      title: "Execute real verification",
      url: "https://github.com/example/repository/issues/811",
      blockers: [810],
      whatToBuild: "Run every required gate against the exact candidate.",
      testSeam: "The public verification receipt.",
      acceptanceCriteria: [
        "All commands execute.",
        "All review axes complete.",
      ],
    });
  });

  it("fingerprints the actual review protocol, schema, and installed skill bytes", () => {
    const repositoryPath = fs.realpathSync.native(process.cwd());
    const recipe = createRepositoryVerificationRecipe({ repositoryPath });

    expect(recipe.review).toMatchObject({
      kind: "exhaustive",
      policySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      skillSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(recipe.review.policySha256).not.toBe(
      DEFAULT_VERIFICATION_RECIPE.review.policySha256,
    );
    expect(recipe.review.skillSha256).not.toBe(
      DEFAULT_VERIFICATION_RECIPE.review.skillSha256,
    );
    expect(() =>
      assertRepositoryVerificationRecipe({ repositoryPath, recipe }),
    ).not.toThrow();
  });

  it.each([
    ["review policy", "scripts/ralph/review-protocol.mjs"],
    ["review schema", "scripts/ralph/review.schema.json"],
    ["review classification dependency", "scripts/ralph/queue.mjs"],
    ["installed code-review skill", ".agents/skills/code-review/SKILL.md"],
  ])("fails closed when the %s changes after planning", (_name, relativePath) => {
    const sourceRoot = fs.realpathSync.native(process.cwd());
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-v2-review-materials-"),
    );
    try {
      for (const sourcePath of [
        "scripts/ralph/review-protocol.mjs",
        "scripts/ralph/review.schema.json",
        "scripts/ralph/queue.mjs",
      ]) {
        const destination = path.join(fixtureRoot, sourcePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(sourceRoot, sourcePath), destination);
      }
      fs.cpSync(
        path.join(sourceRoot, ".agents/skills/code-review"),
        path.join(fixtureRoot, ".agents/skills/code-review"),
        { recursive: true },
      );
      const recipe = createRepositoryVerificationRecipe({
        repositoryPath: fixtureRoot,
      });
      fs.appendFileSync(path.join(fixtureRoot, relativePath), "\nTAMPERED\n");

      expect(() =>
        assertRepositoryVerificationRecipe({
          repositoryPath: fixtureRoot,
          recipe,
        }),
      ).toThrow(/review materials changed after planning/i);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("canonicalizes changed paths and binds every gate to one digest", () => {
    const reversed = createVerificationPlan({
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/z.ts", "src/a.ts"],
      requirements: REQUIREMENTS,
    });
    const ordered = createVerificationPlan({
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/a.ts", "src/z.ts"],
      requirements: REQUIREMENTS,
    });

    expect(reversed).toEqual(ordered);
    expect(reversed.plan.review.subjects).toEqual(["src/a.ts", "src/z.ts"]);
    expect(reversed.plan.tests[0]).toMatchObject({
      id: "related",
      executable: process.execPath,
      args: expect.arrayContaining(["src/a.ts", "src/z.ts"]),
    });
    expect(reversed.plan.tests.every((test) => test.command.length > 0)).toBe(
      true,
    );
    expect(reversed.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [
      "blank executable",
      {
        tests: [
          { id: "related", executable: " ", args: [], includeChangedPaths: true },
        ],
      },
    ],
    [
      "relative executable",
      {
        tests: [
          {
            id: "related",
            executable: "pnpm",
            args: [],
            includeChangedPaths: true,
          },
        ],
      },
    ],
    [
      "duplicate test ID",
      {
        tests: [
          { id: "same", executable: "one", args: [], includeChangedPaths: false },
          { id: "same", executable: "two", args: [], includeChangedPaths: false },
        ],
      },
    ],
    ["blank review axis", { review: { kind: "exhaustive", axes: [" "] } }],
    [
      "duplicate review axis",
      { review: { kind: "exhaustive", axes: ["tests", "tests"] } },
    ],
  ])("rejects a recipe with %s", (_name, override) => {
    const recipe = {
      schemaVersion: 1,
      tests: DEFAULT_VERIFICATION_RECIPE.tests,
      review: DEFAULT_VERIFICATION_RECIPE.review,
      ...override,
    };
    expect(() => validateVerificationRecipe(recipe)).toThrow(
      /recipe failed integrity validation/i,
    );
  });

  it.each([
    ["empty changed paths", []],
    ["blank changed path", [" "]],
    ["duplicate changed path", ["src/a.ts", "src/a.ts"]],
  ])("rejects %s", (_name, changedPaths) => {
    expect(() =>
      createVerificationPlan({
        sessionId: SESSION,
        candidateTreeSha: TREE,
        changedPaths,
        requirements: REQUIREMENTS,
      }),
    ).toThrow(/plan input failed integrity validation/i);
  });

  it("changes the digest when any controller-owned requirement changes", () => {
    const baseline = createVerificationPlan({
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/a.ts"],
      requirements: REQUIREMENTS,
    });
    const changedCommand = createVerificationPlan({
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/a.ts"],
      requirements: REQUIREMENTS,
      recipe: {
        ...DEFAULT_VERIFICATION_RECIPE,
        tests: DEFAULT_VERIFICATION_RECIPE.tests.map((test) =>
          test.id === "related"
            ? { ...test, args: ["exec", "vitest", "run"] }
            : test,
        ),
      },
    });
    const changedPath = createVerificationPlan({
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/b.ts"],
      requirements: REQUIREMENTS,
    });

    expect(changedCommand.sha256).not.toBe(baseline.sha256);
    expect(changedPath.sha256).not.toBe(baseline.sha256);
  });

  it("binds the immutable requirements and review-policy snapshots", () => {
    const input = {
      sessionId: SESSION,
      candidateTreeSha: TREE,
      changedPaths: ["src/a.ts"],
      requirements: REQUIREMENTS,
    };
    const baseline = createVerificationPlan(input);
    const changedRequirement = createVerificationPlan({
      ...input,
      requirements: {
        ...input.requirements,
        body: "Acceptance criterion B",
      },
    });
    const changedPolicy = createVerificationPlan({
      ...input,
      recipe: {
        ...DEFAULT_VERIFICATION_RECIPE,
        review: {
          ...DEFAULT_VERIFICATION_RECIPE.review,
          policySha256: "e".repeat(64),
        },
      },
    });

    expect(baseline.plan).toMatchObject({
      requirementsSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      review: {
        policySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        skillSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(changedRequirement.sha256).not.toBe(baseline.sha256);
    expect(changedPolicy.sha256).not.toBe(baseline.sha256);
  });
});
