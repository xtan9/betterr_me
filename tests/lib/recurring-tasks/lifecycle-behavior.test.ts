import { describe, expect, it } from "vitest";

import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
} from "@/lib/recurring-tasks/lifecycle";

function defaults(title: string, priority: 0 | 1 | 2 | 3 = 0) {
  return {
    title,
    description: null,
    priority,
    categoryId: null,
    dueTime: null,
  } as const;
}

describe("RecurringTaskLifecycle revision behavior", () => {
  it("serializes concurrent coverage requests and keeps one occurrence per date", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-concurrent",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Concurrent"),
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;

    const results = await Promise.all(
      Array.from({ length: 4 }, () => lifecycle.ensureCoverage({
        userId: "user-concurrent",
        seriesId: created.series.id,
        range: { from: "2026-08-01", to: "2026-08-07" },
      })),
    );
    expect(results.every((result) => result.status === "complete")).toBe(true);
    const final = await lifecycle.getSeries("user-concurrent", created.series.id);
    expect(final.status).toBe("complete");
    if (final.status !== "complete") return;
    expect(final.series.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("rolls back a partially materialized create when persistence fails", async () => {
    let idCalls = 0;
    const persistence = new InMemoryRecurringTaskLifecyclePersistence();
    const lifecycle = new RecurringTaskLifecycle(persistence, {
      idFactory: () => {
        idCalls += 1;
        if (idCalls > 2) throw new Error("occurrence write failed");
        return `id-${idCalls}`;
      },
    });

    await expect(lifecycle.createSeries({
      userId: "user-rollback",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Rollback"),
      coverage: { from: "2026-08-01", to: "2026-08-03" },
    })).rejects.toThrow("occurrence write failed");

    expect(persistence.snapshot().series.size).toBe(0);
  });

  it("derives lifecycle dates from the injected instant and series timezone", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-03-08T07:30:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-timezone",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-03-01",
      activationDate: "2026-03-01",
      defaults: defaults("Timezone"),
      timeZone: "America/Los_Angeles",
      coverage: { from: "2026-03-01", to: "2026-03-01" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    const paused = await lifecycle.pauseSeries({
      userId: "user-timezone",
      seriesId: created.series.id,
    });
    expect(paused.status).toBe("complete");
    if (paused.status !== "complete") return;
    expect(paused.series.revisions.at(-1)?.effectiveFrom).toBe("2026-03-07");
  });

  it("coalesces a same-day revision without creating an invalid zero-length span", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-same-day",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Original"),
      coverage: { from: "2026-08-01", to: "2026-08-02" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    const revised = await lifecycle.reviseSeries({
      userId: "user-same-day",
      seriesId: created.series.id,
      effectiveDate: "2026-08-01",
      defaults: defaults("Same day"),
      coverage: { from: "2026-08-01", to: "2026-08-02" },
    });
    expect(revised.status).toBe("complete");
    if (revised.status !== "complete") return;
    expect(revised.series.revisions).toHaveLength(1);
    expect(revised.series.revisions[0].effectiveTo).toBeNull();
    expect(revised.occurrences[0].details.title).toBe("Same day");
  });

  it("preserves field-level overrides while following later Series Defaults", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );

    const created = await lifecycle.createSeries({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Original", 1),
      coverage: { from: "2026-08-01", to: "2026-08-04" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;

    const edited = await lifecycle.editOccurrence({
      userId: "user-1",
      seriesId: created.series.id,
      occurrenceId: created.occurrences[2].id,
      updates: { title: "Personal title", description: null },
    });
    expect(edited.status).toBe("complete");

    const revised = await lifecycle.reviseSeries({
      userId: "user-1",
      seriesId: created.series.id,
      effectiveDate: "2026-08-02",
      defaults: defaults("Revised", 3),
      coverage: { from: "2026-08-02", to: "2026-08-04" },
    });

    expect(revised.status).toBe("complete");
    if (revised.status !== "complete") return;
    const byDate = new Map(
      revised.occurrences.map((occurrence) => [occurrence.scheduledDate, occurrence]),
    );
    expect(byDate.get("2026-08-02")?.details).toMatchObject({
      title: "Revised",
      priority: 3,
    });
    expect(byDate.get("2026-08-03")?.details).toMatchObject({
      title: "Personal title",
      description: null,
      priority: 3,
    });
    expect(byDate.get("2026-08-03")?.overrides).toEqual({
      title: "Personal title",
      description: null,
    });
    expect(revised.series.revisions).toHaveLength(2);
    expect(revised.series.revisions[0].effectiveTo).toBe("2026-08-02");
  });

  it("withdraws untouched open work during a pause and resumes without backfill", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Pause me"),
      coverage: { from: "2026-08-01", to: "2026-08-05" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;

    const paused = await lifecycle.pauseSeries({
      userId: "user-1",
      seriesId: created.series.id,
      effectiveDate: "2026-08-03",
      coverage: { from: "2026-08-03", to: "2026-08-05" },
    });
    expect(paused.status).toBe("complete");
    if (paused.status !== "complete") return;
    expect(paused.series.status).toBe("paused");
    expect(paused.occurrences.filter((occurrence) => occurrence.state === "withdrawn")).toHaveLength(0);
    expect(paused.series.occurrences.filter((occurrence) => occurrence.state === "withdrawn")).toHaveLength(3);
    expect(paused.intentionalAbsences).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);

    const resumed = await lifecycle.resumeSeries({
      userId: "user-1",
      seriesId: created.series.id,
      effectiveDate: "2026-08-06",
      coverage: { from: "2026-08-03", to: "2026-08-08" },
    });
    expect(resumed.status).toBe("complete");
    if (resumed.status !== "complete") return;
    expect(resumed.series.status).toBe("active");
    expect(resumed.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
  });

  it("schedules on the resume boundary without restoring the paused interval", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-resume-boundary",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Resume boundary"),
      coverage: { from: "2026-08-01", to: "2026-08-05" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;

    await lifecycle.pauseSeries({
      userId: "user-resume-boundary",
      seriesId: created.series.id,
      effectiveDate: "2026-08-03",
      coverage: { from: "2026-08-03", to: "2026-08-05" },
    });
    const resumed = await lifecycle.resumeSeries({
      userId: "user-resume-boundary",
      seriesId: created.series.id,
      effectiveDate: "2026-08-05",
      coverage: { from: "2026-08-03", to: "2026-08-06" },
    });

    expect(resumed.status).toBe("complete");
    if (resumed.status !== "complete") return;
    expect(resumed.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-05",
      "2026-08-06",
    ]);
    expect(resumed.intentionalAbsences).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("keeps a skipped occurrence suppressed and makes end terminal", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Skip me"),
      coverage: { from: "2026-08-01", to: "2026-08-03" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    const skipped = await lifecycle.skipOccurrence({
      userId: "user-1",
      seriesId: created.series.id,
      occurrenceId: created.occurrences[1].id,
    });
    expect(skipped.status).toBe("complete");
    if (skipped.status !== "complete") return;
    expect(skipped.occurrences.map((occurrence) => occurrence.state)).toEqual([
      "open",
      "skipped",
      "open",
    ]);

    const ended = await lifecycle.endSeries({
      userId: "user-1",
      seriesId: created.series.id,
      effectiveDate: "2026-08-04",
      coverage: { from: "2026-08-04", to: "2026-08-05" },
    });
    expect(ended.status).toBe("complete");
    if (ended.status !== "complete") return;
    expect(ended.series.status).toBe("ended");
    const resumed = await lifecycle.resumeSeries({
      userId: "user-1",
      seriesId: created.series.id,
      effectiveDate: "2026-08-06",
    });
    expect(resumed.status).toBe("invalid-transition");
  });

  it("fills a coverage gap and ends exactly when the retained occurrence limit is reached", async () => {
    const lifecycle = new RecurringTaskLifecycle(
      new InMemoryRecurringTaskLifecyclePersistence(),
      { clock: () => new Date("2026-08-01T12:00:00.000Z") },
    );
    const created = await lifecycle.createSeries({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: defaults("Limited"),
      occurrenceLimit: 2,
      lastScheduledDate: "2026-08-10",
      coverage: { from: "2026-08-01", to: "2026-08-02" },
    });
    expect(created.status).toBe("complete");
    if (created.status !== "complete") return;
    expect(created.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);

    const extended = await lifecycle.ensureCoverage({
      userId: "user-1",
      seriesId: created.series.id,
      range: { from: "2026-08-05", to: "2026-08-06" },
    });
    expect(extended.status).toBe("complete");
    if (extended.status !== "complete") return;
    expect(extended.series.status).toBe("ended");
    expect(extended.occurrences.map((occurrence) => occurrence.scheduledDate)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});
