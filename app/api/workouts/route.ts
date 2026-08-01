import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutsDB } from "@/lib/db/workouts";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutCreateSchema } from "@/lib/validations/workout";
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
 * GET /api/workouts
 * List completed workouts with enriched summary data (exercise names, volume, sets).
 * Supports pagination via `limit` and `offset` query params.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    const workoutsDB = new WorkoutsDB(supabase);
    const workouts = await workoutsDB.getWorkoutsWithSummary(userId, {
      limit,
      offset,
    });

    return NextResponse.json(workouts);
  } catch (error) {
    log.error("GET /api/workouts error", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workouts
 * Start a new workout session. Returns 409 if user already has an active workout.
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
    const validation = validateRequestBody(body, workoutCreateSchema);
    if (!validation.success) return validation.response;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.startWorkout(userId, validation.data);

    return NextResponse.json({ workout }, { status: 201 });
  } catch (error: unknown) {
    log.error("POST /api/workouts error", error);

    // Handle unique constraint violation (active workout already exists)
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "23505") {
      return NextResponse.json(
        { error: "You already have an active workout" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to start workout" },
      { status: 500 }
    );
  }
}
