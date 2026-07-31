import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createRoutineWorkoutRequests } from "@/lib/fitness/routine-workout-requests";
import { validateRequestBody } from "@/lib/validations/api";
import { saveAsRoutineSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/workouts/[id]/save-as-routine
 * Creates a new routine from a workout's exercises and sets.
 * Works for in_progress, completed, or discarded workouts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workoutId } = await params;

  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    // Validate body
    const body = await request.json();
    const validation = validateRequestBody(body, saveAsRoutineSchema);
    if (!validation.success) return validation.response;

    const routine = await createRoutineWorkoutRequests(supabase).save(
      userId,
      workoutId,
      validation.data.name,
    );
    if (!routine) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/save-as-routine error", error);

    return NextResponse.json(
      { error: "Failed to save workout as routine" },
      { status: 500 }
    );
  }
}
