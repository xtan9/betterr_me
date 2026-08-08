import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockCreateAdminClient,
  mockCreateMaintenance,
  mockRunMaintenance,
  mockLog,
} = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateMaintenance: vi.fn(),
  mockRunMaintenance: vi.fn(),
  mockLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/recurring-tasks", () => ({
  createRecurringTaskMaintenanceCapability: mockCreateMaintenance,
  RECURRING_TASK_MAINTENANCE_AUTHORITY: {
    type: "cron",
    serviceId: "recurring-task-maintenance",
  },
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
    mockCreateMaintenance.mockReturnValue({ run: mockRunMaintenance });
    mockRunMaintenance.mockResolvedValue({
      status: "partial",
      type: "partial",
      seriesCount: 2,
      warmedSeriesCount: 1,
      skippedSeriesCount: 0,
      failedSeriesCount: 1,
      operationalFailures: {
        total: 1,
        activeSeriesScan: 0,
        coveragePrewarm: 1,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the cron authorization", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(401);
    expect(mockCreateMaintenance).not.toHaveBeenCalled();
  });

  it("runs the narrow maintenance boundary and returns aggregate outcomes", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      status: "partial",
      series_count: 2,
      warmed_series_count: 1,
      failed_series_count: 1,
      operational_failure_count: 1,
    });
    expect(payload).not.toHaveProperty("failed_series_ids");
    expect(payload).not.toHaveProperty("attempts");
    expect(mockCreateMaintenance).toHaveBeenCalledWith({
      supabase: expect.anything(),
      authority: expect.objectContaining({
        serviceId: "recurring-task-maintenance",
      }),
    });
    expect(mockRunMaintenance).toHaveBeenCalledTimes(1);
  });

  it("does not put lifecycle errors or user content into diagnostics", async () => {
    mockRunMaintenance.mockRejectedValueOnce(new Error("SECRET_DESCRIPTION"));
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
