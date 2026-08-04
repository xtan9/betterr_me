import type { Habit, HabitLog, Task, Workout } from "@/lib/db/types";
import { shouldTrackOnDate } from "@/lib/habits/format";

export const CALENDAR_OVERLAY_LAYERS = ["tasks", "habits", "workouts"] as const;
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

export interface HabitOverlayRequest {
  userId: string;
  range: LocalDateRange;
}

export interface ActiveHabitReadPort {
  read(request: HabitOverlayRequest): Promise<Habit[]>;
}

export interface HabitCompletionLogReadPort {
  read(request: HabitOverlayRequest): Promise<HabitLog[]>;
}

/** The minimum separate reads needed to acquire the habit layer. */
export interface HabitOverlayCapabilities {
  activeHabits: ActiveHabitReadPort;
  completionLogs: HabitCompletionLogReadPort;
}

export interface WorkoutOverlayRequest {
  userId: string;
  range: LocalDateRange;
  timezone: string;
}

export interface WorkoutReadPort {
  read(request: WorkoutOverlayRequest): Promise<Workout[]>;
}

export type WorkoutOverlayCapabilities = WorkoutReadPort;

/** Combined capabilities used by the selected overlay layers. */
export interface CalendarOverlayCapabilities extends TaskOverlayCapabilities {
  habits: HabitOverlayCapabilities;
  workouts: WorkoutOverlayCapabilities;
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

export interface HabitOverlayAction {
  type: "toggle_habit_completion";
  habitId: string;
  date: string;
}

export interface HabitOverlayItem {
  layer: "habits";
  kind: "habit";
  /** Identity includes the displayed date because a habit can appear once per date. */
  id: string;
  habitId: string;
  title: string;
  date: string;
  startTime: null;
  endTime: null;
  allDay: true;
  completed: boolean;
  action: HabitOverlayAction;
}

export interface WorkoutOverlayAction {
  type: "navigate_workout";
  workoutId: string;
}

export interface WorkoutOverlayItem {
  layer: "workouts";
  kind: "workout";
  /** Cross-layer identity; it cannot collide with a Calendar Event ID. */
  id: string;
  workoutId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: null;
  allDay: false;
  completed: boolean;
  action: WorkoutOverlayAction;
}

export type CalendarOverlayItem = TaskOverlayItem | HabitOverlayItem | WorkoutOverlayItem;

export type OverlayUnavailable =
  | {
      layer: "tasks";
      code: "recurring_coverage_unavailable";
      failedSeriesIds: string[];
    }
  | {
      layer: "tasks";
      code: "unavailable";
    }
  | {
      layer: "habits";
      code: "unavailable";
    }
  | {
      layer: "workouts";
      code: "unavailable";
    };

export type OverlayLayerRequest = TaskOverlayRequest | HabitOverlayRequest | WorkoutOverlayRequest;

export interface OverlayFailureReport {
  layer: CalendarOverlayLayer;
  request: OverlayLayerRequest;
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

function localDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function habitItems(
  habits: Habit[],
  logs: HabitLog[],
  range: LocalDateRange,
): HabitOverlayItem[] {
  const completed = new Set(
    logs.filter((log) => log.completed).map((log) => `${log.habit_id}:${log.logged_date}`),
  );
  const [startYear, startMonth, startDay] = range.from.split("-").map(Number);
  const [endYear, endMonth, endDay] = range.to.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const items: HabitOverlayItem[] = [];

  for (const habit of habits) {
    const date = new Date(start);
    while (date <= end) {
      if (shouldTrackOnDate(habit.frequency, date)) {
        const displayedDate = localDateString(date);
        items.push({
          layer: "habits",
          kind: "habit",
          id: `habits:${habit.id}:${displayedDate}`,
          habitId: habit.id,
          title: habit.name,
          date: displayedDate,
          startTime: null,
          endTime: null,
          allDay: true,
          completed: completed.has(`${habit.id}:${displayedDate}`),
          action: {
            type: "toggle_habit_completion",
            habitId: habit.id,
            date: displayedDate,
          },
        });
      }
      date.setDate(date.getDate() + 1);
    }
  }

  return items;
}

function workoutDateTime(workout: Workout, timezone: string): { date: string; startTime: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(workout.started_at));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    startTime: `${values.hour}:${values.minute}`,
  };
}

