import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecurrenceRule } from "@/lib/db";
import { addLocalDays } from "./recurrence";
import {
  toRecurringTaskResponse,
  type RecurringTaskResponse,
} from "./compatibility";
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
 * adapters. Compatibility start-date fields are translated before this
 * transport-neutral intent reaches the lifecycle boundary.
 */
export interface SeriesCreationIntent {
  userId: string;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  categoryId: string | null;
  dueTime: string | null;
  recurrenceRule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  endType: "never" | "after_count" | "on_date";
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
 * Derive the initial inclusive Coverage range from the Recurrence Anchor.
 * A future anchor gets a full window of its own rather than an
 * inverted range against today's product window.
 */
export function initialSeriesCoverage(
  recurrenceAnchor: string,
  referenceDate: string = recurrenceAnchor,
) {
  const coverageStart =
    recurrenceAnchor > referenceDate ? recurrenceAnchor : referenceDate;
  return {
    from: recurrenceAnchor,
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
    recurrenceAnchor: intent.recurrenceAnchor.trim(),
    activationDate: intent.activationDate.trim(),
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
    recurrenceAnchor: normalized.recurrenceAnchor,
    activationDate: normalized.activationDate,
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
      from: normalized.recurrenceAnchor,
      to: normalized.coverageThrough,
    },
  };
}

/** Convert a successful lifecycle result to the existing HTTP/AI response model. */
export function toRecurringTaskCompatibility(
  series: RecurringTaskSeries,
): RecurringTaskResponse {
  return toRecurringTaskResponse(series);
}

/**
 * Every production creation request is lifecycle-owned after the coordinated
 * cutover. The optional port remains a test/in-process seam, but omitting it
 * always selects the activated lifecycle writer.
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
