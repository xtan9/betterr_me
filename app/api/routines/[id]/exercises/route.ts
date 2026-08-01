import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineExerciseAddSchema } from "@/lib/validations/routine";
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
 * GET /api/routines/[id]/exercises
 * Get all exercises for a routine.
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

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.getRoutine(id);

    if (!routine) {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exercises: routine.exercises });
  } catch (error) {
    log.error("GET /api/routines/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to fetch routine exercises" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routines/[id]/exercises
 * Add an exercise to a routine.
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
    const validation = validateRequestBody(body, routineExerciseAddSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const exercise = await routinesDB.addExerciseToRoutine(
      id,
      validation.data
    );

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to add exercise to routine" },
      { status: 500 }
    );
  }
}
