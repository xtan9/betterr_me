import { z } from "zod";
import { TasksDB, RecurringTasksDB } from "@/lib/db";
import type { RecurrenceRule } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function taskTools(): ToolDefinition[] {
  return [
    {
      name: "getTodayTasks",
      description: "Get tasks due today and overdue tasks",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
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
      parameters: z.object({
        title: z.string().describe("Task title"),
        dueDate: z
          .string()
          .optional()
          .describe("Due date in YYYY-MM-DD format"),
        priority: z
          .number()
          .optional()
          .describe("Priority level (0=none, 1=low, 2=medium, 3=high)"),
        projectId: z
          .string()
          .optional()
          .describe("Project ID to assign the task to"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        return db.createTask({
          user_id: ctx.userId,
          title: params.title,
          description: null,
          due_date: params.dueDate ?? null,
          due_time: null,
          priority: params.priority ?? 0,
          project_id: params.projectId,
          is_completed: false,
        });
      },
    },
    {
      name: "toggleTask",
      description: "Toggle a task's completion status",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        return db.toggleTaskCompletion(params.taskId, ctx.userId);
      },
    },
    {
      name: "updateTask",
      description: "Update an existing task's fields",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.string().optional().describe("New status"),
        priority: z.number().optional().describe("New priority level"),
        dueDate: z
          .string()
          .optional()
          .describe("New due date in YYYY-MM-DD format"),
        projectId: z
          .string()
          .optional()
          .describe("Move to a different project"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        const { taskId, dueDate, projectId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (dueDate !== undefined) updates.due_date = dueDate;
        if (projectId !== undefined) updates.project_id = projectId;
        // Remove undefined values
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateTask(taskId, ctx.userId, updates);
      },
    },
    {
      name: "deleteTask",
      description: "Delete a task by ID. This action cannot be undone.",
      parameters: z.object({
        taskId: z.string().describe("The task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new TasksDB(ctx.supabase);
        await db.deleteTask(params.taskId, ctx.userId);
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
        const db = new RecurringTasksDB(ctx.supabase);
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
        const db = new RecurringTasksDB(ctx.supabase);
        // Calculate a rolling window end date (30 days from start)
        const throughDate = new Date(params.startDate);
        throughDate.setDate(throughDate.getDate() + 30);
        const throughDateStr = throughDate.toISOString().split("T")[0];

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
        const db = new RecurringTasksDB(ctx.supabase);
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
        const db = new RecurringTasksDB(ctx.supabase);
        return db.pauseRecurringTask(params.recurringTaskId, ctx.userId);
      },
    },
    {
      name: "deleteRecurringTask",
      description:
        "Delete a recurring task and all its future incomplete instances. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        await db.deleteRecurringTask(
          params.recurringTaskId,
          ctx.userId,
        );
        return { success: true };
      },
    },
  ];
}
