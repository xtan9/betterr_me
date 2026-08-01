import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createWorkoutWrites, toWorkoutSetResponse } from "@/lib/fitness/writes";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutSetUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId]
 * Update a workout set (weight, reps, duration, set type, completion).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string; setId: string }> }
) {
  try {
    const { id, weId, setId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, workoutSetUpdateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createWorkoutWrites(supabase).updateSet({
      userId,
      workoutId: id,
      workoutExerciseId: weId,
      setId,
      changes: {
        ...(validation.data.set_type !== undefined
          ? { setType: validation.data.set_type }
          : {}),
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
        ...(validation.data.is_completed !== undefined
          ? { isCompleted: validation.data.is_completed }
          : {}),
      },
    });

    if (outcome.type === "not-found") {
      return NextResponse.json({ error: "Workout set not found" }, { status: 404 });
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

    return NextResponse.json({ set: toWorkoutSetResponse(outcome.set) });
  } catch (error) {
    log.error(
      "PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId] error",
      error
    );
    return NextResponse.json(
      { error: "Failed to update set" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId]
 * Delete a workout set.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string; setId: string }> }
) {
  try {
    const { id, weId, setId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const outcome = await createWorkoutWrites(supabase).removeSet({
      userId,
      workoutId: id,
      workoutExerciseId: weId,
      setId,
    });

    if (outcome.type === "not-found") {
      return NextResponse.json({ error: "Workout set not found" }, { status: 404 });
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

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error(
      "DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId] error",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete set" },
      { status: 500 }
    );
  }
}
