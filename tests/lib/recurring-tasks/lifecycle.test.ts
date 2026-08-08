import { describe, expect, it } from "vitest";

import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
} from "@/lib/recurring-tasks/internal/lifecycle";

describe("Recurring Task Lifecycle", () => {
  it("materializes an activation-bounded schedule from an independent anchor and converges on retry", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-10T12:00:00.000Z") },
    );

    const created = await lifecycle.createSeries({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 2 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-04",
      defaults: {
        title: "Daily review",
        description: null,
        priority: 0,
        categoryId: null,
        dueTime: null,
      },
      timeZone: "America/Los_Angeles",
      coverage: { from: "2026-08-01", to: "2026-08-10" },
      idempotencyKey: "create-daily-review",
    });

    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    expect(created.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-05",
      "2026-08-07",
      "2026-08-09",
    ]);
    expect(created.series.coverageHorizon).toBe("2026-08-10");

    const firstEnsure = await lifecycle.ensureCoverage({
      userId: "user-1",
      seriesId: created.series.id,
      range: { from: "2026-08-01", to: "2026-08-10" },
      idempotencyKey: "ensure-daily-review-aug-10",
    });
    expect(firstEnsure.status).toBe("complete");

    const retried = await lifecycle.ensureCoverage({
      userId: "user-1",
      seriesId: created.series.id,
      range: { from: "2026-08-01", to: "2026-08-10" },
      idempotencyKey: "ensure-daily-review-aug-10",
    });

    expect(retried.status).toBe("already-applied");
    if (retried.status !== "already-applied") return;
    expect(retried.occurrences).toHaveLength(3);
  });
});
