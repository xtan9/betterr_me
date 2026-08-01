import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSeriesCreation,
  initialSeriesCoverage,
  normalizeSeriesCreationIntent,
  toLifecycleCreateSeriesRequest,
  type SeriesCreationIntent,
} from "@/lib/recurring-tasks/creation";
import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
} from "@/lib/recurring-tasks/lifecycle";
import type { SupabaseClient } from "@supabase/supabase-js";

const { mockLegacyCreate } = vi.hoisted(() => ({
  mockLegacyCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  RecurringTasksDB: class {
    createRecurringTask = mockLegacyCreate;
  },
}));

function makeIntent(
  overrides: Partial<SeriesCreationIntent> = {},
): SeriesCreationIntent {
  return {
    userId: "user-1",
    title: "Daily review",
    description: "Review the plan",
    priority: 2,
    categoryId: "category-1",
    dueTime: "09:00:00",
    recurrenceRule: { frequency: "daily", interval: 1 },
    legacyStartDate: "2026-08-01",
    endType: "never",
    endDate: null,
    endCount: null,
    coverageThrough: "2026-08-08",
    ...overrides,
  };
}

function makeLifecycle(ids = [
  "series-1",
  "revision-1",
  "occurrence-1",
  "occurrence-2",
  "occurrence-3",
  "occurrence-4",
  "occurrence-5",
  "occurrence-6",
  "occurrence-7",
  "occurrence-8",
]) {
  const idQueue = [...ids];
  return new RecurringTaskLifecycle(
    new InMemoryRecurringTaskLifecyclePersistence(),
    {
      clock: () => new Date("2026-08-01T12:00:00.000Z"),
      idFactory: () => idQueue.shift() ?? "unexpected-id",
    },
  );
}

describe("Series creation adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a legacy start date to both lifecycle dates and a storage-independent request", () => {
    const request = toLifecycleCreateSeriesRequest(
      makeIntent({
        endType: "after_count",
        endCount: 3,
        endDate: null,
      }),
    );

    expect(request).toEqual({
      userId: "user-1",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: {
        title: "Daily review",
        description: "Review the plan",
        priority: 2,
        categoryId: "category-1",
        dueTime: "09:00:00",
      },
      occurrenceLimit: 3,
      lastScheduledDate: null,
      coverage: { from: "2026-08-01", to: "2026-08-08" },
    });
    expect(request).not.toHaveProperty("startDate");
    expect(request).not.toHaveProperty("start_date");
  });

  it("normalizes equivalent product and AI transport values before lifecycle mapping", () => {
    const productIntent = normalizeSeriesCreationIntent(
      makeIntent({
        title: "  Daily review ",
        description: "  Review the plan  ",
        dueTime: "09:00:00",
      }),
    );
    const aiIntent = normalizeSeriesCreationIntent(
      makeIntent({
        title: "Daily review",
        description: "Review the plan",
        dueTime: "09:00",
      }),
    );

    expect(productIntent).toEqual(aiIntent);
    expect(initialSeriesCoverage("2026-08-01", "2026-08-01")).toEqual({
      from: "2026-08-01",
      to: "2026-08-08",
    });
  });

  it("produces equivalent Series, Revision, Coverage, and typed outcomes in lifecycle mode", async () => {
    const productLifecycle = makeLifecycle();
    const aiLifecycle = makeLifecycle();
    const productIntent = normalizeSeriesCreationIntent(
      makeIntent({ dueTime: "09:00:00" }),
    );
    const aiIntent = normalizeSeriesCreationIntent(
      makeIntent({ dueTime: "09:00" }),
    );

    const productResult = await createSeriesCreation(
      {} as SupabaseClient,
      { lifecycle: productLifecycle },
    ).create(productIntent);
    const aiResult = await createSeriesCreation(
      {} as SupabaseClient,
      { lifecycle: aiLifecycle },
    ).create(aiIntent);

    expect(productResult).toEqual(aiResult);
    expect(productResult.mode).toBe("lifecycle");
    if (productResult.mode !== "lifecycle") return;
    expect(productResult.outcome.status).toBe("complete");
    if (productResult.outcome.status !== "complete") return;
    expect(productResult.outcome.series.recurrenceAnchor).toBe("2026-08-01");
    expect(productResult.outcome.series.activationDate).toBe("2026-08-01");
    expect(productResult.outcome.series.coverageHorizon).toBe("2026-08-08");
    expect(productResult.outcome.series.revisions[0].defaults).toEqual({
      title: "Daily review",
      description: "Review the plan",
      priority: 2,
      categoryId: "category-1",
      dueTime: "09:00:00",
    });
  });

  it("activates the lifecycle writer by default and never calls the legacy writer", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "complete",
        type: "complete",
        series: {},
      },
      error: null,
    });

    const result = await createSeriesCreation(
      { rpc } as unknown as SupabaseClient,
    ).create(makeIntent());

    expect(result.mode).toBe("lifecycle");
    expect(rpc).toHaveBeenCalledWith(
      "recurring_task_lifecycle",
      expect.objectContaining({ p_operation: "create-series" }),
    );
    expect(mockLegacyCreate).not.toHaveBeenCalled();
  });

  it("preserves typed lifecycle failures without parsing their reasons", async () => {
    const conflict = {
      status: "conflict" as const,
      type: "conflict" as const,
      reason: "request changed",
      expectedRevisionToken: 1,
      actualRevisionToken: 2,
    };
    const lifecycle = {
      createSeries: vi.fn().mockResolvedValue(conflict),
    };

    const result = await createSeriesCreation(
      {} as SupabaseClient,
      { lifecycle },
    ).create(makeIntent());

    expect(result).toEqual({ mode: "lifecycle", outcome: conflict });
    expect(lifecycle.createSeries).toHaveBeenCalledWith(
      toLifecycleCreateSeriesRequest(makeIntent()),
    );
  });
});
