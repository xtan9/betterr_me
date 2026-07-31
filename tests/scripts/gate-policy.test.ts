import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { verifyGate } from "../../scripts/ci/verify-gate.mjs";

const classification = (suites: Record<string, boolean>) =>
  JSON.stringify({ suites });

function executeGate(environment: Record<string, string>) {
  const execution = spawnSync(process.execPath, ["scripts/ci/verify-gate.mjs"], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  return {
    status: execution.status,
    stderr: execution.stderr.replaceAll("\r\n", "\n"),
    stdout: execution.stdout.replaceAll("\r\n", "\n"),
  };
}

describe("workflow gate policy", () => {
  it("accepts successful selected work and an explicit selection-based skip", () => {
    expect(verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: classification({ quality: true, migrations: false }),
      prerequisites: [
        { name: "quality", suite: "quality", result: "success" },
        { name: "migrations", suite: "migrations", result: "skipped" },
      ],
    })).toEqual({
      gateName: "CI Gate",
      selected: ["quality"],
      skipped: ["migrations"],
    });
  });

  it.each(["failure", "cancelled", "skipped", ""])(
    "fails closed when selection reports %s",
    (selectionResult) => {
      expect(() => verifyGate({
        gateName: "E2E Gate",
        selectionResult,
        classificationJson: classification({ e2e: true }),
        prerequisites: [{ name: "browser tests", suite: "e2e", result: "success" }],
      })).toThrow(
        `E2E Gate requires change selection to report success; received ${selectionResult || "missing"}`,
      );
    },
  );

  it.each(["failure", "cancelled", "skipped", ""])(
    "fails closed when selected work reports %s",
    (result) => {
      expect(() => verifyGate({
        gateName: "E2E Gate",
        selectionResult: "success",
        classificationJson: classification({ e2e: true }),
        prerequisites: [{ name: "browser tests", suite: "e2e", result }],
      })).toThrow(
        result
          ? `E2E Gate requires browser tests to report success; received ${result}`
          : "E2E Gate requires browser tests to report a completed result; received missing",
      );
    },
  );

  it("rejects missing selection metadata and non-skipped conditional work", () => {
    expect(() => verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: classification({ quality: false }),
      prerequisites: [
        { name: "quality", suite: "quality", result: "success" },
        { name: "migrations", suite: "migrations", result: "skipped" },
      ],
    })).toThrow(
      "CI Gate requires quality to report skipped; received success",
    );

    expect(() => verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: classification({ quality: true }),
      prerequisites: [
        { name: "quality", suite: "quality", result: "success" },
        { name: "migrations", suite: "migrations", result: "skipped" },
      ],
    })).toThrow(
      "CI Gate requires migrations selection to be a boolean",
    );
  });

  it("fails closed for malformed or incomplete policy input", () => {
    expect(() => verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: "not-json",
      prerequisites: [{ name: "quality", suite: "quality", result: "success" }],
    })).toThrow("CLASSIFICATION_JSON must contain valid JSON");

    expect(() => verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: "{}",
      prerequisites: [{ name: "quality", suite: "quality", result: "success" }],
    })).toThrow("CI Gate requires classification suites");

    expect(() => verifyGate({
      gateName: "CI Gate",
      selectionResult: "success",
      classificationJson: classification({ quality: true }),
      prerequisites: [],
    })).toThrow("CI Gate requires at least one prerequisite");
  });

  it("executes representative CI Gate and E2E Gate aggregate jobs", () => {
    expect(executeGate({
      GATE_NAME: "CI Gate",
      SELECTION_RESULT: "success",
      CLASSIFICATION_JSON: classification({ quality: true, migrations: false }),
      PREREQUISITES_JSON: JSON.stringify([
        { name: "quality", suite: "quality", result: "success" },
        { name: "migrations", suite: "migrations", result: "skipped" },
      ]),
    })).toEqual({
      status: 0,
      stderr: "",
      stdout: "CI Gate passed.\nselected work: quality\nskipped by policy: migrations\n",
    });

    expect(executeGate({
      GATE_NAME: "E2E Gate",
      SELECTION_RESULT: "success",
      CLASSIFICATION_JSON: classification({ e2e: false }),
      PREREQUISITES_JSON: JSON.stringify([
        { name: "browser tests", suite: "e2e", result: "skipped" },
      ]),
    })).toEqual({
      status: 0,
      stderr: "",
      stdout: "E2E Gate passed.\nselected work: none\nskipped by policy: browser tests\n",
    });
  });

  it.each([
    ["failure", "E2E Gate requires browser tests to report success; received failure\n"],
    ["cancelled", "E2E Gate requires browser tests to report success; received cancelled\n"],
    ["", "E2E Gate requires browser tests to report a completed result; received missing\n"],
  ])("fails the aggregate-job command for a %s prerequisite", (result, stderr) => {
    expect(executeGate({
      GATE_NAME: "E2E Gate",
      SELECTION_RESULT: "success",
      CLASSIFICATION_JSON: classification({ e2e: true }),
      PREREQUISITES_JSON: JSON.stringify([
        { name: "browser tests", suite: "e2e", result },
      ]),
    })).toEqual({ status: 1, stderr, stdout: "" });
  });
});
