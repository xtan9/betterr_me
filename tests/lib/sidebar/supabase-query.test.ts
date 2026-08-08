import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateCoverageRead,
  mockGetHabitsWithTodayStatus,
  mockGetTodayTasks,
} = vi.hoisted(() => ({
  mockCreateCoverageRead: vi.fn(),
  mockGetHabitsWithTodayStatus: vi.fn(),
  mockGetTodayTasks: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
  },
  TasksDB: class {
    getTodayTasks = mockGetTodayTasks;
  },
}));

vi.mock("@/lib/recurring-tasks/coverage-read", () => ({
  createCoverageRead: mockCreateCoverageRead,
}));

import { createSupabaseSidebarCountsQuery } from "@/lib/sidebar/supabase-query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};
const supabase = {} as never;

describe("Supabase sidebar counts query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds Coverage to the authenticated principal before reading materialized counts", async () => {
    const events: string[] = [];
    const ensure = vi.fn().mockImplementation(async (range) => {
      events.push(`coverage:${range.from}:${range.to}`);
      return {
        status: "complete",
        type: "complete",
        requestedRange: range,
        failedSeriesIds: [],
      };
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });
    mockGetHabitsWithTodayStatus.mockImplementation(async () => {
      events.push("habits");
      return [
        { id: "habit-1", completed_today: false },
        { id: "habit-2", completed_today: true },
        { id: "habit-3", completed_today: false },
      ];
    });
    mockGetTodayTasks.mockImplementation(async () => {
      events.push("tasks");
      return [
        { id: "task-1", is_completed: false },
        { id: "task-2", is_completed: true },
        { id: "task-3", is_completed: false },
      ];
    });

    const query = createSupabaseSidebarCountsQuery(supabase, principal);
    const result = await query.read({ date: "2026-08-07" });

    expect(mockCreateCoverageRead).toHaveBeenCalledWith({
      supabase,
      principal,
      source: "sidebar",
    });
    expect(ensure).toHaveBeenCalledWith({
      from: "2026-08-07",
      to: "2026-08-07",
    });
    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
    );
    expect(mockGetTodayTasks).toHaveBeenCalledWith("user-1", "2026-08-07");
    expect(events[0]).toBe("coverage:2026-08-07:2026-08-07");
    expect(result).toEqual({
      status: "complete",
      counts: { habits_incomplete: 2, tasks_due: 2 },
      completeness: {
        status: "complete",
        type: "complete",
        requestedRange: { from: "2026-08-07", to: "2026-08-07" },
        failedSeriesIds: [],
      },
    });
  });

  it.each([
    [
      "partial",
      {
        status: "partial" as const,
        type: "partial" as const,
        requestedRange: { from: "2026-08-07", to: "2026-08-07" },
        failedSeriesIds: ["series-1"],
      },
    ],
    [
      "unavailable",
      {
        status: "unavailable" as const,
        type: "unavailable" as const,
        requestedRange: { from: "2026-08-07", to: "2026-08-07" },
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    ],
  ])(
    "fails closed for incomplete %s Coverage before either count read",
    async (_label, completeness) => {
      const ensure = vi.fn().mockResolvedValue(completeness);
      mockCreateCoverageRead.mockReturnValue({ ensure });

      const result = await createSupabaseSidebarCountsQuery(
        supabase,
        principal,
      ).read({ date: "2026-08-07" });

      expect(ensure).toHaveBeenCalledWith({
        from: "2026-08-07",
        to: "2026-08-07",
      });
      expect(result).toEqual(expect.objectContaining({
        status: "failed",
        completeness,
      }));
      expect(mockGetTodayTasks).not.toHaveBeenCalled();
      expect(mockGetHabitsWithTodayStatus).not.toHaveBeenCalled();
    },
  );
});
