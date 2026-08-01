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
});
