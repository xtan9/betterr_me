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

describe("Habit detail mutation architecture boundaries", () => {
  it("routes HTTP detail edits through HabitWrites without a persistence bypass", () => {
    const route = source("app/api/habits/[id]/route.ts");
    const patch = section(
      route,
      "export async function PATCH",
      "/**\n * DELETE /api/habits/[id]",
    );

    expect(patch).toContain("createHabitWrites(supabase).update");
    expect(patch).not.toMatch(/habitsDB\.updateHabit/);
    expect(patch).not.toContain("HabitUpdate");
  });

  it("routes AI detail edits through HabitWrites without a persistence bypass", () => {
    const tools = source("lib/ai/tools/habits.ts");
    const update = section(tools, 'name: "updateHabit"', 'name: "pauseHabit"');

    expect(update).toContain("createHabitWrites(ctx.supabase).update");
    expect(update).not.toMatch(/new HabitsDB|\.updateHabit\(/);
  });

  it("keeps lifecycle status out of generic detail updates", () => {
    const validation = source("lib/validations/habit.ts");
    const updateSchema = section(
      validation,
      "export const habitUpdateSchema",
      "export type HabitUpdateValues",
    );

    expect(updateSchema).toContain(".strict()");
    expect(updateSchema).not.toContain("status");
  });

  it("keeps pause and resume on dedicated lifecycle routes", () => {
    const detail = source("components/habits/habit-detail-content.tsx");
    const pauseHandler = section(
      detail,
      "const handlePause = async () =>",
      "const handleGraduate = async () =>",
    );

    expect(pauseHandler).toContain('"pause"');
    expect(pauseHandler).toContain('"resume"');
    expect(pauseHandler).not.toContain('method: "PATCH"');
    expect(pauseHandler).not.toContain('status: "paused"');
    expect(pauseHandler).not.toContain('status: "active"');
  });

  it("routes HTTP lifecycle changes through HabitWrites", () => {
    const pauseRoute = source("app/api/habits/[id]/pause/route.ts");
    const resumeRoute = source("app/api/habits/[id]/resume/route.ts");

    expect(pauseRoute).toContain("createHabitWrites(supabase).pause");
    expect(resumeRoute).toContain("createHabitWrites(supabase).resume");
    expect(pauseRoute).not.toMatch(/new HabitsDB|\.pauseHabit\(/);
    expect(resumeRoute).not.toMatch(/new HabitsDB|\.resumeHabit\(/);
  });

  it("routes HTTP graduation through HabitWrites without a direct-write bypass", () => {
    const route = source("app/api/habits/[id]/graduate/route.ts");

    expect(route).toContain("createHabitWrites(supabase).graduate");
    expect(route).not.toMatch(/new HabitsDB|\.graduateHabit\(/);
  });

  it("routes HTTP reactivation through HabitWrites without a direct-write bypass", () => {
    const route = source("app/api/habits/[id]/reactivate/route.ts");

    expect(route).toContain("createHabitWrites(supabase).reactivate");
    expect(route).not.toMatch(/new HabitsDB|\.reactivateHabit\(/);
  });

  it("routes AI lifecycle changes through HabitWrites", () => {
    const tools = source("lib/ai/tools/habits.ts");
    const lifecycle = section(tools, 'name: "pauseHabit"', 'name: "graduateHabit"');

    expect(lifecycle).toContain("createHabitWrites(ctx.supabase).pause");
    expect(lifecycle).toContain("createHabitWrites(ctx.supabase).resume");
    expect(lifecycle).not.toMatch(/new HabitsDB|\.pauseHabit\(|\.resumeHabit\(/);
  });

  it("routes AI graduation through HabitWrites without a direct-write bypass", () => {
    const tools = source("lib/ai/tools/habits.ts");
    const graduation = section(tools, 'name: "graduateHabit"', 'name: "reactivateHabit"');

    expect(graduation).toContain("createHabitWrites(ctx.supabase).graduate");
    expect(graduation).not.toMatch(/new HabitsDB|\.graduateHabit\(/);
  });

  it("routes AI reactivation through HabitWrites without a direct-write bypass", () => {
    const tools = source("lib/ai/tools/habits.ts");
    const reactivation = section(tools, 'name: "reactivateHabit"', 'name: "deleteHabit"');

    expect(reactivation).toContain("createHabitWrites(ctx.supabase).reactivate");
    expect(reactivation).not.toMatch(/new HabitsDB|\.reactivateHabit\(/);
  });

  it("routes HTTP deletion through HabitWrites without a direct-write bypass", () => {
    const route = source("app/api/habits/[id]/route.ts");
    const deletion = section(route, "export async function DELETE", "\n}");

    expect(deletion).toContain("createHabitWrites(supabase).delete");
    expect(deletion).not.toMatch(/new HabitsDB|\.deleteHabit\(/);
  });

  it("routes AI deletion through HabitWrites without losing confirmation", () => {
    const tools = source("lib/ai/tools/habits.ts");
    const deletion = section(tools, 'name: "deleteHabit"', 'name: "getDetailedHabitStats"');

    expect(deletion).toContain("createHabitWrites(ctx.supabase).delete");
    expect(deletion).toContain("Always confirm with the user first");
    expect(deletion).not.toMatch(/new HabitsDB|\.deleteHabit\(/);
  });

  it("keeps lifecycle and graduation writes out of the generic database inventory", () => {
    const habitsDb = source("lib/db/habits.ts");

    expect(habitsDb).not.toMatch(/async pauseHabit\s*\(/);
    expect(habitsDb).not.toMatch(/async resumeHabit\s*\(/);
    expect(habitsDb).not.toMatch(/async graduateHabit\s*\(/);
    expect(habitsDb).not.toMatch(/async reactivateHabit\s*\(/);
    expect(habitsDb).not.toMatch(/async deleteHabit\s*\(/);
  });
});
