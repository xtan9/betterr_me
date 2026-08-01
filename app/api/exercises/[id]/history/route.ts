import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutsDB } from "@/lib/db/workouts";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/exercises/[id]/history
 * Get per-workout aggregated stats for an exercise across completed workouts.
 * Used for progression charts. Accepts optional `since` query param (ISO date).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: exerciseId } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since") ?? undefined;

    const workoutsDB = new WorkoutsDB(supabase);
    const history = await workoutsDB.getExerciseHistory(
      exerciseId,
      userId,
      { since }
    );

    return NextResponse.json(history);
  } catch (error) {
    log.error("GET /api/exercises/[id]/history error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise history" },
      { status: 500 }
    );
  }
}
