import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import {
  createWorkoutWrites,
  toWorkoutExerciseResponse,
} from "@/lib/fitness/writes";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutExerciseUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * PATCH /api/workouts/[id]/exercises/[weId]
 * Update a workout exercise (notes, rest timer).
 */
export async function PATCH(
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
    const validation = validateRequestBody(body, workoutExerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createWorkoutWrites(supabase).updateExercise({
      userId,
      workoutId: id,
      workoutExerciseId: weId,
      changes: {
        ...(validation.data.notes !== undefined
          ? { notes: validation.data.notes }
          : {}),
        ...(validation.data.rest_timer_seconds !== undefined
          ? { restTimerSeconds: validation.data.rest_timer_seconds }
          : {}),
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

    return NextResponse.json({
      exercise: toWorkoutExerciseResponse(outcome.exercise),
    });
  } catch (error) {
    log.error("PATCH /api/workouts/[id]/exercises/[weId] error", error);
    return NextResponse.json(
      { error: "Failed to update workout exercise" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workouts/[id]/exercises/[weId]
 * Remove an exercise from a workout (CASCADE deletes related sets).
 */
export async function DELETE(
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

    const outcome = await createWorkoutWrites(supabase).removeExercise({
      userId,
      workoutId: id,
      workoutExerciseId: weId,
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

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/workouts/[id]/exercises/[weId] error", error);
    return NextResponse.json(
      { error: "Failed to remove exercise from workout" },
      { status: 500 }
    );
  }
}
