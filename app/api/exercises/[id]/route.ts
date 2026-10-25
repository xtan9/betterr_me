import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ExercisesDB } from "@/lib/db/exercises";
import {
  executeExerciseCommand,
  exerciseFailure,
  exerciseUnavailable,
} from "@/lib/fitness/exercise-commands";
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
 * GET /api/exercises/[id]
 * Get a single exercise by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const {
      client: supabase,
      principal: { userId },
    } = auth;

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.getExercise(id, userId);

    if (!exercise) {
      return NextResponse.json(
        { error: "Exercise not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ exercise });
  } catch (error) {
    log.error("GET /api/exercises/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise" },
      { status: 500 },
    );
  }
}

/** Legacy route locations share the command contract; unversioned writes fail. */
async function command(
  request: NextRequest,
  params: Promise<{ id: string }>,
  kinds: readonly string[],
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) return exerciseFailure("unauthenticated", auth.status);
    if (request.headers.get("X-Train-Owner") !== auth.principal.userId)
      return exerciseFailure("unauthenticated", 403);
    return await executeExerciseCommand(
      request,
      auth.client,
      auth.principal.userId,
      { id, kinds },
    );
  } catch {
    return exerciseUnavailable("unexpected_exception");
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return command(request, params, ["update-metadata", "restore"]);
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return command(request, params, ["archive"]);
}
