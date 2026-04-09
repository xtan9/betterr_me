import { describe, it, expect, vi, beforeEach } from "vitest";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetHabitsWithTodayStatus = vi.fn();
const mockGetHabitStats = vi.fn();
const mockToggleLog = vi.fn();

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
  },
  HabitLogsDB: class {
    getHabitStats = mockGetHabitStats;
    toggleLog = mockToggleLog;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-08",
    timezone: "America/Toronto",
    ...overrides,
  };
}

describe("habitTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 3 tool definitions", () => {
    const tools = habitTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(["getHabitsToday", "getHabitStats", "logHabit"]);
  });

  it("getHabitsToday calls HabitsDB.getHabitsWithTodayStatus", async () => {
    const ctx = makeCtx();
    const tools = habitTools();
    const getHabitsToday = tools.find((t) => t.name === "getHabitsToday")!;
    mockGetHabitsWithTodayStatus.mockResolvedValue([{ id: "h1", name: "Meditate", completed_today: true }]);
    const result = await getHabitsToday.execute({ date: "2026-04-08" }, ctx);
    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith("user-123", "2026-04-08");
    expect(result).toEqual([{ id: "h1", name: "Meditate", completed_today: true }]);
  });

  it("logHabit calls HabitLogsDB.toggleLog", async () => {
    const ctx = makeCtx();
    const tools = habitTools();
    const logHabit = tools.find((t) => t.name === "logHabit")!;
    mockToggleLog.mockResolvedValue({ log: { completed: true }, currentStreak: 5, bestStreak: 10 });
    const result = await logHabit.execute({ habitId: "h1", date: "2026-04-08" }, ctx);
    expect(mockToggleLog).toHaveBeenCalledWith("h1", "user-123", "2026-04-08");
    expect(result).toEqual({ log: { completed: true }, currentStreak: 5, bestStreak: 10 });
  });
});
