import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LEGACY_PROFILE_RETIREMENT_TEST_ENV = Object.freeze({
  TEST_LEGACY_PROFILE_CLIENT_PATHS: "disabled",
});

export const REQUIRED_LEGACY_OBSERVATION_DAYS = 14;

export const LEGACY_PROFILE_ROUTES = Object.freeze([
  "/api/profile",
  "/api/profile/preferences",
]);

export const APPROVED_LEGACY_TELEMETRY_FIELDS = Object.freeze([
  "route",
  "domain",
  "revision",
  "errorCode",
  "correlationId",
]);

const APPROVED_LEGACY_EVIDENCE_FIELDS = Object.freeze([
  "source",
  "observationStart",
  "observationEndExclusive",
  "telemetryFields",
  "completeDays",
]);

const APPROVED_LEGACY_DAILY_EVIDENCE_FIELDS = Object.freeze([
  "date",
  "complete",
  "legacyRouteCount",
]);

export const RETAINED_LEGACY_PROFILE_PATHS = Object.freeze([
  "app/api/profile/route.ts",
  "app/api/profile/preferences/route.ts",
  "lib/db/profiles.ts",
  "lib/submit-profile-preference-intent.ts",
  "lib/validations/profile.ts",
  "lib/types/database.ts",
]);

const RETIREMENT_BASE_REF =
  process.env.RETIREMENT_BASE_REF ??
  "4da4ba73416117acc0e2a0ecfa0b7be962cad073";

