import { z } from "zod";
import { TasksDB } from "@/lib/db";
import type { RecurrenceRule } from "@/lib/db";
import type { Task } from "@/lib/db/types";
import {
  createTaskWrites,
  taskDeletionErrorMessage,
} from "@/lib/tasks/writes";
import {
  TaskCoverageUnavailableError,
  type TaskReadQuery,
} from "@/lib/tasks/query";
import { createSupabaseTaskQuery } from "@/lib/tasks/supabase-query";
import {
  createActivatedRecurringTaskLifecycle,
  createAuthenticatedRecurringTaskCapabilities,
} from "@/lib/recurring-tasks";
import {
  isOccurrenceSuccess,
  occurrenceErrorMessage,
  toOccurrenceEditIntent,
} from "@/lib/recurring-tasks/occurrence-adapter";
import { createSupabaseOccurrenceAdapter } from "@/lib/recurring-tasks/supabase-occurrence-adapter";
import { addLocalDays } from "@/lib/recurring-tasks/recurrence";
import {
  createSupabaseSeriesStateAdapter,
  isSeriesStateSuccess,
  resolveSeriesEffectiveDate,
  seriesStateErrorMessage,
} from "@/lib/recurring-tasks";
import {
  initialSeriesCoverage,
  recurringTaskFailureMessage,
  toCreateSeriesCommand,
  toLifecycleRecurrenceDates,
  toRecurringTaskResponse,
} from "@/lib/recurring-tasks/compatibility";
import {
  hasTaskUpdateValues,
  taskFormSchema,
  taskStatusSchema,
} from "@/lib/validations/task";
import { recurrenceRuleSchema } from "@/lib/validations/recurring-task";
import type { ToolDefinition, ToolContext } from "./types";

const createTaskParameters = z.object({
  title: taskFormSchema.shape.title.describe("Task title"),
  dueDate: taskFormSchema.shape.due_date.describe(
    "Due date in YYYY-MM-DD format",
  ),
  priority: taskFormSchema.shape.priority.describe(
    "Priority level (0=none, 1=low, 2=medium, 3=high)",
  ),
  projectId: taskFormSchema.shape.project_id.describe(
    "Project ID to assign the task to",
  ),
});

const updateTaskParameters = z
  .object({
    taskId: z.string().describe("The task ID"),
    title: taskFormSchema.shape.title.optional().describe("New title"),
    description: taskFormSchema.shape.description.describe("New description"),
    status: taskStatusSchema.optional().describe("New status"),
    priority: taskFormSchema.shape.priority.describe("New priority level"),
    dueDate: taskFormSchema.shape.due_date.describe(
      "New due date in YYYY-MM-DD format",
    ),
    projectId: taskFormSchema.shape.project_id.describe(
      "Move to a different project",
    ),
    scope: z.enum(["this", "following", "all"]).optional().describe(
      "Apply to this occurrence, this and following occurrences, or all occurrences",
    ),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional()
      .describe("Effective local date for a scoped recurring change"),
  })
  .refine(
    ({ taskId: _taskId, scope: _scope, effectiveDate: _effectiveDate, ...updates }) =>
      hasTaskUpdateValues(updates),
    { message: "At least one field must be provided" },
  );

