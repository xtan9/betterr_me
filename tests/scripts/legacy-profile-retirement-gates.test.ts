import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROVED_LEGACY_TELEMETRY_FIELDS,
  LEGACY_PROFILE_RETIREMENT_TEST_ENV,
  changedRetainedLegacyProfilePaths,
  REQUIRED_LEGACY_OBSERVATION_DAYS,
  scanLegacyProfileCallers,
  scanRepositoryLegacyProfileCallers,
  validateLegacyTelemetryEvidence,
  validateLegacyTelemetryRecord,
} from "../../scripts/ci/legacy-profile-retirement-gates.mjs";

const COMPLETE_FOURTEEN_DAY_WINDOW = [
  "2026-07-18",
  "2026-07-19",
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];

describe("legacy Profile retirement gates", () => {
  it("finds no production callers outside retained compatibility adapters", () => {
    expect(scanRepositoryLegacyProfileCallers()).toEqual([]);
  });

  it("reports a new production route caller with its contract and location", () => {
    expect(scanLegacyProfileCallers({
      "components/settings/legacy-client.tsx":
        'await fetch("/api/profile", { method: "GET" });',
    })).toEqual([
      {
        contract: "GET /api/profile",
        path: "components/settings/legacy-client.tsx",
        line: 1,
      },
    ]);
  });

  it("keeps telemetry to the approved non-sensitive context fields", () => {
    expect(validateLegacyTelemetryRecord({
      route: "/api/profile",
      domain: "profile",
      revision: 4,
      errorCode: "invalid_request",
      correlationId: "11111111-1111-4111-8111-111111111111",
    })).toEqual({ valid: true, errors: [] });

    expect(validateLegacyTelemetryRecord({
      route: "/api/profile/preferences",
      domain: "preferences",
      correlationId: "11111111-1111-4111-8111-111111111111",
      identityEmail: "person@example.com",
      preferences: { theme: "dark" },
      quietWindowStart: "22:00",
    })).toEqual({
      valid: false,
      errors: [
        "unexpected field: identityEmail",
        "unexpected field: preferences",
        "unexpected field: quietWindowStart",
      ],
    });
  });

  it("accepts exactly fourteen complete zero-traffic days", () => {
    const evidence = {
      source: "vercel-runtime-logs",
      observationStart: "2026-07-18",
      observationEndExclusive: "2026-08-01",
      telemetryFields: [...APPROVED_LEGACY_TELEMETRY_FIELDS],
      completeDays: COMPLETE_FOURTEEN_DAY_WINDOW.map((date) => ({
        date,
        complete: true,
        legacyRouteCount: 0,
      })),
    };

    expect(validateLegacyTelemetryEvidence(evidence)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects incomplete, non-consecutive, or non-zero observation evidence", () => {
    const evidence = {
      source: "vercel-runtime-logs",
      observationStart: "2026-07-18",
      observationEndExclusive: "2026-08-01",
      telemetryFields: [...APPROVED_LEGACY_TELEMETRY_FIELDS],
      completeDays: COMPLETE_FOURTEEN_DAY_WINDOW.map((date, index) => ({
        date: index === 4 ? "2026-07-26" : date,
        complete: index !== 4,
        legacyRouteCount: index === 2 ? 1 : 0,
      })),
    };

    expect(validateLegacyTelemetryEvidence(evidence)).toEqual({
      valid: false,
      errors: [
        "observation days must be consecutive",
        "observation day 2026-07-22 is not complete",
        "observation day 2026-07-20 has legacy route traffic",
      ],
    });
  });

  it("rejects sensitive or unapproved fields in aggregate evidence", () => {
    const evidence = {
      source: "vercel-runtime-logs",
      observationStart: "2026-07-18",
      observationEndExclusive: "2026-08-01",
      telemetryFields: [...APPROVED_LEGACY_TELEMETRY_FIELDS],
      rawPreferences: { theme: "dark" },
      completeDays: COMPLETE_FOURTEEN_DAY_WINDOW.map((date) => ({
        date,
        complete: true,
        legacyRouteCount: 0,
        identityEmail: "person@example.com",
      })),
    };

    const result = validateLegacyTelemetryEvidence(evidence);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("unexpected evidence field: rawPreferences");
    expect(result.errors).toContain(
      "unexpected observation field: identityEmail",
    );
  });

  it("defines the retirement test configuration with legacy client paths disabled", () => {
    expect(LEGACY_PROFILE_RETIREMENT_TEST_ENV).toEqual({
      TEST_LEGACY_PROFILE_CLIENT_PATHS: "disabled",
    });
    expect(process.env.TEST_LEGACY_PROFILE_CLIENT_PATHS).toBe("disabled");
    expect(REQUIRED_LEGACY_OBSERVATION_DAYS).toBe(14);
  });

  it("does not modify retained legacy Profile implementation paths", () => {
    expect(changedRetainedLegacyProfilePaths()).toEqual([]);
  });

  it("records the fail-closed observation result and runnable evidence", () => {
    const evidence = readFileSync(
      "docs/verification/legacy-profile-retirement-gates.md",
      "utf8",
    ).replaceAll("\r\n", "\n");

    expect(evidence).toContain("Issue #674 is a verification ticket");
    expect(evidence).toContain("Fourteen consecutive complete production days with zero legacy route traffic | NOT VERIFIED");
    expect(evidence).toContain("node scripts/ci/legacy-profile-retirement-gates.mjs");
    expect(evidence).toContain("pnpm exec vitest run");
    expect(evidence).toContain("pnpm exec playwright test e2e/current-profile-preferences.spec.ts --project=chromium");
  });
});
