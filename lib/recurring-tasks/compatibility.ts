import type { EndType, RecurrenceRule } from "@/lib/db/types";
import type { RecurringTaskSeries } from "./lifecycle";

/** Supported compatibility subpath for legacy HTTP and AI translation. */

/** The historical HTTP/AI response retained only at this adapter boundary. */
export interface RecurringTaskResponse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  category_id: string | null;
  due_time: string | null;
  recurrence_rule: RecurrenceRule;
  start_date: string;
  end_type: EndType;
  end_date: string | null;
  end_count: number | null;
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
}

/**
 * Translate the historical transport start-date field at the adapter edge.
 * The lifecycle itself always receives the two explicit date concepts.
 */
export function toLifecycleRecurrenceDates(startDate: string): {
  recurrenceAnchor: string;
  activationDate: string;
} {
  const normalized = startDate.trim();
  return {
    recurrenceAnchor: normalized,
    activationDate: normalized,
  };
}

/**
 * Translate the lifecycle model into the existing transport shape used by
 * the web and AI adapters. No persistence or lifecycle decision belongs in
 * this compatibility boundary.
 */
export function toRecurringTaskResponse(
  series: RecurringTaskSeries,
): RecurringTaskResponse {
  const revision = series.revisions.find(
    (candidate) => candidate.id === series.currentRevisionId,
  ) ?? series.revisions[series.revisions.length - 1];
  const defaults = revision?.defaults ?? {
    title: "",
    description: null,
    priority: 0 as const,
    categoryId: null,
    dueTime: null,
  };
  const endType = series.occurrenceLimit !== null
    ? "after_count"
    : series.lastScheduledDate !== null
      ? "on_date"
      : "never";

  return {
    id: series.id,
    user_id: series.userId,
    title: defaults.title,
    description: defaults.description,
    priority: defaults.priority,
    category_id: defaults.categoryId,
    due_time: defaults.dueTime,
    recurrence_rule: revision?.recurrenceRule ?? {
      frequency: "daily",
      interval: 1,
    },
    start_date: series.recurrenceAnchor,
    end_type: endType,
    end_date: series.lastScheduledDate,
    end_count: series.occurrenceLimit,
    status: series.status === "ended" ? "archived" : series.status,
    created_at: series.createdAt,
    updated_at: series.updatedAt,
  };
}
