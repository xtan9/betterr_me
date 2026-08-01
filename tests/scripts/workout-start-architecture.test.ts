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

describe("Workout start mutation architecture boundaries", () => {
  it("routes the blank HTTP start through WorkoutWrites", () => {
    const route = source("app/api/workouts/route.ts");
    const post = section(route, "export async function POST", "\n}");

    expect(post).toContain("createWorkoutWrites(supabase).start");
    expect(post).not.toMatch(/new WorkoutsDB|\.startWorkout\(/);
    expect(post).not.toMatch(/code === ["']23505["']/);
  });

  it("routes routine HTTP starts through the same WorkoutWrites seam", () => {
    const route = source("app/api/routines/[id]/start/route.ts");

    expect(route).toContain("createWorkoutWrites(supabase).start");
    expect(route).not.toContain("createRoutineWorkoutRequests");
    expect(route).not.toMatch(/\.startWorkout\(|code === ["']23505["']/);
  });

  it("routes AI blank and routine starts through WorkoutWrites and preserves confirmation", () => {
    const tools = source("lib/ai/tools/workouts.ts");
    const start = section(tools, 'name: "startWorkout"', 'name: "completeWorkout"');

    expect(start).toContain("createWorkoutWrites(ctx.supabase).start");
    expect(start).toContain("Always confirm with the user first");
    expect(start).not.toMatch(/new WorkoutsDB|\.startWorkout\(/);
  });

  it("keeps workout start out of the generic database write inventory", () => {
    const workoutsDb = source("lib/db/workouts.ts");
    const routineRequests = source("lib/fitness/routine-workout-requests.ts");

    expect(workoutsDb).not.toMatch(/async startWorkout\s*\(/);
    expect(workoutsDb).not.toContain("StartWorkoutInput");
    expect(routineRequests).not.toMatch(/async start\s*\(/);
  });
});
