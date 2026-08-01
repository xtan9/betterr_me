import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { HabitsDB } from "@/lib/db";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST116"
  );
}

/**
 * POST /api/habits/[id]/resume
 * Resume a habit through its dedicated lifecycle operation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let id: string | undefined;
  let userId: string | undefined;

  try {
    ({ id } = await params);
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }

    const { principal, client: supabase } = auth;
    userId = principal.userId;
    const habit = await new HabitsDB(supabase).resumeHabit(id, userId);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      log.info("[habits] resume: not found", { id, userId });
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    log.error("[habits] POST resume", error, { id, userId });
    return NextResponse.json(
      { error: "Failed to resume habit" },
      { status: 500 },
    );
  }
}
