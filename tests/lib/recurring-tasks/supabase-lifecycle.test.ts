import { describe, expect, it, vi } from "vitest";

import { SupabaseRecurringTaskLifecycle } from "@/lib/recurring-tasks/supabase-lifecycle";

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
});
