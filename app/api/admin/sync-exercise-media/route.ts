import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCatalog } from "@/lib/exercisedb/catalog";
import { downloadAndStoreGif } from "@/lib/exercisedb/gif-downloader";
import { syncExerciseMediaSchema } from "@/lib/validations/exercise-media";
import {
  authenticateRequest,
  ADMIN_REQUEST_POLICY,
} from "@/lib/auth/authenticated-request";
import { log } from "@/lib/logger";
import { findBestMatch } from "string-similarity";

/**
 * POST /api/admin/sync-exercise-media
 * Admin-only route: loads exercise catalog, upserts exercises,
 * downloads GIFs to Supabase Storage, and upserts exercise_media.
 *
 * Auth: admin role (via requireAdminApi) OR x-admin-secret header (for CLI/cron)
 *
 * Optional body: { dryRun?: boolean, skipGifs?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check: admin role OR secret header
    const adminSecret = process.env.ADMIN_SYNC_SECRET;
    const headerSecret = request.headers.get("x-admin-secret");
    const hasValidAdminSecret =
      Boolean(adminSecret) && headerSecret === adminSecret;

    const auth = await authenticateRequest(request, ADMIN_REQUEST_POLICY);
    const isAuthed = auth.ok || hasValidAdminSecret;
    if (!isAuthed && auth.outcome === "misconfigured") {
      throw new Error(auth.error);
    }

    if (!isAuthed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Parse body
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

    const { dryRun, skipGifs } = parsed.data;

    // 3. Load catalog
    const catalog = loadCatalog();

    // 4. Fetch existing preset exercises
    const adminClient = createAdminClient();
    const { data: existingExercises, error: fetchError } = await adminClient
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

    // 5. Match catalog entries to existing exercises by name
    const existingNames = (existingExercises || []).map((e: { name: string }) =>
      e.name.toLowerCase().trim()
    );

    let created = 0;
    let updated = 0;
    let exercisesFailed = 0;
    let gifsDownloaded = 0;
    let gifsFailed = 0;
    let mediaFailed = 0;
    const exerciseIds: Map<string, string> = new Map(); // catalog name → exercise ID

    for (const entry of catalog) {
      const normalizedName = entry.name.toLowerCase().trim();

      // Find existing exercise by fuzzy name match
      let existingExercise: { id: string; name: string } | null = null;
      if (existingNames.length > 0) {
        const match = findBestMatch(normalizedName, existingNames);
        if (match.bestMatch.rating >= 0.8) {
          existingExercise = (existingExercises || [])[match.bestMatchIndex];
        }
      }

      if (dryRun) {
        if (existingExercise) {
          updated++;
          exerciseIds.set(entry.name, existingExercise.id);
        } else {
          created++;
        }
        continue;
      }

      if (existingExercise) {
        // UPDATE existing exercise (preserve UUID)
        const { error: updateError } = await adminClient
          .from("exercises")
          .update({
            muscle_group_primary: entry.muscle_group_primary,
            muscle_groups_secondary: entry.muscle_groups_secondary,
            equipment: entry.equipment,
            exercise_type: entry.exercise_type,
          })
          .eq("id", existingExercise.id);

        if (updateError) {
          log.error("Failed to update exercise", updateError, { name: entry.name });
          exercisesFailed++;
        } else {
          updated++;
          exerciseIds.set(entry.name, existingExercise.id);
        }
      } else {
        // INSERT new exercise
        const { data: inserted, error: insertError } = await adminClient
          .from("exercises")
          .insert({
            name: entry.name,
            muscle_group_primary: entry.muscle_group_primary,
            muscle_groups_secondary: entry.muscle_groups_secondary,
            equipment: entry.equipment,
            exercise_type: entry.exercise_type,
            is_custom: false,
            user_id: null,
          })
          .select("id")
          .single();

        if (insertError) {
          log.error("Failed to insert exercise", insertError, { name: entry.name });
          exercisesFailed++;
        } else {
          created++;
          exerciseIds.set(entry.name, inserted.id);
        }
      }
    }

    // 6. Download GIFs and upsert exercise_media (unless dryRun or skipGifs)
    if (!dryRun) {
      for (const entry of catalog) {
        const exerciseId = exerciseIds.get(entry.name);
        if (!exerciseId || !entry.exercisedb_id) continue;

        let storageUrl: string | null = null;

        if (!skipGifs && entry.gif_url) {
          storageUrl = await downloadAndStoreGif(entry.exercisedb_id, entry.gif_url);
          if (storageUrl) {
            gifsDownloaded++;
          } else {
            gifsFailed++;
          }
        }

        // Upsert exercise_media with storage URL (or original URL if skipGifs)
        const mediaRow = {
          exercise_id: exerciseId,
          exercisedb_id: entry.exercisedb_id,
          gif_url: storageUrl || entry.gif_url,
          thumbnail_url: storageUrl || entry.gif_url,
          instructions: [],
          alternative_names: [],
          media_status: "active",
          source: "exercisedb",
        };

        const { error: mediaError } = await adminClient
          .from("exercise_media")
          .upsert(mediaRow, { onConflict: "exercise_id" });

        if (mediaError) {
          log.error("Failed to upsert exercise media", mediaError, { name: entry.name });
          mediaFailed++;
        }
      }
    }

    // 7. Return report
    const report = {
      total: catalog.length,
      created,
      updated,
      exercisesFailed,
      gifsDownloaded,
      gifsFailed,
      mediaFailed,
      dryRun,
      skipGifs,
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
