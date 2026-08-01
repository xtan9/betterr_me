import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import {
  createWorkoutWrites,
  toWorkoutExerciseResponse,
} from "@/lib/fitness/writes";
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
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, addExerciseToWorkoutSchema);
    if (!validation.success) return validation.response;

    const outcome = await createWorkoutWrites(supabase).addExercise({
      userId,
      workoutId: id,
      exerciseId: validation.data.exercise_id,
      restTimerSeconds: validation.data.rest_timer_seconds,
    });

    if (outcome.type === "not-found") {
      return NextResponse.json(
        { error: "Workout or exercise not found" },
        { status: 404 },
      );
    }
    if (outcome.type === "invalid-transition") {
      return NextResponse.json(
        { error: "Workout is no longer editable" },
        { status: 409 },
      );
    }
    if (outcome.type === "invalid") {
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { exercise: toWorkoutExerciseResponse(outcome.exercise) },
      { status: 201 },
    );
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to add exercise to workout" },
      { status: 500 }
    );
  }
}
