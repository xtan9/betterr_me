import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import {
  RoutineToWorkoutConversion,
} from "@/lib/fitness/routine-to-workout";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import { log } from "@/lib/logger";

/**
 * POST /api/routines/[id]/start
 * Copy-on-start: creates a new workout from a routine template.
 * Deep-copies all routine exercises and pre-fills sets based on target values.
 * Returns 409 if the user already has an active workout.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routineId } = await params;
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch routine with exercises
    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.getRoutine(routineId);

    if (!routine) {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    // 2. Convert the complete routine through the route-independent lifecycle.
    const conversion = new RoutineToWorkoutConversion(
      new SupabaseRoutineWorkoutStore(supabase),
    );
    const workout = await conversion.start(user.id, routine);

    // 3. Update routine's last_performed_at (best-effort, do not fail the request)
    try {
      await routinesDB.updateRoutine(routineId, {
        last_performed_at: new Date().toISOString(),
      });
    } catch (err) {
      log.error("Failed to update routine last_performed_at", err, { routineId });
    }

    return NextResponse.json({ workout }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines/[id]/start error", error);

    // Re-check for 23505 in case it was thrown from WorkoutsDB
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
      { error: "Failed to start workout from routine" },
      { status: 500 }
    );
  }
}
