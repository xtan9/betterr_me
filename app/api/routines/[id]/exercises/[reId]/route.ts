import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createRoutineWrites } from "@/lib/fitness/routine-writes";
import { validateRequestBody } from "@/lib/validations/api";
import { routineExerciseUpdateSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * PATCH /api/routines/[id]/exercises/[reId]
 * Update a routine exercise's target values.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reId: string }> }
) {
  try {
    const { id, reId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, routineExerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createRoutineWrites(supabase).updateExercise({
      userId,
      routineId: id,
      routineExerciseId: reId,
      changes: {
        targetSets: validation.data.target_sets,
        targetReps: validation.data.target_reps,
        targetWeightKg: validation.data.target_weight_kg,
        targetDurationSeconds: validation.data.target_duration_seconds,
        targetDistanceMeters: validation.data.target_distance_meters,
        restTimerSeconds: validation.data.rest_timer_seconds,
        notes: validation.data.notes,
        sortOrder: validation.data.sort_order,
      },
    });
    if (outcome.type === "not-found") {
      return NextResponse.json(
        { error: "Routine exercise not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ exercise: outcome.exercise });
  } catch (error) {
    log.error("PATCH /api/routines/[id]/exercises/[reId] error", error);

    // Handle not found
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "PGRST116") {
      return NextResponse.json(
        { error: "Routine exercise not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update routine exercise" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/routines/[id]/exercises/[reId]
 * Remove an exercise from a routine.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reId: string }> }
) {
  try {
    const { id, reId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const outcome = await createRoutineWrites(supabase).removeExercise({
      userId,
      routineId: id,
      routineExerciseId: reId,
    });
    if (outcome.type === "not-found") {
      return NextResponse.json(
        { error: "Routine exercise not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/routines/[id]/exercises/[reId] error", error);
    return NextResponse.json(
      { error: "Failed to remove routine exercise" },
      { status: 500 }
    );
  }
}
