// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MCP_ACCESS_GRANT_CATALOGS,
} from "../../e2e/mcp-access-grant-catalogs";
import { finalizeEvidence } from "../../e2e/mcp-access-grant-evidence";
import {
  MCP_ACCESS_GRANT_DECISION_GOLDENS,
  MCP_ACCESS_GRANT_GOLDEN_REPORTS,
  MCP_ACCESS_GRANT_GOLDEN_OMISSION_RULES,
  MCP_ACCESS_GRANT_GOLDEN_SERIALIZATION_KEY_ORDER,
  MCP_ACCESS_GRANT_GOLDEN_SERIALIZED_SHA256,
  MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS,
  compareMcpAccessGrantGolden,
  validateMcpAccessGrantGoldens,
} from "../../e2e/mcp-access-grant-goldens";

describe("MCP access-grant byte-exact evidence goldens", () => {
  it("has complete, closed coverage for the Candidate 2 catalogs", () => {
    expect(validateMcpAccessGrantGoldens(MCP_ACCESS_GRANT_GOLDEN_REPORTS)).toEqual({
      valid: true,
      errors: [],
      securityFollowUpRequired: false,
    });
  });

  it.each(MCP_ACCESS_GRANT_GOLDEN_REPORTS)("freezes the $id report and serialized artifact", (golden) => {
    const result = compareMcpAccessGrantGolden(golden);

    expect(result).toEqual({
      equal: true,
      differences: [],
      securityFollowUpRequired: false,
    });
  });

  it("locks the canonical serialized report key order", () => {
    expect(MCP_ACCESS_GRANT_GOLDEN_SERIALIZATION_KEY_ORDER).toEqual([
      "finishedAt",
      "gates",
      "issue",
      "outcome",
      "requests",
      "startedAt",
      "target",
      "versions",
    ]);
  });

  it("references every registered decision case exactly once", () => {
    const catalogCaseIds = Object.entries(MCP_ACCESS_GRANT_CATALOGS.classifiers).flatMap(([classifier, definition]) =>
      Object.keys(definition.cases).map((caseId) => `${classifier}:${caseId}`),
    );

    expect(MCP_ACCESS_GRANT_DECISION_GOLDENS).toHaveLength(catalogCaseIds.length);
    expect(new Set(MCP_ACCESS_GRANT_DECISION_GOLDENS.map(({ id }) => id))).toEqual(new Set(catalogCaseIds));
  });

  it("freezes nested fixtures and replays identical facts and clocks byte-for-byte", () => {
    for (const golden of MCP_ACCESS_GRANT_GOLDEN_REPORTS) {
      expect(Object.isFrozen(golden.input)).toBe(true);
      expect(Object.isFrozen(golden.input.observations)).toBe(true);
      expect(Object.isFrozen(golden.expectedReport)).toBe(true);

      const first = finalizeEvidence(golden.input, golden.context);
      const second = finalizeEvidence(golden.input, golden.context);
      expect(first.report).toEqual(second.report);
      expect(first.verification.serialized).toBe(second.verification.serialized);
      expect(first.verification.serialized).toBe(golden.serialized);
      const expectedDigest = MCP_ACCESS_GRANT_GOLDEN_SERIALIZED_SHA256[
        golden.id as keyof typeof MCP_ACCESS_GRANT_GOLDEN_SERIALIZED_SHA256
      ];
      expect(createHash("sha256").update(golden.serialized).digest("hex")).toBe(expectedDigest);
    }
  });

  it("locks hosted omission, version sentinels, request order, and bounded serialization", () => {
    const hostedReports = MCP_ACCESS_GRANT_GOLDEN_REPORTS.filter(({ scenario }) => scenario === "hosted");
    expect(hostedReports).not.toHaveLength(0);

    for (const golden of hostedReports) {
      expect(golden.expectedReport.target).not.toHaveProperty("loopbackHosts");
      expect(golden.expectedReport.versions).toMatchObject(MCP_ACCESS_GRANT_GOLDEN_VERSION_SENTINELS);
    }

    const local = MCP_ACCESS_GRANT_GOLDEN_REPORTS.find(({ id }) => id === "public-client-local-pass")!;
    expect(local.expectedReport.requests.map(({ method }) => method)).toEqual(["GET", "POST"]);
    expect(local.expectedReport.gates.length).toBeGreaterThan(32);
    expect(JSON.parse(local.serialized).gates).toHaveLength(32);
    expect(MCP_ACCESS_GRANT_GOLDEN_OMISSION_RULES).toEqual({
      hostedTargetLoopbackHosts: "omit",
      absentRequestOptionalFields: "omit",
      absentTargetOptionalFields: "omit",
    });
  });

  it("does not normalize a negative-registration security mismatch", () => {
    const golden = MCP_ACCESS_GRANT_GOLDEN_REPORTS.find(({ id }) => id === "public-client-negative-registration")!;
    const mismatched = {
      ...golden,
      expectedReport: {
        ...golden.expectedReport,
        gates: golden.expectedReport.gates.map((gate) =>
          gate.id === "registration-negative-validation-both"
            ? { ...gate, status: "pass" as const }
            : gate,
        ),
      },
    };

    expect(compareMcpAccessGrantGolden(mismatched)).toMatchObject({
      equal: false,
      securityFollowUpRequired: true,
    });
  });
});
