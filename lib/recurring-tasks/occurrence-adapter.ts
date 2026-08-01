import type {
  Task,
  TaskSection,
  TaskStatus,
  TaskUpdate,
} from "@/lib/db/types";
import type { EditScope } from "@/lib/validations/recurring-task";

import type {
  LifecycleOutcome,
  OccurrenceCommandRequest,
  OccurrenceOverrides,
  OccurrenceUpdateRequest,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
} from "./lifecycle";

export interface OccurrenceEditInput {
  userId: string;
  taskId: string;
  title?: string;
  description?: string | null;
  priority?: 0 | 1 | 2 | 3;
  categoryId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  status?: TaskStatus;
  completed?: boolean;
  section?: TaskSection;
  sortOrder?: number;
  projectId?: string | null;
  completionDifficulty?: 1 | 2 | 3 | null;
  scope?: EditScope;
}

export interface OccurrenceEditIntent {
  userId: string;
  taskId: string;
  updates: OccurrenceOverrides;
  completed?: boolean;
  completionDifficulty?: 1 | 2 | 3 | null;
  scope?: EditScope;
}

export interface OccurrenceCommandIntent {
  userId: string;
  taskId: string;
}

export interface OccurrenceAdapterPersistence {
  getTask(taskId: string, userId: string): Promise<Task | null>;
  legacy?: {
    edit(intent: OccurrenceEditIntent, task: Task): Promise<Task>;
    editScoped(intent: OccurrenceEditIntent, task: Task): Promise<void>;
    toggle(intent: OccurrenceCommandIntent, task: Task): Promise<Task>;
  };
}

export type OccurrenceLifecyclePort = Pick<
  RecurringTaskLifecyclePort,
  "editOccurrence" | "completeOccurrence" | "reopenOccurrence" | "skipOccurrence"
>;

export type OccurrenceAdapterSuccess = {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  task?: Task;
};

export type OccurrenceAdapterOutcome =
  | (LifecycleOutcome<RecurringTaskSeries> & { task?: Task })
  | OccurrenceAdapterSuccess;

export function toOccurrenceEditIntent(
  input: OccurrenceEditInput,
): OccurrenceEditIntent {
  const updates: OccurrenceOverrides = {};

  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.categoryId !== undefined) {
    updates.categoryId = input.categoryId?.trim() || null;
  }
  if (input.dueDate !== undefined) updates.dueDate = input.dueDate?.trim() || null;
  if (input.dueTime !== undefined) updates.dueTime = input.dueTime?.trim() || null;
  if (input.section !== undefined) updates.section = input.section;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.projectId !== undefined) {
    updates.projectId = input.projectId?.trim() || null;
  }

  let completed = input.completed;
  if (input.status !== undefined) {
    completed = input.status === "done";
    if (input.status !== "done" && input.status !== "todo") {
      updates.status = input.status;
    }
  }

  return {
    userId: input.userId.trim(),
    taskId: input.taskId.trim(),
    updates,
    ...(completed === undefined ? {} : { completed }),
    ...(input.completionDifficulty === undefined
      ? {}
      : { completionDifficulty: input.completionDifficulty }),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
  };
}

export class OccurrenceAdapter {
  constructor(
    private readonly persistence: OccurrenceAdapterPersistence,
    private readonly options: { lifecycle?: OccurrenceLifecyclePort } = {},
  ) {}

