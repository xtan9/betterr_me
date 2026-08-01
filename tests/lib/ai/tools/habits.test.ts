import { describe, it, expect, vi, beforeEach } from "vitest";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetHabitsWithTodayStatus = vi.fn();
const mockGetHabitStats = vi.fn();
const mockComplete = vi.fn();
const mockUncomplete = vi.fn();
const mockCreateHabit = vi.fn();
const {
  mockCreateHabitWrite,
  mockUpdateHabitWrite,
  mockToHabitResponse,
} = vi.hoisted(() => ({
  mockCreateHabitWrite: vi.fn(),
  mockUpdateHabitWrite: vi.fn(),
  mockToHabitResponse: vi.fn(),
}));
const mockUpdateHabit = vi.fn();
const mockPauseHabit = vi.fn();
const mockResumeHabit = vi.fn();
const mockGraduateHabit = vi.fn();
const mockReactivateHabit = vi.fn();
const mockDeleteHabitWrite = vi.fn();
const mockGetHabit = vi.fn();
const mockGetDetailedHabitStats = vi.fn();

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
    getHabit = mockGetHabit;
    createHabit = mockCreateHabit;
    updateHabit = mockUpdateHabit;
  },
  HabitLogsDB: class {
    getHabitStats = mockGetHabitStats;
    getDetailedHabitStats = mockGetDetailedHabitStats;
  },
}));

vi.mock("@/lib/habits/completion", () => ({
  createHabitCompletion: vi.fn(() => ({
    complete: mockComplete,
    uncomplete: mockUncomplete,
  })),
}));

