import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find architecture section ${start}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("Active workout editing architecture boundaries", () => {
  it("routes workout detail changes through WorkoutWrites", () => {
    const route = source("app/api/workouts/[id]/route.ts");
    const patch = section(route, "export async function PATCH", "\n}");

    expect(patch).toContain("createWorkoutWrites(supabase)");
    expect(patch).toContain("writes.update");
    expect(patch).toContain("writes.complete");
    expect(patch).toContain("writes.discard");
    expect(patch).not.toMatch(/new WorkoutsDB|\.updateWorkout\(/);
  });

  it("routes exercise and set changes through WorkoutWrites", () => {
    const exerciseAdd = source("app/api/workouts/[id]/exercises/route.ts");
    const exerciseEdit = source("app/api/workouts/[id]/exercises/[weId]/route.ts");
    const setAdd = source("app/api/workouts/[id]/exercises/[weId]/sets/route.ts");
    const setEdit = source(
      "app/api/workouts/[id]/exercises/[weId]/sets/[setId]/route.ts",
    );

    expect(exerciseAdd).toContain("createWorkoutWrites(supabase).addExercise");
    expect(exerciseEdit).toContain("createWorkoutWrites(supabase).updateExercise");
    expect(exerciseEdit).toContain("createWorkoutWrites(supabase).removeExercise");
    expect(setAdd).toContain("createWorkoutWrites(supabase).addSet");
    expect(setEdit).toContain("createWorkoutWrites(supabase).updateSet");
    expect(setEdit).toContain("createWorkoutWrites(supabase).removeSet");

    for (const route of [exerciseAdd, exerciseEdit, setAdd, setEdit]) {
      expect(route).not.toContain("WorkoutExercisesDB");
      expect(route).not.toContain("@/lib/db/workout-exercises");
    }
  });

  it("routes the AI completion write through the same mutation boundary", () => {
    const tools = source("lib/ai/tools/workouts.ts");
    const completion = section(tools, 'name: "completeWorkout"', 'name: "getWorkoutDetails"');

    expect(completion).toContain("createWorkoutWrites(ctx.supabase).complete");
    expect(completion).not.toMatch(/\.updateWorkout\(/);
  });

  it("keeps active workout write methods out of generic database modules", () => {
    const workoutsDb = source("lib/db/workouts.ts");
    const workoutExercisesDb = source("lib/db/workout-exercises.ts");

    expect(workoutsDb).not.toMatch(/async updateWorkout\s*\(/);
    expect(workoutsDb).not.toMatch(/async completeWorkout\s*\(/);
    expect(workoutsDb).not.toMatch(/async discardWorkout\s*\(/);
    expect(workoutExercisesDb).not.toMatch(/export\s+(?:class|function|const)\s+\w+/);
  });
});
