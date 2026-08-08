import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockCreateSidebarCountsQuery, mockSidebarQueryRead } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockCreateSidebarCountsQuery: vi.fn(),
    mockSidebarQueryRead: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/sidebar/supabase-query", () => ({
  createSupabaseSidebarCountsQuery: mockCreateSidebarCountsQuery,
}));

const complete = (counts = { habits_incomplete: 2, tasks_due: 2 }) => ({
  status: "complete" as const,
  counts,
  completeness: {
    status: "complete" as const,
    type: "complete" as const,
    requestedRange: { from: "2026-02-17", to: "2026-02-17" },
    failedSeriesIds: [] as [],
  },
});

describe("GET /api/sidebar/counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockCreateSidebarCountsQuery.mockReturnValue({
      read: mockSidebarQueryRead,
    });
    mockSidebarQueryRead.mockResolvedValue(complete());
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/sidebar/counts?date=2026-02-17"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockCreateSidebarCountsQuery).not.toHaveBeenCalled();
  });

  it("uses the authenticated focused query for complete counts", async () => {
    const { GET } = await import("@/app/api/sidebar/counts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/sidebar/counts?date=2026-02-17"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      habits_incomplete: 2,
      tasks_due: 2,
    });
    expect(mockCreateSidebarCountsQuery).toHaveBeenCalledWith(
      expect.anything(),
      {
        type: "user",
        userId: "user-1",
        credential: "cookie",
      },
    );
    expect(mockSidebarQueryRead).toHaveBeenCalledWith({ date: "2026-02-17" });
  });

  it("returns zero counts from a complete focused query", async () => {
    mockSidebarQueryRead.mockResolvedValueOnce(
      complete({ habits_incomplete: 0, tasks_due: 0 }),
    );

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/sidebar/counts?date=2026-02-17"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      habits_incomplete: 0,
      tasks_due: 0,
    });
  });

  it.each([
    {
      label: "partial",
      completeness: {
        status: "partial" as const,
        type: "partial" as const,
        requestedRange: { from: "2026-02-17", to: "2026-02-17" },
        failedSeriesIds: ["series-2"],
      },
    },
    {
      label: "unavailable",
      completeness: {
        status: "unavailable" as const,
        type: "unavailable" as const,
        requestedRange: { from: "2026-02-17", to: "2026-02-17" },
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    },
  ])(
    "returns the typed fail-closed $label outcome instead of counts",
    async ({ completeness }) => {
      const warning = {
        code: "recurring_coverage_unavailable",
        type: "coverage-unavailable",
        message:
          "Recurring task coverage is unavailable for the requested date range.",
        requestedRange: completeness.requestedRange,
        failedSeriesIds: completeness.failedSeriesIds,
      };
      mockSidebarQueryRead.mockResolvedValueOnce({
        status: "failed",
        completeness,
        warning,
        error: {
          code: "coverage_unavailable",
          message: "Recurring task coverage is temporarily unavailable.",
        },
      });

      const { GET } = await import("@/app/api/sidebar/counts/route");
      const response = await GET(
        new NextRequest(
          "http://localhost/api/sidebar/counts?date=2026-02-17",
        ),
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({
        error: "Recurring task coverage is temporarily unavailable.",
        warning,
      });
    },
  );

  it("returns 500 when the focused query cannot read counts", async () => {
    mockSidebarQueryRead.mockRejectedValueOnce(new Error("DB error"));

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const response = await GET(
      new NextRequest("http://localhost/api/sidebar/counts?date=2026-02-17"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch sidebar counts",
    });
  });
});
