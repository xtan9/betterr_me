import { z } from "zod";
import { TasksDB, RecurringTasksDB } from "@/lib/db";
import type { RecurrenceRule } from "@/lib/db";
import { createTaskWrites } from "@/lib/tasks/writes";
import { createSupabaseRecurringTaskLifecycle } from "@/lib/recurring-tasks";
import { ensureRecurringTaskCoverageThrough } from "@/lib/recurring-tasks/coverage";
import { addLocalDays } from "@/lib/recurring-tasks/recurrence";
import {
  hasTaskUpdateValues,
  taskFormSchema,
  taskStatusSchema,
} from "@/lib/validations/task";
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
  })
  .refine(
    ({ taskId: _taskId, ...updates }) => hasTaskUpdateValues(updates),
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
        await ensureAiRecurringCoverage(ctx, params.date, params.date);
        const db = new TasksDB(ctx.supabase);
        return db.getTodayTasks(ctx.userId, params.date);
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
        await ensureAiRecurringCoverage(
          ctx,
          params.date,
          addLocalDays(params.date, params.days ?? 7),
        );
        const db = new TasksDB(ctx.supabase);
        return db.getUpcomingTasks(ctx.userId, params.date, params.days);
      },
    },
    {
      name: "getOverdueTasks",
      description: "Get incomplete tasks that are past their due date",
      parameters: z.object({
        date: z.string().describe("Current date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        await ensureAiRecurringCoverage(ctx, params.date, params.date);
        const db = new TasksDB(ctx.supabase);
        return db.getOverdueTasks(ctx.userId, params.date);
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
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
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
        const outcome = await createTaskWrites(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        }).execute({
          type: "toggle-completion",
          taskId: params.taskId,
          userId: ctx.userId,
        });
        return outcome.task;
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
        const { taskId, dueDate, projectId, ...rest } = params;
        const outcome = await createTaskWrites(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        }).execute({
          type: "update",
          taskId,
          userId: ctx.userId,
          values: {
            ...rest,
            due_date: dueDate,
            project_id: projectId,
          },
        });
        return outcome.task;
      },
    },
    {
      name: "deleteTask",
      description:
        "Delete a task by ID, or skip a recurring occurrence while preserving its series lineage.",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        const task = await db.getTask(params.taskId, ctx.userId);
        if (!task) return { error: "Task not found" };
        if (task.recurring_series_id && task.recurring_occurrence_id) {
          await new RecurringTasksDB(ctx.supabase, {
            lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
          }).deleteInstanceWithScope(params.taskId, ctx.userId, "this");
        } else {
          await db.deleteTask(params.taskId, ctx.userId);
        }
        return { success: true };
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
        const db = new RecurringTasksDB(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        });
        return db.getUserRecurringTasks(ctx.userId, {
          status: params.status,
        });
      },
    },
    {
      name: "createRecurringTask",
      description:
        "Create a new recurring task that generates instances automatically. Always confirm with the user before calling this tool.",
      parameters: z.object({
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
        const db = new RecurringTasksDB(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        });
        // Calculate a rolling window end date (30 days from start)
        // Use string manipulation to avoid UTC date shift from toISOString()
        const throughDateStr = addLocalDays(params.startDate, 30);

        return db.createRecurringTask(
          {
            user_id: ctx.userId,
            title: params.title,
            description: params.description ?? null,
            priority: (params.priority ?? 0) as 0 | 1 | 2 | 3,
            category_id: params.categoryId ?? null,
            due_time: params.dueTime ?? null,
            start_date: params.startDate,
            recurrence_rule: {
              ...params.recurrenceRule,
              interval: params.recurrenceRule.interval ?? 1,
            } as RecurrenceRule,
            end_type: params.endType ?? "never",
            end_date: params.endDate ?? null,
            end_count: params.endCount ?? null,
            status: "active",
          },
          throughDateStr,
        );
      },
    },
    {
      name: "updateRecurringTask",
      description: "Update a recurring task's title, description, or priority",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        priority: z
          .number()
          .optional()
          .describe("New priority level (0=none, 1=low, 2=medium, 3=high)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        });
        const { recurringTaskId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateRecurringTask(recurringTaskId, ctx.userId, updates);
      },
    },
    {
      name: "pauseRecurringTask",
      description:
        "Pause a recurring task to stop generating new instances",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        });
        return db.pauseRecurringTask(params.recurringTaskId, ctx.userId);
      },
    },
    {
      name: "deleteRecurringTask",
      description:
        "End a recurring task while preserving its lineage and completed history. Always confirm with the user first.",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase, {
          lifecycle: createSupabaseRecurringTaskLifecycle(ctx.supabase),
        });
        const rt = await db.getRecurringTask(params.recurringTaskId, ctx.userId);
        if (!rt) return { error: "Recurring task not found" };
        await db.deleteRecurringTask(
          params.recurringTaskId,
          ctx.userId,
        );
        return { success: true };
      },
    },
  ];
}

async function ensureAiRecurringCoverage(
  ctx: ToolContext,
  fromDate: string,
  throughDate: string,
): Promise<void> {
  const coverage = await ensureRecurringTaskCoverageThrough(
    ctx.supabase,
    ctx.userId,
    fromDate,
    throughDate,
  );
  if (coverage.status === "partial") {
    throw new Error("Recurring task coverage is temporarily unavailable");
  }
}
