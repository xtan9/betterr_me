import { describe, expect, it } from "vitest";

import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
  type RecurringLifecycleSignal,
} from "@/lib/recurring-tasks/lifecycle";

function defaults(title: string) {
  return {
    title,
    description: "SECRET_DESCRIPTION",
    priority: 0 as const,
    categoryId: null,
    dueTime: null,
  };
}

describe("recurring lifecycle observability", () => {
  it("emits safe signals for coverage outcomes and failures", async () => {
    const signals: RecurringLifecycleSignal[] = [];
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      {
        clock: () => new Date("2026-08-01T12:00:00.000Z"),
        observer: (signal) => signals.push(signal),
      },
    );

    const created = await lifecycle.createSeries({
      userId: "user-observability",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("SECRET_TITLE"),
      coverage: { from: "2026-08-01", to: "2026-08-03" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;

    await lifecycle.skipOccurrence({
      userId: "user-observability",
      seriesId: created.series.id,
      occurrenceId: created.occurrences[1].id,
    });
    const paused = await lifecycle.pauseSeries({
      userId: "user-observability",
      seriesId: created.series.id,
      effectiveDate: "2026-08-03",
      coverage: { from: "2026-08-03", to: "2026-08-04" },
    });
    expect(paused.status).toBe("complete");

    const retryRequest = {
      userId: "user-observability",
      seriesId: created.series.id,
      range: { from: "2026-08-01", to: "2026-08-04" },
      idempotencyKey: "observability-retry",
    };
    await lifecycle.ensureCoverage(retryRequest);
    await lifecycle.ensureCoverage(retryRequest);

    await lifecycle.reviseSeries({
      userId: "user-observability",
      seriesId: created.series.id,
      expectedRevisionToken: 999,
      effectiveDate: "2026-08-05",
      defaults: defaults("SECRET_OVERRIDE"),
    });
    await expect(lifecycle.createSeries({
      userId: "user-observability",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-02",
      activationDate: "2026-08-01",
      defaults: defaults("SECRET_FAILURE_TITLE"),
    })).rejects.toThrow();

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "coverage_attempt" }),
      expect.objectContaining({ event: "occurrence_created" }),
      expect.objectContaining({ event: "intentional_absence" }),
      expect.objectContaining({ event: "occurrence_withdrawn" }),
      expect.objectContaining({ event: "coverage_retry" }),
      expect.objectContaining({ event: "lifecycle_conflict" }),
      expect.objectContaining({ event: "lifecycle_failure" }),
    ]));
    const serialized = JSON.stringify(signals);
    expect(serialized).not.toContain("SECRET_TITLE");
    expect(serialized).not.toContain("SECRET_DESCRIPTION");
    expect(serialized).not.toContain("SECRET_OVERRIDE");
    expect(serialized).not.toContain("SECRET_FAILURE_TITLE");
  });
});
