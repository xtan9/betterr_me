import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createWorkoutWrites, toWorkoutSetResponse } from "@/lib/fitness/writes";
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
    const { id, weId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, workoutSetCreateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createWorkoutWrites(supabase).addSet({
      userId,
      workoutId: id,
      workoutExerciseId: weId,
      set: {
        setType: validation.data.set_type,
        ...(validation.data.weight_kg !== undefined
          ? { weightKg: validation.data.weight_kg }
          : {}),
        ...(validation.data.reps !== undefined
          ? { reps: validation.data.reps }
          : {}),
        ...(validation.data.duration_seconds !== undefined
          ? { durationSeconds: validation.data.duration_seconds }
          : {}),
        ...(validation.data.distance_meters !== undefined
          ? { distanceMeters: validation.data.distance_meters }
          : {}),
        ...(validation.data.rpe !== undefined
          ? { rpe: validation.data.rpe }
          : {}),
        isCompleted: validation.data.is_completed,
      },
    });

    if (outcome.type === "not-found") {
      return NextResponse.json(
        { error: "Workout exercise not found" },
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
      { set: toWorkoutSetResponse(outcome.set) },
      { status: 201 },
    );
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises/[weId]/sets error", error);
    return NextResponse.json(
      { error: "Failed to add set" },
      { status: 500 }
    );
  }
}
