import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createHabitWrites, toHabitResponse } from "@/lib/habits/writes";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

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
    const outcome = await createHabitWrites(supabase).resume({
      habitId: id,
      userId,
    });
    if (outcome.type === "not-found") {
      log.info("[habits] resume: not found", { id, userId });
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    if (outcome.type === "invalid-transition") {
      return NextResponse.json(
        { error: outcome.message },
        { status: 409 },
      );
    }
    return NextResponse.json({ habit: toHabitResponse(outcome.habit) });
  } catch (error: unknown) {
    log.error("[habits] POST resume", error, { id, userId });
    return NextResponse.json(
      { error: "Failed to resume habit" },
      { status: 500 },
    );
  }
}