vi.mock("@/lib/habits/writes", () => ({
  createHabitWrites: vi.fn(() => ({
    create: mockCreateHabitWrite,
    update: mockUpdateHabitWrite,
    pause: mockPauseHabit,
    resume: mockResumeHabit,
    graduate: mockGraduateHabit,
    reactivate: mockReactivateHabit,
    delete: mockDeleteHabitWrite,
  })),
  toHabitResponse: mockToHabitResponse,
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

  it("returns 11 tool definitions", () => {
    const tools = habitTools();
    expect(tools).toHaveLength(11);
    expect(tools.map((t) => t.name)).toEqual([
      "getHabitsToday",
      "getHabitStats",
      "logHabit",
      "createHabit",
      "updateHabit",
      "pauseHabit",
      "resumeHabit",
      "graduateHabit",
      "reactivateHabit",
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

  it("logHabit completes a habit to an explicit desired state", async () => {
    const ctx = makeCtx();
    mockComplete.mockResolvedValue({
      log: { completed: true },
      completed: true,
      currentStreak: 5,
      bestStreak: 10,
      milestones: [],
    });
    const result = await findTool("logHabit").execute(
      { habitId: "h1", date: "2026-04-10", completed: true },
      ctx,
    );
    expect(mockComplete).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
      date: "2026-04-10",
    });
    expect(result).toEqual({
      log: { completed: true },
      completed: true,
      currentStreak: 5,
      bestStreak: 10,
      milestones: [],
    });
  });

  it("logHabit retries the same uncompleted state without toggling it", async () => {
    const ctx = makeCtx();
    mockUncomplete.mockResolvedValue({
      log: { completed: false },
      completed: false,
      currentStreak: 4,
      bestStreak: 10,
      milestones: [],
    });
    const params = {
      habitId: "h1",
      date: "2026-04-10",
      completed: false,
    };

    await findTool("logHabit").execute(params, ctx);
    const retry = await findTool("logHabit").execute(params, ctx);

    expect(mockUncomplete).toHaveBeenCalledTimes(2);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(retry).toEqual({
      currentStreak: 4,
      bestStreak: 10,
      completed: false,
      log: { completed: false },
      milestones: [],
    });
  });

  it("createHabit maps through HabitWrites and preserves its presentation", async () => {
    const ctx = makeCtx();
    const createdHabit = {
      id: "h2",
      userId: "user-123",
      name: "Read",
      description: null,
      categoryId: null,
      frequency: { type: "daily" },
      status: "active",
      currentStreak: 0,
      bestStreak: 0,
      pausedAt: null,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    };
    const presentedHabit = { id: "h2", name: "Read" };
    mockCreateHabitWrite.mockResolvedValue({ type: "created", habit: createdHabit });
    mockToHabitResponse.mockReturnValue(presentedHabit);
    const result = await findTool("createHabit").execute(
      { name: "Read", frequency: { type: "daily" } },
      ctx,
    );
    expect(mockCreateHabitWrite).toHaveBeenCalledWith({
      userId: "user-123",
      name: "Read",
      description: null,
      frequency: { type: "daily" },
      categoryId: null,
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(createdHabit);
    expect(mockCreateHabit).not.toHaveBeenCalled();
    expect(result).toEqual(presentedHabit);
  });

  it("updateHabit maps camelCase detail input through HabitWrites", async () => {
    const ctx = makeCtx();
    const updatedHabit = {
      id: "h1",
      userId: "user-123",
      name: "Meditate more",
    };
    const presentedHabit = { id: "h1", name: "Meditate more" };
    mockUpdateHabitWrite.mockResolvedValue({
      type: "updated",
      habit: updatedHabit,
    });
    mockToHabitResponse.mockReturnValue(presentedHabit);
    const result = await findTool("updateHabit").execute(
      { habitId: "h1", name: "Meditate more", categoryId: "cat-1" },
      ctx,
    );
    expect(mockUpdateHabitWrite).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
      name: "Meditate more",
      categoryId: "cat-1",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(updatedHabit);
    expect(mockUpdateHabit).not.toHaveBeenCalled();
    expect(result).toEqual(presentedHabit);
  });

  it("updateHabit maps expected domain outcomes to conversational errors", async () => {
    const ctx = makeCtx();
    mockUpdateHabitWrite.mockResolvedValue({ type: "not-found" });
    await expect(
      findTool("updateHabit").execute({ habitId: "missing", name: "Name" }, ctx),
    ).resolves.toEqual({ error: "Habit not found" });

    mockUpdateHabitWrite.mockResolvedValue({ type: "conflict" });
    await expect(
      findTool("updateHabit").execute({ habitId: "h1", name: "Name" }, ctx),
    ).resolves.toEqual({ error: "Habit update conflict" });

    mockUpdateHabitWrite.mockResolvedValue({
      type: "invalid",
      field: "frequency",
      message: "Frequency is invalid",
    });
    await expect(
      findTool("updateHabit").execute(
        { habitId: "h1", frequency: { type: "custom", days: [] } },
        ctx,
      ),
    ).resolves.toEqual({ error: "Frequency is invalid", field: "frequency" });
  });

  it("pauseHabit maps a shared transitioned outcome through the AI presentation", async () => {
    const ctx = makeCtx();
    const habit = { id: "h1", status: "paused" };
    const presentedHabit = { id: "h1", status: "paused", paused_at: "now" };
    mockPauseHabit.mockResolvedValue({ type: "transitioned", habit });
    mockToHabitResponse.mockReturnValue(presentedHabit);

    const result = await findTool("pauseHabit").execute({ habitId: "h1" }, ctx);

    expect(mockPauseHabit).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(habit);
    expect(result).toEqual(presentedHabit);
  });

  it("resumeHabit maps an already-applied outcome through the AI presentation", async () => {
    const ctx = makeCtx();
    const habit = { id: "h1", status: "active" };
    const presentedHabit = { id: "h1", status: "active", paused_at: null };
    mockResumeHabit.mockResolvedValue({ type: "already-applied", habit });
    mockToHabitResponse.mockReturnValue(presentedHabit);

    const result = await findTool("resumeHabit").execute({ habitId: "h1" }, ctx);

    expect(mockResumeHabit).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(habit);
    expect(result).toEqual(presentedHabit);
  });

  it.each([
    ["pauseHabit", mockPauseHabit, { type: "not-found" }, { error: "Habit not found" }],
    [
      "resumeHabit",
      mockResumeHabit,
      {
        type: "invalid-transition",
        action: "resume",
        currentStatus: "formed",
        message: "Habit cannot be resumed from formed state",
      },
      { error: "Habit cannot be resumed from formed state" },
    ],
  ] as const)("maps %s lifecycle failures to conversational errors", async (name, mutation, outcome, expected) => {
    const ctx = makeCtx();
    mutation.mockResolvedValue(outcome);

    await expect(
      findTool(name).execute({ habitId: "h1" }, ctx),
    ).resolves.toEqual(expected);
  });

  it("leaves an unexpected lifecycle failure exceptional for the AI caller", async () => {
    const persistenceError = new Error("habit lifecycle unavailable");
    mockPauseHabit.mockRejectedValue(persistenceError);

    await expect(
      findTool("pauseHabit").execute({ habitId: "h1" }, makeCtx()),
    ).rejects.toBe(persistenceError);
  });

  it("graduateHabit uses HabitWrites and preserves the AI presentation", async () => {
    const ctx = makeCtx();
    const habit = { id: "h1", userId: "user-123", status: "formed" };
    const presentedHabit = { id: "h1", status: "formed" };
    mockGraduateHabit.mockResolvedValue({ type: "graduated", habit });
    mockToHabitResponse.mockReturnValue(presentedHabit);

    await expect(
      findTool("graduateHabit").execute({ habitId: "h1" }, ctx),
    ).resolves.toEqual(presentedHabit);
    expect(mockGraduateHabit).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(habit);
  });

  it.each([
    [
      { type: "already-formed", habit: { id: "h1", status: "formed" } },
      { error: "Habit is already formed" },
    ],
    [{ type: "not-found" }, { error: "Habit not found" }],
    [
      {
        type: "invalid-transition",
        action: "graduate",
        currentStatus: "paused",
        message: "Habit cannot be graduated from paused state",
      },
      { error: "Habit cannot be graduated from paused state" },
    ],
  ] as const)("maps graduation outcome %j for the AI caller", async (outcome, expected) => {
    mockGraduateHabit.mockResolvedValue(outcome);

    await expect(
      findTool("graduateHabit").execute({ habitId: "h1" }, makeCtx()),
    ).resolves.toEqual(expected);
  });

  it("reactivateHabit uses HabitWrites and preserves the AI presentation", async () => {
    const ctx = makeCtx();
    const habit = { id: "h1", userId: "user-123", status: "active" };
    const presentedHabit = { id: "h1", status: "active" };
    mockReactivateHabit.mockResolvedValue({ type: "reactivated", habit });
    mockToHabitResponse.mockReturnValue(presentedHabit);

    await expect(
      findTool("reactivateHabit").execute({ habitId: "h1" }, ctx),
    ).resolves.toEqual(presentedHabit);
    expect(mockReactivateHabit).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(habit);
  });

  it.each([
    [
      { type: "already-active", habit: { id: "h1", status: "active" } },
      { error: "Habit is not formed" },
    ],
    [{ type: "not-found" }, { error: "Habit not found" }],
    [
      {
        type: "invalid-transition",
        action: "reactivate",
        currentStatus: "paused",
        message: "Habit cannot be reactivated from paused state",
      },
      { error: "Habit is not formed" },
    ],
  ] as const)("maps reactivation outcome %j for the AI caller", async (outcome, expected) => {
    mockReactivateHabit.mockResolvedValue(outcome);

    await expect(
      findTool("reactivateHabit").execute({ habitId: "h1" }, makeCtx()),
    ).resolves.toEqual(expected);
  });

  it("deleteHabit delegates to the mutation command and preserves confirmation", async () => {
    const ctx = makeCtx();
    mockDeleteHabitWrite.mockResolvedValue({ type: "deleted" });
    const tool = findTool("deleteHabit");
    const result = await findTool("deleteHabit").execute(
      { habitId: "h1" },
      ctx,
    );
    expect(tool.description).toContain("Always confirm with the user first");
    expect(mockDeleteHabitWrite).toHaveBeenCalledWith({
      habitId: "h1",
      userId: "user-123",
    });
    expect(mockGetHabit).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("deleteHabit maps the mutation not-found outcome", async () => {
    const ctx = makeCtx();
    mockDeleteHabitWrite.mockResolvedValue({ type: "not-found" });
    const result = await findTool("deleteHabit").execute(
      { habitId: "h999" },
      ctx,
    );
    expect(result).toEqual({ error: "Habit not found" });
  });

  it("deleteHabit propagates unexpected mutation failures", async () => {
    const persistenceError = new Error("database unavailable");
    mockDeleteHabitWrite.mockRejectedValue(persistenceError);

    await expect(
      findTool("deleteHabit").execute({ habitId: "h1" }, makeCtx()),
    ).rejects.toBe(persistenceError);
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
