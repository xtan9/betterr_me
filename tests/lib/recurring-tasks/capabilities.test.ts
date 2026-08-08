import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticatedRecurringTaskCapabilities,
  createRecurringTaskCapabilitiesForLifecycle,
  RECURRING_TASK_OPERATION_IDS,
  type AuthenticatedRecurringTaskCapabilities,
  type CreateSeriesCommand,
} from "@/lib/recurring-tasks/capabilities";
import { createInMemoryRecurringTaskCapabilities } from "@/lib/recurring-tasks/reference-capabilities";
import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
  type UserCoverageOutcome,
  type RecurringTaskLifecyclePort,
} from "@/lib/recurring-tasks/lifecycle";
import type { SupabaseClient } from "@supabase/supabase-js";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

function createInput(): CreateSeriesCommand {
  return {
    operationId: "create-series-1",
    recurrenceRule: { frequency: "daily", interval: 1 },
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    timeZone: "UTC",
    defaults: {
      title: "Daily review",
      description: null,
      priority: 1,
      categoryId: null,
      dueTime: "09:00:00",
    },
    coverage: { from: "2026-08-01", to: "2026-08-03" },
  };
}

function createReferenceLifecycle(): RecurringTaskLifecycle {
  const ids = [
    "series-1",
    "revision-1",
    "occurrence-1",
    "occurrence-2",
    "occurrence-3",
    "revision-2",
    "revision-3",
    "revision-4",
  ];
  return new RecurringTaskLifecycle(
    new InMemoryRecurringTaskLifecyclePersistence(),
    {
      clock: () => new Date("2026-08-01T12:00:00.000Z"),
      idFactory: () => ids.shift() ?? "unexpected-id",
    },
  );
}

function createSupabaseCapabilities(): {
  capabilities: AuthenticatedRecurringTaskCapabilities;
  rpc: ReturnType<typeof vi.fn>;
} {
  const lifecycle = createReferenceLifecycle();
  const rpc = vi.fn(async (
    _name: string,
    args: { p_operation: string; p_request: Record<string, unknown> },
  ) => ({
    data: await callLifecycle(lifecycle, args.p_operation, args.p_request),
    error: null,
  }));

  return {
    capabilities: createAuthenticatedRecurringTaskCapabilities(
      { rpc } as unknown as SupabaseClient,
      principal,
    ),
    rpc,
  };
}

async function callLifecycle(
  lifecycle: RecurringTaskLifecyclePort,
  operation: string,
  request: Record<string, unknown>,
) {
  switch (operation) {
    case "create-series":
      return lifecycle.createSeries(request as never);
    case "revise-series":
      return lifecycle.reviseSeries(request as never);
    case "pause-series":
      return lifecycle.pauseSeries(request as never);
    case "resume-series":
      return lifecycle.resumeSeries(request as never);
    case "end-series":
      return lifecycle.endSeries(request as never);
    case "ensure-user-coverage":
      return lifecycle.ensureUserCoverage(request as never);
    case "list-series":
      return lifecycle.listSeries(
        request.userId as string,
        request.status as never,
      );
    case "get-series":
      return lifecycle.getSeries(
        request.userId as string,
        request.seriesId as string,
      );
    default:
      throw new Error(`Unsupported conformance operation: ${operation}`);
  }
}

