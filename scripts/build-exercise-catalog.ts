/**
 * Refresh reviewed ExerciseDB media URLs in the curated exercise catalog.
 *
 * Usage: EXERCISEDB_API_KEY=xxx npx tsx scripts/build-exercise-catalog.ts
 *
 * Preserves the curated definitions and stable preset UUIDs. It never adds
 * name-based media matches or replaces the catalog with a smaller target list.
 */

import { writeFileSync } from "fs";
import { loadCatalog, type CatalogEntry } from "../lib/exercisedb/catalog";

const BASE_URL = "https://exercisedb.p.rapidapi.com";
const API_KEY = process.env.EXERCISEDB_API_KEY;

if (!API_KEY) {
  console.error("Set EXERCISEDB_API_KEY environment variable");
  process.exit(1);
}

interface ExerciseDBEntry {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  secondaryMuscles: string[];
  equipment: string;
  gifUrl: string;
  instructions: string[];
}

async function fetchExerciseDB(): Promise<ExerciseDBEntry[]> {
  const response = await fetch(`${BASE_URL}/exercises?limit=1400&offset=0`, {
    headers: {
      "X-RapidAPI-Key": API_KEY!,
      "X-RapidAPI-Host": "exercisedb.p.rapidapi.com",
    },
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

async function main() {
  console.log("Fetching ExerciseDB exercises...");
  const dbExercises = await fetchExerciseDB();
  console.log(`Fetched ${dbExercises.length} exercises from ExerciseDB`);

  // Only refresh media associations that have already been reviewed by ID.
  // Names, modes, equipment and UUIDs remain the curated source of truth.
  const byId = new Map(dbExercises.map(entry => [entry.id, entry]));
  const catalog: CatalogEntry[] = loadCatalog().map(target => {
    const media = target.exercisedb_id ? byId.get(target.exercisedb_id) : undefined;
    return media ? { ...target, gif_url: media.gifUrl } : target;
  });

  const matched = catalog.filter((e) => e.exercisedb_id).length;
  const unmatched = catalog.filter((e) => !e.exercisedb_id).length;

  console.log(`\nCatalog: ${catalog.length} exercises (${matched} matched, ${unmatched} unmatched)`);

  writeFileSync(
    "lib/exercisedb/exercise-catalog.json",
    JSON.stringify(catalog, null, 2)
  );
  console.log("Written to lib/exercisedb/exercise-catalog.json");
}

main().catch(console.error);
