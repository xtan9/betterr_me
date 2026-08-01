import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutsDB } from "@/lib/db/workouts";
import { computePersonalRecords } from "@/lib/fitness/personal-records";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/exercises/[id]/records
 * Compute personal records for an exercise from all completed normal sets.
 * Returns a PersonalRecord object with best weight, reps, volume, and duration.
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

    const workoutsDB = new WorkoutsDB(supabase);
    const sets = await workoutsDB.getExerciseSets(exerciseId, userId);
    const records = computePersonalRecords(exerciseId, sets);

    return NextResponse.json(records);
  } catch (error) {
    log.error("GET /api/exercises/[id]/records error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise records" },
      { status: 500 }
    );
  }
}
