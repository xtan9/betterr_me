import { describe, it, expect, vi, beforeEach } from "vitest";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetHabitsWithTodayStatus = vi.fn();
const mockGetHabitStats = vi.fn();
const mockToggleLog = vi.fn();
const mockCreateHabit = vi.fn();
const mockUpdateHabit = vi.fn();
const mockPauseHabit = vi.fn();
const mockResumeHabit = vi.fn();
const mockArchiveHabit = vi.fn();
const mockDeleteHabit = vi.fn();
const mockGetHabit = vi.fn();
const mockGetDetailedHabitStats = vi.fn();

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
    getHabit = mockGetHabit;
    createHabit = mockCreateHabit;
    updateHabit = mockUpdateHabit;
    pauseHabit = mockPauseHabit;
    resumeHabit = mockResumeHabit;
    archiveHabit = mockArchiveHabit;
    deleteHabit = mockDeleteHabit;
  },
  HabitLogsDB: class {
    getHabitStats = mockGetHabitStats;
    toggleLog = mockToggleLog;
    getDetailedHabitStats = mockGetDetailedHabitStats;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return habitTools().find((t) => t.name === name)!;
}

describe("habitTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 10 tool definitions", () => {
    const tools = habitTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((t) => t.name)).toEqual([
      "getHabitsToday",
      "getHabitStats",
      "logHabit",
      "createHabit",
      "updateHabit",
      "pauseHabit",
      "resumeHabit",
      "archiveHabit",
      "deleteHabit",
      "getDetailedHabitStats",
    ]);
  });

  it("getHabitsToday calls HabitsDB.getHabitsWithTodayStatus", async () => {
    const ctx = makeCtx();
    mockGetHabitsWithTodayStatus.mockResolvedValue([
      { id: "h1", name: "Meditate", completed_today: true },
    ]);
    const result = await findTool("getHabitsToday").execute(
      { date: "2026-04-10" },
      ctx,
    );
    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith(
      "user-123",
      "2026-04-10",
    );
    expect(result).toEqual([
      { id: "h1", name: "Meditate", completed_today: true },
    ]);
  });

  it("logHabit calls HabitLogsDB.toggleLog", async () => {
    const ctx = makeCtx();
    mockToggleLog.mockResolvedValue({
      log: { completed: true },
      currentStreak: 5,
      bestStreak: 10,
    });
    const result = await findTool("logHabit").execute(
      { habitId: "h1", date: "2026-04-10" },
      ctx,
    );
    expect(mockToggleLog).toHaveBeenCalledWith("h1", "user-123", "2026-04-10");
    expect(result).toEqual({
      log: { completed: true },
      currentStreak: 5,
      bestStreak: 10,
    });
  });

  it("createHabit calls HabitsDB.createHabit with correct params", async () => {
    const ctx = makeCtx();
    mockCreateHabit.mockResolvedValue({ id: "h2", name: "Read" });
    const result = await findTool("createHabit").execute(
      { name: "Read", frequency: { type: "daily" } },
      ctx,
    );
    expect(mockCreateHabit).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "Read",
      description: null,
      frequency: { type: "daily" },
      category_id: null,
      status: "active",
    });
    expect(result).toEqual({ id: "h2", name: "Read" });
  });

  it("updateHabit transforms camelCase to snake_case and removes undefined", async () => {
    const ctx = makeCtx();
    mockUpdateHabit.mockResolvedValue({ id: "h1", name: "Meditate more" });
    await findTool("updateHabit").execute(
      { habitId: "h1", name: "Meditate more", categoryId: "cat-1" },
      ctx,
    );
    expect(mockUpdateHabit).toHaveBeenCalledWith("h1", "user-123", {
      name: "Meditate more",
      category_id: "cat-1",
    });
  });

  it("pauseHabit calls HabitsDB.pauseHabit", async () => {
    const ctx = makeCtx();
    mockPauseHabit.mockResolvedValue({ id: "h1", status: "paused" });
    await findTool("pauseHabit").execute({ habitId: "h1" }, ctx);
    expect(mockPauseHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("resumeHabit calls HabitsDB.resumeHabit", async () => {
    const ctx = makeCtx();
    mockResumeHabit.mockResolvedValue({ id: "h1", status: "active" });
    await findTool("resumeHabit").execute({ habitId: "h1" }, ctx);
    expect(mockResumeHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("archiveHabit calls HabitsDB.archiveHabit", async () => {
    const ctx = makeCtx();
    mockArchiveHabit.mockResolvedValue({ id: "h1", status: "archived" });
    await findTool("archiveHabit").execute({ habitId: "h1" }, ctx);
    expect(mockArchiveHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("deleteHabit verifies existence then deletes", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue({ id: "h1" });
    mockDeleteHabit.mockResolvedValue(undefined);
    const result = await findTool("deleteHabit").execute(
      { habitId: "h1" },
      ctx,
    );
    expect(mockGetHabit).toHaveBeenCalledWith("h1", "user-123");
    expect(mockDeleteHabit).toHaveBeenCalledWith("h1", "user-123");
    expect(result).toEqual({ success: true });
  });

  it("deleteHabit returns error when not found", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue(null);
    const result = await findTool("deleteHabit").execute(
      { habitId: "h999" },
      ctx,
    );
    expect(result).toEqual({ error: "Habit not found" });
    expect(mockDeleteHabit).not.toHaveBeenCalled();
  });

  it("getDetailedHabitStats fetches habit then gets detailed stats", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue({
      id: "h1",
      frequency: { type: "daily" },
      created_at: "2026-01-01",
    });
    const stats = {
      thisWeek: { completed: 5, total: 7, percent: 71 },
      thisMonth: { completed: 20, total: 30, percent: 67 },
      allTime: { completed: 100, total: 150, percent: 67 },
    };
    mockGetDetailedHabitStats.mockResolvedValue(stats);
    const result = await findTool("getDetailedHabitStats").execute(
      { habitId: "h1" },
      ctx,
    );
    expect(mockGetHabit).toHaveBeenCalledWith("h1", "user-123");
    expect(mockGetDetailedHabitStats).toHaveBeenCalledWith(
      "h1",
      "user-123",
      { type: "daily" },
      "2026-01-01",
    );
    expect(result).toEqual(stats);
  });

  it("getDetailedHabitStats returns error when habit not found", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue(null);
    const result = await findTool("getDetailedHabitStats").execute(
      { habitId: "h999" },
      ctx,
    );
    expect(result).toEqual({ error: "Habit not found" });
  });
});