const LEGACY_DOMAINS = new Set(["profile", "preferences"]);
const LEGACY_ERROR_CODES = new Set([
  "unauthorized",
  "invalid_credentials",
  "forbidden",
  "server_misconfigured",
  "invalid_request",
  "profile_not_found",
  "profile_read_failed",
  "profile_write_failed",
  "preference_write_failed",
  "legacy_route_failed",
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const LEGACY_PROFILE_CONTRACTS = Object.freeze([
  {
    name: "GET /api/profile",
    pattern: /\bfetch\s*\(\s*["'`]\/api\/profile["'`]/,
    allowedPaths: ["app/api/profile/route.ts"],
  },
  {
    name: "PATCH /api/profile/preferences",
    pattern: /\bfetch\s*\(\s*["'`]\/api\/profile\/preferences["'`]/,
    allowedPaths: [
      "app/api/profile/preferences/route.ts",
      "lib/submit-profile-preference-intent.ts",
    ],
  },
  {
    name: "ProfilesDB.getProfile",
    pattern: /\.\s*getProfile\s*\(/,
    allowedPaths: ["app/api/profile/route.ts", "lib/db/profiles.ts"],
  },
  {
    name: "ProfilesDB.updateProfile",
    pattern: /\.\s*updateProfile\s*\(/,
    allowedPaths: ["app/api/profile/route.ts", "lib/db/profiles.ts"],
  },
  {
    name: "ProfilesDB.updatePreferences",
    pattern: /\.\s*updatePreferences\s*\(/,
    allowedPaths: [
      "app/api/profile/preferences/route.ts",
      "lib/db/profiles.ts",
    ],
  },
  {
    name: "update_profile_preferences RPC",
    pattern: /\.rpc\s*\(\s*["'`]update_profile_preferences["'`]/,
    allowedPaths: ["lib/db/profiles.ts"],
  },
  {
    name: "submitProfilePreferenceIntent helper",
    pattern: /\bsubmitProfilePreferenceIntent\s*\(/,
    allowedPaths: ["lib/submit-profile-preference-intent.ts"],
  },
  {
    name: "broad profiles table read",
    pattern: /\.from\s*\(\s*["'`]profiles["'`]\s*\)[\s\S]{0,120}\.select\s*\(\s*["'`]\*["'`]/,
    allowedPaths: ["lib/db/profiles.ts"],
  },
]);

const PRODUCTION_SOURCE_ROOTS = [
  "app",
  "components",
  "hooks",
  "lib",
  "supabase/functions",
];

function sourceEntries(sources) {
  if (sources instanceof Map) return [...sources.entries()];
  if (Array.isArray(sources)) return sources;
  return Object.entries(sources ?? {});
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

export function scanLegacyProfileCallers(sources) {
  const callers = [];

  for (const [path, rawSource] of sourceEntries(sources)) {
    const source = String(rawSource).replaceAll("\r\n", "\n");

    for (const contract of LEGACY_PROFILE_CONTRACTS) {
      if (contract.allowedPaths.includes(path)) continue;
      const match = contract.pattern.exec(source);
      if (!match) continue;

      callers.push({
        contract: contract.name,
        path,
        line: lineNumber(source, match.index),
      });
    }
  }

  return callers.sort((left, right) =>
    `${left.path}:${left.line}:${left.contract}`.localeCompare(
      `${right.path}:${right.line}:${right.contract}`,
    ),
  );
}

function trackedProductionSources() {
  const paths = execFileSync(
    "git",
    ["ls-files", "-z", "--", ...PRODUCTION_SOURCE_ROOTS],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path));

  return paths
    .filter((path) => existsSync(path))
    .map((path) => [path, readFileSync(path, "utf8")]);
}

export function scanRepositoryLegacyProfileCallers() {
  return scanLegacyProfileCallers(trackedProductionSources());
}

export function changedRetainedLegacyProfilePaths(baseRef = RETIREMENT_BASE_REF) {
  return execFileSync(
    "git",
    ["diff", "--name-only", baseRef, "--", ...RETAINED_LEGACY_PROFILE_PATHS],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
}

function routeDomain(route) {
  return route === "/api/profile" ? "profile" : "preferences";
}

export function validateLegacyTelemetryRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["telemetry record must be an object"] };
  }

  for (const field of Object.keys(record)) {
    if (!APPROVED_LEGACY_TELEMETRY_FIELDS.includes(field)) {
      errors.push(`unexpected field: ${field}`);
    }
  }

  if (typeof record.route !== "string" || !LEGACY_PROFILE_ROUTES.includes(record.route)) {
    errors.push("route must be a retained legacy Profile route");
  }

  if (typeof record.domain !== "string" || !LEGACY_DOMAINS.has(record.domain)) {
    errors.push("domain must be profile or preferences");
  } else if (typeof record.route === "string" && LEGACY_PROFILE_ROUTES.includes(record.route)) {
    if (record.domain !== routeDomain(record.route)) {
      errors.push("domain must match route");
    }
  }

  if (record.revision !== undefined && (
    typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0
  )) {
    errors.push("revision must be a non-negative safe integer");
  }

  if (record.errorCode !== undefined && (
    typeof record.errorCode !== "string" ||
    !LEGACY_ERROR_CODES.has(record.errorCode)
  )) {
    errors.push("errorCode must be an approved legacy error code");
  }

  if (typeof record.correlationId !== "string" || !UUID_V4.test(record.correlationId)) {
    errors.push("correlationId must be an internal UUID v4");
  }

  return { valid: errors.length === 0, errors };
}

function utcDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  if (date.toISOString().slice(0, 10) !== value) return undefined;
  return date;
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function validateLegacyTelemetryEvidence(evidence) {
  const errors = [];

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, errors: ["telemetry evidence must be an object"] };
  }

  for (const field of Object.keys(evidence)) {
    if (!APPROVED_LEGACY_EVIDENCE_FIELDS.includes(field)) {
      errors.push(`unexpected evidence field: ${field}`);
    }
  }

  if (typeof evidence.source !== "string" || evidence.source.length === 0) {
    errors.push("source is required");
  }

  const start = utcDate(evidence.observationStart);
  const end = utcDate(evidence.observationEndExclusive);
  if (!start || !end) {
    errors.push("observation window must use valid UTC dates");
  } else if (addUtcDays(start, REQUIRED_LEGACY_OBSERVATION_DAYS) !== evidence.observationEndExclusive) {
    errors.push("observation window must cover fourteen complete days");
  }

  if (
    !Array.isArray(evidence.telemetryFields) ||
    evidence.telemetryFields.length !== APPROVED_LEGACY_TELEMETRY_FIELDS.length ||
    evidence.telemetryFields.some(
      (field, index) => field !== APPROVED_LEGACY_TELEMETRY_FIELDS[index],
    )
  ) {
    errors.push("telemetry fields must be exactly the approved non-sensitive fields");
  }

  if (!Array.isArray(evidence.completeDays)) {
    errors.push("completeDays must be an array");
  } else {
    if (evidence.completeDays.length !== REQUIRED_LEGACY_OBSERVATION_DAYS) {
      errors.push("completeDays must contain fourteen days");
    }

    let consecutive = true;
    const incompleteDays = [];
    const trafficDays = [];
    for (let index = 0; index < evidence.completeDays.length; index += 1) {
      const day = evidence.completeDays[index];
      const expectedDate = start
        ? addUtcDays(start, index)
        : undefined;
      if (!day || typeof day !== "object" || Array.isArray(day)) {
        errors.push(`observation day ${expectedDate ?? index} must be an object`);
        continue;
      }
      for (const field of Object.keys(day)) {
        if (!APPROVED_LEGACY_DAILY_EVIDENCE_FIELDS.includes(field)) {
          errors.push(`unexpected observation field: ${field}`);
        }
      }
      if (day.date !== expectedDate) consecutive = false;
      if (day.complete !== true) {
        incompleteDays.push(`observation day ${expectedDate ?? day.date} is not complete`);
      }
      if (day.legacyRouteCount !== 0) {
        trafficDays.push(`observation day ${expectedDate ?? day.date} has legacy route traffic`);
      }
    }
    if (!consecutive) errors.unshift("observation days must be consecutive");
    errors.push(...incompleteDays, ...trafficDays);
  }

  return { valid: errors.length === 0, errors };
}

export function hasZeroLegacyTrafficForCompleteWindow(evidence) {
  return validateLegacyTelemetryEvidence(evidence).valid;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const callers = scanRepositoryLegacyProfileCallers();
  process.stdout.write(`${JSON.stringify({ callers }, null, 2)}\n`);
  process.exitCode = callers.length === 0 ? 0 : 1;
}
