import { describe, expect, it, vi } from "vitest";

import {
  initialSeriesCoverage,
  executeSeriesCompatibilityIntent,
  isSeriesCompatibilitySuccess,
  toCreateSeriesCommand,
  toLifecycleRecurrenceDates,
  toReviseSeriesCommand,
  toSeriesStateCommand,
  toRecurringTaskResponse,
  type SeriesCompatibilityCommandPort,
  type SeriesCreationCompatibilityInput,
} from "@/lib/recurring-tasks/compatibility";
import type {
  ReviseSeriesCommand,
  SeriesProjection,
  SeriesVersion,
} from "@/lib/recurring-tasks/internal/capabilities";

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
  it("executes an omitted-date pause through only the matching command", async () => {
    const outcome = {
      type: "paused" as const,
      status: "complete" as const,
      operation: "recurring-task.series.pause" as const,
      operationId: "pause-operation",
      series: publicSeries(),
    };
    const pauseSeries = vi.fn().mockResolvedValue(outcome);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries,
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "pause",
      command: {
        operationId: "pause-operation",
        seriesId: "series-1",
        version: publicSeries().version,
      },
      referenceDate: "2026-08-08",
    });

    expect(result).toBe(outcome);
    expect(pauseSeries).toHaveBeenCalledTimes(1);
    expect(pauseSeries).toHaveBeenCalledWith({
      operationId: "pause-operation",
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "2026-08-08",
    });
    expect(commands.reviseSeries).not.toHaveBeenCalled();
    expect(commands.resumeSeries).not.toHaveBeenCalled();
    expect(commands.endSeries).not.toHaveBeenCalled();
  });

  it("passes operation, Series, version, and explicit date values through unchanged", async () => {
    const pauseSeries = vi.fn().mockResolvedValue({
      type: "paused",
      status: "complete",
      operation: "recurring-task.series.pause",
      operationId: "opaque operation",
      series: publicSeries(),
    });
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries,
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };
    const version = "opaque version/token" as SeriesVersion;

    await executeSeriesCompatibilityIntent(commands, {
      type: "pause",
      command: {
        operationId: "opaque operation",
        seriesId: " series/opaque id ",
        version,
        effectiveDate: "2026-08-08",
      },
      referenceDate: "2026-08-01",
    });

    expect(pauseSeries).toHaveBeenCalledWith({
      operationId: "opaque operation",
      seriesId: " series/opaque id ",
      version,
      effectiveDate: "2026-08-08",
    });
  });

  it("executes resume with the explicit date and inclusive requested range", async () => {
    const outcome = {
      type: "resumed" as const,
      status: "already-applied" as const,
      operation: "recurring-task.series.resume" as const,
      operationId: "resume-operation",
      series: publicSeries(),
    };
    const resumeSeries = vi.fn().mockResolvedValue(outcome);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries: vi.fn(),
      resumeSeries,
      endSeries: vi.fn(),
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "resume",
      command: {
        operationId: "resume-operation",
        seriesId: "series-1",
        version: publicSeries().version,
        effectiveDate: "2026-08-09",
      },
      referenceDate: "2026-08-01",
    });

    expect(result).toBe(outcome);
    expect(resumeSeries).toHaveBeenCalledTimes(1);
    expect(resumeSeries).toHaveBeenCalledWith({
      operationId: "resume-operation",
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "2026-08-09",
      coverage: { from: "2026-08-09", to: "2026-08-16" },
    });
    expect(commands.reviseSeries).not.toHaveBeenCalled();
    expect(commands.pauseSeries).not.toHaveBeenCalled();
    expect(commands.endSeries).not.toHaveBeenCalled();
  });

  it("resolves an omitted resume date from its reference date", async () => {
    const resumeSeries = vi.fn().mockResolvedValue({
      type: "resumed",
      status: "complete",
      operation: "recurring-task.series.resume",
      operationId: "resume-reference",
      series: publicSeries(),
    });
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries: vi.fn(),
      resumeSeries,
      endSeries: vi.fn(),
    };

    await executeSeriesCompatibilityIntent(commands, {
      type: "resume",
      command: {
        operationId: "resume-reference",
        seriesId: "series-1",
        version: publicSeries().version,
      },
      referenceDate: "2026-08-12",
    });

    expect(resumeSeries).toHaveBeenCalledWith({
      operationId: "resume-reference",
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "2026-08-12",
      coverage: { from: "2026-08-12", to: "2026-08-19" },
    });
  });

  it("executes an omitted-date end through only the matching command", async () => {
    const outcome = {
      type: "ended" as const,
      status: "complete" as const,
      operation: "recurring-task.series.end" as const,
      operationId: "end-operation",
      series: publicSeries(),
    };
    const endSeries = vi.fn().mockResolvedValue(outcome);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries: vi.fn(),
      resumeSeries: vi.fn(),
      endSeries,
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "end",
      command: {
        operationId: "end-operation",
        seriesId: "series-1",
        version: publicSeries().version,
      },
      referenceDate: "2026-08-10",
    });

    expect(result).toBe(outcome);
    expect(endSeries).toHaveBeenCalledTimes(1);
    expect(endSeries).toHaveBeenCalledWith({
      operationId: "end-operation",
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "2026-08-10",
    });
    expect(commands.reviseSeries).not.toHaveBeenCalled();
    expect(commands.pauseSeries).not.toHaveBeenCalled();
    expect(commands.resumeSeries).not.toHaveBeenCalled();
  });

  it("executes a canonical revision command unchanged through only the matching command", async () => {
    const outcome = {
      type: "revised" as const,
      status: "complete" as const,
      operation: "recurring-task.series.revise" as const,
      operationId: "revise-operation",
      series: publicSeries(),
    };
    const reviseSeries = vi.fn().mockResolvedValue(outcome);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries,
      pauseSeries: vi.fn(),
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };
    const command: ReviseSeriesCommand = {
      operationId: "revise-operation",
      seriesId: " series/opaque id ",
      version: publicSeries().version,
      effectiveDate: " 2026-08-11 ",
      recurrenceRule: { frequency: "weekly", interval: 2, days_of_week: [1] },
      defaults: {
        title: "  Updated review  ",
        description: "  Keep the spacing  ",
        priority: 2,
        categoryId: " opaque category ",
        dueTime: "09:00",
      },
      scope: "all",
      occurrenceLimit: 4,
      lastScheduledDate: "2026-08-31",
      endType: "on_date",
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "revise",
      command,
    });

    expect(result).toBe(outcome);
    expect(reviseSeries).toHaveBeenCalledTimes(1);
    expect(reviseSeries).toHaveBeenCalledWith(command);
    expect(commands.pauseSeries).not.toHaveBeenCalled();
    expect(commands.resumeSeries).not.toHaveBeenCalled();
    expect(commands.endSeries).not.toHaveBeenCalled();
  });

  it("does not infer a missing revision date from any reference date", async () => {
    const outcome = {
      type: "validation" as const,
      status: "validation" as const,
      operation: "recurring-task.series.revise" as const,
      operationId: "revise-missing-date",
      field: "effectiveDate",
      reason: "Effective Scheduled Date is required",
    };
    const reviseSeries = vi.fn().mockResolvedValue(outcome);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries,
      pauseSeries: vi.fn(),
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };
    const command: ReviseSeriesCommand = {
      operationId: "revise-missing-date",
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "",
      defaults: { title: "Updated review" },
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "revise",
      command,
    });

    expect(result).toBe(outcome);
    expect(reviseSeries).toHaveBeenCalledWith(command);
  });

  it.each([
    {
      type: "validation",
      status: "validation",
      operation: "recurring-task.series.revise",
      operationId: "revise-validation",
      reason: "invalid revision",
    },
    {
      type: "not-found",
      status: "not-found",
      operation: "recurring-task.series.revise",
      operationId: "revise-not-found",
    },
    {
      type: "conflict",
      status: "conflict",
      operation: "recurring-task.series.revise",
      operationId: "revise-conflict",
    },
    {
      type: "invalid-transition",
      status: "invalid-transition",
      operation: "recurring-task.series.revise",
      operationId: "revise-invalid-transition",
      reason: "revision is not allowed",
    },
    {
      type: "coverage-unavailable",
      status: "coverage-unavailable",
      operation: "recurring-task.series.revise",
      operationId: "revise-coverage",
      requestedRange: { from: "2026-08-11", to: "2026-08-18" },
      reason: "coverage unavailable",
    },
  ] as const)("returns the typed revise-Series $type outcome unchanged", async (failure) => {
    const reviseSeries = vi.fn().mockResolvedValue(failure);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries,
      pauseSeries: vi.fn(),
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };
    const command: ReviseSeriesCommand = {
      operationId: failure.operationId,
      seriesId: "series-1",
      version: publicSeries().version,
      effectiveDate: "2026-08-11",
      defaults: { title: "Updated review" },
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "revise",
      command,
    });

    expect(result).toBe(failure);
    expect(reviseSeries).toHaveBeenCalledTimes(1);
    expect(reviseSeries).toHaveBeenCalledWith(command);
  });

  it("leaves a thrown revise-Series command error unchanged", async () => {
    const cause = new Error("revision command failed");
    const reviseSeries = vi.fn().mockRejectedValue(cause);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries,
      pauseSeries: vi.fn(),
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };

    await expect(
      executeSeriesCompatibilityIntent(commands, {
        type: "revise",
        command: {
          operationId: "revise-error",
          seriesId: "series-1",
          version: publicSeries().version,
          effectiveDate: "2026-08-11",
          defaults: { title: "Updated review" },
        },
      }),
    ).rejects.toBe(cause);
  });

  it.each([
    {
      type: "validation",
      status: "validation",
      operation: "recurring-task.series.pause",
      operationId: "pause-validation",
      reason: "invalid command",
    },
    {
      type: "not-found",
      status: "not-found",
      operation: "recurring-task.series.pause",
      operationId: "pause-not-found",
    },
    {
      type: "conflict",
      status: "conflict",
      operation: "recurring-task.series.pause",
      operationId: "pause-conflict",
    },
    {
      type: "invalid-transition",
      status: "invalid-transition",
      operation: "recurring-task.series.pause",
      operationId: "pause-invalid-transition",
      reason: "already ended",
    },
    {
      type: "coverage-unavailable",
      status: "coverage-unavailable",
      operation: "recurring-task.series.pause",
      operationId: "pause-coverage",
      requestedRange: { from: "2026-08-08", to: "2026-08-15" },
      reason: "coverage unavailable",
    },
  ] as const)("returns the typed $type outcome unchanged", async (failure) => {
    const pauseSeries = vi.fn().mockResolvedValue(failure);
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries,
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };

    const result = await executeSeriesCompatibilityIntent(commands, {
      type: "pause",
      command: {
        operationId: failure.operationId,
        seriesId: "series-1",
        version: publicSeries().version,
        effectiveDate: "2026-08-08",
      },
      referenceDate: "2026-08-01",
    });

    expect(result).toBe(failure);
  });

  it("leaves thrown command errors unchanged", async () => {
    const cause = new Error("command failed");
    const commands: SeriesCompatibilityCommandPort = {
      reviseSeries: vi.fn(),
      pauseSeries: vi.fn().mockRejectedValue(cause),
      resumeSeries: vi.fn(),
      endSeries: vi.fn(),
    };

    await expect(
      executeSeriesCompatibilityIntent(commands, {
        type: "pause",
        command: {
          operationId: "pause-error",
          seriesId: "series-1",
          version: publicSeries().version,
          effectiveDate: "2026-08-08",
        },
        referenceDate: "2026-08-01",
      }),
    ).rejects.toBe(cause);
  });

  it.each(["complete", "already-applied"] as const)(
    "classifies a %s result as compatibility success",
    (status) => {
      expect(isSeriesCompatibilitySuccess({
        type: "paused",
        status,
        operation: "recurring-task.series.pause",
        operationId: "pause-success",
        series: publicSeries(),
      })).toBe(true);
    },
  );

  it.each(["complete", "already-applied"] as const)(
    "classifies a %s revised result as compatibility success",
    (status) => {
      expect(isSeriesCompatibilitySuccess({
        type: "revised",
        status,
        operation: "recurring-task.series.revise",
        operationId: "revise-success",
        series: publicSeries(),
      })).toBe(true);
    },
  );

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

  it("maps revision and state metadata into the shared command vocabulary", () => {
    const version = "rt-series-v1.opaque-version" as SeriesVersion;

    expect(toReviseSeriesCommand({
      operationId: "series-revise-1",
      seriesId: " series-1 ",
      version,
      effectiveDate: " 2026-08-03 ",
      title: "  Revised review ",
      dueTime: "09:00",
      recurrenceRule: { frequency: "weekly", interval: 1, days_of_week: [1] },
      scope: "following",
      endType: "on_date",
      endDate: " 2026-08-31 ",
    })).toEqual({
      operationId: "series-revise-1",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-03",
      defaults: { title: "Revised review", dueTime: "09:00:00" },
      recurrenceRule: { frequency: "weekly", interval: 1, days_of_week: [1] },
      scope: "following",
      endType: "on_date",
      occurrenceLimit: null,
      lastScheduledDate: "2026-08-31",
    });

    expect(toSeriesStateCommand({
      operationId: "series-pause-1",
      seriesId: " series-1 ",
      version,
      effectiveDate: "2026-08-04",
      coverage: { from: "2026-08-04", to: "2026-08-11" },
    })).toEqual({
      operationId: "series-pause-1",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-04",
      coverage: { from: "2026-08-04", to: "2026-08-11" },
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
