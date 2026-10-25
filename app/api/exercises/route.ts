import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ExercisesDB } from "@/lib/db/exercises";
import {
  executeExerciseCommand,
  exerciseCapabilities,
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
 * GET /api/exercises
 * Get all exercises visible to the authenticated user (presets + custom).
 */
export async function GET(request: Request) {
  try {
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
    const scope = new URL(request.url).searchParams.get("archived");
    if (scope !== null && scope !== "all")
      return exerciseFailure("invalid_request", 400);
    const exercises = await exercisesDB.getAllExercises(
      userId,
      scope === "all",
    );
    const capabilities = await exerciseCapabilities(supabase);
    if (!capabilities.ok) return capabilities.response;
    return NextResponse.json(
      {
        ownerId: userId,
        exercises,
        customExercises: capabilities.value.customExercises,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    log.error("GET /api/exercises error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercises" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/exercises
 * Create a custom exercise for the authenticated user.
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
    const {
      principal: { userId },
      client: supabase,
    } = auth;

    if (request.headers.get("X-Train-Owner") !== userId)
      return exerciseFailure("unauthenticated", 403);
    return await executeExerciseCommand(request, supabase, userId, {
      kinds: ["create"],
    });
  } catch (error) {
    void error;
    return exerciseUnavailable("unexpected_exception");
  }
}
