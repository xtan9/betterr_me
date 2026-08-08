import { describe, expect, it, vi } from "vitest";

import { SupabaseRecurringTaskLifecycle } from "@/lib/recurring-tasks/supabase-lifecycle";
import type { RecurringLifecycleSignal } from "@/lib/recurring-tasks/lifecycle";

describe("SupabaseRecurringTaskLifecycle", () => {
  it("maps a lifecycle request to the single transactional RPC boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "complete", type: "complete" },
      error: null,
    });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);
    const request = {
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 } as const,
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: {
        title: "Review",
        description: null,
        priority: 0 as const,
        categoryId: null,
        dueTime: null,
      },
      coverage: { from: "2026-08-01", to: "2026-08-03" },
    };

    await lifecycle.createSeries(request);

    expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "create-series",
      p_request: request,
    });
  });

  it("propagates an RPC failure instead of returning incomplete coverage", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("transaction unavailable"),
    });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);

    await expect(
      lifecycle.ensureCoverage({
        userId: "user-1",
        seriesId: "series-1",
        range: { from: "2026-08-01", to: "2026-08-03" },
      }),
    ).rejects.toThrow("transaction unavailable");
  });

  it("emits safe structured coverage signals from lifecycle outcomes", async () => {
    const signals: RecurringLifecycleSignal[] = [];
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "complete",
        type: "complete",
        series: { id: "series-1", status: "active" },
        observability: {
          createdOccurrences: 2,
          intentionalAbsences: 1,
          withdrawnOccurrences: 1,
        },
      },
      error: null,
    });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never, {
      observer: (signal) => signals.push(signal),
    });

    await lifecycle.ensureCoverage({
      userId: "user-1",
      seriesId: "series-1",
      range: { from: "2026-08-01", to: "2026-08-03" },
      title: "SECRET_TITLE",
      source: "prewarm",
    } as never);

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "coverage_attempt", seriesId: "series-1" }),
      expect.objectContaining({ event: "occurrence_created", count: 2 }),
      expect.objectContaining({ event: "intentional_absence", count: 1 }),
      expect.objectContaining({ event: "occurrence_withdrawn", count: 1 }),
    ]));
    expect(JSON.stringify(signals)).not.toContain("SECRET_TITLE");
  });

  it("reports partial multi-Series results and failure type without logging request content", async () => {
    const signals: RecurringLifecycleSignal[] = [];
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          status: "partial",
          type: "partial",
          requestedRange: { from: "2026-08-01", to: "2026-08-03" },
          failedSeriesIds: ["series-2"],
          series: [],
          occurrences: [],
          intentionalAbsences: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: new Error("SECRET_DESCRIPTION") });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never, {
      observer: (signal) => signals.push(signal),
    });

    const partial = await lifecycle.ensureUserCoverage({
      userId: "user-1",
      range: { from: "2026-08-01", to: "2026-08-03" },
      source: "prewarm",
    });
    expect(partial.status).toBe("partial");
    await expect(lifecycle.ensureCoverage({
      userId: "user-1",
      seriesId: "series-2",
      range: { from: "2026-08-01", to: "2026-08-03" },
      updates: { description: "SECRET_OVERRIDE" },
    } as never)).rejects.toThrow("SECRET_DESCRIPTION");

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "coverage_partial",
        failedSeriesIds: ["series-2"],
      }),
      expect.objectContaining({ event: "lifecycle_failure", errorType: "Error" }),
    ]));
    const serialized = JSON.stringify(signals);
    expect(serialized).not.toContain("SECRET_DESCRIPTION");
    expect(serialized).not.toContain("SECRET_OVERRIDE");
  });

  it("routes service prewarming and active-Series listing through dedicated lifecycle operations", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { status: "complete", type: "complete", series: [] },
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: "complete", type: "complete" }, error: null });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);

    await lifecycle.listActiveSeries();
    await lifecycle.prewarmCoverage({
      userId: "user-1",
      seriesId: "series-1",
      range: { from: "2026-08-01", to: "2026-08-03" },
      operationKey: "prewarm:series-1:2026-08-03",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "recurring_task_lifecycle", {
      p_operation: "list-active-series",
      p_request: {},
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "recurring_task_lifecycle", {
      p_operation: "prewarm-coverage",
      p_request: {
        userId: "user-1",
        seriesId: "series-1",
        range: { from: "2026-08-01", to: "2026-08-03" },
        operationKey: "prewarm:series-1:2026-08-03",
      },
    });
  });

  it("routes one-occurrence field edits through the lifecycle RPC without rewriting lineage", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "complete", type: "complete" },
      error: null,
    });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);
    const request = {
      userId: "user-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
      expectedRevisionToken: 7,
      updates: {
        dueDate: null,
        dueTime: "10:30",
        description: null,
      },
      idempotencyKey: "edit-occurrence-1",
    };

    await lifecycle.editOccurrence(request);

    expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "edit-occurrence",
      p_request: request,
    });
  });

  it.each([
    ["skip-occurrence", "skipOccurrence"],
    ["complete-occurrence", "completeOccurrence"],
    ["reopen-occurrence", "reopenOccurrence"],
  ] as const)(
    "routes %s through the explicit occurrence lifecycle command",
    async (operation, method) => {
      const rpc = vi.fn().mockResolvedValue({
        data: { status: "complete", type: "complete" },
        error: null,
      });
      const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);
      const request = {
        userId: "user-1",
        seriesId: "series-1",
        occurrenceId: "occurrence-1",
        idempotencyKey: `${operation}-1`,
      };

      await lifecycle[method](request);

      expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
        p_operation: operation,
        p_request: request,
      });
    },
  );

  it("routes recurring deletion preflight and terminal mutation through lifecycle RPCs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          status: "complete",
          type: "complete",
          series: { id: "series-1", status: "active" },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "complete", type: "complete" },
        error: null,
      })
      .mockResolvedValue({
        data: { status: "complete", type: "complete" },
        error: null,
      });
    const lifecycle = new SupabaseRecurringTaskLifecycle({ rpc } as never);

    await lifecycle.getSeries("user-1", "series-1");
    await lifecycle.endSeries({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-04",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "recurring_task_lifecycle", {
      p_operation: "get-series",
      p_request: { userId: "user-1", seriesId: "series-1" },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "recurring_task_lifecycle", {
      p_operation: "end-series",
      p_request: {
        userId: "user-1",
        seriesId: "series-1",
        effectiveDate: "2026-08-04",
      },
    });

    await lifecycle.deleteSeries({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-04",
    });

    expect(rpc).toHaveBeenNthCalledWith(3, "recurring_task_lifecycle", {
      p_operation: "end-series",
      p_request: {
        userId: "user-1",
        seriesId: "series-1",
        effectiveDate: "2026-08-04",
      },
    });
  });
});
