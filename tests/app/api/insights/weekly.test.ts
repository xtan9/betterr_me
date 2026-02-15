import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/insights/weekly/route";

const mockGetWeeklyInsights = vi.fn();
const mockGetProfile = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123" } },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    constructor() {
      return { getProfile: mockGetProfile };
    }
  },
  InsightsDB: class {
    constructor() {
      return { getWeeklyInsights: mockGetWeeklyInsights };
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

function createRequest(date?: string): NextRequest {
  const url = date
    ? `http://localhost/api/insights/weekly?date=${date}`
    : "http://localhost/api/insights/weekly";
  return new NextRequest(url);
}

describe("GET /api/insights/weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123" } },
          error: null,
        })),
      },
    } as any);
  });

  it("returns insights for authenticated user", async () => {
    const mockInsights = [
      {
        type: "best_habit",
        message: "bestHabit",
        params: { habit: "Meditate", percent: 100 },
        priority: 80,
      },
    ];
    mockGetProfile.mockResolvedValue({
      id: "user-123",
      preferences: { week_start_day: 1 },
    });
    mockGetWeeklyInsights.mockResolvedValue(mockInsights);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.insights).toEqual(mockInsights);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      1,
      undefined,
    );
  });

  it("forwards date query param to InsightsDB", async () => {
    mockGetProfile.mockResolvedValue({ preferences: { week_start_day: 0 } });
    mockGetWeeklyInsights.mockResolvedValue([]);

    const response = await GET(createRequest("2026-02-10"));
    expect(response.status).toBe(200);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      0,
      "2026-02-10",
    );
  });

  it("returns 401 for unauthenticated user", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null }, error: null })) },
    } as any);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 when auth service fails", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: null },
          error: { message: "token expired" },
        })),
      },
    } as any);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Authentication service error");
  });

  it("defaults to Monday when profile has no week_start_day", async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetWeeklyInsights.mockResolvedValue([]);

    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      1,
      undefined,
    );
  });

  it("returns 500 on internal error", async () => {
    mockGetProfile.mockRejectedValue(new Error("DB error"));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch weekly insights");
  });
});