  async edit(intent: OccurrenceEditIntent): Promise<OccurrenceAdapterOutcome> {
    const task = await this.findTask(intent.taskId, intent.userId);
    if (!task) return notFound();

    const target = this.lifecycleTarget(task);
    if (!target) {
      if (this.options.lifecycle) {
        return invalidTransition(
          "Lifecycle mode requires a recurring Task Occurrence",
        );
      }
      const legacy = this.legacyPersistence();
      if (intent.scope) {
        await legacy.editScoped(intent, task);
        return complete();
      }
      return {
        ...complete(),
        task: await legacy.edit(intent, task),
      };
    }

    if (!this.options.lifecycle) {
      const legacy = this.legacyPersistence();
      if (intent.scope) {
        await legacy.editScoped(intent, task);
        return complete();
      }
      return {
        ...complete(),
        task: await legacy.edit(intent, task),
      };
    }

    if (intent.scope && intent.scope !== "this") {
      return invalidTransition(
        "Only one-occurrence edits are available through this lifecycle adapter",
      );
    }

    if (intent.completionDifficulty !== undefined) {
      return invalidTransition(
        "Completion difficulty is not a Series Default or Occurrence Override",
      );
    }

    const request = occurrenceRequest(intent, target);
    const lifecycle = this.options.lifecycle;
    const outcome =
      intent.completed !== undefined && Object.keys(intent.updates).length === 0
        ? intent.completed
          ? await lifecycle.completeOccurrence(request)
          : await lifecycle.reopenOccurrence(request)
        : await lifecycle.editOccurrence({
            ...request,
            updates: intent.updates,
            ...(intent.completed === undefined
              ? {}
              : { completed: intent.completed }),
          });

    return this.attachTask(outcome, intent);
  }

  async complete(
    intent: OccurrenceCommandIntent,
  ): Promise<OccurrenceAdapterOutcome> {
    return this.transition(intent, "complete");
  }

  async reopen(
    intent: OccurrenceCommandIntent,
  ): Promise<OccurrenceAdapterOutcome> {
    return this.transition(intent, "reopen");
  }

  async toggle(
    intent: OccurrenceCommandIntent,
  ): Promise<OccurrenceAdapterOutcome> {
    const task = await this.findTask(intent.taskId, intent.userId);
    if (!task) return notFound();

    if (this.options.lifecycle) {
      if (!this.lifecycleTarget(task)) {
        return invalidTransition(
          "Lifecycle mode requires a recurring Task Occurrence",
        );
      }
      return invalidTransition(
        "Lifecycle occurrences require an explicit completion or reopening command",
      );
    }

    return {
      ...complete(),
      task: await this.legacyPersistence().toggle(intent, task),
    };
  }

  private async transition(
    intent: OccurrenceCommandIntent,
    action: "complete" | "reopen",
  ): Promise<OccurrenceAdapterOutcome> {
    const task = await this.findTask(intent.taskId, intent.userId);
    if (!task) return notFound();

    const target = this.lifecycleTarget(task);
    if (!this.options.lifecycle) {
      const legacy = this.legacyPersistence();
      return {
        ...complete(),
        task: await legacy.edit(
          toOccurrenceEditIntent({
            ...intent,
            completed: action === "complete",
          }),
          task,
        ),
      };
    }

    if (!target) {
      return invalidTransition(
        "Lifecycle mode requires a recurring Task Occurrence",
      );
    }

    const request: OccurrenceCommandRequest = {
      userId: intent.userId,
      seriesId: target.seriesId,
      occurrenceId: target.occurrenceId,
    };
    const outcome = action === "complete"
      ? await this.options.lifecycle.completeOccurrence(request)
      : await this.options.lifecycle.reopenOccurrence(request);
    return this.attachTask(outcome, intent);
  }

  private async attachTask(
    outcome: LifecycleOutcome<RecurringTaskSeries>,
    intent: OccurrenceCommandIntent,
  ): Promise<OccurrenceAdapterOutcome> {
    if (!isOccurrenceSuccess(outcome)) return outcome;
    const task = await this.findTask(intent.taskId, intent.userId);
    return { ...outcome, task: task ?? undefined };
  }

  private async findTask(taskId: string, userId: string): Promise<Task | null> {
    return this.persistence.getTask(taskId, userId);
  }

  private legacyPersistence(): NonNullable<OccurrenceAdapterPersistence["legacy"]> {
    if (!this.persistence.legacy) {
      throw new Error("Legacy occurrence persistence is unavailable");
    }
    return this.persistence.legacy;
  }

