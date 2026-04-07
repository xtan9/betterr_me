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

    const status = matched ? `\u2713 ${match.name} (${(confidence * 100).toFixed(0)}%)` : `\u2717 no match (best: ${result.bestMatch.target} at ${(confidence * 100).toFixed(0)}%)`;
    console.log(`  ${target.name} \u2192 ${status}`);
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