function runWalkingSkeleton(
  name: string,
  makeCapabilities: () => AuthenticatedRecurringTaskCapabilities,
) {
  describe(`${name} recurring-task capability conformance`, () => {
    it("binds authority to the principal and preserves operation replay", async () => {
      const capabilities = makeCapabilities();
      const input = createInput();

      const created = await capabilities.seriesCommands.createSeries(input);

      expect(created.type).toBe("created");
      expect(created.operation).toBe(RECURRING_TASK_OPERATION_IDS.createSeries);
      expect(created.status).toBe("complete");
      if (!("series" in created)) return;
      expect(created.series.version).toEqual(expect.any(String));
      expect(created.series.version).not.toBe("1");
      expect(created.series).not.toHaveProperty("revisionToken");
      expect(created.series).not.toHaveProperty("userId");

      const replay = await capabilities.seriesCommands.createSeries(input);
      expect(replay.type).toBe("created");
      expect(replay.status).toBe("already-applied");
      if (!("series" in replay)) return;
      expect(replay.series.id).toBe(created.series.id);
    });

    it("exposes focused queries and rejects stale opaque versions", async () => {
      const capabilities = makeCapabilities();
      const created = await capabilities.seriesCommands.createSeries(createInput());
      if (!("series" in created)) return;
      const seriesId = created.series.id;

      const listed = await capabilities.seriesQueries.listSeries();
      expect(listed.type).toBe("listed");
      if (!("series" in listed)) return;
      expect(listed.series.map((series) => series.id)).toEqual([seriesId]);

      const detail = await capabilities.seriesQueries.getSeries({ seriesId });
      expect(detail.type).toBe("found");
      if (!("series" in detail)) return;
      expect(detail.series.version).toBe(created.series.version);

      const revised = await capabilities.seriesCommands.reviseSeries({
        operationId: "revise-series-1",
        seriesId,
        version: created.series.version,
        effectiveDate: "2026-08-02",
        defaults: { title: "Updated review" },
      });
      expect(revised.type).toBe("revised");
      if (!("series" in revised)) return;
      expect(revised.series.version).not.toBe(created.series.version);

      const stale = await capabilities.seriesCommands.reviseSeries({
        operationId: "revise-series-stale",
        seriesId,
        version: created.series.version,
        effectiveDate: "2026-08-03",
        defaults: { title: "Stale review" },
      });
      expect(stale.type).toBe("conflict");
      if (stale.type !== "conflict") return;
      expect(stale.expectedVersion).toBe(created.series.version);
      expect(stale.actualVersion).toBe(revised.series.version);
    });

    it("exposes operation-specific Series state successes", async () => {
      const capabilities = makeCapabilities();
      const created = await capabilities.seriesCommands.createSeries({
        ...createInput(),
        operationId: "state-create-1",
        coverage: undefined,
      });
      if (!("series" in created)) return;

      const paused = await capabilities.seriesCommands.pauseSeries({
        operationId: "pause-series-1",
        seriesId: created.series.id,
        version: created.series.version,
        effectiveDate: "2026-08-04",
      });
      expect(paused.type).toBe("paused");
      expect(paused.operation).toBe(RECURRING_TASK_OPERATION_IDS.pauseSeries);
      if (!("series" in paused)) return;

      const resumed = await capabilities.seriesCommands.resumeSeries({
        operationId: "resume-series-1",
        seriesId: created.series.id,
        version: paused.series.version,
        effectiveDate: "2026-08-05",
      });
      expect(resumed.type).toBe("resumed");
      expect(resumed.operation).toBe(RECURRING_TASK_OPERATION_IDS.resumeSeries);
      if (!("series" in resumed)) return;

      const ended = await capabilities.seriesCommands.endSeries({
        operationId: "end-series-1",
        seriesId: created.series.id,
        version: resumed.series.version,
        effectiveDate: "2026-08-06",
      });
      expect(ended.type).toBe("ended");
      expect(ended.operation).toBe(RECURRING_TASK_OPERATION_IDS.endSeries);
      if (!("series" in ended)) return;
      expect(ended.series.status).toBe("ended");
    });

    it("returns structured Coverage completeness and stable validation failures", async () => {
      const capabilities = makeCapabilities();
      const created = await capabilities.seriesCommands.createSeries(createInput());
      if (!("series" in created)) return;

      const coverage = await capabilities.coverage.ensure({
        operationId: "coverage-1",
        range: { from: "2026-08-01", to: "2026-08-03" },
      });
      expect(coverage.type).toBe("coverage");
      if (coverage.type !== "coverage") return;
      expect(coverage.completeness).toEqual({
        status: "complete",
        type: "complete",
        requestedRange: { from: "2026-08-01", to: "2026-08-03" },
        failedSeriesIds: [],
      });
      expect(coverage.series.map((series) => series.id)).toContain(created.series.id);

      const invalid = await capabilities.seriesCommands.createSeries({
        ...createInput(),
        operationId: "",
      });
      expect(invalid).toEqual({
        type: "validation",
        status: "validation",
        operation: RECURRING_TASK_OPERATION_IDS.createSeries,
        operationId: "",
        field: "operationId",
        reason: "Operation ID is required",
      });
    });
  });
}

