import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateCoverageRead,
  mockHabitsDB,
  mockTasksDB,
  mockHabitLogsDB,
  mockMilestonesDB,
  mockLocalizationDB,
  mockWorkoutsDB,
} = vi.hoisted(() => ({
  mockCreateCoverageRead: vi.fn(),
  mockHabitsDB: {
    getHabitsWithTodayStatusAcquisition: vi.fn(),
  },
  mockTasksDB: {
    getTodayTasks: vi.fn(),
    getTaskCount: vi.fn(),
    getUserTasks: vi.fn(),
  },
  mockHabitLogsDB: {
    getAllUserLogs: vi.fn(),
  },
  mockMilestonesDB: {
    getTodaysMilestones: vi.fn(),
  },
  mockLocalizationDB: {
    getWeekStartPreference: vi.fn(),
  },
  mockWorkoutsDB: {
    getLastCompletedAt: vi.fn(),
    getWeekWorkoutCount: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    constructor() {
      return mockHabitsDB;
    }
  },
  TasksDB: class {
    constructor() {
      return mockTasksDB;
    }
  },
  HabitLogsDB: class {
    constructor() {
      return mockHabitLogsDB;
    }
  },
  HabitMilestonesDB: class {
    constructor() {
      return mockMilestonesDB;
    }
  },
  LocalizationDB: class {
    constructor() {
      return mockLocalizationDB;
    }
  },
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {
    constructor() {
      return mockWorkoutsDB;
    }
  },
}));

vi.mock("@/lib/recurring-tasks/coverage-read", () => ({
  createCoverageRead: mockCreateCoverageRead,
}));

import { createSupabaseDashboardQuery } from "@/lib/dashboard/supabase-query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};
const supabase = {} as never;

describe("Supabase dashboard query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHabitsDB.getHabitsWithTodayStatusAcquisition.mockResolvedValue({
      habits: [],
      status: "complete",
    });
    mockTasksDB.getTodayTasks.mockResolvedValue([]);
    mockTasksDB.getTaskCount.mockResolvedValue(0);
    mockTasksDB.getUserTasks.mockResolvedValue([]);
    mockHabitLogsDB.getAllUserLogs.mockResolvedValue([]);
    mockMilestonesDB.getTodaysMilestones.mockResolvedValue([]);
    mockLocalizationDB.getWeekStartPreference.mockResolvedValue("monday");
    mockWorkoutsDB.getLastCompletedAt.mockResolvedValue(null);
    mockWorkoutsDB.getWeekWorkoutCount.mockResolvedValue(0);
  });

  it("binds Coverage to the authenticated principal before materialized reads", async () => {
    const ensure = vi.fn().mockResolvedValue({
      status: "complete",
      type: "complete",
      requestedRange: { from: "2026-08-07", to: "2026-08-08" },
      failedSeriesIds: [],
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });

    const query = createSupabaseDashboardQuery(supabase, principal);
    const result = await query.read({ date: "2026-08-07" }, {
      onIncomplete: "return-available",
    });

    expect(mockCreateCoverageRead).toHaveBeenCalledWith({
      supabase,
      principal,
      source: "dashboard",
    });
    expect(ensure).toHaveBeenCalledWith({
      from: "2026-08-07",
      to: "2026-08-08",
    });
    expect(mockHabitsDB.getHabitsWithTodayStatusAcquisition).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
    );
    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
    );
    expect(mockTasksDB.getUserTasks).toHaveBeenCalledWith("user-1", {
      due_date: "2026-08-08",
      is_completed: false,
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.completeness).toEqual({
      status: "complete",
      type: "complete",
      requestedRange: { from: "2026-08-07", to: "2026-08-08" },
      failedSeriesIds: [],
    });
  });

  it("preserves unavailable Coverage while returning available data", async () => {
    const ensure = vi.fn().mockResolvedValue({
      type: "unavailable",
      status: "unavailable",
      requestedRange: { from: "2026-08-07", to: "2026-08-08" },
      failedSeriesIds: [],
      reason: "Coverage service unavailable",
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });

    const result = await createSupabaseDashboardQuery(supabase, principal).read(
      { date: "2026-08-07" },
      { onIncomplete: "return-available" },
    );

    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") return;
    expect(result.completeness).toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: { from: "2026-08-07", to: "2026-08-08" },
      failedSeriesIds: [],
      reason: "Coverage service unavailable",
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "recurring_coverage_unavailable",
      type: "coverage-unavailable",
    }));
    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
    );
  });
});
