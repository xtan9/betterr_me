import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutSetCreateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/workouts/[id]/exercises/[weId]/sets
 * Add a set to a workout exercise.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  try {
    const { weId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, workoutSetCreateSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const set = await workoutExercisesDB.addSet(weId, validation.data);

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises/[weId]/sets error", error);
    return NextResponse.json(
      { error: "Failed to add set" },
      { status: 500 }
    );
  }
}
