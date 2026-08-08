import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticatedRecurringTaskCapabilities,
  createRecurringTaskCapabilitiesForLifecycle,
  encodeSeriesVersion,
  RECURRING_TASK_OPERATION_IDS,
  type AuthenticatedRecurringTaskCapabilities,
  type CreateSeriesCommand,
} from "@/lib/recurring-tasks/capabilities";
import { createInMemoryRecurringTaskCapabilities } from "@/lib/recurring-tasks/reference-capabilities";
import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
  type RecurringTaskSeries,
  type UserCoverageOutcome,
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
  const rpc = createSupabaseRpcFixture();

  return {
    capabilities: createAuthenticatedRecurringTaskCapabilities(
      { rpc } as unknown as SupabaseClient,
      principal,
    ),
    rpc,
  };
}

/**
 * Raw RPC fixture for the production Supabase adapter seam.
 *
 * This deliberately does not instantiate the private lifecycle. It models the
 * JSON returned by recurring_task_lifecycle so the conformance lane exercises
 * SupabaseRecurringTaskLifecycle request/response mapping and capability
 * projection independently of the in-memory reference implementation.
 */
function createSupabaseRpcFixture() {
  let series: RecurringTaskSeries | undefined;
  const replayedOperations = new Map<string, Record<string, unknown>>();
  const mutatingOperations = new Set([
    "create-series",
    "revise-series",
    "pause-series",
    "resume-series",
    "end-series",
    "ensure-user-coverage",
  ]);

  return vi.fn(async (
    _name: string,
    args: { p_operation: string; p_request: Record<string, unknown> },
  ) => {
    const { p_operation: operation, p_request: request } = args;
    const idempotencyKey = typeof request.idempotencyKey === "string"
      ? `${operation}:${request.idempotencyKey}`
      : undefined;
    const replay = idempotencyKey === undefined
      ? undefined
      : replayedOperations.get(idempotencyKey);
    if (replay) {
      return {
        data: {
          ...cloneRpcData(replay),
          status: "already-applied",
          type: "already-applied",
        },
        error: null,
      };
    }

    const data = handleSupabaseFixtureOperation(operation, request, () => series, (next) => {
      series = next;
    });
    if (idempotencyKey !== undefined && mutatingOperations.has(operation)) {
      replayedOperations.set(idempotencyKey, cloneRpcData(data));
    }
    return { data, error: null };
  });
}

function handleSupabaseFixtureOperation(
  operation: string,
  request: Record<string, unknown>,
  readSeries: () => RecurringTaskSeries | undefined,
  writeSeries: (series: RecurringTaskSeries) => void,
): Record<string, unknown> {
  const current = readSeries();

  if (operation === "create-series") {
    if (typeof request.userId !== "string") {
      return { status: "not-found", type: "not-found" };
    }
    const created = createSupabaseFixtureSeries(request.userId);
    const coverage = request.coverage;
    if (coverage && typeof coverage === "object" && "to" in coverage) {
      created.coverageHorizon = coverage.to as string;
    }
    writeSeries(created);
    return supabaseFixtureSuccess(created);
  }

  if (!current || request.userId !== current.userId) {
    return { status: "not-found", type: "not-found" };
  }
  if (
    ["get-series", "revise-series", "pause-series", "resume-series", "end-series"]
      .includes(operation)
    && request.seriesId !== current.id
  ) {
    return { status: "not-found", type: "not-found" };
  }

  switch (operation) {
    case "list-series":
      return {
        series: request.status === undefined || request.status === current.status
          ? [cloneSupabaseFixtureSeries(current)]
          : [],
      };
    case "get-series":
      return request.seriesId === current.id
        ? supabaseFixtureSuccess(current)
        : { status: "not-found", type: "not-found" };
    case "revise-series": {
      const conflict = expectedVersionConflict(current, request);
      if (conflict) return conflict;
      const revised = cloneSupabaseFixtureSeries(current);
      revised.revisionToken += 1;
      const defaults = request.defaults;
      if (defaults && typeof defaults === "object" && "title" in defaults) {
        const revision = revised.revisions.find(
          (candidate) => candidate.id === revised.currentRevisionId,
        );
        if (revision) revision.defaults.title = defaults.title as string;
      }
      writeSeries(revised);
      return supabaseFixtureSuccess(revised);
    }
    case "pause-series":
      return transitionSupabaseFixtureSeries(current, request, "paused", writeSeries);
    case "resume-series":
      return transitionSupabaseFixtureSeries(current, request, "active", writeSeries);
    case "end-series":
      return transitionSupabaseFixtureSeries(current, request, "ended", writeSeries);
    case "ensure-user-coverage": {
      const covered = cloneSupabaseFixtureSeries(current);
      const range = request.range;
      if (range && typeof range === "object" && "to" in range) {
        covered.coverageHorizon = range.to as string;
        writeSeries(covered);
      }
      return {
        status: "complete",
        type: "complete",
        series: [covered],
        occurrences: structuredClone(covered.occurrences),
        intentionalAbsences: [...covered.intentionalAbsences],
      };
    }
    default:
      throw new Error(`Unsupported Supabase RPC operation: ${operation}`);
  }
}

