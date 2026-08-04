import type { Task } from "@/lib/db/types";

export const CALENDAR_OVERLAY_LAYERS = ["tasks"] as const;
export type CalendarOverlayLayer = (typeof CALENDAR_OVERLAY_LAYERS)[number];

export interface LocalDateRange {
  from: string;
  to: string;
}

export interface TaskOverlayRequest {
  userId: string;
  range: LocalDateRange;
}

export interface TaskCoverageAvailable {
  status: "complete";
}

export interface TaskCoverageUnavailable {
  status: "partial" | "unavailable";
  failedSeriesIds?: string[];
}

export type TaskCoverageResult =
  | TaskCoverageAvailable
  | TaskCoverageUnavailable;

/** The minimum task capabilities needed by the framework-free application query. */
export interface TaskCoveragePort {
  ensureThrough(request: TaskOverlayRequest): Promise<TaskCoverageResult>;
}

export interface TaskReadPort {
  read(request: TaskOverlayRequest): Promise<Task[]>;
}

export interface TaskOverlayCapabilities {
  coverage: TaskCoveragePort;
  read: TaskReadPort;
}

export interface TaskOverlayAction {
  type: "toggle_task_completion";
  taskId: string;
}

export interface TaskOverlayItem {
  layer: "tasks";
  kind: "task";
  /** Cross-layer identity; it cannot collide with a Calendar Event ID. */
  id: string;
  taskId: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: null;
  allDay: boolean;
  completed: boolean;
  action: TaskOverlayAction;
}

export type CalendarOverlayItem = TaskOverlayItem;

export type OverlayUnavailable =
  | {
      layer: "tasks";
      code: "recurring_coverage_unavailable";
      failedSeriesIds: string[];
    }
  | {
      layer: "tasks";
      code: "unavailable";
    };

export interface OverlayFailureReport {
  layer: CalendarOverlayLayer;
  request: TaskOverlayRequest;
  cause: unknown;
}

export interface CalendarOverlayQueryOptions {
  reportFailure?: (report: OverlayFailureReport) => void;
}

export type CalendarOverlayQueryOutcome =
  | {
      status: "complete";
      items: CalendarOverlayItem[];
      unavailable: [];
    }
  | {
      status: "degraded";
      items: CalendarOverlayItem[];
      unavailable: [OverlayUnavailable, ...OverlayUnavailable[]];
    }
  | {
      status: "failed";
      items: [];
      unavailable: [OverlayUnavailable, ...OverlayUnavailable[]];
    };

function taskItem(task: Task): TaskOverlayItem | null {
  if (!task.due_date) return null;
  return {
    layer: "tasks",
    kind: "task",
    id: `tasks:${task.id}`,
    taskId: task.id,
    title: task.title,
    date: task.due_date,
    startTime: task.due_time,
    endTime: null,
    allDay: task.due_time === null,
    completed: task.is_completed,
    action: {
      type: "toggle_task_completion",
      taskId: task.id,
    },
  };
}

function sortItems(items: CalendarOverlayItem[]): CalendarOverlayItem[] {
  return [...items].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (a.startTime && b.startTime) {
      const timeOrder = a.startTime.localeCompare(b.startTime);
      if (timeOrder !== 0) return timeOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Query selected Calendar Overlay Layers without depending on HTTP or a framework. */
export async function queryCalendarOverlayFeed(
  input: {
    userId: string;
    range: LocalDateRange;
    layers: readonly CalendarOverlayLayer[];
  },
  capabilities: TaskOverlayCapabilities,
  options: CalendarOverlayQueryOptions = {},
): Promise<CalendarOverlayQueryOutcome> {
  const selectedLayers = [...new Set(input.layers)];
  if (!selectedLayers.includes("tasks")) {
    return { status: "complete", items: [], unavailable: [] };
  }

  const request: TaskOverlayRequest = {
    userId: input.userId,
    range: input.range,
  };

  let coverage: TaskCoverageResult;
  try {
    coverage = await capabilities.coverage.ensureThrough(request);
  } catch {
    return {
      status: "failed",
      items: [],
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: [],
      }],
    };
  }

  if (coverage.status === "partial" || coverage.status === "unavailable") {
    return {
      status: "failed",
      items: [],
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: [...new Set(coverage.failedSeriesIds ?? [])].sort(),
      }],
    };
  }

  let tasks: Task[];
  try {
    tasks = await capabilities.read.read(request);
  } catch (cause) {
    options.reportFailure?.({ layer: "tasks", request, cause });
    return {
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    };
  }

  const items = sortItems(tasks.map(taskItem).filter((item): item is TaskOverlayItem => item !== null));
  return { status: "complete", items, unavailable: [] };
}