runWalkingSkeleton("in-memory reference", () =>
  createInMemoryRecurringTaskCapabilities(principal, {
    clock: () => new Date("2026-08-01T12:00:00.000Z"),
    idFactory: (() => {
      const ids = [
        "series-1",
        "revision-1",
        "occurrence-1",
        "occurrence-2",
        "occurrence-3",
        "revision-2",
        "revision-3",
        "revision-4",
      ];
      return () => ids.shift() ?? "unexpected-id";
    })(),
  }),
);

runWalkingSkeleton("production Supabase", () => createSupabaseCapabilities().capabilities);

describe("production recurring-task capability composition", () => {
  it("injects the authenticated principal into the private lifecycle request", async () => {
    const { capabilities, rpc } = createSupabaseCapabilities();
    const callerInput = {
      ...createInput(),
      operationId: "principal-binding",
      userId: "caller-supplied-attacker",
    } as CreateSeriesCommand & { userId: string };

    await capabilities.seriesCommands.createSeries(callerInput);

    expect(rpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "create-series",
      p_request: expect.objectContaining({
        userId: principal.userId,
        idempotencyKey: "principal-binding",
      }),
    });
  });

  it("rejects a non-user principal at capability construction", () => {
    expect(() => createAuthenticatedRecurringTaskCapabilities(
      { rpc: vi.fn() } as unknown as SupabaseClient,
      {
        type: "service",
        serviceId: "service-1",
        credential: "adminSecret",
      } as never,
    )).toThrow("An authenticated user principal is required");
  });

  it("maps partial and unavailable Coverage to structured completeness", async () => {
    const lifecycle = createReferenceLifecycle();
    const range = { from: "2026-08-01", to: "2026-08-03" };
    const outcomes: UserCoverageOutcome[] = [
      {
        status: "partial",
        type: "partial",
        requestedRange: range,
        failedSeriesIds: ["series-b", "series-a", "series-b"],
        series: [],
        occurrences: [],
        intentionalAbsences: [],
      },
      {
        status: "coverage-unavailable",
        type: "coverage-unavailable",
        requestedRange: range,
        coverageHorizon: "2026-07-31",
        reason: "The database was unavailable",
      },
    ];
    vi.spyOn(lifecycle, "ensureUserCoverage")
      .mockResolvedValueOnce(outcomes[0])
      .mockResolvedValueOnce(outcomes[1]);
    const capabilities = createRecurringTaskCapabilitiesForLifecycle(
      principal,
      lifecycle,
    );

    const partial = await capabilities.coverage.ensure({
      operationId: "coverage-partial-1",
      range,
    });
    expect(partial).toMatchObject({
      type: "coverage",
      status: "partial",
      completeness: {
        type: "partial",
        status: "partial",
        requestedRange: range,
        failedSeriesIds: ["series-a", "series-b"],
      },
    });

    const unavailable = await capabilities.coverage.ensure({
      operationId: "coverage-unavailable-1",
      range,
    });
    expect(unavailable).toMatchObject({
      type: "coverage",
      status: "unavailable",
      completeness: {
        type: "unavailable",
        status: "unavailable",
        requestedRange: range,
        failedSeriesIds: [],
        reason: "The database was unavailable",
      },
    });
  });
});