  private lifecycleTarget(
    task: Task,
  ): { seriesId: string; occurrenceId: string } | null {
    if (!task.recurring_series_id || !task.recurring_occurrence_id) return null;
    return {
      seriesId: task.recurring_series_id,
      occurrenceId: task.recurring_occurrence_id,
    };
  }
}

function occurrenceRequest(
  intent: OccurrenceEditIntent,
  target: { seriesId: string; occurrenceId: string },
): OccurrenceUpdateRequest {
  return {
    userId: intent.userId,
    seriesId: target.seriesId,
    occurrenceId: target.occurrenceId,
    updates: intent.updates,
    ...(intent.completed === undefined ? {} : { completed: intent.completed }),
  };
}

export function isOccurrenceSuccess(
  outcome: OccurrenceAdapterOutcome,
): outcome is Extract<
  OccurrenceAdapterOutcome,
  { status: "complete" | "already-applied" }
> {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

function complete(): OccurrenceAdapterSuccess {
  return { status: "complete", type: "complete" };
}

function notFound(): OccurrenceAdapterOutcome {
  return { status: "not-found", type: "not-found" };
}

function invalidTransition(reason: string): OccurrenceAdapterOutcome {
  return { status: "invalid-transition", type: "invalid-transition", reason };
}

export function toLegacyTaskUpdate(intent: OccurrenceEditIntent): TaskUpdate {
  const updates: TaskUpdate = {};
  const occurrence = intent.updates;

  if (occurrence.title !== undefined) updates.title = occurrence.title as string;
  if (occurrence.description !== undefined) {
    updates.description = occurrence.description as string | null;
  }
  if (occurrence.priority !== undefined) updates.priority = occurrence.priority as 0 | 1 | 2 | 3;
  if (occurrence.categoryId !== undefined) updates.category_id = occurrence.categoryId as string | null;
  if (occurrence.dueDate !== undefined) updates.due_date = occurrence.dueDate as string | null;
  if (occurrence.dueTime !== undefined) updates.due_time = occurrence.dueTime as string | null;
  if (occurrence.status !== undefined) updates.status = occurrence.status as TaskStatus;
  if (occurrence.section !== undefined) updates.section = occurrence.section as TaskSection;
  if (occurrence.sortOrder !== undefined) updates.sort_order = occurrence.sortOrder as number;
  if (occurrence.projectId !== undefined) updates.project_id = occurrence.projectId as string | null;
  if (intent.completionDifficulty !== undefined) {
    updates.completion_difficulty = intent.completionDifficulty;
  }

  if (intent.completed !== undefined) {
    updates.is_completed = intent.completed;
    if (
      occurrence.status === undefined
      || occurrence.status === "done"
      || occurrence.status === "todo"
    ) {
      updates.status = intent.completed ? "done" : "todo";
    }
  }

  return updates;
}

export function occurrenceErrorMessage(
  outcome: Exclude<OccurrenceAdapterOutcome, OccurrenceAdapterSuccess>,
): string {
  switch (outcome.status) {
    case "not-found":
      return "Task not found";
    case "conflict":
      return "Task occurrence conflict";
    case "coverage-unavailable":
      return "Recurring task coverage is temporarily unavailable";
    case "invalid-transition":
      return outcome.reason;
    case "skipped":
      return "Task occurrence was not changed";
  }
}

export function occurrenceHttpFailure(
  outcome: Exclude<OccurrenceAdapterOutcome, OccurrenceAdapterSuccess>,
): { error: string; status: 400 | 404 | 409 | 503 } {
  switch (outcome.status) {
    case "not-found":
      return { error: occurrenceErrorMessage(outcome), status: 404 };
    case "conflict":
      return { error: occurrenceErrorMessage(outcome), status: 409 };
    case "coverage-unavailable":
      return { error: occurrenceErrorMessage(outcome), status: 503 };
    case "invalid-transition":
      return { error: occurrenceErrorMessage(outcome), status: 400 };
    case "skipped":
      return { error: occurrenceErrorMessage(outcome), status: 400 };
  }
}
