import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateCapabilities,
  mockGetHabitsWithTodayStatus,
  mockGetTodayTasks,
} = vi.hoisted(() => ({
  mockCreateCapabilities: vi.fn(),
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

vi.mock("@/lib/recurring-tasks/capabilities", () => ({
  createAuthenticatedRecurringTaskCapabilities: mockCreateCapabilities,
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
    const ensure = vi.fn().mockImplementation(async () => {
      events.push("coverage");
      return {
        type: "coverage",
        status: "complete",
        completeness: {
          status: "complete",
          type: "complete",
          requestedRange: { from: "2026-08-07", to: "2026-08-07" },
          failedSeriesIds: [],
        },
      };
    });
    mockCreateCapabilities.mockReturnValue({ coverage: { ensure } });
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

    expect(mockCreateCapabilities).toHaveBeenCalledWith(supabase, principal);
    expect(ensure).toHaveBeenCalledWith({
      operationId: "sidebar-read-coverage:user-1:2026-08-07:2026-08-07",
      range: { from: "2026-08-07", to: "2026-08-07" },
    });
    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
    );
    expect(mockGetTodayTasks).toHaveBeenCalledWith("user-1", "2026-08-07");
    expect(events[0]).toBe("coverage");
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

  it("maps an unavailable Coverage capability to the fail-closed result", async () => {
    const ensure = vi.fn().mockResolvedValue({
      type: "coverage-unavailable",
      status: "coverage-unavailable",
      operation: "recurring-task.coverage.ensure",
      operationId: "sidebar-read-coverage:user-1:2026-08-07:2026-08-07",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      reason: "Coverage service unavailable",
    });
    mockCreateCapabilities.mockReturnValue({ coverage: { ensure } });

    const result = await createSupabaseSidebarCountsQuery(
      supabase,
      principal,
    ).read({ date: "2026-08-07" });

    expect(result).toEqual(expect.objectContaining({
      status: "failed",
      completeness: {
        status: "unavailable",
        type: "unavailable",
        requestedRange: { from: "2026-08-07", to: "2026-08-07" },
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    }));
    expect(mockGetTodayTasks).not.toHaveBeenCalled();
    expect(mockGetHabitsWithTodayStatus).not.toHaveBeenCalled();
  });
});
