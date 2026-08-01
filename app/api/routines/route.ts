import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RoutinesDB } from "@/lib/db/routines";
import { createRoutineWrites } from "@/lib/fitness/routine-writes";
import { validateRequestBody } from "@/lib/validations/api";
import { routineCreateSchema } from "@/lib/validations/routine";
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
 * GET /api/routines
 * List all routines for the authenticated user with nested exercises.
 */
export async function GET(request: Request = new Request("http://localhost")) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const routinesDB = new RoutinesDB(supabase);
    const routines = await routinesDB.getUserRoutines(userId);

    return NextResponse.json({ routines });
  } catch (error) {
    log.error("GET /api/routines error", error);
    return NextResponse.json(
      { error: "Failed to fetch routines" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routines
 * Create a new routine.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, routineCreateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createRoutineWrites(supabase).create({
      userId,
      name: validation.data.name,
      notes: validation.data.notes,
    });
    if (outcome.type === "not-found") {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 });
    }

    return NextResponse.json({ routine: outcome.routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines error", error);
    return NextResponse.json(
      { error: "Failed to create routine" },
      { status: 500 }
    );
  }
}
