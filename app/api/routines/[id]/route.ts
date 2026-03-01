import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineUpdateSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

/**
 * GET /api/routines/[id]
 * Get a single routine with nested exercises and exercise details.
 */
export async function GET(
  _request: NextRequest,
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

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.getRoutine(id);

    if (!routine) {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ routine });
  } catch (error) {
    log.error("GET /api/routines/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch routine" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/routines/[id]
 * Update a routine's name or notes.
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
    const validation = validateRequestBody(body, routineUpdateSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.updateRoutine(id, validation.data);

    return NextResponse.json({ routine });
  } catch (error) {
    log.error("PATCH /api/routines/[id] error", error);

    // Handle not found
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "PGRST116") {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update routine" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/routines/[id]
 * Delete a routine. CASCADE handles routine_exercises cleanup.
 */
export async function DELETE(
  _request: NextRequest,
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

    const routinesDB = new RoutinesDB(supabase);
    await routinesDB.deleteRoutine(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/routines/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete routine" },
      { status: 500 }
    );
  }
}