function transitionSupabaseFixtureSeries(
  current: RecurringTaskSeries,
  request: Record<string, unknown>,
  status: RecurringTaskSeries["status"],
  writeSeries: (series: RecurringTaskSeries) => void,
): Record<string, unknown> {
  const conflict = expectedVersionConflict(current, request);
  if (conflict) return conflict;
  if (
    (status === "paused" && current.status !== "active")
    || (status === "active" && current.status !== "paused")
  ) {
    return {
      status: "invalid-transition",
      type: "invalid-transition",
      reason: "The Series state transition is invalid",
    };
  }
  const next = cloneSupabaseFixtureSeries(current);
  next.status = status;
  next.revisionToken += 1;
  writeSeries(next);
  return supabaseFixtureSuccess(next);
}

function expectedVersionConflict(
  series: RecurringTaskSeries,
  request: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (
    typeof request.expectedRevisionToken === "number"
    && request.expectedRevisionToken !== series.revisionToken
  ) {
    return {
      status: "conflict",
      type: "conflict",
      expectedRevisionToken: request.expectedRevisionToken,
      actualRevisionToken: series.revisionToken,
    };
  }
  return undefined;
}

function createSupabaseFixtureSeries(userId: string): RecurringTaskSeries {
  const createdAt = "2026-08-01T12:00:00.000Z";
  const revisionId = "revision-1";
  return {
    id: "series-1",
    userId,
    status: "active",
    timeZone: "UTC",
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    occurrenceLimit: null,
    lastScheduledDate: null,
    coverageHorizon: null,
    currentRevisionId: revisionId,
    revisionToken: 1,
    revisions: [
      {
        id: revisionId,
        seriesId: "series-1",
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
        state: "active",
        recurrenceRule: { frequency: "daily", interval: 1 },
        recurrenceAnchor: "2026-08-01",
        activationDate: "2026-08-01",
        defaults: {
          title: "Daily review",
          description: null,
          priority: 1,
          categoryId: null,
          dueTime: "09:00:00",
        },
        createdAt,
      },
    ],
    occurrences: [],
    intentionalAbsences: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function cloneSupabaseFixtureSeries(series: RecurringTaskSeries): RecurringTaskSeries {
  return structuredClone(series);
}

function supabaseFixtureSuccess(
  series: RecurringTaskSeries,
  status: "complete" | "already-applied" = "complete",
): Record<string, unknown> {
  const snapshot = cloneSupabaseFixtureSeries(series);
  return {
    status,
    type: status,
    value: snapshot,
    series: snapshot,
    occurrences: structuredClone(snapshot.occurrences),
    intentionalAbsences: [...snapshot.intentionalAbsences],
  };
}

function cloneRpcData(data: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(data);
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

    it("returns typed invalid, missing, stale, and replay outcomes for state commands", async () => {
      const capabilities = makeCapabilities();
      const created = await capabilities.seriesCommands.createSeries({
        ...createInput(),
        operationId: "typed-outcome-create",
        coverage: undefined,
      });
      if (!("series" in created)) return;

      const missingOperation = await capabilities.seriesCommands.pauseSeries({
        operationId: "",
        seriesId: created.series.id,
        version: created.series.version,
      });
      expect(missingOperation).toMatchObject({
        type: "validation",
        status: "validation",
        operation: RECURRING_TASK_OPERATION_IDS.pauseSeries,
        field: "operationId",
      });

      const missingVersion = await capabilities.seriesCommands.pauseSeries({
        operationId: "missing-version",
        seriesId: created.series.id,
        version: "" as never,
      });
      expect(missingVersion).toMatchObject({
        type: "validation",
        status: "validation",
        operation: RECURRING_TASK_OPERATION_IDS.pauseSeries,
        field: "version",
      });

      const missingSeries = await capabilities.seriesCommands.pauseSeries({
        operationId: "missing-series",
        seriesId: "missing-series",
        version: encodeSeriesVersion("missing-series", 1),
      });
      expect(missingSeries).toMatchObject({
        type: "not-found",
        status: "not-found",
        operation: RECURRING_TASK_OPERATION_IDS.pauseSeries,
      });

      const pauseInput = {
        operationId: "typed-pause",
        seriesId: created.series.id,
        version: created.series.version,
        effectiveDate: "2026-08-04",
      };
      const paused = await capabilities.seriesCommands.pauseSeries(pauseInput);
      expect(paused).toMatchObject({ type: "paused", status: "complete" });
      if (!("series" in paused)) return;

      const replay = await capabilities.seriesCommands.pauseSeries(pauseInput);
      expect(replay).toMatchObject({
        type: "paused",
        status: "already-applied",
        operationId: "typed-pause",
      });

      const staleResume = await capabilities.seriesCommands.resumeSeries({
        operationId: "stale-resume",
        seriesId: created.series.id,
        version: created.series.version,
        effectiveDate: "2026-08-05",
      });
      expect(staleResume).toMatchObject({
        type: "conflict",
        status: "conflict",
        operation: RECURRING_TASK_OPERATION_IDS.resumeSeries,
        expectedVersion: created.series.version,
        actualVersion: paused.series.version,
      });

      const invalidPause = await capabilities.seriesCommands.pauseSeries({
        operationId: "invalid-pause",
        seriesId: created.series.id,
        version: paused.series.version,
        effectiveDate: "2026-08-05",
      });
      expect(invalidPause).toMatchObject({
        type: "invalid-transition",
        status: "invalid-transition",
        operation: RECURRING_TASK_OPERATION_IDS.pauseSeries,
      });

      const ended = await capabilities.seriesCommands.endSeries({
        operationId: "typed-end",
        seriesId: created.series.id,
        version: paused.series.version,
        effectiveDate: "2026-08-05",
      });
      expect(ended).toMatchObject({ type: "ended", status: "complete" });
      if (!("series" in ended)) return;

      const endReplay = await capabilities.seriesCommands.endSeries({
        operationId: "typed-end",
        seriesId: created.series.id,
        version: paused.series.version,
        effectiveDate: "2026-08-05",
      });
      expect(endReplay).toMatchObject({
        type: "ended",
        status: "already-applied",
        operationId: "typed-end",
      });
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

  it("maps lifecycle validation exceptions to stable public failure codes", async () => {
    const lifecycle = createReferenceLifecycle();
    vi.spyOn(lifecycle, "createSeries").mockRejectedValue(
      new RangeError("Activation Date cannot be before the Recurrence Anchor"),
    );
    vi.spyOn(lifecycle, "listSeries").mockRejectedValue(
      new RangeError("private query validation detail"),
    );
    const capabilities = createRecurringTaskCapabilitiesForLifecycle(
      principal,
      lifecycle,
    );

    const commandFailure = await capabilities.seriesCommands.createSeries({
      ...createInput(),
      operationId: "range-error-command",
    });
    expect(commandFailure).toMatchObject({
      type: "validation",
      status: "validation",
      operation: RECURRING_TASK_OPERATION_IDS.createSeries,
      operationId: "range-error-command",
      reason: "invalid-command",
    });
    expect(commandFailure).not.toHaveProperty(
      "reason",
      "Activation Date cannot be before the Recurrence Anchor",
    );

    const queryFailure = await capabilities.seriesQueries.listSeries();
    expect(queryFailure).toEqual({
      type: "validation",
      status: "validation",
      operation: RECURRING_TASK_OPERATION_IDS.listSeries,
      reason: "invalid-query",
    });
  });
});
