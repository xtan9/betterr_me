import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutExerciseUpdateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

/**
 * PATCH /api/workouts/[id]/exercises/[weId]
 * Update a workout exercise (notes, rest timer).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  try {
    const { weId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, workoutExerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const exercise = await workoutExercisesDB.updateExercise(
      weId,
      validation.data
    );

    return NextResponse.json({ exercise });
  } catch (error) {
    log.error("PATCH /api/workouts/[id]/exercises/[weId] error", error);
    return NextResponse.json(
      { error: "Failed to update workout exercise" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workouts/[id]/exercises/[weId]
 * Remove an exercise from a workout (CASCADE deletes related sets).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  try {
    const { weId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    await workoutExercisesDB.removeExercise(weId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/workouts/[id]/exercises/[weId] error", error);
    return NextResponse.json(
      { error: "Failed to remove exercise from workout" },
      { status: 500 }
    );
  }
}
