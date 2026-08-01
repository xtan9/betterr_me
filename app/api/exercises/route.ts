import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ExercisesDB } from "@/lib/db/exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { exerciseFormSchema } from "@/lib/validations/exercise";
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
export async function GET(request: Request = new Request("http://localhost")) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const exercisesDB = new ExercisesDB(supabase);
    const exercises = await exercisesDB.getAllExercises();

    return NextResponse.json({ exercises });
  } catch (error) {
    log.error("GET /api/exercises error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercises" },
      { status: 500 }
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
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, exerciseFormSchema);
    if (!validation.success) return validation.response;

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.createExercise(userId, validation.data);

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/exercises error", error);
    return NextResponse.json(
      { error: "Failed to create exercise" },
      { status: 500 }
    );
  }
}
