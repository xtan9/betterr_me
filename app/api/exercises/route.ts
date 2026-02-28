import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ExercisesDB } from "@/lib/db/exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { exerciseFormSchema } from "@/lib/validations/exercise";
import { log } from "@/lib/logger";

/**
 * GET /api/exercises
 * Get all exercises visible to the authenticated user (presets + custom).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, exerciseFormSchema);
    if (!validation.success) return validation.response;

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.createExercise(user.id, validation.data);

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/exercises error", error);
    return NextResponse.json(
      { error: "Failed to create exercise" },
      { status: 500 }
    );
  }
}
