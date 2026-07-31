import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildStrykerCommand,
  selectMutationTargets,
} from "../../scripts/ci/mutation-selection.mjs";

describe("changed-scope mutation selection", () => {
  it("mutates a changed habit implementation file directly", () => {
    expect(selectMutationTargets([
      { status: "M", path: "lib/habits/absence.ts" },
    ])).toEqual(["lib/habits/absence.ts"]);
  });

  it("mutates the habits scope when habit tests change", () => {
    expect(selectMutationTargets([
      { status: "M", path: "tests/lib/habits/absence.test.ts" },
    ])).toEqual(["lib/habits/**/*.ts"]);
  });

  it("mutates the full habits scope when source and test changes are mixed", () => {
    expect(selectMutationTargets([
      { status: "M", path: "lib/habits/absence.ts" },
      { status: "M", path: "tests/lib/habits/format.test.ts" },
    ])).toEqual(["lib/habits/**/*.ts"]);
  });

  it("does not mutate habits for unrelated changes", () => {
    expect(selectMutationTargets([
      { status: "M", path: "components/journal/journal-editor.tsx" },
    ])).toEqual([]);
  });

  it("does not select excluded mutation entry points", () => {
    expect(selectMutationTargets([
      { status: "M", path: "lib/db/index.ts" },
    ])).toEqual([]);
  });

  it("builds the full Stryker config from the central mutation scopes", () => {
    const config = readFileSync("stryker.config.mjs", "utf8");

    expect(config).toContain(
      "testFiles: MUTATION_SCOPES.flatMap((scope) => scope.testFiles)",
    );
    expect(config).toContain(
      "mutate: MUTATION_SCOPES.flatMap((scope) => scope.mutate)",
    );
  });

  it("invokes Stryker with the focused habit mutation target", () => {
    const targets = selectMutationTargets([
      { status: "M", path: "lib/habits/absence.ts" },
    ]);

    expect(buildStrykerCommand("C:/tools/stryker.js", targets)).toEqual({
      command: process.execPath,
      args: [
        "C:/tools/stryker.js",
        "run",
        "--mutate",
        "lib/habits/absence.ts",
      ],
      options: { stdio: "inherit" },
    });
  });
});
