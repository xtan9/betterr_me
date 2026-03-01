import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutSetUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

/**
 * PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId]
 * Update a workout set (weight, reps, duration, set type, completion).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string; setId: string }> }
) {
  try {
    const { setId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, workoutSetUpdateSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const set = await workoutExercisesDB.updateSet(setId, validation.data);

    return NextResponse.json({ set });
  } catch (error) {
    log.error(
      "PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId] error",
      error
    );
    return NextResponse.json(
      { error: "Failed to update set" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId]
 * Delete a workout set.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string; setId: string }> }
) {
  try {
    const { setId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    await workoutExercisesDB.deleteSet(setId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error(
      "DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId] error",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete set" },
      { status: 500 }
    );
  }
}
