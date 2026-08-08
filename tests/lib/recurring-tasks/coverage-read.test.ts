import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createCoverageRead,
  type CoverageReadSource,
} from "@/lib/recurring-tasks/coverage-read";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

const range = { from: "2026-08-07", to: "2026-08-09" };

function supabaseFor(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function completeOutcome() {
  return {
    status: "complete",
    type: "complete",
    series: [],
    occurrences: [],
    intentionalAbsences: [],
  };
}

describe("authenticated Coverage Read", () => {
  it.each([
    ["task", "task-read-coverage:user-1:2026-08-07:2026-08-09"],
    ["dashboard", "dashboard-read-coverage:user-1:2026-08-07:2026-08-09"],
    ["sidebar", "sidebar-read-coverage:user-1:2026-08-07:2026-08-09"],
    ["calendar", "calendar-read-coverage:user-1:2026-08-07:2026-08-09"],
  ] as const)(
    "binds the authenticated principal and derives the %s source operation identity",
    async (source, operationId) => {
      const { client, rpc } = supabaseFor(completeOutcome());
      const boundPrincipal = { ...principal };
      const read = createCoverageRead(
        client,
        boundPrincipal,
        source as CoverageReadSource,
      );

      boundPrincipal.userId = "caller-supplied-attacker";
      const result = await read.ensure(range);

      expect(result).toMatchObject({
        status: "complete",
        type: "complete",
        requestedRange: range,
      });
      expect(result).not.toHaveProperty("operationId");
      expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
        p_operation: "ensure-user-coverage",
        p_request: {
          userId: "user-1",
          range,
          idempotencyKey: operationId,
          source: "interactive",
        },
      });
    },
  );

  it("rejects a source outside the closed Coverage Read vocabulary", () => {
    const { client } = supabaseFor(completeOutcome());

    expect(() => createCoverageRead(
      client,
      principal,
      "reports" as never,
    )).toThrow("Coverage Read source is invalid");
  });

  it("supports options-bound construction without exposing operation inputs", async () => {
    const { client, rpc } = supabaseFor(completeOutcome());
    const read = createCoverageRead({
      supabase: client,
      principal,
      source: "task",
    });

    await read.ensure(range);

    expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "ensure-user-coverage",
      p_request: expect.objectContaining({
        userId: "user-1",
        idempotencyKey: "task-read-coverage:user-1:2026-08-07:2026-08-09",
      }),
    });
  });

  it("returns complete Coverage Completeness unchanged", async () => {
    const { client } = supabaseFor(completeOutcome());
    const read = createCoverageRead(client, principal, "task");

    await expect(read.ensure(range)).resolves.toEqual({
      status: "complete",
      type: "complete",
      requestedRange: range,
      failedSeriesIds: [],
    });
  });

  it("returns partial Coverage Completeness unchanged", async () => {
    const { client } = supabaseFor({
      status: "partial",
      type: "partial",
      requestedRange: range,
      failedSeriesIds: ["series-a", "series-b"],
      series: [],
      occurrences: [],
      intentionalAbsences: [],
    });
    const read = createCoverageRead(client, principal, "task");

    await expect(read.ensure(range)).resolves.toEqual({
      status: "partial",
      type: "partial",
      requestedRange: range,
      failedSeriesIds: ["series-a", "series-b"],
    });
  });

  it("returns unavailable Coverage Completeness unchanged", async () => {
    const { client } = supabaseFor({
      status: "coverage-unavailable",
      type: "coverage-unavailable",
      requestedRange: range,
      coverageHorizon: null,
      reason: "The database is still catching up",
    });
    const read = createCoverageRead(client, principal, "task");

    await expect(read.ensure(range)).resolves.toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: range,
      failedSeriesIds: [],
      reason: "The database is still catching up",
    });
  });

  it.each([
    [
      "validation",
      () => ({ from: "not-a-date", to: "2026-08-09" }),
    ],
    [
      "not-found",
      () => range,
    ],
    [
      "conflict",
      () => range,
    ],
    [
      "invalid-transition",
      () => range,
    ],
  ] as const)(
    "normalizes a %s failure to generic unavailable Coverage",
    async (failure, requestFactory) => {
      const { client } = failure === "validation"
        ? supabaseFor(completeOutcome())
        : supabaseFor({
          status: failure,
          type: failure,
          ...(failure === "invalid-transition" ? { reason: "private detail" } : {}),
        });
      const read = createCoverageRead(client, principal, "task");

      const result = await read.ensure(requestFactory() as typeof range);

      expect(result).toEqual({
        status: "unavailable",
        type: "unavailable",
        requestedRange: requestFactory(),
        failedSeriesIds: [],
        reason: "Coverage could not be ensured.",
      });
    },
  );

  it("preserves the reason from an explicit typed Coverage-unavailable failure", async () => {
    const { client } = supabaseFor({
      status: "coverage-unavailable",
      type: "coverage-unavailable",
      requestedRange: range,
      coverageHorizon: "2026-08-06",
      reason: "Coverage horizon could not be advanced",
    });
    const read = createCoverageRead(client, principal, "dashboard");

    await expect(read.ensure(range)).resolves.toMatchObject({
      status: "unavailable",
      reason: "Coverage horizon could not be advanced",
    });
  });

  it("normalizes a lifecycle validation exception without reporting it as unexpected", async () => {
    const rpc = vi.fn().mockRejectedValue(
      new RangeError("private validation detail"),
    );
    const read = createCoverageRead(
      { rpc } as unknown as SupabaseClient,
      principal,
      "task",
    );
    const observer = vi.fn();

    await expect(read.ensure(range, observer)).resolves.toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: range,
      failedSeriesIds: [],
      reason: "Coverage could not be ensured.",
    });
    expect(observer).not.toHaveBeenCalled();
  });

  it("observes an unexpected cause once and returns no raw diagnostic", async () => {
    const cause = new Error("secret database details");
    const rpc = vi.fn().mockRejectedValue(cause);
    const read = createCoverageRead(
      { rpc } as unknown as SupabaseClient,
      principal,
      "calendar",
    );
    const observer = vi.fn();

    const result = await read.ensure(range, observer);

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith(cause);
    expect(result).toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: range,
      failedSeriesIds: [],
      reason: "Coverage could not be ensured.",
    });
    expect(JSON.stringify(result)).not.toContain("secret database details");
  });

  it("swallows observer failures without changing the generic unavailable result", async () => {
    const cause = { private: "cause" };
    const rpc = vi.fn().mockRejectedValue(cause);
    const read = createCoverageRead(
      { rpc } as unknown as SupabaseClient,
      principal,
      "sidebar",
    );
    const observer = vi.fn().mockRejectedValue(new Error("observer failed"));

    await expect(read.ensure(range, observer)).resolves.toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: range,
      failedSeriesIds: [],
      reason: "Coverage could not be ensured.",
    });
    expect(observer).toHaveBeenCalledTimes(1);
  });
});
