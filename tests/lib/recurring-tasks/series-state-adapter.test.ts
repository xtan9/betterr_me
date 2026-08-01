import { describe, expect, it, vi } from "vitest";

import {
  SeriesStateAdapter,
  seriesStateHttpFailure,
  toSeriesRevisionRequest,
  type SeriesStatePersistence,
} from "@/lib/recurring-tasks/series-state-adapter";

function lifecycleSeries() {
  return {
    id: "series-1",
    userId: "user-1",
    status: "active",
    timeZone: "America/Los_Angeles",
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    occurrenceLimit: null,
    lastScheduledDate: null,
    coverageHorizon: "2026-08-15",
    currentRevisionId: "revision-1",
    revisionToken: 1,
    revisions: [{
      id: "revision-1",
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
      createdAt: "2026-08-01T00:00:00.000Z",
    }],
    occurrences: [{
      id: "occurrence-1",
      seriesId: "series-1",
      revisionId: "revision-1",
      scheduledDate: "2026-08-03",
      dueDate: null,
      details: {
        title: "Daily review",
        description: null,
        priority: 1,
        categoryId: null,
        dueTime: "09:00:00",
      },
      state: "open",
      overrides: {},
      taskId: "task-1",
      completedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    }],
    intentionalAbsences: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  } as never;
}

function lifecycleSuccess(
  status: "complete" | "already-applied" = "complete",
  series = lifecycleSeries(),
) {
  return {
    status,
    type: status,
    value: {},
    series,
    occurrences: [],
    intentionalAbsences: [],
  } as never;
}

function createPersistence(): SeriesStatePersistence {
  return {
    getTask: vi.fn(),
  };
}

describe("SeriesStateAdapter", () => {
  it("maps explicit effective dates ahead of inferred today for a revision", () => {
    expect(toSeriesRevisionRequest({
      userId: " user-1 ",
      seriesId: " series-1 ",
      title: "  Revised review  ",
      description: "  New details  ",
      priority: 2,
      categoryId: " category-1 ",
      dueTime: "09:00",
      effectiveDate: "2026-08-05",
      inferredDate: "2026-08-01",
      scope: "following",
    })).toEqual({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-05",
      scope: "following",
      defaults: {
        title: "Revised review",
        description: "New details",
        priority: 2,
        categoryId: "category-1",
        dueTime: "09:00",
      },
    });
  });

  it("uses one lifecycle revision command", async () => {
    const persistence = createPersistence();
    const reviseSeries = vi.fn().mockResolvedValue(lifecycleSuccess());
    const adapter = new SeriesStateAdapter(persistence, {
      lifecycle: {
        getSeries: vi.fn(),
        reviseSeries,
        pauseSeries: vi.fn(),
        resumeSeries: vi.fn(),
        endSeries: vi.fn(),
      },
    });

    const outcome = await adapter.revise({
      userId: "user-1",
      seriesId: "series-1",
      title: "Revised review",
      effectiveDate: "2026-08-05",
      inferredDate: "2026-08-01",
      scope: "following",
    });

    expect(outcome.status).toBe("complete");
    expect(reviseSeries).toHaveBeenCalledExactlyOnceWith({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-05",
      scope: "following",
      defaults: { title: "Revised review" },
    });
  });

  it("requires the lifecycle writer", async () => {
    const persistence = createPersistence();

    const outcome = await new SeriesStateAdapter(persistence).revise({
      userId: "user-1",
      seriesId: "series-1",
      title: "Legacy review",
    });

    expect(outcome).toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      reason: "Recurring Task Lifecycle is not configured",
    });
  });

  it("maps a following-scope Series Default edit to one effective-dated Revision", async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask).mockResolvedValue({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
      scheduled_date: "2026-08-03",
    } as never);
    const reviseSeries = vi.fn().mockResolvedValue(lifecycleSuccess());
    const adapter = new SeriesStateAdapter(persistence, {
      lifecycle: {
        getSeries: vi.fn().mockResolvedValue(lifecycleSuccess()),
        reviseSeries,
        pauseSeries: vi.fn(),
        resumeSeries: vi.fn(),
        endSeries: vi.fn(),
      },
    });

    const outcome = await adapter.editScope({
      userId: "user-1",
      taskId: "task-1",
      title: "Following review",
      scope: "following",
      effectiveDate: "2026-08-05",
      inferredDate: "2026-08-01",
    });

    expect(outcome.status).toBe("complete");
    expect(reviseSeries).toHaveBeenCalledExactlyOnceWith({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-05",
      scope: "following",
      defaults: { title: "Following review" },
    });
  });

  it("maps pause and resume dates with explicit intent before inferred today", async () => {
    const persistence = createPersistence();
    const pauseSeries = vi.fn().mockResolvedValue(lifecycleSuccess());
    const resumeSeries = vi.fn().mockResolvedValue(lifecycleSuccess());
    const adapter = new SeriesStateAdapter(persistence, {
      lifecycle: {
        getSeries: vi.fn(),
        reviseSeries: vi.fn(),
        pauseSeries,
        resumeSeries,
        endSeries: vi.fn(),
      },
    });

    await adapter.pause({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-06",
      inferredDate: "2026-08-01",
    });
    await adapter.resume({
      userId: "user-1",
      seriesId: "series-1",
      inferredDate: "2026-08-02",
      coverageThrough: "2026-08-09",
    });
    expect(pauseSeries).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-06",
    });
    expect(resumeSeries).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      effectiveDate: "2026-08-02",
      coverage: { from: "2026-08-02", to: "2026-08-09" },
    });
  });

  it.each([
    [
      "not-found",
      { status: "not-found", type: "not-found" },
      404,
    ],
    [
      "conflict",
      { status: "conflict", type: "conflict", reason: "internal detail" },
      409,
    ],
    [
      "invalid-transition",
      {
        status: "invalid-transition",
        type: "invalid-transition",
        reason: "Ended Series cannot be resumed",
      },
      400,
    ],
    [
      "coverage-unavailable",
      {
        status: "coverage-unavailable",
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-01", to: "2026-08-08" },
        coverageHorizon: "2026-08-01",
        reason: "temporary",
      },
      503,
    ],
  ] as const)("maps typed %s outcomes for HTTP", (_name, outcome, status) => {
    expect(seriesStateHttpFailure(outcome as never).status).toBe(status);
  });
});
