import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExerciseDBClient } from "@/lib/exercisedb/client";
import { matchExercises } from "@/lib/exercisedb/matcher";
import { syncExerciseMediaSchema } from "@/lib/validations/exercise-media";
import { log } from "@/lib/logger";

/**
 * POST /api/admin/sync-exercise-media
 * Admin-only route: fetches ExerciseDB data, fuzzy-matches to preset exercises,
 * and upserts into exercise_media + exercise_name_mappings.
 *
 * Requires:
 * - Authenticated user (via Supabase auth)
 * - x-admin-secret header matching ADMIN_SYNC_SECRET env var
 *
 * Optional body: { threshold?: number (0-1), dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Admin secret check
    const adminSecret = process.env.ADMIN_SYNC_SECRET;
    const headerSecret = request.headers.get("x-admin-secret");

    if (!adminSecret || headerSecret !== adminSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Parse body (optional -- defaults are fine)
    let body = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const parsed = syncExerciseMediaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { threshold, dryRun } = parsed.data;

    // 4. Fetch all ExerciseDB exercises
    const apiKey = process.env.EXERCISEDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "EXERCISEDB_API_KEY not configured" },
        { status: 500 }
      );
    }

    const exerciseDBClient = new ExerciseDBClient(apiKey);
    const dbExercises = await exerciseDBClient.fetchAll();

    // 5. Fetch all preset exercises (is_custom = false)
    const adminClient = createAdminClient();
    const { data: presetExercises, error: fetchError } = await adminClient
      .from("exercises")
      .select("*")
      .eq("is_custom", false);

    if (fetchError) {
      log.error("Failed to fetch preset exercises", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch preset exercises" },
        { status: 500 }
      );
    }

    // 6. Run fuzzy matching
    if (!presetExercises || presetExercises.length === 0) {
      return NextResponse.json(
        { error: "No preset exercises found" },
        { status: 404 }
      );
    }

    const matchResults = matchExercises(
      presetExercises,
      dbExercises,
      threshold
    );

    // 7. Upsert if not dry run
    if (!dryRun) {
      // Build media rows for matched exercises only
      const mediaRows = matchResults
        .filter((r) => r.match !== null)
        .map((r) => ({
          exercise_id: r.exercise.id,
          exercisedb_id: r.match!.id,
          gif_url: r.match!.gifUrl,
          thumbnail_url: r.match!.gifUrl,
          instructions: r.match!.instructions,
          alternative_names: [],
          media_status: "active",
          source: "exercisedb",
        }));

      if (mediaRows.length > 0) {
        const { error: mediaError } = await adminClient
          .from("exercise_media")
          .upsert(mediaRows, { onConflict: "exercise_id" });

        if (mediaError) {
          log.error("Failed to upsert exercise media", mediaError);
          return NextResponse.json(
            { error: "Failed to upsert exercise media" },
            { status: 500 }
          );
        }
      }

      // Build mapping rows for all exercises (matched and unmatched)
      const mappingRows = matchResults.map((r) => ({
        exercise_id: r.exercise.id,
        our_name: r.exercise.name,
        matched_name: r.match?.name ?? null,
        exercisedb_id: r.match?.id ?? null,
        match_confidence: r.confidence,
        equipment_match: r.equipmentMatch,
        muscle_match: r.muscleMatch,
        verified: r.verified,
      }));

      const { error: mappingError } = await adminClient
        .from("exercise_name_mappings")
        .upsert(mappingRows, { onConflict: "exercise_id" });

      if (mappingError) {
        log.error("Failed to upsert exercise name mappings", mappingError);
        return NextResponse.json(
          { error: "Failed to upsert exercise name mappings" },
          { status: 500 }
        );
      }
    }

    // 8. Build and return mapping report
    const matched = matchResults.filter((r) => r.match !== null).length;
    const unmatched = matchResults.filter((r) => r.match === null).length;

    const report = {
      matched,
      unmatched,
      total: matchResults.length,
      dryRun,
      mappings: matchResults.map((r) => ({
        our_name: r.exercise.name,
        matched_name: r.match?.name ?? null,
        confidence: r.confidence,
        equipment_match: r.equipmentMatch,
        muscle_match: r.muscleMatch,
        exercisedb_id: r.match?.id ?? null,
      })),
    };

    return NextResponse.json(report);
  } catch (error) {
    log.error("POST /api/admin/sync-exercise-media error", error);
    return NextResponse.json(
      { error: "Failed to sync exercise media" },
      { status: 500 }
    );
  }
}
