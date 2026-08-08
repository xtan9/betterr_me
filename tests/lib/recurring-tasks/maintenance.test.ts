import { describe, expect, it, vi } from "vitest";

import {
  createRecurringTaskMaintenanceCapability,
  createRecurringTaskMaintenanceCapabilityForLifecycle,
  RECURRING_TASK_MAINTENANCE_AUTHORITY,
} from "@/lib/recurring-tasks/maintenance";
import {
  createAuthenticatedRecurringTaskCapabilitiesWithTelemetry,
} from "@/lib/recurring-tasks/capabilities";
import type {
  ActiveSeriesSummary,
  LifecycleOutcome,
  PrewarmCoverageRequest,
  RecurringTaskSeries,
} from "@/lib/recurring-tasks/lifecycle";
import type { RecurringTaskPrewarmingLifecycle } from "@/lib/recurring-tasks/prewarming";

const now = () => new Date("2026-08-01T12:00:00.000Z");

function activeSeries(
  id: string,
  coverageHorizon: string | null = null,
): ActiveSeriesSummary {
  return {
    id,
    userId: `user-${id}`,
    status: "active",
    timeZone: "UTC",
    coverageHorizon,
  };
}

function completeOutcome(): LifecycleOutcome<RecurringTaskSeries> {
  return {
    status: "complete",
    type: "complete",
    value: undefined as never,
    series: undefined as never,
    occurrences: [],
    intentionalAbsences: [],
  };
}

function maintenanceLifecycle(
  series: ActiveSeriesSummary[],
  prewarmCoverage: RecurringTaskPrewarmingLifecycle["prewarmCoverage"],
): RecurringTaskPrewarmingLifecycle {
  return {
    listActiveSeries: vi.fn().mockResolvedValue({ series }),
    prewarmCoverage,
  };
}

