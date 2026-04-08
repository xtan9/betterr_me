# Exercise Library Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand from 92 → ~400 preset exercises with self-hosted GIFs in Supabase Storage.

**Architecture:** Static catalog JSON (curated from Hevy reference + ExerciseDB matches) drives the sync. Admin tool reads catalog, upserts exercises, downloads GIFs to Supabase Storage, and stores local URLs in exercise_media. Existing 92 presets migrated in-place to preserve user data.

**Tech Stack:** Supabase Storage (GIF hosting), ExerciseDB RapidAPI (GIF source), string-similarity (fuzzy matching), Next.js API routes, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/exercisedb/exercise-catalog.json` | Static mapping of ~400 exercises → ExerciseDB IDs |
| `lib/exercisedb/catalog.ts` | Load and validate the catalog JSON |
| `lib/supabase/storage.ts` | Upload files to Supabase Storage bucket |
| `lib/exercisedb/gif-downloader.ts` | Download GIF from ExerciseDB, upload to Supabase Storage |
| `app/api/admin/sync-exercise-media/route.ts` | Updated: catalog-based sync with GIF download + storage upload |
| `components/admin/admin-dashboard-content.tsx` | Updated: progress indicator during sync |

---

### Task 1: Build the Exercise Catalog JSON

This is the curation task — research Hevy's ~400 exercises and match each to ExerciseDB.

**Files:**
- Create: `lib/exercisedb/exercise-catalog.json`
- Create: `scripts/build-exercise-catalog.ts` (one-time build script)

- [ ] **Step 1: Create the catalog build script**

This script fetches all ExerciseDB exercises, then for each exercise in our target list (based on Hevy's categories), finds the best ExerciseDB match. It outputs the catalog JSON.

Create `scripts/build-exercise-catalog.ts`:

```ts
/**
 * One-time script to build exercise-catalog.json.
 * 
 * Usage: EXERCISEDB_API_KEY=xxx npx tsx scripts/build-exercise-catalog.ts
 * 
 * Fetches all ExerciseDB exercises, matches against our target exercise list,
 * and outputs the catalog JSON file.
 */

import { writeFileSync } from "fs";
import { findBestMatch } from "string-similarity";

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

interface CatalogEntry {
  name: string;
  muscle_group_primary: string;
  muscle_groups_secondary: string[];
  equipment: string;
  exercise_type: string;
  exercisedb_id: string | null;
  exercisedb_name: string | null;
  gif_url: string | null;
}

// Map ExerciseDB bodyPart/target to our muscle groups
const MUSCLE_MAP: Record<string, string> = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  "upper arms": "biceps",
  "lower arms": "forearms",
  waist: "core",
  "upper legs": "quadriceps",
  "lower legs": "calves",
  cardio: "cardio",
  neck: "traps",
};

const TARGET_REFINEMENT: Record<string, string> = {
  biceps: "biceps",
  triceps: "triceps",
  lats: "lats",
  traps: "traps",
  glutes: "glutes",
  hamstrings: "hamstrings",
  quads: "quadriceps",
  calves: "calves",
  abs: "core",
  forearms: "forearms",
};

// Map ExerciseDB equipment to our equipment enum
const EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  "cable": "cable",
  "leverage machine": "machine",
  "smith machine": "machine",
  "sled machine": "machine",
  kettlebell: "kettlebell",
  band: "band",
  "body weight": "bodyweight",
  assisted: "machine",
  weighted: "bodyweight",
  "ez barbell": "barbell",
  "olympic barbell": "barbell",
  "trap bar": "barbell",
  rope: "cable",
  "resistance band": "band",
  medicine_ball: "other",
  bosu_ball: "other",
  stability_ball: "other",
  roller: "other",
  "": "none",
};

function mapMuscle(bodyPart: string, target: string): string {
  return TARGET_REFINEMENT[target] || MUSCLE_MAP[bodyPart] || "other";
}

function mapEquip(eq: string): string {
  return EQUIPMENT_MAP[eq] || "other";
}

// Determine exercise_type based on equipment and muscle group
function inferExerciseType(equipment: string, muscleGroup: string): string {
  if (muscleGroup === "cardio") return "distance_duration";
  if (equipment === "bodyweight") return "bodyweight_reps";
  return "weight_reps";
}

