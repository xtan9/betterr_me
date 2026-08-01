import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineUpdateSchema } from "@/lib/validations/routine";
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
 * GET /api/routines/[id]
 * Get a single routine with nested exercises and exercise details.
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

    return NextResponse.json({ routine });
  } catch (error) {
    log.error("GET /api/routines/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch routine" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/routines/[id]
 * Update a routine's name or notes.
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
    const validation = validateRequestBody(body, routineUpdateSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.updateRoutine(id, validation.data);

    return NextResponse.json({ routine });
  } catch (error) {
    log.error("PATCH /api/routines/[id] error", error);

    // Handle not found
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "PGRST116") {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update routine" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/routines/[id]
 * Delete a routine. CASCADE handles routine_exercises cleanup.
 */
export async function DELETE(
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

    const routinesDB = new RoutinesDB(supabase);
    await routinesDB.deleteRoutine(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/routines/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete routine" },
      { status: 500 }
    );
  }
}
