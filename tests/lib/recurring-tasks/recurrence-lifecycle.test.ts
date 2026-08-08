import { describe, expect, it } from "vitest";

import type { RecurrenceRule } from "@/lib/db/types";
import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
} from "@/lib/recurring-tasks/internal/lifecycle";
import { calculateScheduledDates } from "@/lib/recurring-tasks/internal/recurrence";

describe("calculateScheduledDates", () => {
  it("uses the recurrence anchor for phase and activation date for eligibility", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 2 };

    expect(
      calculateScheduledDates({
        rule,
        recurrenceAnchor: "2026-01-01",
        activationDate: "2026-01-04",
        range: { from: "2026-01-01", to: "2026-01-08" },
      }),
    ).toEqual(["2026-01-05", "2026-01-07"]);
  });

  it("deduplicates weekly weekdays and remains stable over a daylight-saving boundary", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [0, 0, 1],
    };

    expect(
      calculateScheduledDates({
        rule,
        recurrenceAnchor: "2026-03-01",
        activationDate: "2026-03-01",
        range: { from: "2026-03-01", to: "2026-03-16" },
      }),
    ).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-08",
      "2026-03-09",
      "2026-03-15",
      "2026-03-16",
    ]);
  });
});

describe("RecurringTaskLifecycle", () => {
  it("creates one series revision and materializes the exact requested horizon", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-03-01T12:00:00Z") },
    );

    const created = await lifecycle.createSeries({
      userId: "person-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-03-01",
      activationDate: "2026-03-03",
      defaults: {
        title: "Read",
        description: null,
        priority: 1,
        categoryId: null,
        dueTime: null,
      },
      coverage: { from: "2026-03-01", to: "2026-03-05" },
      idempotencyKey: "create-1",
    });

    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    expect(created.series.revisions).toHaveLength(1);
    expect(created.series.coverageHorizon).toBe("2026-03-05");
    expect(created.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);

    const retried = await lifecycle.createSeries({
      userId: "person-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-03-01",
      activationDate: "2026-03-03",
      defaults: {
        title: "Read",
        description: null,
        priority: 1,
        categoryId: null,
        dueTime: null,
      },
      coverage: { from: "2026-03-01", to: "2026-03-05" },
      idempotencyKey: "create-1",
    });

    expect(retried.status).toBe("already-applied");
    if (retried.status !== "already-applied") return;
    expect(retried.occurrences).toHaveLength(3);
  });
});