// Target exercise list — curated based on Hevy's ~400 exercise library.
// Organized by muscle group. Each entry is a name we want in our catalog.
const TARGET_EXERCISES: Array<{
  name: string;
  muscle_group_primary: string;
  muscle_groups_secondary: string[];
  equipment: string;
  exercise_type: string;
}> = [
  // === CHEST (25) ===
  { name: "Barbell Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Incline Barbell Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Decline Barbell Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Incline Dumbbell Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Decline Dumbbell Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Fly", muscle_group_primary: "chest", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Incline Dumbbell Fly", muscle_group_primary: "chest", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Cable Crossover", muscle_group_primary: "chest", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Low Cable Crossover", muscle_group_primary: "chest", muscle_groups_secondary: ["shoulders"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Machine Chest Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Pec Deck Machine", muscle_group_primary: "chest", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Push Up", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders", "core"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Decline Push Up", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Diamond Push Up", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Chest Dip", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Smith Machine Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps", "shoulders"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Landmine Press", muscle_group_primary: "chest", muscle_groups_secondary: ["shoulders", "triceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Svend Press", muscle_group_primary: "chest", muscle_groups_secondary: [], equipment: "other", exercise_type: "weight_reps" },
  { name: "Close Grip Bench Press", muscle_group_primary: "chest", muscle_groups_secondary: ["triceps"], equipment: "barbell", exercise_type: "weight_reps" },
  // === BACK (25) ===
  { name: "Barbell Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "lats"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Pendlay Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "lats"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "lats"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "T-Bar Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "lats"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Seated Cable Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "lats"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Face Pull", muscle_group_primary: "back", muscle_groups_secondary: ["shoulders"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Machine Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Inverted Row", muscle_group_primary: "back", muscle_groups_secondary: ["biceps", "core"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Superman", muscle_group_primary: "back", muscle_groups_secondary: ["glutes"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Back Extension", muscle_group_primary: "back", muscle_groups_secondary: ["glutes", "hamstrings"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === LATS (15) ===
  { name: "Pull Up", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps", "back"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Chin Up", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps", "back"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Lat Pulldown", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Wide Grip Lat Pulldown", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Close Grip Lat Pulldown", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Straight Arm Pulldown", muscle_group_primary: "lats", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Cable Pullover", muscle_group_primary: "lats", muscle_groups_secondary: ["chest"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Dumbbell Pullover", muscle_group_primary: "lats", muscle_groups_secondary: ["chest"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Assisted Pull Up", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps"], equipment: "machine", exercise_type: "assisted_bodyweight" },
  { name: "Neutral Grip Pull Up", muscle_group_primary: "lats", muscle_groups_secondary: ["biceps"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === SHOULDERS (25) ===
  { name: "Overhead Press", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Shoulder Press", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Arnold Press", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Lateral Raise", muscle_group_primary: "shoulders", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Cable Lateral Raise", muscle_group_primary: "shoulders", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Front Raise", muscle_group_primary: "shoulders", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Reverse Fly", muscle_group_primary: "shoulders", muscle_groups_secondary: ["back"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Cable Reverse Fly", muscle_group_primary: "shoulders", muscle_groups_secondary: ["back"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Upright Row", muscle_group_primary: "shoulders", muscle_groups_secondary: ["traps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Machine Shoulder Press", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Pike Push Up", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps", "chest"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Handstand Push Up", muscle_group_primary: "shoulders", muscle_groups_secondary: ["triceps"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Barbell Shrug", muscle_group_primary: "shoulders", muscle_groups_secondary: ["traps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Shrug", muscle_group_primary: "shoulders", muscle_groups_secondary: ["traps"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Lu Raise", muscle_group_primary: "shoulders", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  // === BICEPS (15) ===
  { name: "Barbell Curl", muscle_group_primary: "biceps", muscle_groups_secondary: ["forearms"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "EZ Bar Curl", muscle_group_primary: "biceps", muscle_groups_secondary: ["forearms"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Curl", muscle_group_primary: "biceps", muscle_groups_secondary: ["forearms"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Hammer Curl", muscle_group_primary: "biceps", muscle_groups_secondary: ["forearms"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Incline Dumbbell Curl", muscle_group_primary: "biceps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Concentration Curl", muscle_group_primary: "biceps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Preacher Curl", muscle_group_primary: "biceps", muscle_groups_secondary: [], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Cable Curl", muscle_group_primary: "biceps", muscle_groups_secondary: ["forearms"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Machine Bicep Curl", muscle_group_primary: "biceps", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Spider Curl", muscle_group_primary: "biceps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  // === TRICEPS (15) ===
  { name: "Tricep Pushdown", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Overhead Tricep Extension", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Skull Crusher", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Tricep Extension", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Tricep Kickback", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Dip", muscle_group_primary: "triceps", muscle_groups_secondary: ["chest", "shoulders"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Bench Dip", muscle_group_primary: "triceps", muscle_groups_secondary: ["chest", "shoulders"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Machine Tricep Dip", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Rope Pushdown", muscle_group_primary: "triceps", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Close Grip Push Up", muscle_group_primary: "triceps", muscle_groups_secondary: ["chest"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === FOREARMS (8) ===
  { name: "Wrist Curl", muscle_group_primary: "forearms", muscle_groups_secondary: [], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Reverse Wrist Curl", muscle_group_primary: "forearms", muscle_groups_secondary: [], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Reverse Barbell Curl", muscle_group_primary: "forearms", muscle_groups_secondary: ["biceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Farmer's Walk", muscle_group_primary: "forearms", muscle_groups_secondary: ["traps", "core"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Dead Hang", muscle_group_primary: "forearms", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "duration" },
  { name: "Plate Pinch", muscle_group_primary: "forearms", muscle_groups_secondary: [], equipment: "other", exercise_type: "duration" },
  // === QUADRICEPS (20) ===
  { name: "Barbell Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "hamstrings", "core"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Front Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "core"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Goblet Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "core"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Hack Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Leg Press", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "hamstrings"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Leg Extension", muscle_group_primary: "quadriceps", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Bulgarian Split Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Lunge", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "hamstrings"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Walking Lunge", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "hamstrings"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Step Up", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Sissy Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Wall Sit", muscle_group_primary: "quadriceps", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "duration" },
  { name: "Smith Machine Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes"], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Pistol Squat", muscle_group_primary: "quadriceps", muscle_groups_secondary: ["glutes", "core"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === HAMSTRINGS (12) ===
  { name: "Romanian Deadlift", muscle_group_primary: "hamstrings", muscle_groups_secondary: ["glutes", "back"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Romanian Deadlift", muscle_group_primary: "hamstrings", muscle_groups_secondary: ["glutes", "back"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Leg Curl", muscle_group_primary: "hamstrings", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Seated Leg Curl", muscle_group_primary: "hamstrings", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Good Morning", muscle_group_primary: "hamstrings", muscle_groups_secondary: ["back", "glutes"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Nordic Curl", muscle_group_primary: "hamstrings", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Glute Ham Raise", muscle_group_primary: "hamstrings", muscle_groups_secondary: ["glutes"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Single Leg Deadlift", muscle_group_primary: "hamstrings", muscle_groups_secondary: ["glutes", "core"], equipment: "dumbbell", exercise_type: "weight_reps" },
  // === GLUTES (12) ===
  { name: "Hip Thrust", muscle_group_primary: "glutes", muscle_groups_secondary: ["hamstrings"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Barbell Hip Thrust", muscle_group_primary: "glutes", muscle_groups_secondary: ["hamstrings"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Glute Bridge", muscle_group_primary: "glutes", muscle_groups_secondary: ["hamstrings"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Cable Pull Through", muscle_group_primary: "glutes", muscle_groups_secondary: ["hamstrings"], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Sumo Deadlift", muscle_group_primary: "glutes", muscle_groups_secondary: ["hamstrings", "back", "quadriceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Hip Abduction Machine", muscle_group_primary: "glutes", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Cable Kickback", muscle_group_primary: "glutes", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Donkey Kick", muscle_group_primary: "glutes", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Fire Hydrant", muscle_group_primary: "glutes", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Clamshell", muscle_group_primary: "glutes", muscle_groups_secondary: [], equipment: "band", exercise_type: "weight_reps" },
  // === CALVES (8) ===
  { name: "Standing Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Seated Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Dumbbell Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Leg Press Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "machine", exercise_type: "weight_reps" },
  { name: "Bodyweight Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Single Leg Calf Raise", muscle_group_primary: "calves", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === CORE (20) ===
  { name: "Crunch", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Bicycle Crunch", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Plank", muscle_group_primary: "core", muscle_groups_secondary: ["shoulders"], equipment: "bodyweight", exercise_type: "duration" },
  { name: "Side Plank", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "duration" },
  { name: "Hanging Leg Raise", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Hanging Knee Raise", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Cable Crunch", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Ab Rollout", muscle_group_primary: "core", muscle_groups_secondary: ["shoulders"], equipment: "other", exercise_type: "bodyweight_reps" },
  { name: "Russian Twist", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Mountain Climber", muscle_group_primary: "core", muscle_groups_secondary: ["shoulders", "quadriceps"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Leg Raise", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Flutter Kick", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "V-Up", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Dead Bug", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Pallof Press", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Woodchop", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Decline Sit Up", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Toe Touch", muscle_group_primary: "core", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  // === TRAPS (8) ===
  { name: "Barbell Shrug", muscle_group_primary: "traps", muscle_groups_secondary: [], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Dumbbell Shrug", muscle_group_primary: "traps", muscle_groups_secondary: [], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Cable Shrug", muscle_group_primary: "traps", muscle_groups_secondary: [], equipment: "cable", exercise_type: "weight_reps" },
  { name: "Rack Pull", muscle_group_primary: "traps", muscle_groups_secondary: ["back", "glutes"], equipment: "barbell", exercise_type: "weight_reps" },
  // === FULL BODY (15) ===
  { name: "Deadlift", muscle_group_primary: "full_body", muscle_groups_secondary: ["back", "glutes", "hamstrings", "quadriceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Clean and Press", muscle_group_primary: "full_body", muscle_groups_secondary: ["shoulders", "quadriceps", "back"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Power Clean", muscle_group_primary: "full_body", muscle_groups_secondary: ["back", "shoulders", "quadriceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Snatch", muscle_group_primary: "full_body", muscle_groups_secondary: ["shoulders", "back", "quadriceps"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Thruster", muscle_group_primary: "full_body", muscle_groups_secondary: ["quadriceps", "shoulders", "core"], equipment: "barbell", exercise_type: "weight_reps" },
  { name: "Turkish Get Up", muscle_group_primary: "full_body", muscle_groups_secondary: ["shoulders", "core"], equipment: "kettlebell", exercise_type: "weight_reps" },
  { name: "Kettlebell Swing", muscle_group_primary: "full_body", muscle_groups_secondary: ["glutes", "hamstrings", "core"], equipment: "kettlebell", exercise_type: "weight_reps" },
  { name: "Burpee", muscle_group_primary: "full_body", muscle_groups_secondary: ["chest", "quadriceps", "core"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Man Maker", muscle_group_primary: "full_body", muscle_groups_secondary: ["chest", "shoulders", "back"], equipment: "dumbbell", exercise_type: "weight_reps" },
  { name: "Battle Rope", muscle_group_primary: "full_body", muscle_groups_secondary: ["shoulders", "core"], equipment: "other", exercise_type: "duration" },
  { name: "Sled Push", muscle_group_primary: "full_body", muscle_groups_secondary: ["quadriceps", "glutes"], equipment: "other", exercise_type: "duration" },
  // === CARDIO (15) ===
  { name: "Treadmill Running", muscle_group_primary: "cardio", muscle_groups_secondary: [], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Cycling", muscle_group_primary: "cardio", muscle_groups_secondary: ["quadriceps"], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Elliptical", muscle_group_primary: "cardio", muscle_groups_secondary: [], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Rowing Machine", muscle_group_primary: "cardio", muscle_groups_secondary: ["back", "biceps"], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Stair Climber", muscle_group_primary: "cardio", muscle_groups_secondary: ["quadriceps", "glutes"], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Jump Rope", muscle_group_primary: "cardio", muscle_groups_secondary: ["calves", "shoulders"], equipment: "other", exercise_type: "duration" },
  { name: "Jumping Jack", muscle_group_primary: "cardio", muscle_groups_secondary: [], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Box Jump", muscle_group_primary: "cardio", muscle_groups_secondary: ["quadriceps", "glutes"], equipment: "other", exercise_type: "bodyweight_reps" },
  { name: "High Knees", muscle_group_primary: "cardio", muscle_groups_secondary: ["core", "quadriceps"], equipment: "bodyweight", exercise_type: "bodyweight_reps" },
  { name: "Sprints", muscle_group_primary: "cardio", muscle_groups_secondary: ["quadriceps", "hamstrings", "glutes"], equipment: "none", exercise_type: "distance_duration" },
  { name: "Swimming", muscle_group_primary: "cardio", muscle_groups_secondary: ["back", "shoulders"], equipment: "none", exercise_type: "distance_duration" },
  { name: "Assault Bike", muscle_group_primary: "cardio", muscle_groups_secondary: ["quadriceps"], equipment: "machine", exercise_type: "distance_duration" },
  { name: "Ski Erg", muscle_group_primary: "cardio", muscle_groups_secondary: ["lats", "core"], equipment: "machine", exercise_type: "distance_duration" },
];

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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

async function main() {
  console.log("Fetching ExerciseDB exercises...");
  const dbExercises = await fetchExerciseDB();
  console.log(`Fetched ${dbExercises.length} exercises from ExerciseDB`);

  const normalizedDbNames = dbExercises.map((e) => normalizeName(e.name));
  const catalog: CatalogEntry[] = [];

  for (const target of TARGET_EXERCISES) {
    const normalized = normalizeName(target.name);
    const result = findBestMatch(normalized, normalizedDbNames);
    const bestIdx = result.bestMatchIndex;
    const confidence = result.bestMatch.rating;
    const match = dbExercises[bestIdx];

    const matched = confidence >= 0.4;

    catalog.push({
      name: target.name,
      muscle_group_primary: target.muscle_group_primary,
      muscle_groups_secondary: target.muscle_groups_secondary,
      equipment: target.equipment,
      exercise_type: target.exercise_type,
      exercisedb_id: matched ? match.id : null,
      exercisedb_name: matched ? match.name : null,
      gif_url: matched ? match.gifUrl : null,
    });

    const status = matched ? `✓ ${match.name} (${(confidence * 100).toFixed(0)}%)` : `✗ no match (best: ${result.bestMatch.target} at ${(confidence * 100).toFixed(0)}%)`;
    console.log(`  ${target.name} → ${status}`);
  }

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
```

- [ ] **Step 2: Run the script to generate the catalog**

```bash
source .env.local && EXERCISEDB_API_KEY=27f39d7dc9mshfe8c95a663386bep130a33jsn8318cf22ca13 npx tsx scripts/build-exercise-catalog.ts
```

Expected: `exercise-catalog.json` created with ~250+ entries. Review the output for match quality. Manually adjust any mismatches in the JSON.

- [ ] **Step 3: Validate the catalog**

Verify the JSON is valid and has the expected structure:
```bash
node -e "const c = require('./lib/exercisedb/exercise-catalog.json'); console.log('Total:', c.length, 'Matched:', c.filter(e => e.exercisedb_id).length)"
```

- [ ] **Step 4: Commit**

```bash
git add lib/exercisedb/exercise-catalog.json scripts/build-exercise-catalog.ts
git commit -m "feat: build exercise catalog with ~400 exercises mapped to ExerciseDB"
```

---

### Task 2: Supabase Storage Upload Utility

**Files:**
- Create: `lib/supabase/storage.ts`
- Create: `tests/lib/supabase/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  })),
}));

import { uploadToStorage } from "@/lib/supabase/storage";

describe("uploadToStorage", () => {
  it("uploads buffer and returns public URL", async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/storage/v1/object/public/exercise-gifs/123.gif" },
    });

    const result = await uploadToStorage(
      "exercise-gifs",
      "123.gif",
      Buffer.from("fake-gif"),
      "image/gif"
    );

    expect(mockUpload).toHaveBeenCalledWith("123.gif", expect.any(Buffer), {
      contentType: "image/gif",
      upsert: true,
    });
    expect(result).toBe("https://example.com/storage/v1/object/public/exercise-gifs/123.gif");
  });

  it("throws on upload error", async () => {
    mockUpload.mockResolvedValue({ error: { message: "Bucket not found" } });

    await expect(
      uploadToStorage("exercise-gifs", "123.gif", Buffer.from("fake"), "image/gif")
    ).rejects.toThrow("Bucket not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- tests/lib/supabase/storage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `lib/supabase/storage.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Upload a file to a Supabase Storage bucket and return its public URL.
 *
 * @param bucket - Storage bucket name (e.g., "exercise-gifs")
 * @param path - File path within the bucket (e.g., "0001.gif")
 * @param data - File contents as Buffer
 * @param contentType - MIME type (e.g., "image/gif")
 * @returns Public URL of the uploaded file
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run -- tests/lib/supabase/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/storage.ts tests/lib/supabase/storage.test.ts
git commit -m "feat: add Supabase Storage upload utility"
```

---

### Task 3: GIF Downloader + Storage Uploader

**Files:**
- Create: `lib/exercisedb/gif-downloader.ts`
- Create: `tests/lib/exercisedb/gif-downloader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUploadToStorage = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  uploadToStorage: mockUploadToStorage,
}));

// Mock global fetch for GIF download
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { downloadAndStoreGif } from "@/lib/exercisedb/gif-downloader";

describe("downloadAndStoreGif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads GIF and uploads to Supabase Storage", async () => {
    const fakeGifBuffer = Buffer.from("fake-gif-data");
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeGifBuffer.buffer),
    });
    mockUploadToStorage.mockResolvedValue(
      "https://example.com/storage/v1/object/public/exercise-gifs/0025.gif"
    );

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(mockFetch).toHaveBeenCalledWith("https://v2.exercisedb.io/image/0025");
    expect(mockUploadToStorage).toHaveBeenCalledWith(
      "exercise-gifs",
      "0025.gif",
      expect.any(Buffer),
      "image/gif"
    );
    expect(url).toBe("https://example.com/storage/v1/object/public/exercise-gifs/0025.gif");
  });

  it("returns null on download failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(url).toBeNull();
  });

  it("returns null on upload failure", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("gif").buffer),
    });
    mockUploadToStorage.mockRejectedValue(new Error("Upload failed"));

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- tests/lib/exercisedb/gif-downloader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `lib/exercisedb/gif-downloader.ts`:

```ts
import { uploadToStorage } from "@/lib/supabase/storage";
import { log } from "@/lib/logger";

const BUCKET = "exercise-gifs";

/**
 * Download a GIF from ExerciseDB and upload it to Supabase Storage.
 *
 * @param exercisedbId - The ExerciseDB exercise ID (used as filename)
 * @param gifUrl - The ExerciseDB GIF URL to download
 * @returns Supabase Storage public URL, or null if download/upload failed
 */
export async function downloadAndStoreGif(
  exercisedbId: string,
  gifUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(gifUrl);
    if (!response.ok) {
      log.warn("GIF download failed", { exercisedbId, status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storagePath = `${exercisedbId}.gif`;

    const publicUrl = await uploadToStorage(BUCKET, storagePath, buffer, "image/gif");
    return publicUrl;
  } catch (error) {
    log.error("GIF download/upload error", error, { exercisedbId });
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run -- tests/lib/exercisedb/gif-downloader.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/exercisedb/gif-downloader.ts tests/lib/exercisedb/gif-downloader.test.ts
git commit -m "feat: add GIF downloader with Supabase Storage upload"
```

---

### Task 4: Catalog Loader Utility

**Files:**
- Create: `lib/exercisedb/catalog.ts`
- Create: `tests/lib/exercisedb/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadCatalog, type CatalogEntry } from "@/lib/exercisedb/catalog";

describe("loadCatalog", () => {
  it("loads and returns catalog entries", () => {
    const catalog = loadCatalog();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(100);
  });

  it("each entry has required fields", () => {
    const catalog = loadCatalog();
    for (const entry of catalog) {
      expect(entry.name).toBeTruthy();
      expect(entry.muscle_group_primary).toBeTruthy();
      expect(entry.equipment).toBeTruthy();
      expect(entry.exercise_type).toBeTruthy();
      expect(Array.isArray(entry.muscle_groups_secondary)).toBe(true);
    }
  });

  it("has entries with exercisedb_id (matched exercises)", () => {
    const catalog = loadCatalog();
    const matched = catalog.filter((e) => e.exercisedb_id !== null);
    expect(matched.length).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `lib/exercisedb/catalog.ts`:

```ts
import catalogData from "./exercise-catalog.json";

export interface CatalogEntry {
  name: string;
  muscle_group_primary: string;
  muscle_groups_secondary: string[];
  equipment: string;
  exercise_type: string;
  exercisedb_id: string | null;
  exercisedb_name: string | null;
  gif_url: string | null;
}

/**
 * Load the exercise catalog from the static JSON file.
 * This is the curated list of ~400 exercises with ExerciseDB mappings.
 */
export function loadCatalog(): CatalogEntry[] {
  return catalogData as CatalogEntry[];
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run -- tests/lib/exercisedb/catalog.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exercisedb/catalog.ts tests/lib/exercisedb/catalog.test.ts
git commit -m "feat: add catalog loader utility"
```

---

### Task 5: Update Sync Endpoint — Catalog-Based Sync with GIF Storage

**Files:**
- Modify: `app/api/admin/sync-exercise-media/route.ts`
- Modify: `tests/app/api/admin/sync-exercise-media.test.ts`

- [ ] **Step 1: Read existing files**

Read `app/api/admin/sync-exercise-media/route.ts` and `tests/app/api/admin/sync-exercise-media.test.ts` to understand current implementation.

- [ ] **Step 2: Rewrite the sync endpoint**

Replace the sync logic to use the catalog instead of pure fuzzy matching. The new flow:

1. Auth check (unchanged — `requireAdminApi` or secret header)
2. Load catalog from `exercise-catalog.json`
3. Fetch existing exercises from DB
4. For each catalog entry:
   a. Fuzzy-match to existing exercise by name → UPDATE if found (preserve ID)
   b. If no match → INSERT new exercise
   c. If `exercisedb_id` exists and GIF not already in Supabase Storage → download GIF, upload to storage
   d. Upsert `exercise_media` with Supabase Storage URL (not ExerciseDB CDN URL)
5. Return report with counts

The key difference from before: exercises are upserted from the catalog (not just media matched), and GIFs are downloaded to Supabase Storage.

The endpoint should accept `{ dryRun?: boolean, skipGifs?: boolean }` — `skipGifs` allows upserting exercises without downloading GIFs (fast, for testing).

- [ ] **Step 3: Update tests**

Update the test file to cover:
- Catalog-based sync creates new exercises
- Existing exercises are updated in-place (UUID preserved)
- GIF download + storage upload flow
- `dryRun` skips writes
- `skipGifs` skips GIF downloads
- Error handling for individual GIF failures (skip and continue)

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/app/api/admin/sync-exercise-media.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/sync-exercise-media/route.ts tests/app/api/admin/sync-exercise-media.test.ts
git commit -m "feat: catalog-based exercise sync with GIF storage upload"
```

---

### Task 6: Update Admin Dashboard UI — Progress Indicator

**Files:**
- Modify: `components/admin/admin-dashboard-content.tsx`

- [ ] **Step 1: Update the sync card**

Changes:
- Show "Syncing 45/400..." progress text (from API response streaming or poll)
- Add stats: "X exercises, Y with GIFs"
- The API doesn't stream, so show a spinner with "This may take a few minutes..." for GIF downloads
- Add `skipGifs` checkbox: "Skip GIF downloads (exercises only)"
- Update result display to show exercise counts alongside GIF counts

- [ ] **Step 2: Add i18n keys**

Add to all 3 locale files under `admin.sync`:

```json
"skipGifs": "Skip GIF downloads (exercises only)",
"exerciseCount": "{count} exercises in library",
"gifCount": "{count} exercises with GIFs",
"syncingLong": "Syncing exercises and downloading GIFs. This may take a few minutes..."
```

And Chinese translations in zh.json and zh-TW.json.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add components/admin/admin-dashboard-content.tsx i18n/messages/en.json i18n/messages/zh.json i18n/messages/zh-TW.json
git commit -m "feat: update admin sync UI with progress and GIF controls"
```

---

### Task 7: Create Supabase Storage Bucket + Full Test Run

- [ ] **Step 1: Create the storage bucket**

Create a migration or document manual step. The bucket needs to be created in Supabase dashboard or via CLI:

```bash
# This is a manual step — create in Supabase dashboard:
# Storage → New Bucket → Name: "exercise-gifs" → Public: Yes
```

Alternatively, create via the admin API in the sync endpoint itself (auto-create if missing).

- [ ] **Step 2: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: final cleanup for exercise library expansion"
```