function workoutItems(workouts: Workout[], range: LocalDateRange, timezone: string): WorkoutOverlayItem[] {
  return workouts.flatMap((workout) => {
    const { date, startTime } = workoutDateTime(workout, timezone);
    if (date < range.from || date > range.to) return [];
    return [{
      layer: "workouts" as const,
      kind: "workout" as const,
      id: `workouts:${workout.id}`,
      workoutId: workout.id,
      title: workout.title,
      date,
      startTime,
      endTime: null,
      allDay: false as const,
      completed: workout.status === "completed",
      action: { type: "navigate_workout" as const, workoutId: workout.id },
    }];
  });
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
    timezone?: string;
  },
  capabilities: TaskOverlayCapabilities | CalendarOverlayCapabilities | WorkoutOverlayCapabilities,
  options: CalendarOverlayQueryOptions = {},
): Promise<CalendarOverlayQueryOutcome> {
  const selectedLayers = [...new Set(input.layers)];
  const request: TaskOverlayRequest = {
    userId: input.userId,
    range: input.range,
  };

  const taskAcquisition = selectedLayers.includes("tasks")
    ? (async (): Promise<{ items: CalendarOverlayItem[]; unavailable: OverlayUnavailable[]; available: boolean }> => {
        const taskCapabilities = "coverage" in capabilities && "read" in capabilities
          ? capabilities
          : undefined;
        if (!taskCapabilities?.coverage || !taskCapabilities.read) {
          return { items: [], available: false, unavailable: [{ layer: "tasks", code: "unavailable" }] };
        }
        let coverage: TaskCoverageResult;
        try {
          coverage = await taskCapabilities.coverage.ensureThrough(request);
        } catch {
          return {
            items: [],
            available: false,
            unavailable: [{
              layer: "tasks",
              code: "recurring_coverage_unavailable",
              failedSeriesIds: [],
            }],
          };
        }

        if (coverage.status === "partial" || coverage.status === "unavailable") {
          return {
            items: [],
            available: false,
            unavailable: [{
              layer: "tasks",
              code: "recurring_coverage_unavailable",
              failedSeriesIds: [...new Set(coverage.failedSeriesIds ?? [])].sort(),
            }],
          };
        }

        try {
          const tasks = await taskCapabilities.read.read(request);
          return {
            items: sortItems(tasks.map(taskItem).filter((item): item is TaskOverlayItem => item !== null)),
            unavailable: [],
            available: true,
          };
        } catch (cause) {
          options.reportFailure?.({ layer: "tasks", request, cause });
          return { items: [], available: false, unavailable: [{ layer: "tasks", code: "unavailable" }] };
        }
      })()
    : Promise.resolve({ items: [], unavailable: [], available: false });

  const habitAcquisition = selectedLayers.includes("habits")
    ? (async (): Promise<{ items: CalendarOverlayItem[]; unavailable: OverlayUnavailable[]; available: boolean }> => {
        try {
          const habitCapabilities = "habits" in capabilities ? capabilities.habits : undefined;
          if (!habitCapabilities) throw new Error("Habit overlay capabilities are unavailable");
          const activeHabits = habitCapabilities.activeHabits.read({ userId: input.userId, range: input.range });
          const completionLogs = habitCapabilities.completionLogs.read({ userId: input.userId, range: input.range });
          const [habits, logs] = await Promise.all([activeHabits, completionLogs]);
          return {
            items: habitItems(habits, logs, input.range),
            unavailable: [],
            available: true,
          };
        } catch (cause) {
          options.reportFailure?.({
            layer: "habits",
            request,
            cause,
          });
          return { items: [], available: false, unavailable: [{ layer: "habits", code: "unavailable" }] };
        }
      })()
    : Promise.resolve({ items: [], unavailable: [], available: false });

  const workoutAcquisition = selectedLayers.includes("workouts")
    ? (async (): Promise<{ items: CalendarOverlayItem[]; unavailable: OverlayUnavailable[]; available: boolean }> => {
        const workoutCapabilities = "workouts" in capabilities ? capabilities.workouts : undefined;
        const timezone = input.timezone ?? "UTC";
        try {
          if (!workoutCapabilities) throw new Error("Workout overlay capabilities are unavailable");
          const workouts = await workoutCapabilities.read({
            userId: input.userId,
            range: input.range,
            timezone,
          });
          return {
            items: workoutItems(workouts, input.range, timezone),
            unavailable: [],
            available: true,
          };
        } catch (cause) {
          options.reportFailure?.({
            layer: "workouts",
            request: { userId: input.userId, range: input.range, timezone },
            cause,
          });
          return { items: [], available: false, unavailable: [{ layer: "workouts", code: "unavailable" }] };
        }
      })()
    : Promise.resolve({ items: [], unavailable: [], available: false });

  const [taskResult, habitResult, workoutResult] = await Promise.all([
    taskAcquisition,
    habitAcquisition,
    workoutAcquisition,
  ]);
  const unavailable = [
    ...taskResult.unavailable,
    ...habitResult.unavailable,
    ...workoutResult.unavailable,
  ] as [OverlayUnavailable, ...OverlayUnavailable[]] | [];
  const items = sortItems([...taskResult.items, ...habitResult.items, ...workoutResult.items]);
  const selectedCount = selectedLayers.length;
  const availableCount = [taskResult, habitResult, workoutResult].filter((result) => result.available).length;

  if (unavailable.length === 0 || selectedCount === 0) {
    return { status: "complete", items, unavailable: [] };
  }
  if (availableCount > 0) {
    return { status: "degraded", items, unavailable: unavailable as [OverlayUnavailable, ...OverlayUnavailable[]] };
  }
  return { status: "failed", items: [], unavailable: unavailable as [OverlayUnavailable, ...OverlayUnavailable[]] };
}
