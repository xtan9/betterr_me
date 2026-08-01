import type { SupabaseClient } from "@supabase/supabase-js";

import { recurringTaskFromSeries } from "@/lib/db";
import type {
  EndType,
  RecurrenceRule,
  RecurringTask,
} from "@/lib/db";
import { addLocalDays } from "./recurrence";
import { createActivatedRecurringTaskLifecycle } from "./activation";
import type {
  CreateSeriesRequest,
  LifecycleOutcome,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
} from "./lifecycle";

/** The product's initial lifecycle Coverage window. */
export const INITIAL_COVERAGE_DAYS = 7;

/**
 * Transport-neutral creation intent shared by the product HTTP and AI
 * adapters. `legacyStartDate` is deliberately named at this seam because it
 * is the old input being translated into two lifecycle dates.
 */
export interface SeriesCreationIntent {
  userId: string;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  categoryId: string | null;
  dueTime: string | null;
  recurrenceRule: RecurrenceRule;
  legacyStartDate: string;
  endType: EndType;
  endDate: string | null;
  endCount: number | null;
  coverageThrough: string;
}

export type SeriesCreationOutcome = {
  mode: "lifecycle";
  outcome: LifecycleOutcome<RecurringTaskSeries>;
};

export interface SeriesCreationAdapter {
  create(intent: SeriesCreationIntent): Promise<SeriesCreationOutcome>;
}

export type SeriesCreationLifecyclePort = Pick<
  RecurringTaskLifecyclePort,
  "createSeries"
>;

/**
 * Derive the initial inclusive Coverage range from the legacy start-date
 * input. A future start date gets a full window of its own rather than an
 * inverted range against today's product window.
 */
export function initialSeriesCoverage(
  legacyStartDate: string,
  referenceDate: string = legacyStartDate,
) {
  const coverageStart =
    legacyStartDate > referenceDate ? legacyStartDate : referenceDate;
  return {
    from: legacyStartDate,
    to: addLocalDays(coverageStart, INITIAL_COVERAGE_DAYS),
  };
}

export function normalizeSeriesCreationIntent(
  intent: SeriesCreationIntent,
): SeriesCreationIntent {
  return {
    ...intent,
    userId: intent.userId.trim(),
    title: intent.title.trim(),
    description: intent.description?.trim() || null,
    categoryId: intent.categoryId?.trim() || null,
    dueTime: normalizeDueTime(intent.dueTime),
    legacyStartDate: intent.legacyStartDate.trim(),
    endDate: intent.endDate?.trim() || null,
    coverageThrough: intent.coverageThrough.trim(),
  };
}

export function toLifecycleCreateSeriesRequest(
  intent: SeriesCreationIntent,
): CreateSeriesRequest {
  const normalized = normalizeSeriesCreationIntent(intent);
  return {
    userId: normalized.userId,
    recurrenceRule: normalized.recurrenceRule,
    // A legacy start date defined both when the pattern is phased and when
    // the first occurrence may be activated. The lifecycle keeps those
    // concepts separate even when this compatibility input supplies one date.
    recurrenceAnchor: normalized.legacyStartDate,
    activationDate: normalized.legacyStartDate,
    defaults: {
      title: normalized.title,
      description: normalized.description,
      priority: normalized.priority,
      categoryId: normalized.categoryId,
      dueTime: normalized.dueTime,
    },
    occurrenceLimit:
      normalized.endType === "after_count" ? normalized.endCount : null,
    lastScheduledDate:
      normalized.endType === "on_date" ? normalized.endDate : null,
    coverage: {
      from: normalized.legacyStartDate,
      to: normalized.coverageThrough,
    },
  };
}

/** Convert a successful lifecycle result to the existing HTTP/AI response model. */
export function toLegacyRecurringTask(
  series: RecurringTaskSeries,
): RecurringTask {
  return recurringTaskFromSeries(series);
}

/**
 * Every production creation request is lifecycle-owned after the coordinated
 * cutover. The optional port remains a test/in-process seam, but omitting it
 * can no longer select the legacy recurring-task writer.
 */
export function createSeriesCreation(
  supabase: SupabaseClient,
  options: { lifecycle?: SeriesCreationLifecyclePort } = {},
): SeriesCreationAdapter {
  const lifecycle =
    options.lifecycle ?? createActivatedRecurringTaskLifecycle(supabase);
  return {
    async create(intent) {
      return {
        mode: "lifecycle",
        outcome: await lifecycle.createSeries(
          toLifecycleCreateSeriesRequest(intent),
        ),
      };
    },
  };
}

function normalizeDueTime(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return /^\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
}
