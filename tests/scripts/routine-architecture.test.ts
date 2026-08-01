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

describe("Routine mutation architecture boundaries", () => {
  it("routes routine creation through RoutineWrites while keeping GET query-only", () => {
    const route = source("app/api/routines/route.ts");
    const post = section(route, "export async function POST", "  } catch");

    expect(post).toContain("createRoutineWrites(supabase).create");
    expect(post).not.toMatch(/new RoutinesDB|\.createRoutine\(/);
    expect(route).toContain("new RoutinesDB(supabase)");
  });

  it("routes routine update and deletion through RoutineWrites", () => {
    const route = source("app/api/routines/[id]/route.ts");
    const patch = section(route, "export async function PATCH", "  } catch");
    const deletion = section(route, "export async function DELETE", "  } catch");

    expect(patch).toContain("createRoutineWrites(supabase).update");
    expect(patch).not.toMatch(/new RoutinesDB|\.updateRoutine\(/);
    expect(deletion).toContain("createRoutineWrites(supabase).delete");
    expect(deletion).not.toMatch(/new RoutinesDB|\.deleteRoutine\(/);
  });

  it("routes routine-exercise mutations through RoutineWrites", () => {
    const collection = source("app/api/routines/[id]/exercises/route.ts");
    const item = source("app/api/routines/[id]/exercises/[reId]/route.ts");
    const add = section(collection, "export async function POST", "  } catch");
    const update = section(item, "export async function PATCH", "  } catch");
    const remove = section(item, "export async function DELETE", "  } catch");

    expect(add).toContain("createRoutineWrites(supabase).addExercise");
    expect(update).toContain("createRoutineWrites(supabase).updateExercise");
    expect(remove).toContain("createRoutineWrites(supabase).removeExercise");
    for (const mutation of [add, update, remove]) {
      expect(mutation).not.toMatch(/new RoutinesDB|\.(?:add|update|remove)RoutineExercise\(/);
    }
    expect(collection).toContain("new RoutinesDB(supabase)");
  });

  it("keeps routine exercise requests storage-independent", () => {
    const writes = source("lib/fitness/routine-writes.ts");
    const requestStart = writes.indexOf("export interface RoutineExerciseInput");
    const requestEnd = writes.indexOf("export interface RoutineExerciseRemovalRequest");
    const request = writes.slice(requestStart, requestEnd);

    expect(request).toContain("exerciseId");
    expect(request).toContain("targetSets");
    expect(request).toContain("sortOrder");
    expect(request).not.toContain("exercise_id");
    expect(request).not.toContain("target_sets");
    expect(request).not.toContain("sort_order");
  });
});
