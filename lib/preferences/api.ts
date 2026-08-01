import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type {
  AuthenticatedRequestContext,
  AuthenticatedRequestPolicy,
} from "@/lib/auth/request-context";
import { log } from "@/lib/logger";

export const PREFERENCE_WRITE_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

export type PreferenceCommandAuth = AuthenticatedRequestContext<
  SupabaseClient,
  "cookie"
>;

type CommandHandler = (auth: PreferenceCommandAuth) => Promise<NextResponse>;

const PUBLIC_ERROR_CODES = new Set([
  "profile_not_provisioned",
  "user_time_zone_unresolved",
  "identity_email_unavailable",
  "invalid_preference",
  "profile_details_unavailable",
  "user_time_zone_unavailable",
  "appearance_preference_unavailable",
  "localization_preference_unavailable",
  "fitness_preference_unavailable",
  "notification_preference_unavailable",
]);

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;
  if (PUBLIC_ERROR_CODES.has(code)) return code;
  if (code === "22023") return "invalid_preference";
  if (code === "P0002") return "profile_not_provisioned";
  if (code === "P0001") {
    const message = (error as { message?: unknown }).message;
    if (
      message === "user_time_zone_unresolved" ||
      message === "identity_email_unavailable"
    ) {
      return message;
    }
  }
  return null;
}

function responseStatus(code: string): number {
  if (
    code === "profile_not_provisioned" ||
    code === "user_time_zone_unresolved" ||
    code === "identity_email_unavailable"
  ) {
    return 409;
  }
  if (code === "invalid_preference") return 400;
  return 500;
}

export function commandFailureResponse(error: unknown, fallbackCode: string) {
  const code = errorCode(error) ?? fallbackCode;
  // Command errors may be produced from user intents. Keep diagnostics typed
  // by public code only; never attach an error message or raw intent payload.
  log.error("[preferences] command failed", undefined, { code });
  return NextResponse.json({ error: code }, { status: responseStatus(code) });
}

export async function runPreferenceCommand(
  request: Request,
  fallbackCode: string,
  handler: CommandHandler,
): Promise<NextResponse> {
  const auth = await authenticateRequest(request, PREFERENCE_WRITE_POLICY);
  if (!auth.ok) {
    return NextResponse.json(
      { error: cookieRouteErrorMessage(auth) },
      { status: auth.status },
    );
  }

  try {
    return await handler(auth);
  } catch (error) {
    return commandFailureResponse(error, fallbackCode);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
