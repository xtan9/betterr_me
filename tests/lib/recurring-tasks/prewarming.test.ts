import { describe, expect, it, vi } from "vitest";

import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
  type RecurringLifecycleSignal,
} from "@/lib/recurring-tasks/internal/lifecycle";
import { prewarmActiveRecurringTaskCoverage } from "@/lib/recurring-tasks/internal/prewarming";

function defaults(title: string) {
  return {
    title,
    description: "private description",
    priority: 0 as const,
    categoryId: null,
    dueTime: null,
  };
}

async function createSeries(
  lifecycle: RecurringTaskLifecycle,
  userId: string,
  title: string,
) {
  const result = await lifecycle.createSeries({
    userId,
    recurrenceRule: { frequency: "daily", interval: 1 },
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    defaults: defaults(title),
  });
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error("Series was not created");
  return result.series;
}

describe("recurring task prewarming", () => {
  it("returns a partial result, retries only the failed Series, and omits user content from signals", async () => {
    const signals: RecurringLifecycleSignal[] = [];
    let failNextOccurrence = false;
    let idCalls = 0;
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      {
        clock: () => new Date("2026-08-01T12:00:00.000Z"),
        idFactory: () => {
          if (failNextOccurrence) {
            failNextOccurrence = false;
            throw new Error("synthetic persistence failure");
          }
          idCalls += 1;
          return `id-${idCalls}`;
        },
        observer: (signal) => signals.push(signal),
      },
    );
    const first = await createSeries(lifecycle, "user-prewarm", "SECRET_TITLE");
    const second = await createSeries(lifecycle, "user-prewarm", "second title");

    failNextOccurrence = true;
    const partial = await prewarmActiveRecurringTaskCoverage(lifecycle, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      days: 3,
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    expect(partial).toMatchObject({
      status: "partial",
      seriesCount: 2,
      warmedSeriesCount: 1,
      failedSeriesIds: [first.id],
    });
    expect(partial.attempts).toEqual([
      { seriesId: first.id, attempts: 1, status: "failed" },
      { seriesId: second.id, attempts: 1, status: "complete" },
    ]);

    const retried = await prewarmActiveRecurringTaskCoverage(lifecycle, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      days: 3,
      maxAttempts: 2,
      retryDelayMs: 0,
    });
    expect(retried).toMatchObject({
      status: "complete",
      seriesCount: 2,
      warmedSeriesCount: 1,
      failedSeriesIds: [],
    });
    expect(retried.attempts).toEqual([
      { seriesId: first.id, attempts: 1, status: "complete" },
      { seriesId: second.id, attempts: 0, status: "already-covered" },
    ]);

    const serializedSignals = JSON.stringify(signals);
    expect(serializedSignals).not.toContain("SECRET_TITLE");
    expect(serializedSignals).not.toContain("private description");
    expect(serializedSignals).not.toContain("second title");
  });

  it("does not prewarm Paused or Ended Series and converges under concurrent runs", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const active = await createSeries(lifecycle, "user-states", "Active");
    const paused = await createSeries(lifecycle, "user-states", "Paused");
    const ended = await createSeries(lifecycle, "user-states", "Ended");

    expect((await lifecycle.pauseSeries({
      userId: "user-states",
      seriesId: paused.id,
      effectiveDate: "2026-08-02",
    })).status).toBe("complete");
    expect((await lifecycle.endSeries({
      userId: "user-states",
      seriesId: ended.id,
      effectiveDate: "2026-08-02",
    })).status).toBe("complete");

    const [first, second] = await Promise.all([
      prewarmActiveRecurringTaskCoverage(lifecycle, {
        now: () => new Date("2026-08-01T12:00:00.000Z"),
        days: 3,
        retryDelayMs: 0,
      }),
      prewarmActiveRecurringTaskCoverage(lifecycle, {
        now: () => new Date("2026-08-01T12:00:00.000Z"),
        days: 3,
        retryDelayMs: 0,
      }),
    ]);

    expect(first.status).toBe("complete");
    expect(second.status).toBe("complete");
    expect(first.seriesCount).toBe(1);
    expect(first.attempts[0]?.seriesId).toBe(active.id);
    expect((await lifecycle.getSeries("user-states", paused.id)).status).toBe("complete");
    expect((await lifecycle.getSeries("user-states", ended.id)).status).toBe("complete");
    const final = await lifecycle.getSeries("user-states", active.id);
    expect(final.status).toBe("complete");
    if (final.status !== "complete") return;
    expect(final.series.coverageHorizon).toBe("2026-08-04");
    expect(final.series.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("retries a conflict for one Series without affecting another Series", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    await createSeries(lifecycle, "user-conflict", "First");
    await createSeries(lifecycle, "user-conflict", "Second");
    const ensureCoverage = vi
      .spyOn(lifecycle, "prewarmCoverage")
      .mockImplementationOnce(async (_request) => ({
        status: "conflict",
        type: "conflict",
        reason: "changed concurrently",
      }))
      .mockImplementationOnce((request) => lifecycle.ensureCoverage({
        ...request,
        source: "prewarm",
      }));

    const result = await prewarmActiveRecurringTaskCoverage(lifecycle, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      days: 2,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.status).toBe("complete");
    expect(ensureCoverage).toHaveBeenCalledTimes(3);
  });
});
