import { describe, expect, it } from "vitest";

import {
  initialSeriesCoverage,
  toCreateSeriesCommand,
  toLifecycleRecurrenceDates,
  toRecurringTaskResponse,
  type SeriesCreationCompatibilityInput,
} from "@/lib/recurring-tasks/compatibility";
import type { SeriesProjection } from "@/lib/recurring-tasks/capabilities";

function publicSeries(): SeriesProjection {
  return {
    id: "series-1",
    status: "active",
    timeZone: "UTC",
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    occurrenceLimit: null,
    lastScheduledDate: null,
    coverageHorizon: "2026-08-08",
    currentRevisionId: "revision-1",
    revisions: [
      {
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
          priority: 0,
          categoryId: null,
          dueTime: null,
        },
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    occurrences: [],
    intentionalAbsences: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: "rt-series-v1.opaque-version" as SeriesProjection["version"],
  };
}

describe("recurring task compatibility", () => {
  it("maps legacy creation fields to an owned capability command", () => {
    const input: SeriesCreationCompatibilityInput = {
      operationId: "series-create-1",
      title: "  Daily review ",
      description: "  Review the plan  ",
      priority: 2,
      categoryId: " category-1 ",
      dueTime: "09:00",
      recurrenceRule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: " 2026-08-01 ",
      activationDate: "2026-08-01",
      endType: "after_count",
      endDate: null,
      endCount: 3,
      coverageThrough: " 2026-08-08 ",
    };

    expect(toCreateSeriesCommand(input)).toEqual({
      operationId: "series-create-1",
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
    expect(toCreateSeriesCommand(input)).not.toHaveProperty("userId");
  });

  it("keeps the historical start date while making lifecycle dates explicit", () => {
    expect(toLifecycleRecurrenceDates(" 2026-08-01 ")).toEqual({
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
    });
  });

  it("gives a future anchor a complete initial Coverage window", () => {
    expect(initialSeriesCoverage("2026-08-10", "2026-08-01")).toEqual({
      from: "2026-08-10",
      to: "2026-08-17",
    });
  });

  it("translates a public Series projection without exposing private ownership fields", () => {
    expect(toRecurringTaskResponse(publicSeries(), "user-1")).toEqual(
      expect.objectContaining({
        id: "series-1",
        user_id: "user-1",
        version: "rt-series-v1.opaque-version",
      }),
    );
    expect(toRecurringTaskResponse(publicSeries(), "user-1")).not.toHaveProperty(
      "revisionToken",
    );
    expect(toRecurringTaskResponse(publicSeries(), "user-1")).not.toHaveProperty(
      "userId",
    );
  });
});
