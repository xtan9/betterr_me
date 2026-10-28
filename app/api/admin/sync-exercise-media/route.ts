import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCatalog, type CatalogEntry } from "@/lib/exercisedb/catalog";
import { downloadAndStoreGif } from "@/lib/exercisedb/gif-downloader";
import { syncExerciseMediaSchema } from "@/lib/validations/exercise-media";
import { authenticateRequest } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { log } from "@/lib/logger";

const ADMIN_REQUEST_POLICY = {
  allowedCredentials: ["adminSecret", "admin"],
  requiredPermission: "admin",
} as const satisfies AuthenticatedRequestPolicy;

type ExistingPreset = { id: string; name: string; equipment: string; exercise_type: string };
const definitionKey = (entry: Pick<CatalogEntry, "name" | "equipment" | "exercise_type">) =>
  JSON.stringify([entry.name.toLowerCase().trim(), entry.equipment, entry.exercise_type]);
const sameDefinition = (existing: ExistingPreset, entry: CatalogEntry) =>
  definitionKey(existing) === definitionKey(entry);

/**
 * POST /api/admin/sync-exercise-media
 * Admin-only route: adds missing preset definitions without changing existing ones,
 * downloads GIFs to Supabase Storage, and upserts exercise_media.
 *
 * Auth: admin role or x-admin-secret, both resolved by the route policy.
 *
 * Optional body: { dryRun?: boolean, skipGifs?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ADMIN_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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
    const catalogIds = new Set<string>();
    const catalogDefinitions = new Set<string>();
    for (const entry of catalog) {
      const key = definitionKey(entry);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.preset_id)
        || catalogIds.has(entry.preset_id) || catalogDefinitions.has(key)) {
        return NextResponse.json({ error: "Catalog contains an invalid or duplicate identity", name: entry.name }, { status: 409 });
      }
      catalogIds.add(entry.preset_id);
      catalogDefinitions.add(key);
    }

    // 4. Fetch existing preset exercises
    const adminClient = createAdminClient();
    const { data: existingExercises, error: fetchError } = await adminClient
      .from("exercises")
      .select("*")
      .eq("is_custom", false)
      .is("user_id", null);

    if (fetchError) {
      log.error("Failed to fetch preset exercises", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch preset exercises" },
        { status: 500 }
      );
    }

    const presets = (existingExercises || []) as ExistingPreset[];
    for (const entry of catalog) {
      if (presets.filter(exercise => sameDefinition(exercise, entry)).length > 1) {
        return NextResponse.json({ error: "Existing preset definition is ambiguous", name: entry.name }, { status: 409 });
      }
      const existingIdentity = presets.find(exercise => exercise.id === entry.preset_id);
      if (existingIdentity && !sameDefinition(existingIdentity, entry)) {
        return NextResponse.json({ error: "Catalog identity conflicts with an existing preset", name: entry.name }, { status: 409 });
      }
    }

    // Similar names can describe different equipment or movement variations.
    let created = 0;
    const updated = 0; // Retained for response compatibility; existing definitions are immutable here.
    let unchanged = 0;
    let exercisesFailed = 0;
    let gifsDownloaded = 0;
    let gifsFailed = 0;
    let mediaFailed = 0;
    const exerciseIds = new Map<string, string>(); // reviewed catalog identity → stored exercise ID

    for (const entry of catalog) {
      const existingExercise = presets.find(exercise => sameDefinition(exercise, entry)) ?? null;

      if (dryRun) {
        if (existingExercise) {
          unchanged++;
          exerciseIds.set(entry.preset_id, existingExercise.id);
        } else {
          created++;
        }
        continue;
      }

      if (existingExercise) {
        // Catalog expansion must not rewrite definitions referenced by saved sets.
        unchanged++;
        exerciseIds.set(entry.preset_id, existingExercise.id);
      } else {
        // INSERT new exercise
        const { data: inserted, error: insertError } = await adminClient
          .from("exercises")
          .insert({
            id: entry.preset_id,
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
          exerciseIds.set(entry.preset_id, inserted.id);
        }
      }
    }

    // 6. Download GIFs and upsert exercise_media (unless dryRun or skipGifs)
    if (!dryRun) {
      for (const entry of catalog) {
        const exerciseId = exerciseIds.get(entry.preset_id);
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
      unchanged,
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
