import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RoutinesDB } from "@/lib/db/routines";
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
    const { reId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, routineExerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const exercise = await routinesDB.updateRoutineExercise(
      reId,
      validation.data
    );

    return NextResponse.json({ exercise });
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
    const { reId } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const routinesDB = new RoutinesDB(supabase);
    await routinesDB.removeRoutineExercise(reId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/routines/[id]/exercises/[reId] error", error);
    return NextResponse.json(
      { error: "Failed to remove routine exercise" },
      { status: 500 }
    );
  }
}
