import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { addExerciseToWorkoutSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/workouts/[id]/exercises
 * Add an exercise to a workout.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, addExerciseToWorkoutSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const exercise = await workoutExercisesDB.addExercise(
      id,
      validation.data.exercise_id,
      validation.data.rest_timer_seconds
    );

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to add exercise to workout" },
      { status: 500 }
    );
  }
}
