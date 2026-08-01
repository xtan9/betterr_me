import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockCreateAdminClient,
  mockCreateLifecycle,
  mockPrewarm,
  mockLog,
} = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateLifecycle: vi.fn(),
  mockPrewarm: vi.fn(),
  mockLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/recurring-tasks/supabase-lifecycle", () => ({
  createSupabaseRecurringTaskLifecycle: mockCreateLifecycle,
}));

vi.mock("@/lib/recurring-tasks/prewarming", () => ({
  prewarmActiveRecurringTaskCoverage: mockPrewarm,
}));

vi.mock("@/lib/logger", () => ({ log: mockLog }));

import { GET } from "@/app/api/cron/prewarm-recurring-tasks/route";

const CRON_SECRET = "prewarm-cron-secret";

function request(token = CRON_SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/prewarm-recurring-tasks", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/cron/prewarm-recurring-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockCreateAdminClient.mockReturnValue({ rpc: vi.fn() });
    mockCreateLifecycle.mockReturnValue({});
    mockPrewarm.mockResolvedValue({
      status: "partial",
      type: "partial",
      seriesCount: 2,
      warmedSeriesCount: 1,
      skippedSeriesCount: 0,
      failedSeriesIds: ["series-2"],
      attempts: [{ seriesId: "series-2", attempts: 3, status: "failed" }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the cron authorization", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(401);
    expect(mockPrewarm).not.toHaveBeenCalled();
  });

  it("runs the narrow prewarming boundary and returns per-Series outcomes", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "partial",
      series_count: 2,
      warmed_series_count: 1,
      failed_series_ids: ["series-2"],
    });
    expect(mockCreateLifecycle).toHaveBeenCalledWith(expect.anything());
    expect(mockPrewarm).toHaveBeenCalledWith(expect.anything());
  });

  it("does not put lifecycle errors or user content into diagnostics", async () => {
    mockPrewarm.mockRejectedValueOnce(new Error("SECRET_DESCRIPTION"));
    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mockLog.error).toHaveBeenCalledWith(
      "[recurring-prewarm] failed",
      undefined,
      expect.objectContaining({ errorType: "Error" }),
    );
    expect(JSON.stringify(mockLog.error.mock.calls)).not.toContain("SECRET_DESCRIPTION");
  });
});
