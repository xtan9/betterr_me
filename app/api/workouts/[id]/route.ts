import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

/**
 * GET /api/workouts/[id]
 * Get a single workout with nested exercises and sets.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.getWorkoutWithExercises(id);

    if (!workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ workout });
  } catch (error) {
    log.error("GET /api/workouts/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch workout" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workouts/[id]
 * Update a workout: title, notes, status (finish/discard).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, workoutUpdateSchema);
    if (!validation.success) return validation.response;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.updateWorkout(id, validation.data);

    return NextResponse.json({ workout });
  } catch (error) {
    log.error("PATCH /api/workouts/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update workout" },
      { status: 500 }
    );
  }
}
