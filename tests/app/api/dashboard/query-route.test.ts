import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuthenticateRequest, mockRead, mockCreateQuery } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockRead: vi.fn(),
  mockCreateQuery: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/dashboard/supabase-query", () => ({
  createSupabaseDashboardQuery: mockCreateQuery,
}));

import { GET } from "@/app/api/dashboard/route";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};
const dashboard = {
  habits: [],
  tasks_today: [{ id: "task-1" }],
  tasks_tomorrow: [],
  milestones_today: [],
  stats: {
    total_habits: 0,
    completed_today: 0,
    current_best_streak: 0,
    total_tasks: 1,
    tasks_due_today: 1,
    tasks_completed_today: 0,
    last_workout_at: null,
    week_workout_count: 0,
  },
};

describe("GET /api/dashboard focused query delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal,
      client: { from: vi.fn() },
    });
    mockCreateQuery.mockReturnValue({ read: mockRead });
  });

  it("requests warned-partial data from the authenticated query", async () => {
    mockRead.mockResolvedValue({
      status: "degraded",
      snapshot: dashboard,
      completeness: {
        status: "partial",
        type: "partial",
        requestedRange: { from: "2026-08-07", to: "2026-08-08" },
        failedSeriesIds: ["series-1"],
      },
      warnings: [{
        code: "recurring_coverage_unavailable",
        type: "coverage-unavailable",
        message: "Some recurring tasks may not appear.",
        requestedRange: { from: "2026-08-07", to: "2026-08-08" },
        failedSeriesIds: ["series-1"],
      }],
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/dashboard?date=2026-08-07",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...dashboard,
      _warnings: [{
        code: "recurring_coverage_unavailable",
        type: "coverage-unavailable",
        message: "Some recurring tasks may not appear.",
        requestedRange: { from: "2026-08-07", to: "2026-08-08" },
        failedSeriesIds: ["series-1"],
      }],
    });
    expect(mockCreateQuery).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      principal,
    );
    expect(mockRead).toHaveBeenCalledWith(
      { date: "2026-08-07" },
      { onIncomplete: "return-available" },
    );
  });
});
