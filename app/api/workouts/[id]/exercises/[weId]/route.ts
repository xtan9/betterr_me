import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
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
    const validation = validateRequestBody(body, workoutExerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const exercise = await workoutExercisesDB.updateExercise(
      weId,
      validation.data
    );

    return NextResponse.json({ exercise });
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
    const { weId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    await workoutExercisesDB.removeExercise(weId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/workouts/[id]/exercises/[weId] error", error);
    return NextResponse.json(
      { error: "Failed to remove exercise from workout" },
      { status: 500 }
    );
  }
}
