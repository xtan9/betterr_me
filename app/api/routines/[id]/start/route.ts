import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createWorkoutWrites } from "@/lib/fitness/writes";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/routines/[id]/start
 * Copy-on-start: creates a new workout from a routine template.
 * Deep-copies all routine exercises and pre-fills sets based on target values.
 * Returns 409 if the user already has an active workout.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routineId } = await params;

  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const outcome = await createWorkoutWrites(supabase).start({
      userId,
      source: { type: "routine", routineId },
    });

    if (outcome.type === "not-found") {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }
    if (outcome.type === "conflict") {
      return NextResponse.json(
        { error: "You already have an active workout" },
        { status: 409 },
      );
    }
    if (outcome.type === "invalid-source") {
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    }

    return NextResponse.json({ workout: outcome.workout }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines/[id]/start error", error);

    return NextResponse.json(
      { error: "Failed to start workout from routine" },
      { status: 500 }
    );
  }
}
