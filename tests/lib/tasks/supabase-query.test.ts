import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateCoverageRead, mockTasksDB } = vi.hoisted(() => ({
  mockCreateCoverageRead: vi.fn(),
  mockTasksDB: {
    getTodayTasks: vi.fn(),
    getUpcomingTasks: vi.fn(),
    getOverdueTasks: vi.fn(),
    getUserTasks: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  TasksDB: class {
    constructor() {
      return mockTasksDB;
    }
  },
}));

vi.mock("@/lib/recurring-tasks/coverage-read", () => ({
  createCoverageRead: mockCreateCoverageRead,
}));

import { createSupabaseTaskQuery } from "@/lib/tasks/supabase-query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};
const supabase = {} as never;

describe("Supabase task query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds Coverage to the authenticated principal and reads materialized Tasks", async () => {
    const ensure = vi.fn().mockResolvedValue({
      status: "complete",
      type: "complete",
      requestedRange: { from: "2026-08-07", to: "2026-08-09" },
      failedSeriesIds: [],
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });
    mockTasksDB.getUpcomingTasks.mockResolvedValue([{ id: "task-1" }]);

    const query = createSupabaseTaskQuery(supabase, principal);
    const result = await query.read({
      type: "upcoming",
      date: "2026-08-07",
      days: 2,
    });

    expect(mockCreateCoverageRead).toHaveBeenCalledWith({
      supabase,
      principal,
      source: "task",
    });
    expect(ensure).toHaveBeenCalledWith({
      from: "2026-08-07",
      to: "2026-08-09",
    });
    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith(
      "user-1",
      "2026-08-07",
      2,
    );
    expect(result).toEqual({
      tasks: [{ id: "task-1" }],
      completeness: {
        status: "complete",
        type: "complete",
        requestedRange: { from: "2026-08-07", to: "2026-08-09" },
        failedSeriesIds: [],
      },
    });
  });

  it("preserves partial Coverage facts while returning available materialized Tasks", async () => {
    const ensure = vi.fn().mockResolvedValue({
      status: "partial",
      type: "partial",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: ["series-2", "series-1", "series-2"],
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });
    mockTasksDB.getTodayTasks.mockResolvedValue([{ id: "task-1" }]);

    const query = createSupabaseTaskQuery(supabase, principal);
    const result = await query.read({
      type: "today",
      date: "2026-08-07",
    });

    expect(result.completeness).toEqual({
      status: "partial",
      type: "partial",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: ["series-2", "series-1", "series-2"],
    });
    expect(result.tasks).toEqual([{ id: "task-1" }]);
  });

  it("fails before reading materialized Tasks when Coverage is incomplete", async () => {
    const ensure = vi.fn().mockResolvedValue({
      status: "unavailable",
      type: "unavailable",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: [],
      reason: "Coverage service unavailable",
    });
    mockCreateCoverageRead.mockReturnValue({ ensure });

    const query = createSupabaseTaskQuery(supabase, principal);
    const result = await query.read(
      { type: "today", date: "2026-08-07" },
      { onIncomplete: "fail" },
    );

    expect(result).toEqual({
      tasks: [],
      completeness: {
        status: "unavailable",
        type: "unavailable",
        requestedRange: { from: "2026-08-07", to: "2026-08-07" },
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    });
    expect(mockTasksDB.getTodayTasks).not.toHaveBeenCalled();
  });
});