describe("recurring task maintenance capability", () => {
  it("constructs a separate service-backed capability for Active-Series maintenance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    try {
      const rpc = vi.fn()
        .mockResolvedValueOnce({
          data: { series: [activeSeries("series-1", "2026-07-31")] },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { status: "complete", type: "complete" },
          error: null,
        });
      const maintenance = createRecurringTaskMaintenanceCapability({
        supabase: { rpc } as never,
        authority: RECURRING_TASK_MAINTENANCE_AUTHORITY,
      });

      await expect(maintenance.run()).resolves.toMatchObject({
        status: "complete",
        seriesCount: 1,
        warmedSeriesCount: 1,
        failedSeriesCount: 0,
      });
      expect(rpc).toHaveBeenNthCalledWith(1, "recurring_task_lifecycle", {
        p_operation: "list-active-series",
        p_request: {},
      });
      expect(rpc).toHaveBeenNthCalledWith(2, "recurring_task_lifecycle", {
        p_operation: "prewarm-coverage",
        p_request: {
          userId: "user-series-1",
          seriesId: "series-1",
          range: { from: "2026-08-01", to: "2026-08-15" },
          operationKey: "recurring-prewarm:series-1:2026-08-01:2026-08-15",
          source: "prewarm",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires the dedicated recurring-maintenance service authority", () => {
    const lifecycle = maintenanceLifecycle([], vi.fn());

    expect(() => createRecurringTaskMaintenanceCapabilityForLifecycle(
      {
        type: "user",
        userId: "user-1",
        credential: "cookie",
      } as never,
      lifecycle,
    )).toThrow("recurring task maintenance authority");

    expect(() => createRecurringTaskMaintenanceCapabilityForLifecycle(
      {
        type: "service",
        serviceId: "admin-sync",
        credential: "adminSecret",
      } as never,
      lifecycle,
    )).toThrow("recurring task maintenance authority");
  });

  it("selects Active Series and returns aggregate counts without lifecycle details", async () => {
    const prewarmCoverage = vi.fn().mockResolvedValue(completeOutcome());
    const lifecycle = maintenanceLifecycle([
      activeSeries("series-1"),
      activeSeries("series-2", "2026-08-10"),
    ], prewarmCoverage);
    const maintenance = createRecurringTaskMaintenanceCapabilityForLifecycle(
      RECURRING_TASK_MAINTENANCE_AUTHORITY,
      lifecycle,
      { now, days: 3, retryDelayMs: 0 },
    );

    const result = await maintenance.run();

    expect(result).toEqual({
      status: "complete",
      type: "complete",
      seriesCount: 2,
      warmedSeriesCount: 1,
      skippedSeriesCount: 1,
      failedSeriesCount: 0,
      operationalFailures: {
        total: 0,
        activeSeriesScan: 0,
        coveragePrewarm: 0,
      },
    });
    expect(prewarmCoverage).toHaveBeenCalledWith(expect.objectContaining({
      seriesId: "series-1",
      source: "prewarm",
    }));
    expect(prewarmCoverage).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("failedSeriesIds");
    expect(result).not.toHaveProperty("attempts");
    expect(JSON.stringify(result)).not.toContain("user-series-1");
  });

  it("isolates one Series failure and reports it only as an aggregate", async () => {
    const prewarmCoverage = vi
      .fn<(_request: PrewarmCoverageRequest) => Promise<LifecycleOutcome<RecurringTaskSeries>>>()
      .mockRejectedValueOnce(new Error("private failure"))
      .mockResolvedValueOnce(completeOutcome());
    const lifecycle = maintenanceLifecycle([
      activeSeries("series-1"),
      activeSeries("series-2"),
    ], prewarmCoverage);
    const maintenance = createRecurringTaskMaintenanceCapabilityForLifecycle(
      RECURRING_TASK_MAINTENANCE_AUTHORITY,
      lifecycle,
      { now, days: 3, maxAttempts: 1, retryDelayMs: 0 },
    );

    await expect(maintenance.run()).resolves.toEqual({
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
    expect(prewarmCoverage).toHaveBeenCalledTimes(2);
  });

  it("returns an aggregate unavailable result when Active-Series scanning fails", async () => {
    const lifecycle: RecurringTaskPrewarmingLifecycle = {
      listActiveSeries: vi.fn().mockRejectedValue(new Error("database unavailable")),
      prewarmCoverage: vi.fn(),
    };
    const maintenance = createRecurringTaskMaintenanceCapabilityForLifecycle(
      RECURRING_TASK_MAINTENANCE_AUTHORITY,
      lifecycle,
    );

    await expect(maintenance.run()).resolves.toEqual({
      status: "unavailable",
      type: "unavailable",
      seriesCount: 0,
      warmedSeriesCount: 0,
      skippedSeriesCount: 0,
      failedSeriesCount: 0,
      operationalFailures: {
        total: 1,
        activeSeriesScan: 1,
        coveragePrewarm: 0,
      },
    });
  });

  it("keeps interactive telemetry private while public coverage omits observability", async () => {
    const telemetry = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "complete",
        type: "complete",
        series: [],
        occurrences: [],
        intentionalAbsences: [],
        observability: {
          createdOccurrences: 2,
          intentionalAbsences: 0,
          withdrawnOccurrences: 0,
        },
      },
      error: null,
    });
    const capabilities = createAuthenticatedRecurringTaskCapabilitiesWithTelemetry(
      { rpc } as never,
      {
        type: "user",
        userId: "user-1",
        credential: "cookie",
      },
      { emit: telemetry },
    );

    const result = await capabilities.coverage.ensure({
      operationId: "coverage-1",
      range: { from: "2026-08-01", to: "2026-08-03" },
    });

    expect(result).toMatchObject({ type: "coverage", status: "complete" });
    expect(result).not.toHaveProperty("observability");
    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({ event: "occurrence_created", count: 2 }),
    );
    expect(JSON.stringify(result)).not.toContain("createdOccurrences");
  });
});
