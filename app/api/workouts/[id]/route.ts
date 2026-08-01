import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutsDB } from "@/lib/db/workouts";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/workouts/[id]
 * Get a single workout with nested exercises and sets.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.getWorkoutWithExercises(id);

    if (!workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ workout });
  } catch (error) {
    log.error("GET /api/workouts/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch workout" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workouts/[id]
 * Update a workout: title, notes, status (finish/discard).
 */
export async function PATCH(
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
    const validation = validateRequestBody(body, workoutUpdateSchema);
    if (!validation.success) return validation.response;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.updateWorkout(id, validation.data);

    return NextResponse.json({ workout });
  } catch (error) {
    log.error("PATCH /api/workouts/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update workout" },
      { status: 500 }
    );
  }
}