const recurringTaskUpdateParameters = z
  .object({
    recurringTaskId: z.string().describe("The recurring task ID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    priority: z
      .number()
      .optional()
      .describe("New priority level (0=none, 1=low, 2=medium, 3=high)"),
    categoryId: z.string().optional().describe("New category ID"),
    dueTime: z.string().optional().describe("New due time in HH:MM format"),
    recurrenceRule: recurrenceRuleSchema.optional().describe(
      "New recurrence schedule",
    ),
    endType: z
      .enum(["never", "after_count", "on_date"])
      .optional()
      .describe("When the Series ends"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional()
      .describe("End date when endType is on_date"),
    endCount: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Occurrence count when endType is after_count"),
    scope: z.enum(["following", "all"]).optional().describe(
      "Apply the change to this and following occurrences or all occurrences",
    ),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional()
      .describe("Effective local date for the revision"),
  })
  .refine(
    ({ recurringTaskId: _recurringTaskId, scope: _scope, effectiveDate: _effectiveDate, ...updates }) =>
      hasTaskUpdateValues(updates),
    { message: "At least one field must be provided" },
  );

export function taskTools(): ToolDefinition[] {
  return [
    {
      name: "getTodayTasks",
      description: "Get tasks due today and overdue tasks",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        return readAiTasks(ctx, { type: "today", date: params.date });
      },
    },
    {
      name: "getUpcomingTasks",
      description: "Get tasks due in the next N days",
      parameters: z.object({
        date: z.string().describe("Start date in YYYY-MM-DD format"),
        days: z
          .number()
          .optional()
          .describe("Number of days to look ahead (default 7)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        return readAiTasks(ctx, {
          type: "upcoming",
          date: params.date,
          days: params.days,
        });
      },
    },
    {
      name: "getOverdueTasks",
      description: "Get incomplete tasks that are past their due date",
      parameters: z.object({
        date: z.string().describe("Current date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        return readAiTasks(ctx, { type: "overdue", date: params.date });
      },
    },
    {
      name: "getTask",
      description: "Get a single task by its ID",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        return db.getTask(params.taskId, ctx.userId);
      },
    },
    {
      name: "getProjectTasks",
      description:
        "List tasks in a project, optionally filtered by status and priority",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
        status: z.string().optional().describe("Filter by task status"),
        priority: z.number().optional().describe("Filter by priority level"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        return db.getUserTasks(ctx.userId, {
          project_id: params.projectId,
          status: params.status,
          priority: params.priority,
        });
      },
    },
    {
      name: "createTask",
      description: "Create a new task",
      parameters: createTaskParameters,
      execute: async (
        params: z.infer<typeof createTaskParameters>,
        ctx: ToolContext,
      ) => {
        const outcome = await createTaskWrites(ctx.supabase, {
          lifecycle: createActivatedRecurringTaskLifecycle(ctx.supabase),
        }).execute({
          type: "create",
          userId: ctx.userId,
          values: {
            title: params.title,
            due_date: params.dueDate,
            priority: params.priority,
            project_id: params.projectId,
          },
        });
        return outcome.task;
      },
    },
    {
      name: "toggleTask",
      description: "Toggle a task's completion status",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createSupabaseOccurrenceAdapter(ctx.supabase).toggle({
          taskId: params.taskId,
          userId: ctx.userId,
        });
        if (isOccurrenceSuccess(outcome)) return outcome.task;
        return { error: occurrenceErrorMessage(outcome) };
      },
    },
    {
      name: "updateTask",
      description: "Update an existing task's fields",
      parameters: updateTaskParameters,
      execute: async (
        params: z.infer<typeof updateTaskParameters>,
        ctx: ToolContext,
      ) => {
        const {
          taskId,
          dueDate,
          projectId,
          scope,
          effectiveDate,
          ...rest
        } = params;
        if (scope && scope !== "this") {
          const outcome = await createSupabaseSeriesStateAdapter(
            ctx.supabase,
          ).editScope({
            userId: ctx.userId,
            taskId,
            scope,
            effectiveDate,
            ...toSeriesScopeInput({
              title: rest.title,
              description: rest.description,
              priority: rest.priority,
              status: rest.status,
              dueDate,
              projectId,
            }),
          });
          if (isSeriesStateSuccess(outcome)) return { success: true };
          return { error: seriesStateErrorMessage(outcome) };
        }
        const outcome = await createSupabaseOccurrenceAdapter(ctx.supabase).edit(
          toOccurrenceEditIntent({
            userId: ctx.userId,
            taskId,
            title: rest.title,
            description: rest.description,
            priority: rest.priority,
            status: rest.status,
            dueDate,
            projectId,
          }),
        );
        if (isOccurrenceSuccess(outcome)) return outcome.task;
        return { error: occurrenceErrorMessage(outcome) };
      },
    },
    {
      name: "deleteTask",
      description:
        "Delete a task by ID, or skip a recurring occurrence while preserving its series lineage. Always confirm with the user first.",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
        scope: z.enum(["this", "following", "all"]).optional().describe(
          "Apply to this occurrence, this and following occurrences, or all occurrences",
        ),
        effectiveDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
          .optional()
          .describe("Effective local date for a recurring Series end"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createTaskWrites(ctx.supabase, {
          lifecycle: createActivatedRecurringTaskLifecycle(ctx.supabase),
        }).delete({
          taskId: params.taskId,
          userId: ctx.userId,
          ...(params.scope === undefined ? {} : { scope: params.scope }),
          ...(params.effectiveDate === undefined
            ? {}
            : { effectiveDate: params.effectiveDate }),
        });
        if (outcome.type === "deleted") return { success: true };
        return {
          error: taskDeletionErrorMessage(
            outcome,
            params.scope === "following" || params.scope === "all"
              ? "series"
              : "occurrence",
          ),
        };
      },
    },
    {
      name: "getRecurringTasks",
      description: "List all recurring tasks with optional status filter",
      parameters: z.object({
        status: z
          .enum(["active", "paused", "archived"])
          .optional()
          .describe("Filter by status (default: all)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const result = await recurringTaskCapabilities(ctx).seriesQueries.listSeries({
          status: params.status === "archived" ? "ended" : params.status,
        });
        if (result.type !== "listed") {
          return { error: recurringTaskFailureMessage(result) };
        }
        return result.series.map((series) =>
          toRecurringTaskResponse(series, ctx.userId),
        );
      },
    },
    {
      name: "createRecurringTask",
      description:
        "Create a new recurring task that generates instances automatically. Always confirm with the user before calling this tool.",
      parameters: z.object({
        operationId: z
          .string()
          .min(1)
          .describe("Caller-stable operation ID; reuse it when retrying this creation"),
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description"),
        priority: z
          .number()
          .optional()
          .describe("Priority level (0=none, 1=low, 2=medium, 3=high)"),
        categoryId: z.string().optional().describe("Category ID"),
        dueTime: z
          .string()
          .optional()
          .describe("Due time in HH:MM format"),
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        recurrenceRule: z
          .object({
            frequency: z
              .enum(["daily", "weekly", "monthly", "yearly"])
              .describe("Recurrence frequency"),
            interval: z
              .number()
              .optional()
              .describe("Interval (e.g., every 2 weeks). Default 1"),
            days_of_week: z
              .array(z.number())
              .optional()
              .describe("Days of week for weekly (0=Sun, 6=Sat)"),
            day_of_month: z
              .number()
              .optional()
              .describe("Day of month for monthly (1-31)"),
            week_position: z
              .enum(["first", "second", "third", "fourth", "last"])
              .optional()
              .describe("Week position for monthly weekday recurrences"),
            day_of_week_monthly: z
              .number()
              .int()
              .min(0)
              .max(6)
              .optional()
              .describe("Day of week for monthly weekday recurrences"),
            month_of_year: z
              .number()
              .int()
              .min(1)
              .max(12)
              .optional()
              .describe("Month for yearly recurrences (1-12)"),
          })
          .describe("Recurrence rule"),
        endType: z
          .enum(["never", "after_count", "on_date"])
          .optional()
          .describe("When to stop recurring (default: never)"),
        endDate: z
          .string()
          .optional()
          .describe("End date if endType is on_date"),
        endCount: z
          .number()
          .optional()
          .describe("Number of occurrences if endType is after_count"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const recurrenceDates = toLifecycleRecurrenceDates(params.startDate);
        const result = await recurringTaskCapabilities(ctx).seriesCommands.createSeries(
          toCreateSeriesCommand({
            operationId: params.operationId,
            title: params.title,
            description: params.description ?? null,
            priority: (params.priority ?? 0) as 0 | 1 | 2 | 3,
            categoryId: params.categoryId ?? null,
            dueTime: params.dueTime ?? null,
            recurrenceRule: {
              ...params.recurrenceRule,
              interval: params.recurrenceRule.interval ?? 1,
            } as RecurrenceRule,
            ...recurrenceDates,
            endType: params.endType ?? "never",
            endDate: params.endDate ?? null,
            endCount: params.endCount ?? null,
            coverageThrough: initialSeriesCoverage(
              recurrenceDates.recurrenceAnchor,
              ctx.date,
            ).to,
          }),
        );
        if (result.type === "created") {
          return toRecurringTaskResponse(result.series, ctx.userId);
        }
        return { error: recurringTaskFailureMessage(result) };
      },
    },
    {
      name: "updateRecurringTask",
      description:
        "Update a recurring Series Default or schedule. An effective date creates a following-scope revision.",
      parameters: recurringTaskUpdateParameters,
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createSupabaseSeriesStateAdapter(ctx.supabase).update({
          userId: ctx.userId,
          seriesId: params.recurringTaskId,
          title: params.title,
          description: params.description,
          priority: params.priority as 0 | 1 | 2 | 3 | undefined,
          categoryId: params.categoryId,
          dueTime: params.dueTime,
          recurrenceRule: params.recurrenceRule as RecurrenceRule | undefined,
          endType: params.endType,
          endDate: params.endDate,
          endCount: params.endCount,
          scope: params.scope,
          effectiveDate: params.effectiveDate,
          inferredDate: ctx.date,
          timezone: ctx.timezone,
        });
        if (isSeriesStateSuccess(outcome)) return outcome.recurringTask;
        return { error: seriesStateErrorMessage(outcome) };
      },
    },
    {
      name: "pauseRecurringTask",
      description:
        "Pause a recurring task to stop generating new instances",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
        effectiveDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
          .optional()
          .describe("Effective local date; defaults to today"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createSupabaseSeriesStateAdapter(ctx.supabase).pause({
          seriesId: params.recurringTaskId,
          userId: ctx.userId,
          effectiveDate: params.effectiveDate,
          inferredDate: ctx.date,
          timezone: ctx.timezone,
        });
        if (isSeriesStateSuccess(outcome)) return outcome.recurringTask;
        return { error: seriesStateErrorMessage(outcome) };
      },
    },
    {
      name: "resumeRecurringTask",
      description:
        "Resume a paused recurring task and continue generating instances",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
        effectiveDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
          .optional()
          .describe("Effective local date; defaults to today"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const effectiveDate = resolveSeriesEffectiveDate(
          params.effectiveDate,
          ctx.date,
        );
        const outcome = await createSupabaseSeriesStateAdapter(ctx.supabase).resume({
          seriesId: params.recurringTaskId,
          userId: ctx.userId,
          effectiveDate: params.effectiveDate,
          inferredDate: ctx.date,
          timezone: ctx.timezone,
          coverageThrough: effectiveDate
            ? addLocalDays(effectiveDate, 7)
            : undefined,
        });
        if (isSeriesStateSuccess(outcome)) return outcome.recurringTask;
        return { error: seriesStateErrorMessage(outcome) };
      },
    },
    {
      name: "deleteRecurringTask",
      description:
        "End a recurring task while preserving its lineage and completed history. Always confirm with the user first.",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
        effectiveDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
          .optional()
          .describe("Effective local date; defaults to today"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createTaskWrites(ctx.supabase, {
          lifecycle: createActivatedRecurringTaskLifecycle(ctx.supabase),
        }).deleteSeries({
          seriesId: params.recurringTaskId,
          userId: ctx.userId,
          effectiveDate: params.effectiveDate ?? ctx.date,
        });
        if (outcome.type === "deleted") return { success: true };
        return { error: taskDeletionErrorMessage(outcome, "series") };
      },
    },
  ];
}

function recurringTaskCapabilities(ctx: ToolContext) {
  return createAuthenticatedRecurringTaskCapabilities({
    supabase: ctx.supabase,
    principal: {
      type: "user",
      userId: ctx.userId,
      credential: "mcp",
    },
  });
}

async function readAiTasks(
  ctx: ToolContext,
  request: Exclude<TaskReadQuery, { type: "list" }>,
): Promise<Task[]> {
  if (!ctx.principal) {
    throw new Error("Authenticated principal required for AI task reads");
  }

  const result = await createSupabaseTaskQuery(ctx.supabase, ctx.principal).read(
    request,
    { onIncomplete: "fail" },
  );
  if (result.completeness && result.completeness.status !== "complete") {
    throw new TaskCoverageUnavailableError(result.completeness);
  }
  return result.tasks;
}

function toSeriesScopeInput(input: {
  title?: string;
  description?: string | null;
  priority?: 0 | 1 | 2 | 3;
  categoryId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  status?: "backlog" | "todo" | "in_progress" | "done";
  projectId?: string | null;
}) {
  return {
    title: input.title,
    description: input.description,
    priority: input.priority,
    categoryId: input.categoryId,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    status: input.status,
    projectId: input.projectId,
  };
}
