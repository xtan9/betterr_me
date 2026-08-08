import { describe, expect, it, vi } from "vitest";

import {
  ensureRecurringTaskCoverage,
  taskReadCoverageRange,
} from "@/lib/recurring-tasks/coverage";

vi.mock("@/lib/logger", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

function supabaseFor(outcome: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: outcome, error: null }),
  } as never;
}

describe("recurring coverage read boundaries", () => {
  it("derives the exact inclusive horizon for each task read filter", () => {
    expect(taskReadCoverageRange({
      view: "today",
      date: "2026-02-17",
    })).toEqual({ from: "2026-02-17", to: "2026-02-17" });
    expect(taskReadCoverageRange({
      view: "upcoming",
      date: "2026-02-17",
      days: 14,
    })).toEqual({ from: "2026-02-17", to: "2026-03-03" });
    expect(taskReadCoverageRange({
      view: "overdue",
      date: "2026-02-17",
    })).toEqual({ from: "2026-02-17", to: "2026-02-17" });
    expect(taskReadCoverageRange({
      dueDate: "2026-02-17",
    })).toEqual({ from: "2026-02-17", to: "2026-02-17" });
    expect(taskReadCoverageRange({ date: "2026-02-17" })).toBeUndefined();
  });

  it("keeps local-day derivation stable across a timezone boundary", () => {
    expect(taskReadCoverageRange({
      view: "upcoming",
      date: "2026-03-08",
      days: 1,
    })).toEqual({ from: "2026-03-08", to: "2026-03-09" });
  });

  it("reports an already-covered exact range as complete", async () => {
    const range = { from: "2026-02-17", to: "2026-02-17" };
    const result = await ensureRecurringTaskCoverage(
      supabaseFor({
        status: "already-applied",
        type: "already-applied",
      }),
      "user-1",
      range,
    );

    expect(result).toEqual({
      status: "complete",
      type: "complete",
      requestedRange: range,
      failedSeriesIds: [],
    });
  });

  it("ensures an exact read horizon synchronously without scheduled prewarming", async () => {
    const range = { from: "2026-02-17", to: "2026-03-03" };
    const supabase = supabaseFor({ status: "complete", type: "complete" }) as unknown as {
      rpc: ReturnType<typeof vi.fn>;
    };
    const result = await ensureRecurringTaskCoverage(
      supabase as never,
      "user-1",
      range,
    );

    expect(supabase.rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "ensure-user-coverage",
      p_request: { userId: "user-1", range },
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(result.requestedRange).toEqual(range);
  });

  it("retains a typed warning when only part of a multi-Series range is available", async () => {
    const range = { from: "2026-02-17", to: "2026-02-21" };
    const result = await ensureRecurringTaskCoverage(
      supabaseFor({
        status: "partial",
        type: "partial",
        requestedRange: range,
        failedSeriesIds: ["series-2"],
      }),
      "user-1",
      range,
    );

    expect(result).toEqual({
      status: "partial",
      type: "coverage-unavailable",
      requestedRange: range,
      failedSeriesIds: ["series-2"],
      warning: {
        code: "recurring_coverage_unavailable",
        type: "coverage-unavailable",
        message: "Recurring task coverage is unavailable for the requested date range.",
        requestedRange: range,
        failedSeriesIds: ["series-2"],
      },
    });
  });

  it("returns a typed degraded result when the lifecycle boundary is unavailable", async () => {
    const range = { from: "2026-02-17", to: "2026-02-21" };
    const result = await ensureRecurringTaskCoverage(
      {} as never,
      "user-1",
      range,
    );

    expect(result.status).toBe("partial");
    if (result.status !== "partial") return;
    expect(result.warning).toEqual({
      code: "recurring_coverage_unavailable",
      type: "coverage-unavailable",
      message: "Recurring task coverage is unavailable for the requested date range.",
      requestedRange: range,
      failedSeriesIds: [],
    });
  });

  it("turns a failed lifecycle RPC into the same typed degraded result", async () => {
    const range = { from: "2026-02-17", to: "2026-02-21" };
    const result = await ensureRecurringTaskCoverage(
      {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("transaction unavailable"),
        }),
      } as never,
      "user-1",
      range,
    );

    expect(result.status).toBe("partial");
    if (result.status !== "partial") return;
    expect(result.warning.requestedRange).toEqual(range);
  });
});
