import { randomUUID } from "node:crypto";
import { log } from "@/lib/logger";

export type LegacyTelemetryDomain = "profile" | "preferences";

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

type LegacyTelemetryContext = {
  route: string;
  domain: LegacyTelemetryDomain;
  revision?: number;
  errorCode?: string;
  correlationId: string;
};

export type LegacyRouteTelemetry = {
  setRevision(revision: unknown): void;
  setErrorCode(errorCode: string): void;
  emit(): void;
};

export function createLegacyRouteTelemetry(
  route: string,
  domain: LegacyTelemetryDomain,
): LegacyRouteTelemetry {
  const correlationId = randomUUID();
  let revision: number | undefined;
  let errorCode: string | undefined;
  let emitted = false;

  return {
    setRevision(value) {
      if (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
      ) {
        revision = value;
      }
    },
    setErrorCode(value) {
      errorCode = LEGACY_ERROR_CODES.has(value) ? value : "legacy_route_failed";
    },
    emit() {
      if (emitted) return;
      emitted = true;

      const context: LegacyTelemetryContext = {
        route,
        domain,
        correlationId,
        ...(revision !== undefined && { revision }),
        ...(errorCode !== undefined && { errorCode }),
      };
      log.info("[legacy] deprecated route", context);
    },
  };
}

export function legacyAuthErrorCode(outcome: string): string {
  switch (outcome) {
    case "invalid":
      return "invalid_credentials";
    case "forbidden":
      return "forbidden";
    case "misconfigured":
      return "server_misconfigured";
    default:
      return "unauthorized";
  }
}

export function legacyFailureCode(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === "P0002" || code === "PGRST116") return "profile_not_found";
  }
  if (error instanceof Error && /not found/i.test(error.message)) {
    return "profile_not_found";
  }
  return fallback;
}
